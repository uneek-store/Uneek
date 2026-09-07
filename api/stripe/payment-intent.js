// /api/stripe/payment-intent.js
// Create a Stripe PaymentIntent for payment confirmation

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, email } = req.body;

    if (!amount || amount < 50) {
      return res.status(400).json({
        error: 'Invalid amount',
      });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in cents
      currency: 'usd',
      description: 'UNEEK Order',
      receipt_email: email,
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
      error: 'Failed to create payment intent',
      details: error.message,
    });
  }
}
