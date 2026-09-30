// API : /api/admin/visites
// GET ?jours=7|30|90 → les chiffres de fréquentation de la vue d'ensemble
//                      admin : visites, carte, conversion, produits cliqués.
//
// POURQUOI CE FICHIER EXISTE
// Axel, le 30 septembre : « si le premier mois j'ai 120 visites et deux
// commandes, je sais qu'il y a un problème ». Il faut donc, côte à côte,
// combien de gens passent et combien commandent.
//
// D'OÙ VIENNENT LES CHIFFRES
//   - site_visits    : une ligne par visite (voir outils/sql/2026-09-30-visites.sql),
//                      écrite par /api/events. Aucune donnée personnelle.
//   - product_events : les fiches produits regardées et mises au panier
//                      (la même source que l'onglet « Mes stats » des créateurs).
//   - orders         : les commandes PAYÉES — la même définition que la carte
//                      « Commandes ce mois » et l'onglet Finances.
//
// UNE VISITE « ACTIVE » = au moins 2 pages vues. C'est la différence entre
// quelqu'un qui arrive et repart aussitôt, et quelqu'un qui a regardé.
//
// SUPABASE NE REND JAMAIS PLUS DE 1000 LIGNES D'UN COUP
// Sans pagination, le 1001e visiteur disparaîtrait des chiffres sans rien
// dire. On lit donc par tranches, jusqu'à un plafond ; s'il est atteint, la
// réponse le dit (tronque: true) au lieu de présenter un total faux.
//
// Si la table site_visits n'existe pas encore (SQL pas lancé), on renvoie
// des zéros et table_absente: true — la vue d'ensemble s'affiche quand même.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";

const JOURS_PERMIS = [7, 30, 90];
const MOIS_AFFICHES = 6;
const TRANCHE = 1000;
const PLAFOND = 100000;
const EN_CE_MOMENT_MS = 5 * 60 * 1000;

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Jours et mois du calendrier belge, pas d'UTC (même raison que
// api/admin/versements.js : minuit à Bruxelles n'est pas minuit à Londres).
const FUSEAU = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
});

export function jourDe(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = FUSEAU.formatToParts(d);
  const v = (t) => (p.find((x) => x.type === t) || {}).value;
  return v("year") + "-" + v("month") + "-" + v("day");
}

function moisPrecedents(n, maintenant) {
  const [a, m] = jourDe(maintenant.toISOString()).split("-").map(Number);
  const liste = [];
  for (let k = n - 1; k >= 0; k--) {
    let mm = m - k, aa = a;
    while (mm < 1) { mm += 12; aa -= 1; }
    liste.push(aa + "-" + String(mm).padStart(2, "0"));
  }
  return liste;
}

function joursPrecedents(n, maintenant) {
  const liste = [];
  for (let k = n - 1; k >= 0; k--) {
    const cle = jourDe(new Date(maintenant.getTime() - k * 86400000).toISOString());
    if (liste[liste.length - 1] !== cle) liste.push(cle);
  }
  return liste;
}

// Lit toute une table par tranches de 1000. `construire` refait la requête
// à chaque tranche (une requête supabase-js ne se rejoue pas).
async function toutLire(construire) {
  const lignes = [];
  for (let debut = 0; debut < PLAFOND; debut += TRANCHE) {
    const { data, error } = await construire().range(debut, debut + TRANCHE - 1);
    if (error) return { lignes, error, tronque: false };
    const lot = data || [];
    lot.forEach((l) => lignes.push(l));
    if (lot.length < TRANCHE) return { lignes, error: null, tronque: false };
  }
  return { lignes, error: null, tronque: true };
}

