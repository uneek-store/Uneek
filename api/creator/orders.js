// API : /api/creator/orders
// GET  → liste les commandes d'une marque (pour le panneau créateur)
// POST → marquer un item comme expédié

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // --- GET : commandes de la marque ---
    if (req.method === "GET") {
      const { brand_id } = req.query;

      if (!brand_id) {
        return res.status(400).json({ error: "brand_id requis" });
      }

      // Récupérer les order_items de cette marque avec les infos de commande
      const { data, error } = await supabaseAdmin
        .from("order_items")
        .select("*, orders(order_number, customer_name, customer_email, shipping_address, status), products(name)")
        .eq("brand_id", brand_id)
        ;

      if (error) {
        console.error("Error fetching creator orders:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      // Reformater pour le frontend
      const orders = (data || []).map(item => ({
        id: item.id,
        order_number: item.orders?.order_number,
        customer_name: item.orders?.customer_name,
        customer_email: item.orders?.customer_email,
        shipping_address: item.orders?.shipping_address,
        product_name: item.products?.name || item.product_name,
        quantity: item.quantity,
        size: item.size,
        price: item.product_price,
        shipping_status: item.fulfillment_status || "pending",
        total_amount: item.product_price * item.quantity,
        creator_payout: item.creator_payout,
        items: [{
          product_name: item.products?.name || item.product_name,
          quantity: item.quantity,
          size: item.size,
          price: item.product_price,
        }],
      }));

      return res.status(200).json({ orders });
    }

    // --- POST : marquer comme expédié ---
    if (req.method === "POST") {
      const { order_item_id, action } = req.body;

      if (!order_item_id) {
        return res.status(400).json({ error: "order_item_id requis" });
      }

      const newStatus = action === "ship" ? "shipped" : "shipped";

      const { error } = await supabaseAdmin
        .from("order_items")
        .update({ fulfillment_status: newStatus })
        .eq("id", order_item_id);

      if (error) {
        console.error("Error updating fulfillment:", error);
        return res.status(500).json({ error: "Erreur mise à jour" });
      }

      return res.status(200).json({ success: true, message: "Marqué comme expédié" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
