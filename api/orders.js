// API : /api/orders
// GET  → liste toutes les commandes (admin)
// POST → créer une nouvelle commande (checkout)

import { supabaseAdmin } from "./lib/supabase.js";
import { controlerAcces } from "./lib/session.js";
import crypto from "crypto";
import {
  confirmationCommande,
  nouvelleCommandeCreateur,
  alerteAdmin,
  envoyerTous,
  ligneArticle,
  esc,
  prix,
} from "./lib/email.js";

function generateOrderNumber() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `UNEEK-${y}${m}${d}-${rand}`;
}

function parseToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [customerId] = decoded.split(":");
    return customerId;
  } catch {
    return null;
  }
}


// sizes_stock a deux formes : plate { S: 3 } ou par couleur { Rouge: { S: 3 } }.
// Ces deux fonctions lisent et ecrivent indifferemment dans l'une ou l'autre.
function stockParCouleur(ss) {
  if (!ss || typeof ss !== "object") return false;
  const vals = Object.keys(ss).map((k) => ss[k]);
  if (!vals.length) return false;
  return vals[0] !== null && typeof vals[0] === "object" && !Array.isArray(vals[0]);
}

function lireStock(ss, taille, couleur) {
  if (!ss || !taille) return null;
  if (stockParCouleur(ss)) {
    if (!couleur) {
      // Pas de couleur precisee : on additionne toutes les couleurs.
      return Object.keys(ss).reduce((n, c) => n + (parseInt((ss[c] || {})[taille]) || 0), 0);
    }
    if (!ss[couleur]) return null;
    return parseInt(ss[couleur][taille]) || 0;
  }
  return parseInt(ss[taille]) || 0;
}