function taux(commandes, visites) {
  if (!visites) return null;
  return Math.round((commandes / visites) * 1000) / 10;   // en %, une décimale
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const acces = controlerAcces(req, { admin: true, nom: "/api/admin/visites" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  try {
    const q = req.query || {};
    const jours = JOURS_PERMIS.indexOf(parseInt(q.jours, 10)) !== -1 ? parseInt(q.jours, 10) : 30;
    const maintenant = new Date();
    const cleMois = moisPrecedents(MOIS_AFFICHES, maintenant);
    const cleJours = joursPrecedents(jours, maintenant);
    const aujourdhui = cleJours[cleJours.length - 1];

    // Assez loin pour couvrir les 6 mois ET la période choisie (90 j max).
    const depuis = new Date(maintenant.getTime() - 200 * 86400000).toISOString();
    const debutPeriode = new Date(maintenant.getTime() - jours * 86400000).toISOString();
    const tPeriode = maintenant.getTime() - jours * 86400000;
    const avantPeriode = (iso) => { const t = new Date(iso).getTime(); return isNaN(t) || t < tPeriode; };

    // --- 1. les visites ---
    const v = await toutLire(() => supabaseAdmin
      .from("site_visits")
      .select("created_at, updated_at, pages, country, city, lat, lon, source")
      .gte("created_at", depuis)
      .order("created_at", { ascending: true }));
    const tableAbsente = !!v.error;
    if (v.error) console.warn("[visites] site_visits illisible :", v.error.message);
    const visites = v.error ? [] : v.lignes;

    // --- 2. les commandes payées ---
    const o = await toutLire(() => supabaseAdmin
      .from("orders")
      .select("id, created_at")
      .eq("payment_status", "paid")
      .gte("created_at", depuis)
      .order("created_at", { ascending: true }));
    if (o.error) console.error("[visites] commandes :", o.error.message);
    const commandes = o.error ? [] : o.lignes;

    // --- 3. on range tout ça par mois et par jour ---
    const mois = {};
    cleMois.forEach((c) => { mois[c] = { visites: 0, actives: 0, commandes: 0 }; });
    const parJour = {};
    cleJours.forEach((c) => { parJour[c] = { visites: 0, actives: 0 }; });

    const periode = { visites: 0, actives: 0, pages: 0, commandes: 0 };
    const pays = {}, villes = {}, sources = {};
    let enCeMoment = 0, duJour = 0;
    const seuilMoment = maintenant.getTime() - EN_CE_MOMENT_MS;

    visites.forEach((l) => {
      const jour = jourDe(l.created_at);
      if (!jour) return;
      const active = (Number(l.pages) || 1) >= 2;
      const m = mois[jour.slice(0, 7)];
      if (m) { m.visites++; if (active) m.actives++; }
      if (jour === aujourdhui) duJour++;
      const maj = new Date(l.updated_at || l.created_at).getTime();
      if (maj >= seuilMoment) enCeMoment++;

      if (avantPeriode(l.created_at)) return;
      const j = parJour[jour];
      if (j) { j.visites++; if (active) j.actives++; }
      periode.visites++;
      if (active) periode.actives++;
      periode.pages += Number(l.pages) || 1;

      const cp = l.country || "??";
      pays[cp] = (pays[cp] || 0) + 1;
      if (l.lat !== null && l.lat !== undefined && l.lon !== null && l.lon !== undefined) {
        const cle = (l.city || "") + "|" + cp;
        const vi = villes[cle] || (villes[cle] = { ville: l.city || null, pays: cp, lat: Number(l.lat), lon: Number(l.lon), visites: 0 });
        vi.visites++;
      }
      const s = l.source || "direct";
      sources[s] = (sources[s] || 0) + 1;
    });

    commandes.forEach((c) => {
      const jour = jourDe(c.created_at);
      if (!jour) return;
      const m = mois[jour.slice(0, 7)];
      if (m) m.commandes++;
      if (!avantPeriode(c.created_at)) periode.commandes++;
    });

    // --- 4. les produits les plus regardés sur la période ---
    let produits = [];
    const e = await toutLire(() => supabaseAdmin
      .from("product_events")
      .select("product_id, type")
      .in("type", ["vue", "panier"])
      .gte("created_at", debutPeriode));
    if (e.error) {
      console.warn("[visites] product_events illisible :", e.error.message);
    } else {
      const compte = {};
      e.lignes.forEach((ev) => {
        const id = String(ev.product_id);
        const c = compte[id] || (compte[id] = { vues: 0, paniers: 0 });
        if (ev.type === "vue") c.vues++; else if (ev.type === "panier") c.paniers++;
      });
      const tete = Object.keys(compte)
        .sort((a, b) => compte[b].vues - compte[a].vues || compte[b].paniers - compte[a].paniers)
        .slice(0, 10);
      if (tete.length) {
        // Jamais image_urls ici : ce sont des photos en base64, lourdes.
        const { data: prods, error: errP } = await supabaseAdmin
          .from("products").select("id, name, brand_id").in("id", tete);
        if (errP) console.warn("[visites] produits :", errP.message);
        const ids = (prods || []).map((p) => p.brand_id).filter(Boolean);
        let marques = [];
        if (ids.length) {
          const r = await supabaseAdmin.from("brands").select("id, name").in("id", ids);
          if (!r.error) marques = r.data || [];
        }
        const nomProduit = {}, marqueDe = {};
        (prods || []).forEach((p) => { nomProduit[String(p.id)] = p.name; marqueDe[String(p.id)] = p.brand_id; });
        const nomMarque = {};
        marques.forEach((b) => { nomMarque[String(b.id)] = b.name; });
        produits = tete
          .filter((id) => nomProduit[id] !== undefined)       // produit supprimé depuis : on l'écarte
          .map((id) => ({
            id,
            nom: nomProduit[id] || "Sans nom",
            marque: nomMarque[String(marqueDe[id])] || null,
            vues: compte[id].vues,
            paniers: compte[id].paniers,
          }));
      }
    }

    const trier = (obj) => Object.keys(obj).map((k) => ({ cle: k, n: obj[k] })).sort((a, b) => b.n - a.n);

    return res.status(200).json({
      jours,
      table_absente: tableAbsente,
      tronque: v.tronque || o.tronque || e.tronque,
      en_ce_moment: enCeMoment,
      aujourdhui: duJour,
      periode: Object.assign(periode, { conversion: taux(periode.commandes, periode.visites) }),
      par_jour: cleJours.map((c) => Object.assign({ jour: c }, parJour[c])),
      mois: cleMois.map((c) => Object.assign({
        cle: c,
        nom: NOMS_MOIS[parseInt(c.slice(5), 10) - 1] + " " + c.slice(0, 4),
        conversion: taux(mois[c].commandes, mois[c].visites),
      }, mois[c])),
      pays: trier(pays).map((x) => ({ code: x.cle, visites: x.n })),
      villes: Object.values(villes).sort((a, b) => b.visites - a.visites).slice(0, 200),
      sources: trier(sources).slice(0, 20).map((x) => ({ source: x.cle, visites: x.n })),
      produits,
    });
  } catch (err) {
    console.error("[visites] erreur :", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
