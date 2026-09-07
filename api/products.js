// API : /api/products
// GET  → liste tous les produits publiés (avec leur marque)
// GET  ?brand=slug → produits d'une marque spécifique
// GET  ?id=xxx → un produit spécifique

import { supabaseAdmin } from "./lib/supabase.js";

// Colonnes qui n'ont rien a faire dans une reponse publique (constat 08 de
// l'audit du 7 septembre). commission_percent, c'est la marge negociee avec
// chaque marque : lisible par n'importe qui, et par les concurrentes.
//
// POURQUOI ON RETIRE PLUTOT QUE DE LISTER LES COLONNES VOULUES
// Le 31 aout, remplacer un select("*") par une liste explicite sur /api/brands
// a fait disparaitre "story" de la boutique sans que personne le voie pendant
// deux jours. Retirer nommement ce qu'on ne veut pas ne peut pas produire
// cette panne-la : une colonne ajoutee en base continue de passer.
//
// DEUX COLONNES, PAS UNE (constate en direct le 7 septembre)
// La base contient commission_percent ET commission_percentage. Le code ne
// se sert que de la premiere ; la seconde est une survivance d'un schema
// plus ancien, que personne ne lit plus — mais qui contenait toujours un
// vrai taux, et qui sortait donc en clair par select("*"). Retirer une
// seule des deux ne servait a rien. On retire donc tout ce qui commence par
// "commission", ce qui couvre aussi la prochaine variante d'orthographe.
const CHAMPS_PRIVES = ["commission_percent", "commission_percentage"];
const PREFIXES_PRIVES = ["commission"];

function estPrive(champ) {
  if (CHAMPS_PRIVES.includes(champ)) return true;
  return PREFIXES_PRIVES.some((p) => champ.startsWith(p));
}

function sansChampsPrives(produit) {
  if (!produit || typeof produit !== "object") return produit;
  const copie = { ...produit };
  for (const champ of Object.keys(copie)) {
    if (estPrive(champ)) delete copie[champ];
  }
  return copie;
}

export default async function handler(req, res) {
  // Autoriser les requêtes depuis le site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { id, brand, category } = req.query;

    // Un produit spécifique
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*, brands(name, slug, tagline, city, year, image_url, is_active)")
        .eq("id", id)
        .eq("is_published", true)
        .single();

      if (error || !data) return res.status(404).json({ error: "Produit non trouvé" });
      // Marque en pause : le produit n'existe plus pour le public.
      if (data.brands && data.brands.is_active === false) {
        return res.status(404).json({ error: "Produit non trouvé" });
      }
      return res.status(200).json(sansChampsPrives(data));
    }

    // Liste de produits (avec filtres optionnels)
    let query = supabaseAdmin
      .from("products")
      .select("*, brands(name, slug, tagline, city, is_active)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (brand) query = query.eq("brands.slug", brand);
    if (category && category !== "Tous") query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching products:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Marques en pause : leurs produits sortent de la liste publique.
    // Filtre en JavaScript plutot que dans la requete : un filtre PostgREST
    // sur une table jointe ne retire pas la ligne parente.
    const visibles = (data || []).filter(
      (p) => !(p.brands && p.brands.is_active === false)
    );

    // Map image_urls array to image_url for frontend
    const products = visibles.map(p => ({
      ...sansChampsPrives(p),
      image_url: (p.image_urls && p.image_urls.length > 0) ? p.image_urls[0] : ''
    }));
    return res.status(200).json(products);
  } catch (err) {
    console.error("Products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
