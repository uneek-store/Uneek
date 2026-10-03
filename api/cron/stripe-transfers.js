// /api/cron/stripe-transfers.js
// Cron job pour transférer l'argent aux créateurs 21 jours après
// l'expédition de leur colis (règle : api/lib/virement.js).

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { JOURS_APRES_EXPEDITION, dateDeLiberation, rangerParColis } from '../lib/virement.js';

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
    // 1. Les virements en attente. Un colis part toujours APRES la commande :
    //    une ligne de moins de 21 jours ne peut donc pas etre mure. Ce premier
    //    tri evite de lire toute la table.
    const seuil = new Date();
    seuil.setDate(seuil.getDate() - JOURS_APRES_EXPEDITION);

    const { data: candidats, error: fetchError } = await supabase
      .from('pending_transfers')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', seuil.toISOString());

    if (fetchError) {
      console.error('Erreur lors de la récupération des transferts :', fetchError);
      return res.status(500).json({ error: 'Failed to fetch pending transfers' });
    }

    // 1 bis. On ne garde que les colis ENTIEREMENT expedies depuis au moins
    //    21 jours. Un colis pas encore parti (ou renvoye) attend : rien n'est
    //    vire, la ligne reste « pending » et sera relue la nuit suivante.
    let pendingTransfers = [];
    let enAttenteExpedition = 0;
    if (candidats && candidats.length) {
      const [comptes, lignes] = await Promise.all([
        supabase.from('creator_accounts').select('id, brand_id')
          .in('id', [...new Set(candidats.map((t) => t.creator_id))]),
        supabase.from('order_items').select('order_id, brand_id, fulfillment_status, shipped_at')
          .in('order_id', [...new Set(candidats.map((t) => t.order_id))]),
      ]);
      if (comptes.error || lignes.error) {
        // Dans le doute, on ne vire RIEN : mieux vaut un jour de retard qu'un
        // virement parti trop tot.
        console.error('Lecture des expeditions impossible :',
          (comptes.error || lignes.error).message);
        return res.status(500).json({ error: 'Failed to read shipments' });
      }
      const marqueDe = new Map((comptes.data || []).map((c) => [c.id, c.brand_id]));
      const parColis = rangerParColis(lignes.data);
      const maintenant = Date.now();
      for (const t of candidats) {
        const colis = parColis.get(t.order_id + '|' + marqueDe.get(t.creator_id));
        const liberation = dateDeLiberation(colis, t.created_at);
        if (liberation !== null && liberation <= maintenant) pendingTransfers.push(t);
        else enAttenteExpedition++;
      }
    }

    if (pendingTransfers.length === 0) {
      return res.status(200).json({
        message: 'No transfers to process',
        processedCount: 0,
        waitingCount: enAttenteExpedition
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
          // Les commandes sont encaissees en euros. Virer en dollars ferait
          // echouer le transfert faute de solde dans cette devise, ou le
          // convertirait aux frais d'UNEEK.
          currency: 'eur',
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
