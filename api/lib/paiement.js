// CE QUI SE PASSE QUAND UNE COMMANDE EST PAYEE — a un seul endroit.
//
// Ecrit le 12 octobre 2026, apres la simulation complete du circuit de
// l'argent (outils/tests/tests-argent.mjs). Deux chemins peuvent constater
// qu'une commande est payee :
//   - api/orders.js, au moment ou le navigateur enregistre la commande ;
//   - api/webhooks/stripe.js, quand la banque confirme plus tard
//     (Bancontact, iDEAL... en « processing » au moment de la commande).
// Avant ce fichier, seul le premier inscrivait la part des createurs : une
// commande confirmee par le webhook etait payee, mais personne n'etait
// jamais verse, et le createur n'etait meme pas prevenu.
//
// TOUT EST IDEMPOTENT : appeler deux fois ces fonctions pour la meme
// commande ne cree ni deux parts, ni deux remboursements.

import Stripe from "stripe";
import { supabaseAdmin } from "./supabase.js";
import { nouvelleCommandeCreateur, envoyerTous } from "./email.js";

// Inscrit la part qui revient a chaque createur sur la liste des virements.
// Le robot de /api/cron/stripe-transfers viendra la lire 21 jours apres
// l'expedition et executera le virement.
//
// UNE LIGNE PAR CREATEUR ET PAR COMMANDE, PAS PAR ARTICLE
// Deux articles de la meme marque donnent une seule ligne : part sur les
// articles + forfait colis (porte par une seule ligne de la marque).
//
// LES CREATEURS SANS COMPTE STRIPE SONT IGNORES, ET SIGNALES
// Sans identifiant de compte, la ligne serait inexploitable. On la saute en
// l'ecrivant en clair ; l'onglet Finances la montre « a verser a la main ».
//
// DEJA INSCRITE ? ON NE FAIT RIEN
// Si la commande a deja des lignes, on s'arrete : c'est ce qui permet au
// webhook et a la commande de passer tous les deux sans doubler les parts.
export async function inscrireVirements(order, orderItems, chargeId) {
  const { data: existantes, error: errExistantes } = await supabaseAdmin
    .from("pending_transfers")
    .select("id")
    .eq("order_id", order.id);
  if (errExistantes) throw new Error("lecture des parts deja inscrites : " + errExistantes.message);
  if (existantes && existantes.length) {
    console.log("[virements] parts deja inscrites pour", order.order_number, "— rien a refaire");
    return;
  }

  const parMarque = new Map();
  for (const item of orderItems || []) {
    if (!item.brand_id) continue;
    const cents = Math.round((parseFloat(item.creator_payout) || 0) * 100)
      + Math.round((parseFloat(item.shipping_payout) || 0) * 100);
    if (cents <= 0) continue;
    parMarque.set(item.brand_id, (parMarque.get(item.brand_id) || 0) + cents);
  }
  if (parMarque.size === 0) return;

  const { data: comptes, error } = await supabaseAdmin
    .from("creator_accounts")
    .select("id, email, brand_id, stripe_account_id")
    .in("brand_id", [...parMarque.keys()]);
  if (error) throw new Error("lecture des comptes createurs : " + error.message);

  const lignes = [];
  for (const [brandId, montant] of parMarque) {
    // Une marque peut avoir plusieurs comptes createurs : on retient celui
    // qui a relie Stripe, sinon l'ordre de la base deciderait au hasard.
    const candidats = (comptes || []).filter((c) => c.brand_id === brandId);
    const relies = candidats.filter((c) => c.stripe_account_id);
    if (relies.length > 1) {
      console.warn("[virements] la marque", brandId, "a", relies.length,
        "comptes Stripe relies — la part part sur", relies[0].email);
    }
    const compte = relies[0] || candidats[0];
    if (!compte) {
      console.error("[virements] aucun compte createur pour la marque", brandId,
        "— part de", montant / 100, "EUR non inscrite (commande", order.order_number + ")");
      continue;
    }
    if (!compte.stripe_account_id) {
      console.warn("[virements]", compte.email,
        "n'a pas encore relie son compte Stripe — part de", montant / 100,
        "EUR en attente (commande", order.order_number + ")");
      continue;
    }
    lignes.push({
      order_id: order.id,
      creator_id: compte.id,
      stripe_account_id: compte.stripe_account_id,
      charge_id: chargeId || null,
      amount: montant, // en centimes, comme l'attend le robot
      status: "pending",
    });
  }
  if (lignes.length === 0) return;

  const { error: erreurEcriture } = await supabaseAdmin.from("pending_transfers").insert(lignes);
  if (erreurEcriture && erreurEcriture.code === "23505") {
    // Deux inscriptions simultanees (commande + webhook) : l'index unique
    // pending_transfers(order_id, creator_id) n'en a garde qu'une. Rien a faire.
    console.warn("[virements] parts de", order.order_number, "deja inscrites par un appel simultane");
    return;
  }
  if (erreurEcriture) throw new Error("ecriture des virements : " + erreurEcriture.message);

  console.log("[virements]", lignes.length, "part(s) inscrite(s) pour la commande",
    order.order_number, "-", lignes.reduce((s, l) => s + l.amount, 0) / 100, "EUR");
}

