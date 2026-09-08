// API : /api/admin/versements
// GET → l'etat de l'argent des createurs, marque par marque.
//
// POURQUOI CE FICHIER EXISTE
// Stripe montre le total encaisse, jamais le partage : la part des createurs
// est melee a celle d'UNEEK dans un seul solde. La question "combien est-ce
// que je dois encore aux createurs" n'avait donc de reponse nulle part.
//
// LE CHIFFRE QUI COMPTE VRAIMENT EST L'ECART
// On compare deux choses qui devraient etre egales :
//   - ce qui est DU     : la somme des parts createur sur les commandes payees
//   - ce qui est SUIVI  : les lignes de pending_transfers (en attente + versees)
// Si l'ecart n'est pas nul, de l'argent du a un createur n'est inscrit nulle
// part et ne partira jamais tout seul. C'est le cas quand le createur n'avait
// pas encore relie son compte Stripe au moment de la vente. Ce montant est
// affiche en clair plutot que d'etre silencieusement absent des totaux.
//
// TOUT EST EN CENTIMES
// order_items.creator_payout est en euros, pending_transfers.amount en
// centimes. On ramene tout en centimes ici pour ne jamais additionner deux
// unites differentes ; l'affichage divise par 100 une seule fois.

import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";

// Le robot des virements ne prend que les parts de plus de 14 jours
// (voir /api/cron/stripe-transfers). On applique le meme delai pour dire
// ce qui est deja exigible et ce qui doit encore murir.
const JOURS_AVANT_VIREMENT = 14;

