// API : /api/creator/products
// GET  → liste les produits d'une marque (pour le panneau créateur)
// POST → soumettre un nouveau produit ou une modification (va dans product_edits)

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // --- GET : liste des produits de la marque ---
    if (req.method === "GET") {
      const { brand_id } = req.query;

      if (!brand_id) {
        return res.status(400).json({ error: "brand_id requis" });
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching creator products:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json({ products: data || [] });
    }

    // --- POST : soumettre un nouveau produit ou une modification ---
    if (req.method === "POST") {
      const { brand_id, product_id, edit_type, name, price, category, description, image_url, sizes_stock } = req.body;

      if (!brand_id || !name || !price) {
        return res.status(400).json({ error: "brand_id, name et price requis" });
      }

      const isNew = edit_type === "new" || !product_id;

      // Construire l'objet changes
      const changes = { name, price, category, description };
      if (image_url) changes.image_url = image_url;
      if (sizes_stock) {
        changes.sizes_stock = sizes_stock;
        // Calculer le stock total
        changes.stock_quantity = Object.values(sizes_stock).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
      }

      const { data, error } = await supabaseAdmin
        .from("product_edits")
        .insert({
          brand_id,
          product_id: isNew ? null : product_id,
          is_new_product: isNew,
          changes,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating product edit:", error);
        return res.status(500).json({ error: "Erreur soumission produit" });
      }

      return res.status(201).json({
        success: true,
        message: isNew ? "Nouveau produit soumis pour validation" : "Modification soumise pour validation",
        edit_id: data.id,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
