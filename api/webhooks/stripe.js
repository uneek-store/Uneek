// API : /api/webhooks/stripe
// Stripe previent ici quand un paiement aboutit, echoue ou est rembourse.
//
// C'est le filet de securite du checkout. Le chemin normal (api/orders.js)
// marque deja la commande payee au moment de sa creation, mais il ne couvre
// pas tout :
//   - un moyen de paiement qui se regle en differe (Bancontact, virement)
//     laisse la commande en attente le temps que la banque confirme ;
//   - un remboursement declenche depuis le tableau de bord Stripe n'a aucun
//     autre moyen de redescendre dans la base ;
//   - un paiement refuse apres coup doit repasser la commande en echec.
//
// Ce point d'entree est public : n'importe qui peut lui envoyer une requete.
// C'est la signature de Stripe qui fait autorite, rien d'autre.

import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase.js";
import { inscrireVirements, notifierCreateurs, rembourserPaiement } from "../lib/paiement.js";
import { alerteAdmin, esc } from "../lib/email.js";

// Stripe signe les octets BRUTS du corps de la requete. Si Vercel les
// transforme en objet JSON avant nous, le corps reserialise ne correspond
// plus a ce qui a ete signe et toute verification echoue. On desactive donc
// l'analyse automatique pour lire les octets nous-memes.
export const config = { api: { bodyParser: false } };

function lireCorpsBrut(req) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    req.on("data", (c) => morceaux.push(c));
    req.on("end", () => resolve(Buffer.concat(morceaux)));
    req.on("error", reject);
  });
}

// Met a jour la commande rattachee a ce paiement. Idempotent : Stripe
// reessaie ses envois et peut livrer deux fois le meme evenement, or
// reecrire les memes valeurs ne change rien.
async function majCommande(paymentIntentId, champs, type) {
  if (!paymentIntentId) return false;
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update(champs)
    .eq("payment_id", paymentIntentId)
    .select("id, order_number");
  if (error) {
    console.error("[webhook]", type, "- mise a jour refusee :", error.message);
    return false;
  }
  const touchees = data || [];
  if (touchees.length === 0) {
    // Cas normal si la commande n'est pas encore ecrite (l'evenement peut
    // arriver avant que le navigateur ait fini son appel a /api/orders).
    console.warn("[webhook]", type, "- aucune commande pour", paymentIntentId);
    return false;
  }
  console.log("[webhook]", type, "->", touchees.map((o) => o.order_number).join(", "));
  return true;
}

