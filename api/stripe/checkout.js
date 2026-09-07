// /api/stripe/checkout.js
// Handle payment processing for the checkout form

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      paymentMethodId,
      amount,
      currency = 'usd',
      email,
      firstName,
      lastName,
      description,
      creatorId, // Optional: if you want to associate with a specific creator
    } = req.body;

    // Validation
    if (!paymentMethodId || !amount || amount < 50) {
      return res.status(400).json({
        error: 'Missing required fields or amount too low',
      });
    }

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Customer information is required',
      });
    }

    // Create or retrieve customer
    let customer;
    try {
      // Check if customer exists
      const customers = await stripe.customers.list({
        email: email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customer = customers.data[0];
      } else {
        // Create new customer
        customer = await stripe.customers.create({
          email: email,
          name: `${firstName} ${lastName}`,
          metadata: {
            firstName: firstName,
            lastName: lastName,
          },
        });
      }
    } catch (error) {
      console.error('Error managing customer:', error);
      throw new Error('Failed to process customer information');
    }

    // Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in cents
      currency: currency,
      payment_method: paymentMethodId,
      customer: customer.id,
      description: description || `Payment from ${firstName} ${lastName}`,
      metadata: {
        email: email,
        firstName: firstName,
        lastName: lastName,
        customerName: `${firstName} ${lastName}`,
      },
      confirm: true, // Automatically confirm the payment
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    // Handle payment intent status
    if (paymentIntent.status === 'succeeded') {
      // Payment successful - create order record
      try {
        // Insert order into database
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_email: email,
            customer_name: `${firstName} ${lastName}`,
            amount: amount / 100, // Store as dollars
            currency: currency,
            stripe_payment_intent_id: paymentIntent.id,
            stripe_customer_id: customer.id,
            status: 'completed',
            payment_method: 'stripe_card',
            description: description,
          })
          .select('id');

        if (orderError) {
          console.error('Error creating order record:', orderError);
          // Payment succeeded but DB record failed - log this
          // In production, you'd want retry logic here
        }

        const orderId = order?.[0]?.id || paymentIntent.id;

        // If there's a creator_id, create a pending transfer record
        if (creatorId) {
          try {
            await supabase
              .from('pending_transfers')
              .insert({
                creator_id: creatorId,
                order_id: orderId,
                amount: Math.round((amount / 100) * 100), // Store as cents
                status: 'pending',
              });
          } catch (error) {
            console.error('Error creating pending transfer:', error);
            // Don't fail the payment if transfer record creation fails
          }
        }

        return res.status(200).json({
          success: true,
          message: 'Payment processed successfully',
          orderId: orderId,
          paymentIntentId: paymentIntent.id,
          amount: amount / 100,
          currency: currency,
        });

      } catch (error) {
        console.error('Error in payment success handler:', error);
        return res.status(500).json({
          error: 'Payment succeeded but order processing failed',
          details: error.message,
          paymentIntentId: paymentIntent.id,
        });
      }

    } else if (paymentIntent.status === 'requires_action') {
      // Payment requires additional action (like 3D Secure)
      return res.status(200).json({
        success: false,
        message: 'Payment requires additional authentication',
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
      });

    } else if (paymentIntent.status === 'processing') {
      // Payment is still processing
      return res.status(200).json({
        success: false,
        message: 'Payment is being processed',
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
      });

    } else {
      // Payment failed
      return res.status(400).json({
        success: false,
        error: 'Payment failed',
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
      });
    }

  } catch (error) {
    console.error('Stripe checkout error:', error);

    // Determine error message
    let errorMessage = 'Payment processing failed';
    if (error.type === 'StripeCardError') {
      errorMessage = error.message;
    } else if (error.type === 'StripeInvalidRequestError') {
      errorMessage = 'Invalid payment information';
    }

    return res.status(500).json({
      error: errorMessage,
      details: error.message,
    });
  }
}
