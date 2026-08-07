// API : /api/admin/brands
// DELETE → supprimer une marque et tout ce qui est lié

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "DELETE") {
    const { brand_id } = req.body || {};
    if (!brand_id) {
      return res.status(400).json({ error: "brand_id requis" });
    }

    try {
      // 1. Supprimer les pending_edits liés aux produits de cette marque
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("brand_id", brand_id);

      if (products && products.length > 0) {
        const productIds = products.map(p => p.id);
        await supabaseAdmin
          .from("pending_edits")
          .delete()
          .in("product_id", productIds);
      }

      // 2. Supprimer les produits de la marque
      await supabaseAdmin
        .from("products")
        .delete()
        .eq("brand_id", brand_id);

      // 3. Supprimer les comptes créateurs liés
      await supabaseAdmin
        .from("creator_accounts")
        .delete()
        .eq("brand_id", brand_id);

      // 4. Supprimer la marque
      const { error } = await supabaseAdmin
        .from("brands")
        .delete()
        .eq("id", brand_id);

      if (error) {
        console.error("Error deleting brand:", error);
        return res.status(500).json({ error: "Erreur suppression de la marque" });
      }

      return res.status(200).json({ success: true, message: "Marque supprimée avec succès" });
    } catch (err) {
      console.error("Delete brand error:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
