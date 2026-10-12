// /api/stripe/payment-intent.js
// Cree un PaymentIntent Stripe pour le Payment Element affiche dans le checkout.
// Le front confirme ensuite le paiement lui-meme (stripe.confirmPayment), sans
// quitter la page. La commande n'est ecrite en base qu'apres un paiement reussi.
//
// LE MONTANT EST CALCULE ICI (12 octobre 2026)
// Avant, le navigateur annoncait le montant et ce fichier le recopiait tel
// quel. api/orders.js comparait bien apres coup, mais trop tard : le client
// avait deja paye, et une erreur (prix modifie par le createur pendant le
// paiement, onglet ancien, requete trafiquee) laissait de l'argent encaisse
// sur une commande « non payee ». Le serveur recalcule donc le panier avec les
// prix du catalogue et la meme regle de frais que la commande
// (api/lib/livraison.js), et refuse AVANT le paiement une piece epuisee.
// Le champ « amount » ne sert plus qu'a verifier que le total affiche au
// client est toujours le bon.

import Stripe from 'stripe';
import { supabaseAdmin } from '../lib/supabase.js';
import { calculerFrais, paysValide } from '../lib/livraison.js';
import { lireStock, stockParCouleur } from '../lib/stock.js';

// Rend { montant } en centimes, ou { erreur, code }.
async function montantDuPanier(items, pays) {
  const paysClient = paysValide(pays);
  if (!paysClient) return { erreur: 'Pays de livraison non desservi', code: 400 };
  const lignes = (items || []).slice(0, 100);
  if (!lignes.length) return { erreur: 'Panier vide', code: 400 };

  const ids = [...new Set(lignes.map((i) => i && i.product_id).filter(Boolean))];
  const { data: produits, error } = await supabaseAdmin
    .from('products')
    .select('id, name, price, brand_id, sizes_stock')
    .in('id', ids);
  if (error || !produits) return { erreur: 'Erreur récupération produits', code: 500 };

  // Quantites regroupees par variante, comme api/orders.js (constat 03).
  const demande = new Map();
  let articles = 0;
  for (const i of lignes) {
    const p = produits.find((x) => x.id === i.product_id);
    if (!p) return { erreur: 'Un article de ton panier n\'existe plus. Retire-le et réessaie.', code: 400 };
    const q = Number(i.quantity == null ? 1 : i.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 20) return { erreur: 'Quantité invalide', code: 400 };
    articles += Math.round(p.price * 100) * q;
    const cle = [p.id, i.size || '', i.color || ''].join('\u0000');
    const d = demande.get(cle) || { p, size: i.size || null, color: i.color || null, q: 0 };
    d.q += q;
    demande.set(cle, d);
  }
  for (const d of demande.values()) {
    if (!d.size || !d.p.sizes_stock) continue;
    if (stockParCouleur(d.p.sizes_stock) && !d.color) continue; // api/orders.js le dira
    const dispo = lireStock(d.p.sizes_stock, d.size, d.color);
    if (dispo !== null && dispo < d.q) {
      return {
        erreur: '« ' + d.p.name + ' » ' + (d.color ? d.color + ' ' : '') + d.size
          + ' n\'est plus disponible en quantité suffisante. Rien ne t\'a été débité.',
        code: 409,
      };
    }
  }

  const marques = [...new Set(produits.map((p) => p.brand_id).filter(Boolean))];
  let pays_marques = [];
  if (marques.length) {
    const { data: m, error: errM } = await supabaseAdmin
      .from('brands').select('id, ship_country').in('id', marques);
    if (errM) console.error('[paiement] pays des marques illisible :', errM.message);
    pays_marques = m || [];
  }
  const frais = calculerFrais(paysClient, marques.map((id) => {
    const x = pays_marques.find((b) => String(b.id) === String(id));
    return { brand_id: id, pays: x ? x.ship_country : null };
  }));
  return { montant: articles + frais.total_frais };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe non configuré (STRIPE_SECRET_KEY manquante)' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { amount, email, name, description, items, country } = req.body || {};

    let montant;
    if (Array.isArray(items) && items.length) {
      const calcul = await montantDuPanier(items, country);
      if (calcul.erreur) return res.status(calcul.code).json({ error: calcul.erreur });
      montant = calcul.montant;
      const annonce = Number.parseInt(amount, 10);
      if (Number.isFinite(annonce) && Math.abs(annonce - montant) > 1) {
        // Le total affiche au client ne correspond plus au catalogue (prix
        // modifie pendant qu'il remplissait le formulaire). On ne debite pas
        // un montant different de celui qu'il a vu : il recharge et confirme.
        console.warn('[paiement] total affiche', annonce, 'different du catalogue', montant);
        return res.status(409).json({
          error: 'Le prix d\'un article vient de changer. Recharge la page pour voir le nouveau total. Rien ne t\'a été débité.',
          montant_actuel: montant,
        });
      }
    } else {
      // Plus de montant fixe par le navigateur : une page ouverte avant la
      // mise a jour doit etre rechargee.
      return res.status(409).json({
        error: 'La page a été mise à jour. Recharge-la pour finaliser ta commande. Rien ne t\'a été débité.',
      });
    }

    // Montant en centimes. Stripe refuse en dessous de 0,50 EUR.
    if (!Number.isFinite(montant) || montant < 50 || montant > 10000000) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: montant,
      currency: 'eur',
      description: description || 'Commande UNEEK',
      receipt_email: email || undefined,
      metadata: {
        source: 'uneek-checkout',
        customer_email: email || '',
        customer_name: name || '',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: montant,
    });

  } catch (error) {
    console.error('Payment Intent Error:', error);
    return res.status(500).json({
      error: 'Impossible de préparer le paiement',
      details: error.message,
    });
  }
}
