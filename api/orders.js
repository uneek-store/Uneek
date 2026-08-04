// API : /api/orders
// POST → créer une nouvelle commande (appelé au checkout)

import { supabaseAdmin } from "./lib/supabase.js";

// Générer un numéro de commande unique
function generateOrderNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `UNEEK-${y}${m}${d}-${rand}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { customer, items } = req.body;

    // Vérifications
    if (!customer?.email || !customer?.name || !customer?.address) {
      return res.status(400).json({ error: "Informations client manquantes" });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Panier vide" });
    }

    // Récupérer les vrais prix depuis la base (sécurité — ne jamais faire confiance au frontend)
    const productIds = items.map((i) => i.product_id);
    const { data: products, error: prodError } = await supabaseAdmin
      .from("products")
      .select("id, price, brand_id, name, commission_percent")
      .in("id", productIds);

    if (prodError || !products) {
      return res.status(500).json({ error: "Erreur récupération produits" });
    }

    // Calculer le total et préparer les order_items
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

    // Créer la commande
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

    // Ajouter les items à la commande
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

    // TODO: Ici on déclenchera le paiement Mollie (étape 3)
    // Pour l'instant, on retourne la commande créée
    return res.status(201).json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total: totalAmount,
        commission: totalCommission,
      },
    });
  } catch (err) {
    console.error("Orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
