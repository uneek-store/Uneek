// API : /api/creator/orders
// GET  → liste les commandes d'une marque (pour le panneau créateur)
// POST → marquer un item comme expédié

import { supabaseAdmin } from "../lib/supabase.js";
import { commandeExpediee } from "../lib/email.js";

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
        .select("*, orders(order_number, customer_name, customer_nickname, customer_email, shipping_address, status, created_at), products(name)")
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
        created_at: item.orders?.created_at || item.created_at || null,
        customer_name: item.orders?.customer_name,
        // Surnom a inscrire sur l'emballage : c'est ce que le client a demande.
        customer_nickname: item.orders?.customer_nickname || null,
        customer_email: item.orders?.customer_email,
        shipping_address: item.orders?.shipping_address,
        product_name: item.products?.name || item.product_name,
        quantity: item.quantity,
        size: item.size,
        // La couleur etait enregistree en base mais jamais renvoyee :
        // le createur ne savait pas quelle variante expedier.
        color: item.color || null,
        price: item.product_price,
        shipping_status: item.fulfillment_status || "pending",
        total_amount: item.product_price * item.quantity,
        creator_payout: item.creator_payout,
        items: [{
          product_name: item.products?.name || item.product_name,
          quantity: item.quantity,
          size: item.size,
          color: item.color || null,
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

      // Prevenir le client. Deux requetes simples plutot qu'une jointure
      // imbriquee : les embeds PostgREST echouent durement au moindre nom
      // de colonne inexact, et on ne veut pas risquer l'expedition pour un
      // e-mail.
      try {
        const { data: ligne } = await supabaseAdmin
          .from("order_items")
          .select("order_id, product_name, size, color, quantity")
          .eq("id", order_item_id)
          .maybeSingle();

        if (ligne && ligne.order_id) {
          const { data: commande } = await supabaseAdmin
            .from("orders")
            .select("order_number, customer_name, customer_email, shipping_address")
            .eq("id", ligne.order_id)
            .maybeSingle();

          if (commande && commande.customer_email) {
            await commandeExpediee(commande, [ligne]);
          } else {
            console.warn("[email] pas d'adresse client pour la commande", ligne.order_id);
          }
        }
      } catch (err) {
        console.error("[email] avis d'expedition ignore :", err && err.message);
      }

      return res.status(200).json({ success: true, message: "Marqué comme expédié" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
