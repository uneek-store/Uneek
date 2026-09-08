// API : /api/admin/versements
// GET → l'argent des ventes, mois par mois : ce qui rentre, ce qui revient
//       aux createurs, ce qui te reste une fois Stripe paye.
//
// POURQUOI CE FICHIER EXISTE
// Stripe montre le total encaisse, jamais le partage : la part des createurs
// est melee a celle d'UNEEK dans un seul solde. La question "combien est
// vraiment a moi" n'avait de reponse nulle part.
//
// AUCUN POURCENTAGE N'EST FIXE ICI
// Chaque ligne de commande porte son propre taux (products.commission_percent
// au moment de la vente). On additionne des montants deja calcules, jamais un
// pourcentage applique au total : deux mois de meme chiffre d'affaires peuvent
// donner deux partages differents selon les produits vendus. taux_min et
// taux_max disent quels taux ont reellement joue dans le mois.
//
// LE CHIFFRE QUI COMPTE VRAIMENT EST L'ECART
// On compare deux choses qui devraient etre egales :
//   - ce qui est DU    : la somme des parts createur sur les commandes payees
//   - ce qui est SUIVI : les lignes de pending_transfers de ces commandes
// L'ecart est de l'argent du a un createur qui ne partira jamais tout seul —
// typiquement une vente conclue avant qu'il ne relie son compte bancaire.
// Il est renvoye a part (a_la_main) plutot que d'etre silencieusement absent.
//
// TOUT EST EN CENTIMES
// order_items est en euros, pending_transfers en centimes. On ramene tout en
// centimes ici pour ne jamais additionner deux unites ; l'affichage divise
// par 100 une seule fois.

import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";

// Meme delai que le robot des virements (/api/cron/stripe-transfers).
const JOURS_AVANT_VIREMENT = 14;
// Combien de mois on renvoie au maximum, meme si la boutique est plus vieille.
const MOIS_MAX = 24;

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Les mois sont ceux du calendrier belge, pas ceux d'UTC : une commande du
// 1er a 01 h 30 a Bruxelles est enregistree le 31 a 23 h 30 en UTC, et
// tomberait dans le mois precedent.
const FUSEAU = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels", year: "numeric", month: "2-digit",
});

function cleDuMois(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = FUSEAU.formatToParts(d);
  const an = p.find((x) => x.type === "year");
  const mo = p.find((x) => x.type === "month");
  return an && mo ? an.value + "-" + mo.value : null;
}

function nomDuMois(cle) {
  const [an, mo] = cle.split("-");
  return NOMS_MOIS[parseInt(mo, 10) - 1] + " " + an;
}

// Toutes les cles de mois entre deux bornes, sans trou : un mois sans vente
// doit apparaitre a zero, sinon le graphique ment sur le rythme des ventes.
function moisEntre(debut, fin) {
  const liste = [];
  let [a, m] = debut.split("-").map(Number);
  const [af, mf] = fin.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    liste.push(a + "-" + String(m).padStart(2, "0"));
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return liste;
}

function cents(euros) {
  return Math.round((parseFloat(euros) || 0) * 100);
}

