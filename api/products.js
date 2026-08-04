// API : /api/products
// GET  → liste tous les produits publiés (avec leur marque)
// GET  ?brand=slug → produits d'une marque spécifique
// GET  ?id=xxx → un produit spécifique

import { supabaseAdmin } from "./lib/supabase.js";

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
        .select("*, brands(name, slug, tagline, city, year, image_url)")
        .eq("id", id)
        .eq("is_published", true)
        .single();

      if (error || !data) return res.status(404).json({ error: "Produit non trouvé" });
      return res.status(200).json(data);
    }

    // Liste de produits (avec filtres optionnels)
    let query = supabaseAdmin
      .from("products")
      .select("*, brands(name, slug, tagline, city)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (brand) query = query.eq("brands.slug", brand);
    if (category && category !== "Tous") query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching products:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
