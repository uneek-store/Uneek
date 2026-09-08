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
        await majCommande(
          objet.payment_intent,
          {
            payment_status: "paid",
            stripe_charge_id: objet.id,
            paid_at: new Date().toISOString(),
            failure_reason: null,
          },
          evenement.type
        );
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
  }

  return res.status(200).json({ received: true });
}
