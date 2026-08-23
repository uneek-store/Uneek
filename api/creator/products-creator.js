// API : /api/creator/products
// GET    → liste les produits du créateur connecté
// POST   → soumettre un nouveau produit ou une modification (en attente de validation)
// DELETE → supprimer un produit directement (notifie l'admin par email)

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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
      const { product_id, product_data, creator_id } = req.body;

      const isNew = !product_id;

      // Créer une entrée dans product_edits (en attente de validation)
      const { data: edit, error } = await supabaseAdmin
        .from("product_edits")
        .insert({
          product_id: product_id || null,
          brand_id,
          is_new_product: isNew,
          changes: product_data,
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

    // --- SUPPRIMER UN PRODUIT ---
    if (req.method === "DELETE") {
      const { product_id } = req.body;

      if (!product_id) {
        return res.status(400).json({ error: "product_id requis" });
      }

      // Vérifier que le produit appartient bien à cette marque
      const { data: product, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, name, brand_id")
        .eq("id", product_id)
        .eq("brand_id", brand_id)
        .single();

      if (fetchErr || !product) {
        return res.status(404).json({ error: "Produit non trouvé" });
      }

      // Récupérer le nom de la marque pour la notification
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("name")
        .eq("id", brand_id)
        .single();

      // Supprimer le produit
      const { error: deleteErr } = await supabaseAdmin
        .from("products")
        .delete()
        .eq("id", product_id);

      if (deleteErr) {
        console.error("Error deleting product:", deleteErr);
        return res.status(500).json({ error: "Erreur suppression" });
      }

      // Notifier l'admin par email (via Supabase Edge Function ou simple log)
      // On insère une notification dans une table pour que l'admin la voie
      try {
        await supabaseAdmin.from("admin_notifications").insert({
          type: "product_deleted",
          message: `Le créateur ${brand?.name || "inconnu"} a supprimé le produit "${product.name}"`,
          brand_id,
          product_id,
          read: false,
        });
      } catch (notifErr) {
        // Si la table n'existe pas encore, on log simplement
        console.log(
          `[NOTIFICATION] Produit supprimé: "${product.name}" par ${brand?.name || brand_id}`
        );
      }

      return res.status(200).json({
        success: true,
        message: "Produit supprimé",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
