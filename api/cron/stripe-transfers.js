// /api/cron/stripe-transfers.js
// Cron job pour transférer l'argent aux créateurs après 14 jours

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Vérifier que c'est une requête du cron Vercel
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  const cronSecret = req.query.secret || req.headers['x-cron-secret'];
  const expectedSecret = process.env.STRIPE_TRANSFER_SECRET;

  if (!isVercelCron && cronSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Récupérer toutes les pending_transfers qui ont > 14 jours
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: pendingTransfers, error: fetchError } = await supabase
      .from('pending_transfers')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', fourteenDaysAgo.toISOString());

    if (fetchError) {
      console.error('Erreur lors de la récupération des transferts :', fetchError);
      return res.status(500).json({ error: 'Failed to fetch pending transfers' });
    }

    if (!pendingTransfers || pendingTransfers.length === 0) {
      return res.status(200).json({
        message: 'No transfers to process',
        processedCount: 0
      });
    }

    // 2. Grouper les transferts par créateur (stripe_account_id)
    const transfersByCreator = {};
    pendingTransfers.forEach((transfer) => {
      const accountId = transfer.stripe_account_id;
      if (!transfersByCreator[accountId]) {
        transfersByCreator[accountId] = [];
      }
      transfersByCreator[accountId].push(transfer);
    });

    // 3. Exécuter les transferts pour chaque créateur
    const results = [];
    const errors = [];

    for (const [accountId, transfers] of Object.entries(transfersByCreator)) {
      try {
        const totalAmount = transfers.reduce((sum, t) => sum + t.amount, 0);

        const stripeTransfer = await stripe.transfers.create({
          amount: totalAmount,
          currency: 'usd',
          destination: accountId,
          description: `UNEEK payout - ${transfers.length} orders`,
          metadata: {
            transfer_ids: transfers.map(t => t.id).join(','),
            order_count: transfers.length,
          },
        });

        const transferIds = transfers.map(t => t.id);
        const { error: updateError } = await supabase
          .from('pending_transfers')
          .update({
            status: 'completed',
            stripe_transfer_id: stripeTransfer.id,
            transferred_at: new Date().toISOString(),
          })
          .in('id', transferIds);

        if (updateError) {
          throw updateError;
        }

        await supabase
          .from('transfer_logs')
          .insert({
            destination_account: accountId,
            amount: totalAmount,
            stripe_transfer_id: stripeTransfer.id,
          });

        results.push({
          accountId,
          transferCount: transfers.length,
          amount: totalAmount,
          stripeTransferId: stripeTransfer.id,
          status: 'success',
        });

        console.log(
          `✅ Transfert réussi pour ${accountId}: ${totalAmount / 100}$ (${transfers.length} commandes)`
        );
      } catch (error) {
        errors.push({
          accountId,
          error: error.message,
          transferCount: transfers.length,
        });
        console.error(`❌ Erreur pour ${accountId}:`, error.message);
      }
    }

    return res.status(200).json({
      message: 'Cron job completed',
      processedCount: pendingTransfers.length,
      successfulTransfers: results.length,
      failedTransfers: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error('Erreur critique du cron job :', error);
    return res.status(500).json({
      error: 'Cron job failed',
      details: error.message
    });
  }
}
