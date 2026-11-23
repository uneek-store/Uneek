// API : sert les pages /marque/<slug> (voir "rewrites" dans vercel.json)
//
// POURQUOI CE FICHIER EXISTE (23 novembre 2026)
// Toutes les adresses du site renvoyaient le MEME index.html : meme titre,
// meme description, et un <div id="app"></div> vide. Le contenu de la marque
// n'apparaissait qu'apres le JavaScript. Google finit par l'executer, mais
// plus tard et moins bien ; les apercus de partage (WhatsApp, Instagram,
// Messenger) et les robots des assistants IA, jamais.
//
// Ici, on renvoie le meme index.html, mais deja rempli pour CETTE marque :
// titre, description, adresse officielle, donnees structurees, et dans
// #app le nom, l'accroche, la ville et la liste des pieces avec leurs liens.
// Le JavaScript de la boutique remplace ensuite #app comme d'habitude : pour
// le visiteur, rien ne change. Le contenu pre-rempli reprend exactement ce
// que la page affiche (pas de texte reserve aux robots : Google le punit).
//
// REGLE DE PRUDENCE
// Cette page ne doit JAMAIS etre cassee par ce fichier. Marque introuvable,
// base injoignable, erreur quelconque : on renvoie l'index.html d'origine,
// tel quel, et la boutique fait ce qu'elle a toujours fait.
//
// PHOTOS : elles sont stockees en base64 dans la base. Les mettre ici ferait
// des pages de plusieurs Mo. On ne reprend donc qu'une image en https://.

import fs from "fs";
import path from "path";
import { supabaseAdmin } from "./lib/supabase.js";
import { marqueInvisible } from "./lib/invisibles.js";

const SITE = "https://www.uneek.store";

function echapper(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Meme coupe que index.html : Google tronque la description vers 155 caracteres.
function couper(texte, max) {
  const t = String(texte == null ? "" : texte).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const bout = t.slice(0, max - 1);
  const espace = bout.lastIndexOf(" ");
  return (espace > max * 0.6 ? bout.slice(0, espace) : bout) + "…";
}

function prix(v) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",") + " €";
}

let modeleEnMemoire = null;
async function modele() {
  if (modeleEnMemoire) return modeleEnMemoire;
  // Inclus dans la fonction par "includeFiles" (vercel.json).
  try {
    modeleEnMemoire = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    return modeleEnMemoire;
  } catch { /* on essaie autrement */ }
  // Secours : le fichier statique tel que Vercel le sert.
  const r = await fetch(SITE + "/index.html");
  if (!r.ok) throw new Error("index.html introuvable (" + r.status + ")");
  modeleEnMemoire = await r.text();
  return modeleEnMemoire;
}

// Remplace la valeur d'une balise de l'en-tete si elle existe. Une balise
// absente n'est pas une erreur : la page reste valable sans elle.
function poser(html, motif, nouvelle) {
  return motif.test(html) ? html.replace(motif, nouvelle) : html;
}