// Previent chaque marque de la commande, avec SES articles seulement, dans
// SA langue. Appele uniquement une fois le paiement confirme : un createur
// ne doit jamais voir (ni expedier) une commande que personne n'a payee.
export async function notifierCreateurs(order, orderItems) {
  try {
    const brandIds = [...new Set((orderItems || []).map((i) => i.brand_id).filter(Boolean))];
    if (!brandIds.length) return;
    const { data: comptes } = await supabaseAdmin
      .from("creator_accounts")
      .select("email, full_name, brand_id, lang, is_admin, stripe_account_id")
      .in("brand_id", brandIds);
    const { data: marques } = await supabaseAdmin
      .from("brands")
      .select("id, name, email")
      .in("id", brandIds);

    const taches = [];
    for (const bid of brandIds) {
      // Meme regle que pour les virements : le compte qui tient la boutique
      // (Stripe relie), sinon un compte non administrateur.
      const candidats = (comptes || []).filter((c) => c.brand_id === bid);
      const compte = candidats.find((c) => c.stripe_account_id)
        || candidats.find((c) => !c.is_admin)
        || candidats[0];
      if (candidats.length > 1) {
        console.warn("[email] la marque", bid, "a", candidats.length,
          "comptes createurs — la notification part chez", compte && compte.email);
      }
      const marque = (marques || []).find((m) => m.id === bid);
      const destinataire = (compte && compte.email) || (marque && marque.email);
      if (!destinataire) {
        console.warn("[email] aucune adresse pour la marque", bid);
        continue;
      }
      taches.push(nouvelleCommandeCreateur(
        destinataire,
        (compte && compte.full_name) || (marque && marque.name) || "",
        order,
        orderItems.filter((i) => i.brand_id === bid),
        (compte && compte.lang) || null
      ));
    }
    await envoyerTous(taches);
  } catch (err) {
    console.error("[email] notification des createurs ignoree :", err && err.message);
  }
}

// Rembourse integralement un paiement qu'on ne peut pas honorer (piece
// partie pendant le paiement, produit retire...). Avant le 12 octobre, le
// client voyait « rien ne t'a ete debite » alors que sa carte l'etait.
//
// Rend true seulement si le client est REELLEMENT rembourse, ou si rien n'a
// jamais ete preleve. Un paiement encore « processing » (Bancontact, iDEAL en
// cours) ne peut pas etre rembourse tout de suite : on le marque chez Stripe
// (metadata uneek_refusee) et le webhook le remboursera des que la banque le
// confirme. La fonction rend alors false : on ne dit pas au client qu'il est
// rembourse avant que ce soit vrai.
// La cle d'idempotence garantit qu'un double appel ne rembourse qu'une fois.
export async function rembourserPaiement(paymentIntentId, motif) {
  if (!paymentIntentId || !process.env.STRIPE_SECRET_KEY) return false;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const rienPreleve = ["requires_payment_method", "requires_confirmation", "requires_action", "canceled"];
    if (rienPreleve.indexOf(pi.status) !== -1) return true;
    // Toujours marquer le paiement « refuse » chez Stripe : le webhook sait
    // alors qu'aucune commande ne doit jamais s'y rattacher.
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { uneek_refusee: "1", uneek_motif: String(motif || "").slice(0, 200) },
    });
    if (pi.status !== "succeeded") {
      console.warn("[paiement]", paymentIntentId, "en statut", pi.status,
        "— marque a rembourser des que la banque confirme");
      return false;
    }
    const remb = await stripe.refunds.create(
      // Parametres identiques a chaque appel : Stripe refuse une meme cle
      // d'idempotence avec des parametres differents.
      { payment_intent: paymentIntentId, metadata: { motif: "commande refusee par UNEEK" } },
      { idempotencyKey: "uneek-refus-" + paymentIntentId }
    );
    console.warn("[paiement] rembourse automatiquement :", paymentIntentId, "-", motif, "-", remb.id);
    return true;
  } catch (err) {
    console.error("[paiement] REMBOURSEMENT IMPOSSIBLE pour", paymentIntentId, ":",
      err && err.message, "— a rembourser a la main dans Stripe");
    return false;
  }
}