function ecrireStock(ss, taille, couleur, valeur) {
  if (stockParCouleur(ss)) {
    if (!couleur || !ss[couleur]) return ss;
    return { ...ss, [couleur]: { ...ss[couleur], [taille]: valeur } };
  }
  return { ...ss, [taille]: valeur };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // --- GET : liste toutes les commandes avec leurs items ---
    if (req.method === "GET") {
      // Cette liste contient les noms, adresses et e-mails des clients.
      // Elle n'a rien a faire en acces libre. Le POST juste en dessous
      // reste public : c'est le passage de commande.
      const acces = controlerAcces(req, { admin: true, nom: "/api/orders (GET)" });
      if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

      const { data: rawOrders, error } = await supabaseAdmin
        .from("orders")
        .select("*, order_items(*, products(name), brands(name))")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching orders:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      // Reformatter pour le frontend admin
      const orders = (rawOrders || []).map(order => {
        const items = (order.order_items || []).map(item => ({
          product_name: item.product_name || item.products?.name || "",
          brand_name: item.brands?.name || "",
          quantity: item.quantity,
          size: item.size,
          color: item.color || null,
          price: item.product_price,
          commission_amount: item.commission_amount || 0,
          creator_payout: item.creator_payout || 0,
          fulfillment_status: item.fulfillment_status || "pending",
        }));

        // Statut global d'expédition basé sur les items
        const statuses = items.map(i => i.fulfillment_status);
        let shipping_status = "pending";
        if (statuses.length > 0 && statuses.every(s => s === "shipped" || s === "delivered")) {
          shipping_status = "shipped";
        } else if (statuses.some(s => s === "returned")) {
          shipping_status = "returned";
        }

        return {
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_nickname: order.customer_nickname || null,
          customer_email: order.customer_email,
          shipping_address: order.shipping_address,
          total_amount: order.total_amount,
          uneek_commission: order.uneek_commission,
          status: order.status,
          shipping_status,
          created_at: order.created_at,
          items,
        };
      });

      return res.status(200).json({ orders });
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

      // Récupérer le customer_id si un token est fourni
      let customerId = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        customerId = parseToken(authHeader.split(" ")[1]);
      }

      // Récupérer les vrais prix depuis la base
      const productIds = items.map((i) => i.product_id);
      const { data: products, error: prodError } = await supabaseAdmin
        .from("products")
        .select("id, price, brand_id, name, commission_percent, sizes_stock")
        .in("id", productIds);

      if (prodError || !products) {
        return res.status(500).json({ error: "Erreur récupération produits" });
      }

      // Vérifier le stock AVANT de créer la commande
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) {
          return res.status(400).json({ error: `Produit introuvable` });
        }
        if (item.size && product.sizes_stock) {
          if (stockParCouleur(product.sizes_stock) && !item.color) {
            return res.status(400).json({
              error: `Couleur requise pour ${product.name}`,
            });
          }
          const available = lireStock(product.sizes_stock, item.size, item.color);
          if (available === null) {
            return res.status(400).json({
              error: `Combinaison indisponible pour ${product.name} (${item.color || ""} ${item.size})`,
            });
          }
          if (available < (item.quantity || 1)) {
            const quoi = (item.color ? item.color + " " : "") + item.size;
            return res.status(400).json({
              error: `Stock insuffisant pour ${product.name} ${quoi} (${available} restant(s))`,
            });
          }
        }
      }

      let totalAmount = 0;
      let totalCommission = 0;
      const orderItems = items.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (!product) throw new Error(`Produit ${item.product_id} non trouvé`);

        const qty = item.quantity || 1;
        const lineTotal = product.price * qty;
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
          quantity: qty,
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
          customer_nickname: customer.nickname || null,
          customer_id: customerId,
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

      // Décrémenter le stock
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);
        if (item.size && product?.sizes_stock) {
          // Decrement cible : la bonne couleur si le produit en a.
          const currentStock = lireStock(product.sizes_stock, item.size, item.color) || 0;
          const newStock = Math.max(0, currentStock - (item.quantity || 1));
          const updatedSizesStock = ecrireStock(
            product.sizes_stock, item.size, item.color, newStock);

          await supabaseAdmin
            .from("products")
            .update({ sizes_stock: updatedSizesStock })
            .eq("id", product.id);
        }
      }

      // --- Notifications par e-mail ---
      // Placees APRES la commande et le decrement de stock, et enfermees dans
      // un try : si Resend est indisponible, la commande reste valide.
      try {
        const pourEmail = { ...order, customer_phone: customer.phone || null };
        const brandIds = [...new Set(orderItems.map((i) => i.brand_id).filter(Boolean))];

        const { data: comptes } = await supabaseAdmin
          .from("creator_accounts")
          .select("email, full_name, brand_id")
          .in("brand_id", brandIds);
        const { data: marques } = await supabaseAdmin
          .from("brands")
          .select("id, name, email")
          .in("id", brandIds);

        // Le client voit la marque sous chaque article : c'est ce qui fait
        // comprendre qu'UNEEK reunit des createurs, et non un seul magasin.
        const articlesClient = orderItems.map((i) => {
          const marque = (marques || []).find((m) => m.id === i.brand_id);
          return marque ? { ...i, brand_name: marque.name } : i;
        });

        const taches = [confirmationCommande(pourEmail, articlesClient)];

        // Un e-mail par marque concernee, ne contenant que ses propres articles.
        for (const bid of brandIds) {
          const compte = (comptes || []).find((c) => c.brand_id === bid);
          const marque = (marques || []).find((m) => m.id === bid);
          const destinataire = (compte && compte.email) || (marque && marque.email);
          if (!destinataire) {
            console.warn("[email] aucune adresse pour la marque", bid);
            continue;
          }
          taches.push(nouvelleCommandeCreateur(
            destinataire,
            (compte && compte.full_name) || (marque && marque.name) || "",
            pourEmail,
            orderItems.filter((i) => i.brand_id === bid)
          ));
        }

        // Alerte interne : etre prevenu de chaque commande sans avoir a
        // surveiller le panneau admin.
        taches.push(alerteAdmin(
          "Nouvelle commande " + (order.order_number || ""),
          [
            "<strong>" + esc(order.customer_name) + "</strong>",
            orderItems.map((i) => ligneArticle(i)).join("<br>"),
            "Total : " + prix(order.total_amount),
            "Livraison : " + esc(order.shipping_address),
          ],
          "Voir la commande"
        ));

        await envoyerTous(taches);
      } catch (err) {
        console.error("[email] notifications de commande ignorees :", err && err.message);
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
