// API : /api/creator/stats
// GET ?brand_id=...&jours=30 → les chiffres de l'onglet « Mes stats ».
//
// CE QUE FAIT CE FICHIER
// Il croise deux sources et ne renvoie que des totaux :
//   - product_events : vues, favoris, mises au panier (aucune donnée
//     personnelle dedans, voir api/lib/evenements.sql) ;
//   - order_items    : ventes, revenu net, tailles et couleurs.
//
// TROIS PRÉCAUTIONS QUI COMPTENT
// 1. On ne lit que les produits de la marque connectée, et on ne cherche
//    les évènements que pour CES identifiants. Une marque ne peut pas voir
//    les chiffres d'une autre, même en changeant brand_id dans l'adresse
//    (controlerAcces compare avec la marque du jeton).
// 2. Si la table product_events n'existe pas encore, tout renvoie zéro au
//    lieu de planter : l'onglet s'affiche, simplement sans les vues.
// 3. Un taux de conversion sur 4 vues ne veut rien dire. On renvoie donc
//    aussi le seuil, et le panneau masque le taux en dessous.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";

const SEUIL_VUES = 30;          // en dessous, pas de taux affiché
const JOURS_PERMIS = [7, 30, 90];
const MAX_EVENEMENTS = 50000;   // garde-fou : on ne ramène jamais plus que ça

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/stats" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: "brand_id requis" });

    const jours = JOURS_PERMIS.indexOf(parseInt(req.query.jours, 10)) !== -1
      ? parseInt(req.query.jours, 10)
      : 30;
    const debut = new Date(Date.now() - jours * 86400000).toISOString();

    // --- 1. les produits de la marque ---
    const { data: produits, error: errProduits } = await supabaseAdmin
      .from("products")
      .select("id, name, price, sizes_stock, created_at")
      .eq("brand_id", brand_id);

    if (errProduits) {
      console.error("[stats] produits :", errProduits.message);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    const liste = produits || [];
    const ids = liste.map((p) => String(p.id));

    // --- 2. les évènements de ces produits, sur la période ---
    // suivi_actif dit au panneau s'il doit afficher les vues ou expliquer
    // qu'elles ne sont pas encore mesurées.
    let evenements = [];
    let suiviActif = true;
    if (ids.length) {
      const { data, error } = await supabaseAdmin
        .from("product_events")
        .select("product_id, type")
        .in("product_id", ids)
        .gte("created_at", debut)
        .limit(MAX_EVENEMENTS);

      if (error) {
        // Table absente ou inaccessible : l'onglet doit quand même s'ouvrir.
        console.warn("[stats] évènements indisponibles :", error.message);
        suiviActif = false;
      } else {
        evenements = data || [];
      }
    }

    // --- 3. les lignes de commande de la marque, sur la période ---
    // La date d'une vente vient de la COMMANDE (orders.created_at), jamais de
    // la ligne : order_items n'a pas de colonne created_at, et la demander
    // faisait échouer toute la requête — donc tout l'onglet.
    //
    // Le repli ci-dessous existe pour la même raison : si un jour une colonne
    // de cette liste change de nom, on retombe sur un select minimal au lieu
    // de renvoyer une erreur. Un onglet avec moins de détail vaut mieux qu'un
    // onglet mort.
    const COLONNES_COMPLETES =
      "product_id, product_name, size, color, quantity, product_price, creator_payout, orders(created_at, status)";
    const COLONNES_MINIMALES = "product_id, quantity, orders(created_at)";

    let lignes = [];
    let ventesCompletes = true;
    {
      const r = await supabaseAdmin
        .from("order_items")
        .select(COLONNES_COMPLETES)
        .eq("brand_id", brand_id);

      if (r.error) {
        console.error("[stats] lignes de commande (select complet) :", r.error.message);
        const secours = await supabaseAdmin
          .from("order_items")
          .select(COLONNES_MINIMALES)
          .eq("brand_id", brand_id);

        if (secours.error) {
          console.error("[stats] lignes de commande (select minimal) :", secours.error.message);
          return res.status(500).json({ error: "Erreur serveur" });
        }
        lignes = secours.data || [];
        ventesCompletes = false;
      } else {
        lignes = r.data || [];
      }
    }

    const depuis = new Date(debut).getTime();
    const dansLaPeriode = (l) => {
      const d = l.orders && l.orders.created_at;
      if (!d) return false;
      const t = new Date(d).getTime();
      return !isNaN(t) && t >= depuis;
    };
    const vendues = (lignes || []).filter(dansLaPeriode);

    // --- 4. on assemble, produit par produit ---
    const par = {};
    liste.forEach((p) => {
      par[String(p.id)] = {
        id: String(p.id),
        nom: p.name || "Sans nom",
        prix: Number(p.price) || 0,
        vues: 0, favoris: 0, paniers: 0,
        ventes: 0, revenu: 0,
      };
    });

    evenements.forEach((e) => {
      const c = par[String(e.product_id)];
      if (!c) return;                               // produit supprimé depuis
      if (e.type === "vue") c.vues++;
      else if (e.type === "favori") c.favoris++;
      else if (e.type === "panier") c.paniers++;
    });

    const tailles = {}, couleurs = {};
    vendues.forEach((l) => {
      const q = Number(l.quantity) || 1;
      const c = par[String(l.product_id)];
      if (c) {
        c.ventes += q;
        // Même repli que le reste du panneau quand creator_payout est vide.
        // Attention : Number(null) vaut 0, pas NaN — sans ce test explicite,
        // une ligne sans creator_payout compterait pour zéro euro au lieu de
        // retomber sur les 88 %.
        const brut = l.creator_payout;
        const vide = brut === null || brut === undefined || brut === "";
        const net = vide ? NaN : Number(brut);
        c.revenu += isNaN(net)
          ? (Number(l.product_price) || 0) * q * 0.88
          : net;
      }
      // En mode secours, size et color ne sont pas lus : on ne remplit rien
      // plutôt que d'inventer des « Taille unique » qui n'existent pas.
      if (ventesCompletes) {
        const t = l.size || "Taille unique";
        const co = l.color || "Sans couleur";
        tailles[t] = (tailles[t] || 0) + q;
        couleurs[co] = (couleurs[co] || 0) + q;
      }
    });

    const pieces = Object.keys(par).map((k) => par[k]);
    const somme = (champ) => pieces.reduce((a, p) => a + p[champ], 0);

    // --- 5. clients qui reviennent, sur la période ---
    // Deux commandes ou plus avec la même adresse : un client fidèle. On ne
    // garde aucune adresse, juste le compte.
    let fideles = null;
    try {
      const { data: cmds } = await supabaseAdmin
        .from("order_items")
        .select("orders(customer_email, created_at)")
        .eq("brand_id", brand_id);
      const vus = {};
      (cmds || []).forEach((l) => {
        const o = l.orders;
        if (!o || !o.customer_email || !o.created_at) return;
        if (new Date(o.created_at).getTime() < depuis) return;
        const e = String(o.customer_email).toLowerCase();
        vus[e] = (vus[e] || 0) + 1;
      });
      const clients = Object.keys(vus);
      if (clients.length >= 5) {
        const revenus = clients.filter((e) => vus[e] > 1).length;
        fideles = Math.round((revenus / clients.length) * 100);
      }
    } catch (err) {
      console.warn("[stats] fidélité ignorée :", err && err.message);
    }

    return res.status(200).json({
      jours,
      suivi_actif: suiviActif,
      ventes_completes: ventesCompletes,
      seuil_vues: SEUIL_VUES,
      totaux: {
        vues: somme("vues"),
        favoris: somme("favoris"),
        paniers: somme("paniers"),
        ventes: somme("ventes"),
        revenu: Math.round(somme("revenu")),
      },
      fideles,
      pieces: pieces.sort((a, b) => b.revenu - a.revenu).map((p) => ({
        ...p,
        revenu: Math.round(p.revenu),
      })),
      tailles: Object.keys(tailles).map((k) => [k, tailles[k]]),
      couleurs: Object.keys(couleurs).map((k) => [k, couleurs[k]]),
    });
  } catch (err) {
    console.error("[stats] erreur :", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
