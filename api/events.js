// API : /api/events
// POST → enregistre un évènement sur une fiche produit (vue, favori, panier).
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
