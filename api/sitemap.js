// API : servi a l'adresse /sitemap.xml (voir "rewrites" dans vercel.json)
//
// POURQUOI CE FICHIER EXISTE
// Le plan du site est la liste que les moteurs lisent pour savoir ce qui
// existe. Sans lui, ils doivent deviner en suivant les liens — et comme les
// pages d'UNEEK sont construites par JavaScript dans le navigateur, il n'y a
// presque rien a suivre. Les 11 produits etaient donc invisibles.
//
// REGLE DE PRUDENCE
// Ce fichier ne doit JAMAIS renvoyer d'erreur. Un moteur qui recoit une 500
// sur le plan du site en deduit que le site est en panne. Si la base ne
// repond pas, on renvoie quand meme le plan des pages fixes.

import { supabaseAdmin } from "./lib/supabase.js";

// Toujours les adresses officielles, quelle que soit l'adresse d'ou vient la
// demande : un plan de site qui melange www et non-www dit au moteur que les
// deux existent, et c'est exactement ce qu'on veut eviter.
const SITE = "https://www.uneek.store";

// Ces pages existent toujours. Les valeurs de priorite sont des indications :
// les moteurs en font ce qu'ils veulent, mais elles disent ce qui compte.
const PAGES_FIXES = [
  { chemin: "/", priorite: "1.0", frequence: "daily" },
  { chemin: "/shop", priorite: "0.9", frequence: "daily" },
  { chemin: "/marques", priorite: "0.8", frequence: "weekly" },
  { chemin: "/manifesto", priorite: "0.6", frequence: "monthly" },
  { chemin: "/devenir-partenaire", priorite: "0.6", frequence: "monthly" },
  { chemin: "/cgv", priorite: "0.2", frequence: "yearly" },
  { chemin: "/confidentialite", priorite: "0.2", frequence: "yearly" },
  { chemin: "/mentions-legales", priorite: "0.2", frequence: "yearly" },
];

// Un & ou un < dans un slug casserait le XML en silence.
function xml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Les moteurs attendent une date au format AAAA-MM-JJ.
function jour(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function entree({ chemin, lastmod, frequence, priorite }) {
  return "  <url>\n"
    + "    <loc>" + xml(SITE + chemin) + "</loc>\n"
    + (lastmod ? "    <lastmod>" + xml(lastmod) + "</lastmod>\n" : "")
    + (frequence ? "    <changefreq>" + xml(frequence) + "</changefreq>\n" : "")
    + (priorite ? "    <priority>" + xml(priorite) + "</priority>\n" : "")
    + "  </url>";
}

export default async function handler(req, res) {
  const urls = PAGES_FIXES.map(entree);

  try {
    // On ne liste que ce qui est reellement visible par un visiteur :
    // un produit non publie renverrait le moteur vers une page vide.
    const [produits, marques] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, slug, is_published, updated_at, created_at")
        .eq("is_published", true),
      supabaseAdmin
        .from("brands")
        .select("slug, is_active, created_at")
        .eq("is_active", true),
    ]);

    for (const p of (produits && produits.data) || []) {
      // Meme regle que dans la boutique : le slug s'il existe, l'id sinon.
      const ref = p.slug || p.id;
      if (!ref) continue;
      urls.push(entree({
        chemin: "/produit/" + encodeURIComponent(ref),
        lastmod: jour(p.updated_at || p.created_at),
        frequence: "weekly",
        priorite: "0.8",
      }));
    }

    for (const m of (marques && marques.data) || []) {
      if (!m.slug) continue;
      urls.push(entree({
        chemin: "/marque/" + encodeURIComponent(m.slug),
        lastmod: jour(m.created_at),
        frequence: "weekly",
        priorite: "0.7",
      }));
    }
  } catch (err) {
    // Un plan partiel vaut infiniment mieux qu'une erreur : le moteur
    // garderait sinon en memoire que le site ne repond pas.
    console.error("[sitemap] base injoignable, plan reduit aux pages fixes :",
      err && err.message);
  }

  const corps = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.join("\n") + "\n"
    + "</urlset>\n";

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(corps);
}
