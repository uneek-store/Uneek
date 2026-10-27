// /api/cron/stripe-transfers.js
// Cron job pour transférer l'argent aux créateurs 21 jours après
// l'expédition de leur colis (règle : api/lib/virement.js).

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { JOURS_APRES_EXPEDITION, dateDeLiberation, rangerParColis } from '../lib/virement.js';
import { lireJeton, jetonDeLaRequete } from '../lib/session.js';
import { rattraperVirements } from '../lib/paiement.js';

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

  // Sans secret configure, « undefined === undefined » laissait passer
  // n'importe qui. Le robot ne vire jamais avant l'heure, mais personne
  // d'autre que Vercel n'a a le declencher.
  // A FAIRE (Axel) : definir CRON_SECRET dans Vercel ; Vercel l'envoie alors
  // en « Authorization: Bearer ... », ce que l'en-tete x-vercel-cron ne
  // garantit pas (il peut etre imite).
  const bearer = String(req.headers['authorization'] || '');
  const cronVercelSigne = !!process.env.CRON_SECRET && bearer === 'Bearer ' + process.env.CRON_SECRET;
  const secretValide = !!expectedSecret && cronSecret === expectedSecret;
  // L'administrateur connecte peut aussi lancer le robot a la main (12 octobre
  // 2026) : jeton REELLEMENT signe et marque admin, quel que soit AUTH_MODE.
  // Le robot garde ses regles : rien n'est vire avant les 21 jours.
  const lu = lireJeton(jetonDeLaRequete(req));
  const adminSigne = !!(lu.ok && lu.session && lu.session.admin);
  if (adminSigne) console.log('[virements] lance a la main par', lu.session.email || 'admin');
  if (!adminSigne && !cronVercelSigne && !secretValide && !(isVercelCron && !process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 0. Rattrapage (27 octobre 2026) : les parts des createurs qui ont relie
  //    Stripe APRES la commande sont inscrites maintenant. Jamais bloquant.
  let rattrapees = 0;
  try {
    rattrapees = await rattraperVirements(supabase);
  } catch (err) {
    console.error('[virements] rattrapage impossible :', err && err.message);
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
    let bloquesPaiement = 0;
    if (candidats && candidats.length) {
      const idsCommandes = [...new Set(candidats.map((t) => t.order_id))];
      const [comptes, lignes, commandes] = await Promise.all([
        supabase.from('creator_accounts').select('id, brand_id')
          .in('id', [...new Set(candidats.map((t) => t.creator_id))]),
        supabase.from('order_items').select('order_id, brand_id, fulfillment_status, shipped_at')
          .in('order_id', idsCommandes),
        supabase.from('orders').select('id, status, payment_status').in('id', idsCommandes),
      ]);
      if (comptes.error || lignes.error || commandes.error) {
        // Dans le doute, on ne vire RIEN : mieux vaut un jour de retard qu'un
        // virement parti trop tot.
        console.error('Lecture des expeditions impossible :',
          (comptes.error || lignes.error || commandes.error).message);
        return res.status(500).json({ error: 'Failed to read shipments' });
      }
      // Une commande remboursee (en tout ou en partie) depuis Stripe, ou dont
      // le paiement n'est plus confirme, n'est JAMAIS viree automatiquement
      // (12 octobre 2026) : avant, le robot payait le createur d'une commande
      // deja rendue au client, et UNEEK payait deux fois. La ligne reste
      // « pending » et se regle a la main.
      // Une commande annulee ne compte jamais comme payee, quoi qu'en dise
      // payment_status.
      const statutPaiement = new Map((commandes.data || []).map((c) =>
        [c.id, c.status === 'cancelled' ? 'cancelled' : c.payment_status]));
      const marqueDe = new Map((comptes.data || []).map((c) => [c.id, c.brand_id]));
      const parColis = rangerParColis(lignes.data);
      const maintenant = Date.now();
      for (const t of candidats) {
        const colis = parColis.get(t.order_id + '|' + marqueDe.get(t.creator_id));
        if (statutPaiement.get(t.order_id) !== 'paid') {
          bloquesPaiement++;
          console.warn('[virements] part', t.id, 'bloquee : commande', t.order_id,
            'en statut de paiement', statutPaiement.get(t.order_id) || '(inconnu)', '— a regler a la main');
          continue;
        }
        const liberation = dateDeLiberation(colis, t.created_at);
        if (liberation !== null && liberation <= maintenant) pendingTransfers.push(t);
        else enAttenteExpedition++;
      }
    }

    if (pendingTransfers.length === 0) {
      return res.status(200).json({
        message: 'No transfers to process',
        processedCount: 0,
        waitingCount: enAttenteExpedition,
        blockedCount: bloquesPaiement,
        caughtUpCount: rattrapees
      });
    }

    // 2. UN VIREMENT PAR PART (une commande, un createur) — 12 octobre 2026.
    //
    // Avant, les parts d'un createur etaient additionnees en un seul virement.
    // Si la base ne pouvait pas enregistrer « completed » juste apres (coupure,
    // delai depasse), les memes parts repartaient la nuit suivante : le
    // createur etait paye deux fois. Mesure par tests-argent.mjs.
    //
    // Maintenant chaque part porte une cle d'idempotence qui lui est propre :
    // si le robot la represente a Stripe, Stripe renvoie le PREMIER virement
    // au lieu d'en creer un second. Le createur recoit plusieurs lignes sur
    // son releve Stripe, mais un seul versement bancaire, que Stripe regroupe.
    //
    // source_transaction : le virement est rattache au paiement du client. Il
    // ne peut pas depasser ce paiement, et il n'echoue pas parce que le solde
    // d'UNEEK serait momentanement bas (fonds pas encore disponibles,
    // remboursement recent sur une autre commande).
    const results = [];
    const errors = [];

    for (const t of pendingTransfers) {
      try {
        const params = {
          amount: t.amount,
          // Les commandes sont encaissees en euros. Virer en dollars ferait
          // echouer le transfert faute de solde dans cette devise, ou le
          // convertirait aux frais d'UNEEK.
          currency: 'eur',
          destination: t.stripe_account_id,
          description: 'UNEEK - commande ' + t.order_id,
          transfer_group: 'commande-' + t.order_id,
          metadata: {
            transfer_ids: String(t.id),
            order_id: String(t.order_id),
            creator_id: String(t.creator_id),
          },
        };
        if (t.charge_id) params.source_transaction = t.charge_id;

        // Stripe oublie une cle d'idempotence apres 24 heures, et le robot ne
        // passe qu'une fois par nuit. On demande donc d'abord a Stripe si
        // cette part a deja ete viree (meme groupe, meme numero de part).
        const deja = await stripe.transfers.list({ transfer_group: params.transfer_group, limit: 100 });
        const dejaVire = ((deja && deja.data) || []).find((v) =>
          v.metadata && String(v.metadata.transfer_ids) === String(t.id) && !v.reversed);
        if (dejaVire) {
          console.warn('[virements] part', t.id, 'deja viree par', dejaVire.id, '— on enregistre sans revirer');
        }
        const stripeTransfer = dejaVire || await stripe.transfers.create(params, {
          idempotencyKey: 'uneek-virement-' + t.id,
        });

        const { error: updateError } = await supabase
          .from('pending_transfers')
          .update({
            status: 'completed',
            stripe_transfer_id: stripeTransfer.id,
            transferred_at: new Date().toISOString(),
          })
          .in('id', [t.id]);

        if (updateError) {
          // Le virement EST parti. La ligne sera representee demain avec la
          // meme cle : Stripe ne virera pas une seconde fois.
          throw new Error('virement ' + stripeTransfer.id + ' parti mais non enregistre : '
            + updateError.message);
        }

        await supabase
          .from('transfer_logs')
          .insert({
            destination_account: t.stripe_account_id,
            amount: t.amount,
            stripe_transfer_id: stripeTransfer.id,
          });

        results.push({
          accountId: t.stripe_account_id,
          transferCount: 1,
          amount: t.amount,
          stripeTransferId: stripeTransfer.id,
          status: 'success',
        });

        console.log('✅ Virement ' + (t.amount / 100).toFixed(2) + ' EUR vers '
          + t.stripe_account_id + ' (part ' + t.id + ')');
      } catch (error) {
        errors.push({
          accountId: t.stripe_account_id,
          transferId: t.id,
          error: error.message,
          transferCount: 1,
        });
        console.error('❌ Erreur pour la part ' + t.id + ' (' + t.stripe_account_id + ') :', error.message);
      }
    }

    return res.status(200).json({
      message: 'Cron job completed',
      processedCount: pendingTransfers.length,
      successfulTransfers: results.length,
      failedTransfers: errors.length,
      waitingCount: enAttenteExpedition,
      blockedCount: bloquesPaiement,
      caughtUpCount: rattrapees,
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
