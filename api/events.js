// API : /api/events
// POST → enregistre un évènement sur une fiche produit (vue, favori, panier),
//        ou une visite du site (voir « VISITES DU SITE » plus bas).
//
// POURQUOI CE FICHIER EXISTE
// Une petite marque ne sait pas combien de gens ont regardé sa pièce, ni à
// quel moment ils abandonnent. Ces trois compteurs alimentent l'onglet
// « Mes stats » du panneau créateur.
//
// CE QU'IL N'ENREGISTRE PAS — et c'est volontaire
// Ni adresse IP, ni compte client, ni identifiant de visiteur, ni agent
// utilisateur. On compte des passages, on ne suit personne. L'agent
// utilisateur est lu une fois pour écarter les robots, puis jeté.
//
// RÈGLE ABSOLUE
// Ce point d'entrée ne doit JAMAIS gêner la boutique. Il répond 204 quoi
// qu'il arrive — table absente, base en panne, charge utile douteuse. Le
// navigateur l'appelle sans attendre la réponse ; une erreur ici ne doit
// pas faire apparaître une croix rouge dans la console d'un client.

import { supabaseAdmin } from "./lib/supabase.js";
import { limiter } from "./lib/limite.js";

const TYPES = ["vue", "favori", "panier"];

// Les robots d'indexation passent sur toutes les fiches : sans ce filtre,
// un créateur verrait 300 « vues » et zéro vente, et perdrait confiance
// dans le chiffre — donc dans UNEEK.
const ROBOTS = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|preview|monitor|curl|wget|python-requests|headless|lighthouse|pagespeed|gtmetrix|semrush|ahrefs|dataprovider|screaming/i;

// --- VISITES DU SITE (ajouté le 30 septembre 2026) ---------------------
// Deux appels de plus, pour la vue d'ensemble admin :
//   { type: "visite", session, entree, source }  → première page d'une visite
//   { type: "page",   session, pages }           → la visite continue
// `session` est un nombre tiré au hasard par le navigateur, gardé dans
// sessionStorage : il meurt avec l'onglet. Pas d'IP, pas de compte.
// Le pays, la ville et des coordonnées arrondies viennent des en-têtes que
// Vercel ajoute lui-même à chaque requête. Voir outils/sql/2026-09-30-visites.sql.
const SESSION_VALIDE = /^[A-Za-z0-9-]{16,64}$/;
const PAGES_MAX = 500;

function entete(req, nom, max) {
  try {
    const v = req.headers && req.headers[nom];
    if (typeof v !== "string" || !v.trim()) return null;
    // Vercel encode la ville (« S%C3%A3o Paulo ») : on la décode.
    let t = v.trim();
    try { t = decodeURIComponent(t); } catch { /* on garde tel quel */ }
    return t.slice(0, max);
  } catch { return null; }
}

// Une décimale, soit ~10 km : de quoi placer un point, pas de quoi localiser.
function coordonnee(v, limite) {
  const n = parseFloat(v);
  if (!isFinite(n) || Math.abs(n) > limite) return null;
  return Math.round(n * 10) / 10;
}