function cents(euros) {
  return Math.round((parseFloat(euros) || 0) * 100);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const acces = controlerAcces(req, { admin: true, nom: "/api/admin/versements" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  try {
    // 1. Les commandes reellement encaissees. Une commande non payee ne doit
    //    rien a personne : l'inclure gonflerait la dette envers les createurs.
    const { data: commandes, error: erreurCommandes } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, created_at, stripe_charge_id")
      .eq("payment_status", "paid");

    if (erreurCommandes) throw new Error("commandes : " + erreurCommandes.message);

    const idsPayees = (commandes || []).map((c) => c.id);

    // 2. Le detail de ces commandes : c'est la que vit le partage.
    let lignes = [];
    if (idsPayees.length) {
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("order_id, brand_id, product_price, quantity, creator_payout, commission_amount")
        .in("order_id", idsPayees);
      if (error) throw new Error("lignes de commande : " + error.message);
      lignes = data || [];
    }

    // 3. Ce qui est suivi cote virements, et qui est relie a Stripe.
    const [{ data: virements, error: erreurVirements },
           { data: comptes, error: erreurComptes },
           { data: marques, error: erreurMarques }] = await Promise.all([
      supabaseAdmin.from("pending_transfers").select("creator_id, amount, status, created_at"),
      supabaseAdmin.from("creator_accounts").select("id, email, full_name, brand_id, stripe_account_id"),
      supabaseAdmin.from("brands").select("id, name"),
    ]);

    if (erreurVirements) throw new Error("virements : " + erreurVirements.message);
    if (erreurComptes) throw new Error("comptes createurs : " + erreurComptes.message);
    if (erreurMarques) throw new Error("marques : " + erreurMarques.message);

    const nomDeLaMarque = new Map((marques || []).map((m) => [m.id, m.name]));

    // Un createur peut exister sans marque, et une marque peut porter deux
    // comptes createurs (voir api/orders.js). On retient le compte relie en
    // priorite, pour la meme raison que la : c'est lui qui recevra l'argent.
    const compteDeLaMarque = new Map();
    for (const c of comptes || []) {
      if (!c.brand_id) continue;
      const dejaLa = compteDeLaMarque.get(c.brand_id);
      if (!dejaLa || (!dejaLa.stripe_account_id && c.stripe_account_id)) {
        compteDeLaMarque.set(c.brand_id, c);
      }
    }
    const marqueDuCreateur = new Map((comptes || []).map((c) => [c.id, c.brand_id]));

    // 4. Agregation par marque.
    const parMarque = new Map();
    function ligneMarque(brandId) {
      if (!parMarque.has(brandId)) {
        const compte = compteDeLaMarque.get(brandId);
        parMarque.set(brandId, {
          brand_id: brandId,
          nom: nomDeLaMarque.get(brandId) || "(marque introuvable)",
          createur: (compte && (compte.full_name || compte.email)) || null,
          compte_relie: !!(compte && compte.stripe_account_id),
          ventes_cents: 0,
          du_cents: 0,
          commission_cents: 0,
          a_verser_cents: 0,
          exigible_cents: 0,
          deja_verse_cents: 0,
        });
      }
      return parMarque.get(brandId);
    }

    for (const l of lignes) {
      if (!l.brand_id) continue;
      const m = ligneMarque(l.brand_id);
      m.ventes_cents += cents(l.product_price) * (l.quantity || 1);
      m.du_cents += cents(l.creator_payout);
      m.commission_cents += cents(l.commission_amount);
    }

    const limite = Date.now() - JOURS_AVANT_VIREMENT * 24 * 60 * 60 * 1000;
    let orphelins_cents = 0; // virements dont on ne retrouve pas la marque

    for (const v of virements || []) {
      const brandId = marqueDuCreateur.get(v.creator_id);
      const montant = parseInt(v.amount, 10) || 0;
      if (!brandId) {
        orphelins_cents += montant;
        continue;
      }
      const m = ligneMarque(brandId);
      if (v.status === "completed") {
        m.deja_verse_cents += montant;
      } else if (v.status === "pending") {
        m.a_verser_cents += montant;
        if (new Date(v.created_at).getTime() < limite) m.exigible_cents += montant;
      }
    }

    // L'ecart : du a un createur, mais suivi nulle part.
    for (const m of parMarque.values()) {
      m.non_inscrit_cents = Math.max(0, m.du_cents - m.a_verser_cents - m.deja_verse_cents);
    }

    const rangs = [...parMarque.values()].sort((a, b) =>
      (b.a_verser_cents + b.non_inscrit_cents) - (a.a_verser_cents + a.non_inscrit_cents)
      || b.ventes_cents - a.ventes_cents);

    const somme = (champ) => rangs.reduce((s, m) => s + m[champ], 0);

    // 5. Les frais reellement preleves par Stripe, pour que "ta part" soit ce
    //    qui reste et non une commission theorique. On les demande a Stripe
    //    plutot que de les estimer : le tarif depend de la carte du client.
    //    Une seule page de transactions suffit tant que le volume est modeste ;
    //    si on n'a pas TOUS les frais, on ne renvoie rien du tout — un total
    //    partiel presente comme complet serait pire que pas de chiffre.
    const empreintes = new Set((commandes || []).map((c) => c.stripe_charge_id).filter(Boolean));
    let frais_cents = null;
    if (process.env.STRIPE_SECRET_KEY && empreintes.size) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const lot = await stripe.balanceTransactions.list({ type: "charge", limit: 100 });
        let total = 0;
        let trouvees = 0;
        for (const t of lot.data || []) {
          const source = typeof t.source === "string" ? t.source : (t.source && t.source.id);
          if (source && empreintes.has(source)) {
            total += t.fee || 0;
            trouvees++;
          }
        }
        if (trouvees === empreintes.size) frais_cents = total;
        else console.warn("[versements] frais Stripe partiels :", trouvees, "/", empreintes.size);
      } catch (err) {
        console.warn("[versements] frais Stripe indisponibles :", err && err.message);
      }
    }

    const commission_cents = somme("commission_cents");

    return res.status(200).json({
      resume: {
        frais_cents,
        net_cents: frais_cents === null ? null : commission_cents - frais_cents,
        commandes_payees: idsPayees.length,
        volume_cents: somme("ventes_cents"),
        commission_cents: somme("commission_cents"),
        du_cents: somme("du_cents"),
        a_verser_cents: somme("a_verser_cents"),
        exigible_cents: somme("exigible_cents"),
        deja_verse_cents: somme("deja_verse_cents"),
        non_inscrit_cents: somme("non_inscrit_cents"),
        orphelins_cents,
      },
      marques: rangs,
      delai_jours: JOURS_AVANT_VIREMENT,
    });
  } catch (err) {
    console.error("[versements]", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
