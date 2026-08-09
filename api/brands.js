// API : /api/brands
// GET  → liste toutes les marques actives
// GET  ?slug=xxx → une marque spécifique avec ses produits

import { supabaseAdmin } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { slug } = req.query;

    // Une marque spécifique avec ses produits
    if (slug) {
      const { data: brand, error } = await supabaseAdmin
        .from("brands")
        .select("*, products(*)")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (error || !brand) return res.status(404).json({ error: "Marque non trouvée" });

      // Filtrer pour ne montrer que les produits publiés
      brand.products = (brand.products || []).filter((p) => p.is_published);
      return res.status(200).json(brand);
    }

    // Liste de toutes les marques actives
    const { data, error } = await supabaseAdmin
      .from("brands")
            .select("id, name, slug, tagline, city, year, image_url, logo_url, email, products(count)")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching brands:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

        const brands = (data || []).map(b => ({ ...b, product_count: b.products?.[0]?.count || 0, products: undefined }));
        return res.status(200).json(brands);
  } catch (err) {
    console.error("Brands API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