// Seul le NOM DU SITE d'où l'on arrive est gardé (instagram.com), jamais
// l'adresse complète, qui peut contenir n'importe quoi.
export function sourceDe(v) {
  if (typeof v !== "string") return null;
  let t = v.trim().toLowerCase();
  if (!t) return null;
  t = t.replace(/^[a-z]+:\/\//, "").split(/[\/?#:]/)[0];
  t = t.replace(/^(www|m|l|lm|mobile)\./, "");
  if (!/^[a-z0-9.-]{2,80}$/.test(t)) return null;
  if (t === "uneek.store" || t.endsWith(".uneek.store") || t.endsWith(".vercel.app") || t === "localhost") return null;
  return t;
}

// Pour le bloc « En direct » de l'admin (ajouté le 30 septembre au soir) :
// la page où se trouve le visiteur (home, product…) et, sur une fiche
// produit ou une page marque, son NOM tel qu'affiché sur le site. C'est du
// catalogue public, rien de personnel.
function pageDe(v) {
  return typeof v === "string" && /^[a-z-]{2,24}$/.test(v) ? v : null;
}
function detailDe(v) {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  return t || null;
}

// Si les colonnes page / page_detail n'existent pas encore (ancienne version
// du SQL), la base refuse TOUTE l'écriture. On réessaie alors sans elles :
// le compteur continue de tourner, seul le détail « en direct » manque.
async function ecrireVisite(operation, valeurs, session) {
  const essai = (v) => operation === "insert"
    ? supabaseAdmin.from("site_visits").insert(v)
    : supabaseAdmin.from("site_visits").update(v).eq("session", session);
  let { error } = await essai(valeurs);
  if (error && ("page" in valeurs || "page_detail" in valeurs)) {
    const sans = Object.assign({}, valeurs);
    delete sans.page;
    delete sans.page_detail;
    ({ error } = await essai(sans));
  }
  return error;
}

async function noterVisite(req, corps) {
  const session = typeof corps.session === "string" ? corps.session.trim() : "";
  if (!SESSION_VALIDE.test(session)) return;

  if (corps.type === "ping") {
    // Toujours là, sur la même page : la visite reste « en direct ».
    const error = await ecrireVisite("update", { updated_at: new Date().toISOString() }, session);
    if (error) console.warn("[events] visite (ping) ignorée :", error.message);
    return;
  }

  if (corps.type === "page") {
    const pages = parseInt(corps.pages, 10);
    if (!isFinite(pages) || pages < 2) return;
    const maj = { pages: Math.min(pages, PAGES_MAX), updated_at: new Date().toISOString() };
    const page = pageDe(corps.page);
    if (page) { maj.page = page; maj.page_detail = detailDe(corps.detail); }
    const error = await ecrireVisite("update", maj, session);
    if (error) console.warn("[events] visite (page) ignorée :", error.message);
    return;
  }

  const pays = entete(req, "x-vercel-ip-country", 8);
  const entree = texteCourt(corps.entree, 24);
  const ligne = {
    session,
    pages: 1,
    country: pays && /^[A-Za-z]{2}$/.test(pays) ? pays.toUpperCase() : null,
    city: entete(req, "x-vercel-ip-city", 80),
    lat: coordonnee(req.headers && req.headers["x-vercel-ip-latitude"], 90),
    lon: coordonnee(req.headers && req.headers["x-vercel-ip-longitude"], 180),
    source: sourceDe(corps.source),
    entree: entree && /^[a-z-]+$/.test(entree) ? entree : null,
    page: entree && /^[a-z-]+$/.test(entree) ? entree : null,
    page_detail: detailDe(corps.detail),
  };
  const error = await ecrireVisite("insert", ligne);
  // Même session envoyée deux fois (double chargement) : la contrainte
  // unique refuse la seconde, et c'est exactement ce qu'on veut.
  if (error) console.warn("[events] visite ignorée :", error.message);
}

function texteCourt(v, max) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Un visiteur qui navigue vite fait quelques dizaines d'appels par minute.
  // Au-delà, c'est une boucle : on coupe. Le limiteur répond 429 lui-même.
  if (limiter(req, res, {
    cle: "events",
    max: 80,
    secondes: 60,
    message: "Trop d'appels.",
  })) return;

  try {
    const ua = (req.headers && req.headers["user-agent"]) || "";
    if (!ua || ROBOTS.test(ua)) return res.status(204).end();

    // Le corps arrive en JSON, ou en texte brut quand le navigateur utilise
    // sendBeacon (au moment où l'onglet se ferme).
    let corps = req.body;
    if (typeof corps === "string") {
      try { corps = JSON.parse(corps); } catch { corps = null; }
    }
    if (!corps || typeof corps !== "object") return res.status(204).end();

    if (corps.type === "visite" || corps.type === "page" || corps.type === "ping") {
      await noterVisite(req, corps);
      return res.status(204).end();
    }

    const type = texteCourt(corps.type, 16);
    const productId = texteCourt(corps.product_id, 64);
    if (!type || !productId || TYPES.indexOf(type) === -1) return res.status(204).end();

    const ligne = {
      product_id: productId,
      type,
      size: texteCourt(corps.size, 40),
      color: texteCourt(corps.color, 40),
    };

    const { error } = await supabaseAdmin.from("product_events").insert(ligne);
    if (error) {
      // Table pas encore créée, colonne renommée, base indisponible : on trace
      // et on s'arrête là. La boutique continue comme si de rien n'était.
      console.warn("[events] insertion ignorée :", error.message);
    }
    return res.status(204).end();
  } catch (err) {
    console.error("[events] erreur ignorée :", err && err.message);
    return res.status(204).end();
  }
}