// Les frais reels preleves par Stripe, charge par charge. On les demande a
// Stripe plutot que de les estimer : le tarif depend de la carte du client.
// Si une seule charge du mois manque a l'appel, ce mois renvoie null au lieu
// d'un total partiel presente comme complet.
async function fraisParEmpreinte(empreintes) {
  const frais = new Map();
  if (!process.env.STRIPE_SECRET_KEY || empreintes.size === 0) return frais;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let curseur;
    for (let page = 0; page < 5; page++) {
      const lot = await stripe.balanceTransactions.list(
        Object.assign({ type: "charge", limit: 100 }, curseur ? { starting_after: curseur } : {})
      );
      for (const t of lot.data || []) {
        const source = typeof t.source === "string" ? t.source : (t.source && t.source.id);
        if (source && empreintes.has(source)) frais.set(source, t.fee || 0);
      }
      if (!lot.has_more || !lot.data.length) break;
      if (frais.size === empreintes.size) break;
      curseur = lot.data[lot.data.length - 1].id;
    }
  } catch (err) {
    console.warn("[versements] frais Stripe indisponibles :", err && err.message);
  }
  return frais;
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
      .select("id, created_at, stripe_charge_id")
      .eq("payment_status", "paid");
    if (erreurCommandes) throw new Error("commandes : " + erreurCommandes.message);

    const payees = commandes || [];
    const moisDeLaCommande = new Map();
    for (const c of payees) moisDeLaCommande.set(c.id, cleDuMois(c.created_at));

    // 2. Le detail des commandes : c'est la que vit le partage.
    let lignes = [];
    if (payees.length) {
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("order_id, brand_id, product_price, quantity, creator_payout, commission_amount, commission_percent")
        .in("order_id", payees.map((c) => c.id));
      if (error) throw new Error("lignes de commande : " + error.message);
      lignes = data || [];
    }

    // 3. Ce qui est suivi cote virements, et qui est relie a Stripe.
    const [{ data: virements, error: erreurVirements },
           { data: comptes, error: erreurComptes },
           { data: marques, error: erreurMarques }] = await Promise.all([
      supabaseAdmin.from("pending_transfers").select("order_id, creator_id, amount, status, created_at"),
      supabaseAdmin.from("creator_accounts").select("id, email, full_name, brand_id, stripe_account_id"),
      supabaseAdmin.from("brands").select("id, name"),
    ]);
    if (erreurVirements) throw new Error("virements : " + erreurVirements.message);
    if (erreurComptes) throw new Error("comptes createurs : " + erreurComptes.message);
    if (erreurMarques) throw new Error("marques : " + erreurMarques.message);

    const nomDeLaMarque = new Map((marques || []).map((m) => [m.id, m.name]));
    const marqueDuCreateur = new Map((comptes || []).map((c) => [c.id, c.brand_id]));

    // Une marque peut porter deux comptes createurs (un compte d'origine et
    // celui qui tient la boutique). On retient celui qui a relie Stripe :
    // c'est lui qui recevra l'argent (meme regle que dans api/orders.js).
    const compteDeLaMarque = new Map();
    for (const c of comptes || []) {
      if (!c.brand_id) continue;
      const deja = compteDeLaMarque.get(c.brand_id);
      if (!deja || (!deja.stripe_account_id && c.stripe_account_id)) {
        compteDeLaMarque.set(c.brand_id, c);
      }
    }

    // 4. Frais Stripe reels, ranges par mois via la commande qui les a payes.
    const empreintes = new Set(payees.map((c) => c.stripe_charge_id).filter(Boolean));
    const fraisDe = await fraisParEmpreinte(empreintes);

    // 5. Agregation par mois, puis par marque dans chaque mois.
    const parMois = new Map();
    function mois(cle) {
      if (!parMois.has(cle)) {
        parMois.set(cle, {
          cle,
          nom: nomDuMois(cle),
          commandes: new Set(),
          ventes_cents: 0,
          createurs_cents: 0,
          toi_cents: 0,
          frais_cents: 0,
          frais_complets: true, // faux des qu'une charge du mois manque
          taux_min: null,
          taux_max: null,
          marques: new Map(),
        });
      }
      return parMois.get(cle);
    }
    function marqueDuMois(m, brandId) {
      if (!m.marques.has(brandId)) {
        const compte = compteDeLaMarque.get(brandId);
        m.marques.set(brandId, {
          brand_id: brandId,
          nom: nomDeLaMarque.get(brandId) || "(marque introuvable)",
          createur: (compte && (compte.full_name || compte.email)) || null,
          compte_relie: !!(compte && compte.stripe_account_id),
          ventes_cents: 0,
          createurs_cents: 0,
          toi_cents: 0,
          suivi_cents: 0,
          taux_min: null,
          taux_max: null,
        });
      }
      return m.marques.get(brandId);
    }

    for (const l of lignes) {
      const cle = moisDeLaCommande.get(l.order_id);
      if (!cle || !l.brand_id) continue;
      const m = mois(cle);
      const b = marqueDuMois(m, l.brand_id);
      const vente = cents(l.product_price) * (l.quantity || 1);
      const part = cents(l.creator_payout);
      const commission = cents(l.commission_amount);

      m.commandes.add(l.order_id);
      m.ventes_cents += vente;
      m.createurs_cents += part;
      m.toi_cents += commission;
      b.ventes_cents += vente;
      b.createurs_cents += part;
      b.toi_cents += commission;

      const taux = parseFloat(l.commission_percent);
      if (!isNaN(taux)) {
        for (const cible of [m, b]) {
          cible.taux_min = cible.taux_min === null ? taux : Math.min(cible.taux_min, taux);
          cible.taux_max = cible.taux_max === null ? taux : Math.max(cible.taux_max, taux);
        }
      }
    }

    for (const c of payees) {
      const cle = moisDeLaCommande.get(c.id);
      if (!cle || !parMois.has(cle)) continue;
      const m = parMois.get(cle);
      if (!c.stripe_charge_id) { m.frais_complets = false; continue; }
      const f = fraisDe.get(c.stripe_charge_id);
      if (f === undefined) m.frais_complets = false;
      else m.frais_cents += f;
    }

    // Ce qui est deja pris en charge par le robot des virements, range dans
    // le mois de la commande d'origine — pas celui du virement.
    let exigible_cents = 0;
    let prochaineLiberation = null;
    const limite = Date.now() - JOURS_AVANT_VIREMENT * 24 * 60 * 60 * 1000;

    for (const v of virements || []) {
      const montant = parseInt(v.amount, 10) || 0;
      const brandId = marqueDuCreateur.get(v.creator_id);
      const cle = moisDeLaCommande.get(v.order_id);
      if (cle && brandId && parMois.has(cle)) {
        marqueDuMois(parMois.get(cle), brandId).suivi_cents += montant;
      }
      if (v.status === "pending") {
        const ne = new Date(v.created_at).getTime();
        if (ne < limite) {
          exigible_cents += montant;
        } else {
          const liberation = ne + JOURS_AVANT_VIREMENT * 24 * 60 * 60 * 1000;
          if (prochaineLiberation === null || liberation < prochaineLiberation) {
            prochaineLiberation = liberation;
          }
        }
      }
    }

    // 6. Mise en forme : une entree par mois, sans trou, du plus ancien au
    //    plus recent, et jamais moins de six pour que le graphique tienne.
    const maintenant = cleDuMois(new Date().toISOString());
    const cles = [...parMois.keys()].sort();
    let debut = cles.length ? cles[0] : maintenant;
    const cinqAvant = (() => {
      let [a, m] = maintenant.split("-").map(Number);
      m -= 5;
      while (m < 1) { m += 12; a -= 1; }
      return a + "-" + String(m).padStart(2, "0");
    })();
    if (debut > cinqAvant) debut = cinqAvant;

    let serie = moisEntre(debut, maintenant).slice(-MOIS_MAX).map((cle) => {
      const m = parMois.get(cle);
      if (!m) {
        return {
          cle, nom: nomDuMois(cle), commandes: 0, ventes_cents: 0,
          createurs_cents: 0, toi_cents: 0, frais_cents: null,
          a_la_main_cents: 0, taux_min: null, taux_max: null, marques: [],
        };
      }
      const marquesTriees = [...m.marques.values()]
        .map((b) => {
          const restant = Math.max(0, b.createurs_cents - b.suivi_cents);
          return {
            brand_id: b.brand_id,
            nom: b.nom,
            createur: b.createur,
            compte_relie: b.compte_relie,
            ventes_cents: b.ventes_cents,
            createurs_cents: b.createurs_cents,
            toi_cents: b.toi_cents,
            a_la_main_cents: restant,
            taux_min: b.taux_min,
            taux_max: b.taux_max,
          };
        })
        .sort((a, b) => b.ventes_cents - a.ventes_cents);

      return {
        cle,
        nom: m.nom,
        commandes: m.commandes.size,
        ventes_cents: m.ventes_cents,
        createurs_cents: m.createurs_cents,
        toi_cents: m.toi_cents,
        frais_cents: m.frais_complets ? m.frais_cents : null,
        a_la_main_cents: marquesTriees.reduce((s, b) => s + b.a_la_main_cents, 0),
        taux_min: m.taux_min,
        taux_max: m.taux_max,
        marques: marquesTriees,
      };
    });

    return res.status(200).json({
      mois: serie,
      total_commission_cents: serie.reduce((s, m) => s + m.toi_cents, 0),
      exigible_cents,
      prochaine_liberation: prochaineLiberation === null
        ? null
        : new Date(prochaineLiberation).toISOString(),
      delai_jours: JOURS_AVANT_VIREMENT,
    });
  } catch (err) {
    console.error("[versements]", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