export function remplir(html, marque, produits) {
  const ville = marque.city ? " à " + marque.city : "";
  const titre = marque.name + " — marque indépendante" + ville + " | UNEEK";
  const description = couper(marque.tagline
    || marque.name + ", marque de mode indépendante"
       + (marque.city ? " basée à " + marque.city : "")
       + ". Découvre ses pièces sur UNEEK.", 155);
  const adresse = SITE + "/marque/" + encodeURIComponent(marque.slug);
  const t = echapper(titre), d = echapper(description), a = echapper(adresse);

  html = poser(html, /<title>[^<]*<\/title>/, "<title>" + t + "</title>");
  html = poser(html, /<meta name="description" content="[^"]*">/, '<meta name="description" content="' + d + '">');
  html = poser(html, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + t + '">');
  html = poser(html, /<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + d + '">');
  html = poser(html, /<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + t + '">');
  html = poser(html, /<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + d + '">');
  html = poser(html, /<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + a + '">');
  html = poser(html, /<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + a + '">');

  // Donnees structurees : disent a Google, sans ambiguite, que cette page
  // est LA page de la marque X sur UNEEK, et quelles pieces elle contient.
  const urlProduit = (p) => SITE + "/produit/" + encodeURIComponent(p.slug || p.id);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: titre,
      description,
      url: adresse,
      about: {
        "@type": "Brand",
        name: marque.name,
        ...(marque.tagline ? { slogan: marque.tagline } : {}),
        ...(marque.instagram ? { sameAs: ["https://www.instagram.com/" + String(marque.instagram).replace(/^@/, "").trim()] } : {}),
      },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: produits.length,
        itemListElement: produits.map((p, i) => ({
          "@type": "ListItem", position: i + 1, url: urlProduit(p), name: p.name,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "UNEEK", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "Les marques", item: SITE + "/marques" },
        { "@type": "ListItem", position: 3, name: marque.name, item: adresse },
      ],
    },
  ];
  // "<" interdit dans le JSON : un nom contenant </script> fermerait la balise.
  const json = JSON.stringify(ld).replace(/</g, "\\u003c");
  html = html.replace("</head>", '<script type="application/ld+json">' + json + "</script>\n</head>");

  // Le contenu visible, repris de brandPage() dans index.html.
  const infos = [marque.city, marque.year ? "depuis " + marque.year : "", produits.length + " pièces"]
    .filter(Boolean).map((x) => "<span>" + echapper(x) + "</span>").join(" · ");
  const liste = produits.length
    ? "<ul>" + produits.map((p) => '<li><a href="' + echapper(urlProduit(p)) + '">'
        + echapper(p.name) + "</a>" + (prix(p.price) ? " — " + prix(p.price) : "") + "</li>").join("") + "</ul>"
    : "<p>Aucun produit pour le moment.</p>";
  const contenu = '<div class="section" data-prerempli="marque">'
    + '<nav><a href="/">UNEEK</a> › <a href="/marques">Les marques</a> › ' + echapper(marque.name) + "</nav>"
    + "<h1>" + echapper(marque.name) + "</h1>"
    + (marque.tagline ? "<p>" + echapper(marque.tagline) + "</p>" : "")
    + "<p>" + infos + "</p>"
    + '<h2>Les pièces ' + echapper(marque.name) + "</h2>" + liste
    + "</div>";
  return html.replace('<div id="app"></div>', '<div id="app">' + contenu + "</div>");
}

export default async function handler(req, res) {
  let html;
  try {
    html = await modele();
  } catch (err) {
    // Sans le modele on ne peut rien servir : on renvoie vers la boutique,
    // qui se chargera normalement par l'adresse d'accueil.
    console.error("[page-marque] index.html illisible :", err && err.message);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect ? res.redirect(302, "/marques") : res.status(302).end();
  }

  const envoyer = (corps, cache) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cache);
    return res.status(200).send(corps);
  };
  // Page d'origine : jamais gardee longtemps en cache, pour qu'une marque
  // qui vient d'etre activee soit pre-remplie au passage suivant.
  const tellequelle = () => envoyer(html, "public, max-age=0, s-maxage=60");

  try {
    let slug = req.query && req.query.slug;
    if (Array.isArray(slug)) slug = slug[0];
    slug = String(slug || "").trim();
    if (!slug || marqueInvisible(slug)) return tellequelle();

    const { data: marque, error } = await supabaseAdmin
      .from("brands")
      .select("id, name, slug, tagline, city, year, instagram, is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();
    if (error || !marque || marqueInvisible(marque.slug)) return tellequelle();

    const { data: produits, error: e2 } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, price, is_published, brand_id, created_at")
      .eq("brand_id", marque.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (e2) return tellequelle();

    // Meme duree de cache que /api/brands : une modification apparait en une minute.
    return envoyer(remplir(html, marque, produits || []),
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  } catch (err) {
    console.error("[page-marque] page servie sans pre-remplissage :", err && err.message);
    return tellequelle();
  }
}
