// API : /api/creator/products
// GET  → liste les produits du créateur connecté
// POST → soumettre un nouveau produit ou une modification (en attente de validation)

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // TODO: Vérifier le token du créateur et récupérer son brand_id

  try {
    // Pour l'instant, on utilise brand_id depuis le body/query
    const brand_id = req.method === "GET" ? req.query.brand_id : req.body.brand_id;

    if (!brand_id) {
      return res.status(400).json({ error: "brand_id requis" });
    }

    // --- LISTE DES PRODUITS DU CRÉATEUR ---
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching creator products:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(data || []);
    }

    // --- SOUMETTRE UN NOUVEAU PRODUIT OU UNE MODIFICATION ---
    if (req.method === "POST") {
      const { product_id, name, price, category, description, image_url, sizes_stock, edit_type, creator_id, commission_percent, _original  } = req.body;

      const isNew = edit_type === 'new' || !product_id;

      // Construire l'objet changes
      const changes = {};
      if (name) changes.name = name;
      if (price != undefined) changes.price = price;
      if (category) changes.category = category;
      if (description) changes.description = description;
      if (image_url) changes.image_url = image_url;
      if (sizes_stock) changes.sizes_stock = sizes_stock;
      if (commission_percent !== undefined) changes.commission_percent = commission_percent;
            // Stocker les valeurs originales pour les modifications (permet d'afficher le diff)
            if (!isNew && _original) changes._original = _original;

      // Créer une entrée dans product_edits (en attente de validation)
      const { data: edit, error } = await supabaseAdmin
        .from("product_edits")
        .insert({
          product_id: product_id || null,
          brand_id,
          is_new_product: isNew,
          changes,
          submitted_by: creator_id || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating product edit:", error);
        return res.status(500).json({ error: "Erreur soumission" });
      }

      return res.status(201).json({
        success: true,
        message: isNew
          ? "Nouveau produit soumis — en attente de validation par UNEEK"
          : "Modification soumise — en attente de validation par UNEEK",
        edit_id: edit.id,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
