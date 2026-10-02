// API : /api/creator/visites
// GET ?brand_id=…&jours=7|30|90 → la fréquentation de la boutique d'UNE marque
// GET ?brand_id=…&direct=1      → seulement « en ce moment » (appel léger, toutes les 5 s)
//
// POURQUOI CE FICHIER EXISTE
// Le créateur voit ses ventes, pas ses visiteurs. Depuis le 2 octobre 2026,
// la boutique note chaque visite d'une page marque ou d'une fiche produit
// dans brand_visits (voir outils/sql/2026-10-02-visites-marques.sql) : une
// ligne par visite ET par marque, sans IP, sans compte, sans cookie.
//
// CE QUI EST GRATUIT, CE QUI EST RÉSERVÉ
//   - pour tout le monde : nombre de visites, visites du jour, part des
//     visites qui ont vu plusieurs pièces, personnes en direct ;
//   - réservé à Pro et Ambassadeur : d'où viennent les visiteurs (pays,
//     villes, points sur la carte).
// La formule est lue en base à chaque appel (api/lib/formules.js). Une marque
// en Gratuit ne REÇOIT PAS les pays ni les villes : ce n'est pas un simple
// masquage dans la page, qu'on contournerait en dix secondes.
//
// TROIS PRÉCAUTIONS
// 1. Une marque ne lit que SES chiffres : controlerAcces compare brand_id à
//    la marque du jeton signé.
// 2. Table absente (SQL pas lancé) : des zéros et table_absente: true, jamais
//    une erreur. Le panneau s'affiche quand même.
// 3. Supabase ne rend que 1000 lignes à la fois : on lit par tranches.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { formuleDe, accesComplet } from "../lib/formules.js";

const JOURS_PERMIS = [7, 30, 90];
const TRANCHE = 1000;
const PLAFOND = 50000;
const EN_CE_MOMENT_MS = 2 * 60 * 1000;   // comme l'admin : un signe de vie depuis moins de 2 min
const COLONNES = "created_at, updated_at, pages, country, city, lat, lon";

const FUSEAU = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
});
function jourDe(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = FUSEAU.formatToParts(d);
  const v = (t) => (p.find((x) => x.type === t) || {}).value;
  return v("year") + "-" + v("month") + "-" + v("day");
}

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

// La formule de la marque. Colonne absente ou marque introuvable : gratuit.
async function formuleDeLaMarque(brandId) {
  try {
    const { data, error } = await supabaseAdmin.from("brands").select("id, formule").eq("id", brandId).maybeSingle();
    if (error || !data) return formuleDe(null);
    return formuleDe(data);
  } catch { return formuleDe(null); }
}

const aCoordonnees = (l) => l.lat !== null && l.lat !== undefined && l.lon !== null && l.lon !== undefined;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/visites" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  try {
    const q = req.query || {};
    const brandId = typeof q.brand_id === "string" ? q.brand_id : "";
    if (!brandId) return res.status(400).json({ error: "brand_id requis" });

    const formule = await formuleDeLaMarque(brandId);
    const complet = accesComplet(formule);
    const maintenant = Date.now();
    const seuilDirect = maintenant - EN_CE_MOMENT_MS;
    const auj = jourDe(new Date(maintenant).toISOString());
    const vivante = (l) => new Date(l.updated_at || l.created_at).getTime() >= seuilDirect;
    const point = (l) => ({ ville: l.city || null, pays: l.country || null, lat: Number(l.lat), lon: Number(l.lon) });

    // --- appel léger : en ce moment + aujourd'hui ---
    if (q.direct === "1") {
      const depuis = new Date(maintenant - 26 * 3600000).toISOString();
      const r = await toutLire(() => supabaseAdmin.from("brand_visits").select(COLONNES)
        .eq("brand_id", brandId).gte("updated_at", depuis));
      if (r.error) return res.status(200).json({ table_absente: true, en_ce_moment: 0, aujourdhui: 0, direct: [] });
      const vivantes = r.lignes.filter(vivante);
      return res.status(200).json({
        en_ce_moment: vivantes.length,
        aujourdhui: r.lignes.filter((l) => jourDe(l.created_at) === auj).length,
        direct: complet ? vivantes.filter(aCoordonnees).slice(0, 50).map(point) : [],
      });
    }

    // --- appel complet ---
    const jours = JOURS_PERMIS.indexOf(parseInt(q.jours, 10)) !== -1 ? parseInt(q.jours, 10) : 30;
    const debut = new Date(maintenant - jours * 86400000).toISOString();
    const r = await toutLire(() => supabaseAdmin.from("brand_visits").select(COLONNES)
      .eq("brand_id", brandId).gte("created_at", debut));
    const base = { jours, formule, acces_complet: complet };
    if (r.error) {
      console.warn("[creator/visites] brand_visits illisible :", r.error.message);
      return res.status(200).json(Object.assign(base, {
        table_absente: true, visites: 0, explore: 0, aujourdhui: 0, en_ce_moment: 0,
        pays: complet ? [] : null, villes: complet ? [] : null, direct: [],
      }));
    }

    let explore = 0, duJour = 0;
    const pays = {}, villes = {}, vivantes = [];
    r.lignes.forEach((l) => {
      if ((Number(l.pages) || 1) >= 2) explore++;
      if (jourDe(l.created_at) === auj) duJour++;
      if (vivante(l)) vivantes.push(l);
      const cp = l.country || "??";
      pays[cp] = (pays[cp] || 0) + 1;
      if (aCoordonnees(l)) {
        const cle = (l.city || "") + "|" + cp;
        const v = villes[cle] || (villes[cle] = Object.assign(point(l), { visites: 0 }));
        v.visites++;
      }
    });

    return res.status(200).json(Object.assign(base, {
      table_absente: false,
      tronque: r.tronque,
      visites: r.lignes.length,
      explore,                       // visites qui ont vu au moins 2 pages de la boutique
      aujourdhui: duJour,
      en_ce_moment: vivantes.length,
      // Réservé à Pro / Ambassadeur : une marque en Gratuit ne reçoit rien ici.
      pays: complet ? Object.keys(pays).map((c) => ({ code: c, visites: pays[c] })).sort((a, b) => b.visites - a.visites) : null,
      villes: complet ? Object.values(villes).sort((a, b) => b.visites - a.visites).slice(0, 200) : null,
      direct: complet ? vivantes.filter(aCoordonnees).slice(0, 50).map(point) : [],
    }));
  } catch (err) {
    console.error("[creator/visites] erreur :", err && err.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
