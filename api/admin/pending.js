// API : /api/admin/pending
// GET  → liste les modifications en attente de validation
// POST → approuver ou rejeter une modification

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // TODO: Vérifier que c'est bien l'admin (via le token)

  try {
    // --- LISTE DES MODIFICATIONS EN ATTENTE ---
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("product_edits")
        .select("*, brands(name), products(name), creator_accounts(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching pending edits:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(data || []);
    }

    // --- APPROUVER OU REJETER ---
    if (req.method === "POST") {
      const { edit_id, action, admin_note } = req.body;

      if (!edit_id || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "edit_id et action (approve/reject) requis" });
      }

      // Récupérer la modification
      const { data: edit, error: editError } = await supabaseAdmin
        .from("product_edits")
        .select("*")
        .eq("id", edit_id)
        .single();

      if (editError || !edit) {
        return res.status(404).json({ error: "Modification non trouvée" });
      }

      if (action === "approve") {
        const c = edit.changes || {};
        // Mapper les champs changes → colonnes products
        const productData = {};
        if (c.name) productData.name = c.name;
        if (c.price) productData.price = c.price;
        if (c.category) productData.category = c.category;
        if (c.description) productData.description = c.description;
        if (c.image_url) productData.image_urls = [c.image_url];
        if (c.sizes_stock) {
          productData.sizes = Object.keys(c.sizes_stock);
          productData.stock = Object.values(c.sizes_stock).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
        }
        if (c.stock_quantity) productData.stock = c.stock_quantity;

        if (edit.is_new_product) {
          const slug = (c.name || "produit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
          const { error: createError } = await supabaseAdmin
            .from("products")
            .insert({
              ...productData,
              slug,
              brand_id: edit.brand_id,
              is_published: true,
              is_pending_review: false,
            });

          if (createError) {
            console.error("Error creating product:", createError);
            return res.status(500).json({ error: "Erreur création produit" });
          }
        } else {
          const { error: updateError } = await supabaseAdmin
            .from("products")
            .update({
              ...productData,
              is_pending_review: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", edit.product_id);

          if (updateError) {
            console.error("Error updating product:", updateError);
            return res.status(500).json({ error: "Erreur mise à jour produit" });
          }
        }
      }

      // Marquer la modification comme approuvée/rejetée
      const { error: statusError } = await supabaseAdmin
        .from("product_edits")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          admin_note: admin_note || null,
        })
        .eq("id", edit_id);

      if (statusError) {
        console.error("Error updating edit status:", statusError);
        return res.status(500).json({ error: "Erreur mise à jour statut" });
      }

      return res.status(200).json({
        success: true,
        message: action === "approve" ? "Modification approuvée" : "Modification rejetée",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin pending API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
