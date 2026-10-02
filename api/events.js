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

// --- LA BOUTIQUE D'UNE MARQUE (ajouté le 2 octobre 2026) --------------------
// Quand la personne regarde la page d'une marque ou une de ses fiches
// produit, la boutique envoie aussi `marque` (l'identifiant de la marque) et
// `pages_marque` (combien de pages de cette boutique elle a vues). On tient
// une ligne par visite ET par marque dans brand_visits : c'est ce que lit le
// panneau créateur. Même règle que le reste : ni IP, ni compte.
const MARQUE_VALIDE = /^[A-Za-z0-9-]{1,64}$/;

async function noterMarque(req, corps, session) {
  if (corps.type === "depart") {
    const { error } = await supabaseAdmin.from("brand_visits")
      .update({ updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() })
      .eq("session", session);
    if (error) console.warn("[events] boutique (depart) ignorée :", error.message);
    return;
  }
  const marque = typeof corps.marque === "string" ? corps.marque.trim() : "";
  if (!MARQUE_VALIDE.test(marque)) return;
  const maintenant = new Date().toISOString();

  if (corps.type === "ping") {
    const { error } = await supabaseAdmin.from("brand_visits")
      .update({ updated_at: maintenant }).eq("session", session).eq("brand_id", marque);
    if (error) console.warn("[events] boutique (ping) ignorée :", error.message);
    return;
  }

  const n = parseInt(corps.pages_marque, 10);
  const pages = Math.min(Math.max(isFinite(n) ? n : 1, 1), PAGES_MAX);
  // La visite de cette boutique existe déjà ? On la met à jour ; sinon on la crée.
  const maj = await supabaseAdmin.from("brand_visits")
    .update({ pages, updated_at: maintenant })
    .eq("session", session).eq("brand_id", marque).select("id");
  if (maj.error) { console.warn("[events] boutique ignorée :", maj.error.message); return; }
  if (maj.data && maj.data.length) return;

  const pays = entete(req, "x-vercel-ip-country", 8);
  const ville = entete(req, "x-vercel-ip-city", 80);
  const { error } = await supabaseAdmin.from("brand_visits").insert({
    session,
    brand_id: marque,
    pages,
    country: pays && /^[A-Za-z]{2}$/.test(pays) ? pays.toUpperCase() : null,
    city: ville,
    lat: ville ? coordonnee(req.headers && req.headers["x-vercel-ip-latitude"], 90) : null,
    lon: ville ? coordonnee(req.headers && req.headers["x-vercel-ip-longitude"], 180) : null,
    source: sourceDe(corps.source),
  });
  if (error) console.warn("[events] boutique ignorée :", error.message);
}

async function noterVisite(req, corps) {
  const session = typeof corps.session === "string" ? corps.session.trim() : "";
  if (!SESSION_VALIDE.test(session)) return;

  // La boutique de la marque regardée : à part, et sans jamais gêner le reste.
  try { await noterMarque(req, corps, session); } catch (e) { /* rien */ }

  if (corps.type === "depart") {
    // Onglet ferme ou mis en arriere-plan : la personne quitte le « direct »
    // tout de suite. On recule son dernier signe de vie ; rien d'autre ne change.
    const error = await ecrireVisite("update", { updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }, session);
    if (error) console.warn("[events] visite (depart) ignorée :", error.message);
    return;
  }

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
  // Sans ville, les coordonnees que donne Vercel sont le CENTRE DU PAYS
  // (pour la Belgique : pres de Namur). Un point la serait faux : on ne
  // garde alors que le pays (retour d'Axel : Liege affiche dans le sud).
  const ville = entete(req, "x-vercel-ip-city", 80);
  const entree = texteCourt(corps.entree, 24);
  const ligne = {
    session,
    pages: 1,
    country: pays && /^[A-Za-z]{2}$/.test(pays) ? pays.toUpperCase() : null,
    city: ville,
    lat: ville ? coordonnee(req.headers && req.headers["x-vercel-ip-latitude"], 90) : null,
    lon: ville ? coordonnee(req.headers && req.headers["x-vercel-ip-longitude"], 180) : null,
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

    if (corps.type === "visite" || corps.type === "page" || corps.type === "ping" || corps.type === "depart") {
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
