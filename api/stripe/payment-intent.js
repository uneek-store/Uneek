// /api/stripe/payment-intent.js
// Cree un PaymentIntent Stripe pour le Payment Element affiche dans le checkout.
// Le front confirme ensuite le paiement lui-meme (stripe.confirmPayment), sans
// quitter la page. La commande n'est ecrite en base qu'apres un paiement reussi.

import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe non configuré (STRIPE_SECRET_KEY manquante)' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { amount, email, name, description } = req.body || {};

    // Montant en centimes. Stripe refuse en dessous de 0,50 EUR.
    const montant = Number.parseInt(amount, 10);
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
    });

  } catch (error) {
    console.error('Payment Intent Error:', error);
    return res.status(500).json({
      error: 'Impossible de préparer le paiement',
      details: error.message,
    });
  }
}
