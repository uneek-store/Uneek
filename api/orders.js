// API : /api/orders
// GET  → liste toutes les commandes (admin)
// POST → créer une nouvelle commande (checkout)

import { supabaseAdmin } from "./lib/supabase.js";
import crypto from "crypto";

function generateOrderNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `UNEEK-${y}${m}${d}-${rand}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // --- GET : liste toutes les commandes avec leurs items ---
    if (req.method === "GET") {
      const { data: orders, error } = await supabaseAdmin
        .from("orders")
        .select("*, order_items(*, products(name), brands(name))")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching orders:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(orders || []);
    }

    // --- POST : créer une nouvelle commande ---
    if (req.method === "POST") {
      const { customer, items } = req.body;

      if (!customer?.email || !customer?.name || !customer?.address) {
        return res.status(400).json({ error: "Informations client manquantes" });
      }
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "Panier vide" });
      }

      // Récupérer les vrais prix depuis la base
      const productIds = items.map((i) => i.product_id);
      const { data: products, error: prodError } = await supabaseAdmin
        .from("products")
        .select("id, price, brand_id, name, commission_percent")
        .in("id", productIds);

      if (prodError || !products) {
        return res.status(500).json({ error: "Erreur récupération produits" });
      }

      let totalAmount = 0;
      let totalCommission = 0;
      const orderItems = items.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) throw new Error(`Produit ${item.product_id} non trouvé`);

        const lineTotal = product.price * item.quantity;
        const commissionPercent = product.commission_percent || 12;
        const commissionAmount = Math.round(lineTotal * commissionPercent) / 100;
        const creatorPayout = lineTotal - commissionAmount;

        totalAmount += lineTotal;
        totalCommission += commissionAmount;

        return {
          product_id: product.id,
          brand_id: product.brand_id,
          product_name: product.name,
          product_price: product.price,
          quantity: item.quantity,
          size: item.size || null,
          color: item.color || null,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          creator_payout: creatorPayout,
          fulfillment_status: "pending",
        };
      });

      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .insert({
          order_number: generateOrderNumber(),
          customer_email: customer.email,
          customer_name: customer.name,
          shipping_address: customer.address,
          total_amount: totalAmount,
          uneek_commission: totalCommission,
          payment_status: "pending",
          status: "new",
        })
        .select()
        .single();

      if (orderError) {
        console.error("Error creating order:", orderError);
        return res.status(500).json({ error: "Erreur création commande" });
      }

      const itemsWithOrderId = orderItems.map((item) => ({
        ...item,
        order_id: order.id,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("order_items")
        .insert(itemsWithOrderId);

      if (itemsError) {
        console.error("Error creating order items:", itemsError);
        return res.status(500).json({ error: "Erreur ajout produits à la commande" });
      }

      return res.status(201).json({
        success: true,
        order: {
          id: order.id,
          order_number: order.order_number,
          total: totalAmount,
          commission: totalCommission,
        },
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
