// API : /api/creator/orders
// GET → liste les commandes à expédier pour le créateur connecté
// POST → marquer une commande comme expédiée

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const brand_id = req.method === "GET" ? req.query.brand_id : req.body.brand_id;

    if (!brand_id) {
      return res.status(400).json({ error: "brand_id requis" });
    }

    // --- LISTE DES COMMANDES DU CRÉATEUR ---
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("*, orders(order_number, customer_name, shipping_address, status, created_at)")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching creator orders:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(data || []);
    }

    // --- MARQUER COMME EXPÉDIÉ ---
    if (req.method === "POST") {
      const { order_item_id, tracking_number } = req.body;

      if (!order_item_id) {
        return res.status(400).json({ error: "order_item_id requis" });
      }

      const { error } = await supabaseAdmin
        .from("order_items")
        .update({ fulfillment_status: "shipped" })
        .eq("id", order_item_id)
        .eq("brand_id", brand_id);

      if (error) {
        console.error("Error updating fulfillment:", error);
        return res.status(500).json({ error: "Erreur mise à jour" });
      }

      return res.status(200).json({
        success: true,
        message: "Commande marquée comme expédiée",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