// UN PAIEMENT CONFIRME PAR STRIPE (12 octobre 2026).
// Avant, ce cas se contentait de passer la commande en « paid » :
//   - la part des createurs n'etait jamais inscrite, donc jamais viree, pour
//     toute commande confirmee apres coup (Bancontact, iDEAL en attente) ;
//   - les createurs n'etaient pas prevenus ;
//   - le montant n'etait pas compare : une commande payee 1 EUR au lieu du
//     prix du panier, laissee « en attente » par api/orders.js, repassait
//     « paid » ici sans controle.
// Rend "reessayer" quand il faut que Stripe renvoie l'evenement plus tard
// (commande pas encore ecrite, lignes pas encore ecrites, base indisponible) :
// le gestionnaire repond alors 500 et Stripe reessaie pendant trois jours.
// Idempotent : seul le passage de « non payee » a « payee » previent les
// createurs ; l'inscription des parts est elle-meme sans doublon.
async function paiementConfirme(charge) {
  const piId = charge.payment_intent;
  if (!piId) return "ok";

  // L'etat REEL du paiement, lu chez Stripe : l'evenement est une photo prise
  // au moment du paiement, et Stripe le renvoie tel quel pendant ses
  // nouvelles tentatives — meme apres un remboursement.
  let pi = null;
  try {
    pi = await new Stripe(process.env.STRIPE_SECRET_KEY)
      .paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  } catch (err) {
    console.error("[webhook] paiement", piId, "illisible :", err && err.message);
    return "reessayer";
  }
  const vraie = (pi && pi.latest_charge && typeof pi.latest_charge === "object") ? pi.latest_charge : charge;
  const dejaRembourse = !!(vraie.refunded || (vraie.amount_refunded || 0) > 0);
  const meta = (pi && pi.metadata) || {};

  const { data: trouvees, error } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("payment_id", piId);
  if (error) {
    console.error("[webhook] charge.succeeded - lecture refusee :", error.message);
    return "reessayer";
  }
  const commande = (trouvees || [])[0];

  if (!commande) {
    // Normal juste apres le paiement : le navigateur n'a pas fini d'ecrire la
    // commande.
    if (meta.uneek_refusee === "1") {
      // Commande refusee : on rembourse si ce n'est pas deja fait (cas d'un
      // Bancontact encore « processing » au moment du refus).
      if (!dejaRembourse) await rembourserPaiement(piId, meta.uneek_motif || "commande refusee");
      return "ok";
    }
    if (meta.source !== "uneek-checkout") return "ok"; // abonnement createur... : pas une commande
    if (dejaRembourse) return "ok";
    // Stripe reessaie pendant une heure. Au-dela, la commande ne viendra plus
    // (panier perdu, onglet ferme) : on previent l'administrateur une fois,
    // plutot que de faire echouer le point d'entree pendant trois jours.
    const age = Date.now() / 1000 - (charge.created || 0);
    if (age < 3600) {
      console.warn("[webhook] charge.succeeded - commande pas encore ecrite pour", piId, "— Stripe reessaiera");
      return "reessayer";
    }
    await alerteAdmin("Paiement reçu SANS commande", [
      "Stripe a encaissé " + ((charge.amount || 0) / 100).toFixed(2) + " € (paiement " + esc(piId) + ") "
        + "mais aucune commande n'a été enregistrée.",
      "Client : " + esc(meta.customer_email || "") + " " + esc(meta.customer_name || ""),
      "À faire : le contacter, ou rembourser dans Stripe.",
    ], "Voir les commandes");
    return "ok";
  }

  if (commande.status === "cancelled") {
    // Refusee faute de stock pendant que la banque confirmait.
    if (!dejaRembourse) await rembourserPaiement(piId, "commande annulee " + (commande.order_number || ""));
    return "ok";
  }
  if (dejaRembourse || ["refunded", "partially_refunded"].indexOf(commande.payment_status) !== -1) {
    console.warn("[webhook] charge.succeeded ignore pour", commande.order_number, "(deja rembourse)");
    return "ok";
  }

  const attendu = Math.round((parseFloat(commande.total_amount) || 0) * 100);
  if (Math.abs((charge.amount || 0) - attendu) > 1) {
    console.error("[webhook] montant incoherent pour", commande.order_number, ":",
      charge.amount, "paye au lieu de", attendu, "— commande laissee non payee");
    await supabaseAdmin.from("orders")
      .update({ failure_reason: "montant_incoherent : " + charge.amount + " au lieu de " + attendu })
      .eq("id", commande.id);
    if (commande.failure_reason && String(commande.failure_reason).indexOf("montant_incoherent") === 0) return "ok";
    await alerteAdmin("Paiement au mauvais montant " + (commande.order_number || ""), [
      "Stripe a encaissé " + (charge.amount / 100).toFixed(2) + " € au lieu de "
        + (attendu / 100).toFixed(2) + " €.",
      "La commande reste NON payée et les créateurs ne sont pas prévenus. Rembourse ou régularise dans Stripe.",
      "Client : " + esc(commande.customer_email || ""),
    ], "Voir les commandes");
    return "ok";
  }

  // Les lignes d'abord : api/orders.js ecrit la commande, PUIS ses lignes.
  const { data: lignes, error: errLignes } = await supabaseAdmin
    .from("order_items")
    .select("*")
    .eq("order_id", commande.id);
  if (errLignes || !lignes || lignes.length === 0) {
    console.warn("[webhook] lignes de", commande.order_number, "pas encore lisibles — Stripe reessaiera");
    return "reessayer";
  }

  // Les parts AVANT de marquer « payee » : si l'inscription echoue, Stripe
  // reessaie, et la commande n'est pas encore payee — rien n'est perdu.
  try {
    await inscrireVirements(commande, lignes, charge.id);
  } catch (err) {
    console.error("[virements] echec pour la commande", commande.order_number, ":", err && err.message);
    return "reessayer";
  }

  // Passage a « payee » conditionnel : un seul appel le reussit, meme si
  // Stripe livre l'evenement deux fois en meme temps. Lui seul previent.
  const { data: basculees, error: errMaj } = await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "paid",
      stripe_charge_id: charge.id,
      paid_at: commande.paid_at || new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", commande.id)
    .neq("payment_status", "paid")
    .neq("status", "cancelled")
    .select("id");
  if (errMaj) {
    console.error("[webhook] mise a jour refusee :", errMaj.message);
    return "reessayer";
  }
  if (basculees && basculees.length) {
    console.log("[webhook] charge.succeeded ->", commande.order_number, "payee");
    await notifierCreateurs(commande, lignes);
  }
  return "ok";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!secret || !cle) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET ou STRIPE_SECRET_KEY manquante");
    return res.status(500).json({ error: "Webhook non configuré" });
  }

  let evenement;
  try {
    const stripe = new Stripe(cle);
    const brut = await lireCorpsBrut(req);
    evenement = stripe.webhooks.constructEvent(
      brut,
      req.headers["stripe-signature"],
      secret
    );
  } catch (err) {
    // Signature absente ou invalide : la requete ne vient pas de Stripe.
    console.error("[webhook] signature refusee :", err && err.message);
    return res.status(400).json({ error: "Signature invalide" });
  }

  try {
    const objet = evenement.data.object;

    switch (evenement.type) {
      case "charge.succeeded":
        if ((await paiementConfirme(objet)) === "reessayer") {
          return res.status(500).json({ error: "A reessayer" });
        }
        break;

      case "charge.failed":
        await majCommande(
          objet.payment_intent,
          {
            payment_status: "failed",
            failure_reason:
              objet.failure_message || objet.failure_code || "Paiement refusé",
          },
          evenement.type
        );
        break;

      case "charge.refunded":
        await majCommande(
          objet.payment_intent,
          {
            // Remboursement partiel ou total : Stripe le precise, on garde la
            // nuance pour ne pas afficher "remboursé" sur une commande qui ne
            // l'est qu'a moitie.
            payment_status: objet.amount_refunded >= objet.amount
              ? "refunded"
              : "partially_refunded",
          },
          evenement.type
        );
        break;

      default:
        // transfer.created et le reste : rien a faire ici. Les virements aux
        // createurs sont deja suivis par le cron et la table transfer_logs.
        break;
    }
  } catch (err) {
    // On accuse quand meme reception : reessayer ne donnerait pas un
    // meilleur resultat, et Stripe finirait par desactiver le point d'entree.
    console.error("[webhook] traitement de", evenement.type, ":", err && err.message);
    // Un paiement confirme mal traite doit revenir : Stripe le renverra.
    if (evenement.type === "charge.succeeded") return res.status(500).json({ error: "A reessayer" });
  }

  return res.status(200).json({ received: true });
}
