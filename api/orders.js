// API : /api/orders
// GET  → liste toutes les commandes (admin)
// POST → créer une nouvelle commande (checkout)

import { supabaseAdmin } from "./lib/supabase.js";
import { controlerAcces } from "./lib/session.js";
import { limiter } from "./lib/limite.js";
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

// Le total, toutes tailles et toutes couleurs confondues. Sert a tenir a jour
// la colonne "stock" (constat 16) : les panneaux la lisent quand le detail par
// taille est vide, et elle n'avait jamais bouge depuis la creation du produit.
// Releve du 7 septembre : le produit "hoodie poul" annoncait 18 alors que le
// detail totalisait 17.
function stockTotal(ss) {
  if (!ss || typeof ss !== "object") return 0;
  let total = 0;
  for (const cle of Object.keys(ss)) {
    const v = ss[cle];
    if (v !== null && typeof v === "object") {
      for (const t of Object.keys(v)) total += parseInt(v[t], 10) || 0;
    } else {
      total += parseInt(v, 10) || 0;
    }
  }
  return total;
}

// CONSTAT 03 — deux exemplaires du meme article passaient avec une piece
// en stock.
// Le panier du site ajoute UNE LIGNE par exemplaire : trois fois le meme
// tee-shirt en M, ce sont trois lignes de quantite 1. La verification se
// faisait ligne par ligne : chacune voyait "1 disponible >= 1 demande" et
// passait. Le decrement, lui, relisait a chaque tour le stock d'origine
// garde en memoire, et ecrivait donc trois fois la meme valeur : trois
// vendus, un seul decompte.
// On regroupe donc par article + taille + couleur AVANT de verifier et
// AVANT de decrementer. Les lignes de la commande, elles, restent telles
// que le client les a composees : rien ne change de ce qu'il voit.
function regrouperParVariante(items) {
  const par = new Map();
  for (const item of items || []) {
    const cle = [item.product_id, item.size || "", item.color || ""].join("\u0000");
    const q = Math.max(1, parseInt(item.quantity, 10) || 1);
    const deja = par.get(cle);
    if (deja) deja.quantity += q;
    else par.set(cle, {
      product_id: item.product_id,
      size: item.size || null,
      color: item.color || null,
      quantity: q,
    });
  }
  return Array.from(par.values());
}

// CONSTAT 02 — le stock partait avant le paiement et ne revenait jamais.
// La reservation est ce qui empeche de vendre deux fois la meme piece entre
// le panier et le paiement : on la garde. Ce qui manquait, c'est de pouvoir
// la DEFAIRE. reserverStock rend un journal de ce qu'il a change, valeur
// d'origine comprise ; restituerStock remet exactement ces valeurs.
//
// Le journal contient la valeur AVANT, pas un delta : remettre la valeur
// d'origine est juste meme si l'ecriture a echoue a mi-chemin, alors qu'un
// "+ 1" applique deux fois inventerait du stock.
async function reserverStock(lignes, produits) {
  const journal = [];
  for (const ligne of lignes) {
    const produit = produits.find((p) => p.id === ligne.product_id);
    if (!ligne.size || !produit || !produit.sizes_stock) continue;

    const avant = produit.sizes_stock;
    const disponible = lireStock(avant, ligne.size, ligne.color) || 0;
    const apres = ecrireStock(
      avant, ligne.size, ligne.color, Math.max(0, disponible - ligne.quantity));

    const { error } = await supabaseAdmin
      .from("products")
      .update({ sizes_stock: apres, stock: stockTotal(apres) })
      .eq("id", produit.id);

    if (error) {
      // On s'arrete au premier refus : le journal contient exactement ce
      // qui a ete ecrit jusque-la, et l'appelant peut tout remettre.
      console.error("[stock] reservation refusee pour", produit.id, ":", error.message);
      return { ok: false, journal, produit: produit.name || produit.id };
    }

    journal.push({ product_id: produit.id, sizes_stock_avant: avant });
    // La copie en memoire suit, sinon deux lignes du meme produit mais de
    // tailles differentes reliraient toutes les deux le stock d'origine.
    produit.sizes_stock = apres;
  }
  return { ok: true, journal };
}

async function restituerStock(journal) {
  for (const entree of (journal || []).slice().reverse()) {
    const { error } = await supabaseAdmin
      .from("products")
      .update({
        sizes_stock: entree.sizes_stock_avant,
        stock: stockTotal(entree.sizes_stock_avant),
      })
      .eq("id", entree.product_id);
    if (error) {
      // Rien d'autre a tenter ici : on le dit fort, pour que ca se voie
      // dans les journaux Vercel plutot que de disparaitre en silence.
      console.error("[stock] RESTITUTION IMPOSSIBLE pour", entree.product_id,
        ":", error.message, "— stock a corriger a la main");
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
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
      // Passer commande est public, et c'est l'appel le plus couteux du site :
      // il ecrit trois tables, decremente les stocks et envoie trois e-mails.
      // En boucle, il noierait la base de fausses commandes et ferait grimper
      // la facture. Un client reel en passe une, pas quinze en cinq minutes.
      if (limiter(req, res, {
        cle: "commande",
        max: 15,
        secondes: 300,
        message: "Trop de commandes d'affilée. Attends quelques minutes, ou écris-nous à contact@uneek.store.",
      })) return;

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

      // Vérifier le stock AVANT de créer la commande.
      // Sur les TOTAUX par variante, pas ligne par ligne : voir le commentaire
      // de regrouperParVariante plus haut (constat 03).
      const demande = regrouperParVariante(items);

      for (const ligne of demande) {
        const product = products.find((p) => p.id === ligne.product_id);
        if (!product) {
          return res.status(400).json({ error: `Produit introuvable` });
        }
        if (ligne.size && product.sizes_stock) {
          if (stockParCouleur(product.sizes_stock) && !ligne.color) {
            return res.status(400).json({
              error: `Couleur requise pour ${product.name}`,
            });
          }
          const available = lireStock(product.sizes_stock, ligne.size, ligne.color);
          if (available === null) {
            return res.status(400).json({
              error: `Combinaison indisponible pour ${product.name} (${ligne.color || ""} ${ligne.size})`,
            });
          }
          if (available < ligne.quantity) {
            const quoi = (ligne.color ? ligne.color + " " : "") + ligne.size;
            return res.status(400).json({
              error: `Stock insuffisant pour ${product.name} ${quoi} (${available} restant(s)`
                + `, ${ligne.quantity} demandé${ligne.quantity > 1 ? "s" : ""})`,
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

      // Réserver le stock (constat 02).
      // La reservation vient APRES l'ecriture de la commande : si la commande
      // n'a pas pu s'ecrire, aucun stock n'a bouge. Et si c'est la reservation
      // qui echoue, on remet tout ce qui avait deja ete pris avant de rendre
      // la main — l'ancien code laissait le stock ampute et le client sans
      // rien.
      const reservation = await reserverStock(demande, products);

      if (!reservation.ok) {
        // On remet d'abord ce qui avait ete pris : c'est ce qui compte.
        await restituerStock(reservation.journal);
        // La commande existe deja en base ; on la marque plutot que de la
        // detruire, pour qu'elle reste tracable. Si ce marquage echoue (par
        // exemple parce que la colonne n'accepte pas cette valeur), on le
        // dit dans les journaux mais on repond quand meme au client : le
        // stock, lui, est en ordre.
        const { error: errMarque } = await supabaseAdmin
          .from("orders")
          .update({ status: "cancelled", payment_status: "failed" })
          .eq("id", order.id);
        if (errMarque) {
          console.error("[commande] " + (order.order_number || order.id)
            + " n'a pas pu etre marquee annulee :", errMarque.message);
        }
        return res.status(409).json({
          error: "Le stock de « " + (reservation.produit || "un article")
            + " » vient de partir. Ta commande n'a pas été validée, rien ne t'a été débité.",
        });
      }

      // Ce que la reservation a pris, et comment le rendre. Le jour ou le
      // paiement Stripe s'intercale ici, c'est cette ligne qu'il faut lire :
      // paiement confirme  -> ne rien faire, la reservation devient la vente
      // paiement echoue ou abandonne -> restituerStock(journal), puis passer
      //                                 la commande en payment_status "failed"
      // Voir aussi PATCH action "annuler" plus bas, qui fait exactement ca a
      // partir des lignes de la commande.
      console.log("[stock] reserve pour " + (order.order_number || order.id) + " : "
        + reservation.journal.map((e) => e.product_id).join(", "));

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

    // --- PATCH : annuler une commande et rendre son stock ---
    // C'est la contrepartie de la reservation. Aujourd'hui c'est
    // l'administrateur qui s'en sert ; demain, c'est ce que le retour de
    // Stripe appellera quand un paiement n'aboutit pas.
    if (req.method === "PATCH") {
      const acces = controlerAcces(req, { admin: true, nom: "/api/orders (PATCH)" });
      if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

      const { order_id, action } = req.body || {};
      if (!order_id) return res.status(400).json({ error: "order_id requis" });
      if (action !== "annuler") {
        return res.status(400).json({ error: "Action inconnue" });
      }

      const { data: commande, error: errCommande } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, payment_status")
        .eq("id", order_id)
        .maybeSingle();

      if (errCommande) {
        console.error("Error reading order:", errCommande);
        return res.status(500).json({ error: "Erreur serveur" });
      }
      if (!commande) return res.status(404).json({ error: "Commande introuvable" });

      // Garde-fou : rendre deux fois le stock d'une meme commande
      // inventerait des pieces qui n'existent pas.
      if (commande.status === "cancelled") {
        return res.status(200).json({
          success: true, deja_annulee: true,
          message: "Cette commande était déjà annulée, le stock n'a pas été rendu deux fois.",
        });
      }

      const { data: lignes, error: errLignes } = await supabaseAdmin
        .from("order_items")
        .select("product_id, size, color, quantity")
        .eq("order_id", order_id);

      if (errLignes) {
        console.error("Error reading order items:", errLignes);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      // ORDRE VOULU : on marque la commande annulee AVANT de rendre le stock.
      // L'inverse serait dangereux — si le marquage echouait apres coup, un
      // second appel repasserait le garde-fou "deja annulee" et rendrait le
      // stock une deuxieme fois, inventant des pieces qui n'existent pas.
      // Ici, un marquage qui echoue veut dire qu'aucun stock n'a bouge :
      // reessayer est sans danger.
      const { error: errMarquage } = await supabaseAdmin
        .from("orders")
        .update({ status: "cancelled", payment_status: "cancelled" })
        .eq("id", order_id);

      if (errMarquage) {
        console.error("Error cancelling order:", errMarquage);
        return res.status(500).json({
          error: "La commande n'a pas pu être marquée annulée. Rien n'a été touché, tu peux réessayer.",
        });
      }

      // On relit le stock actuel et on rajoute les quantites de la commande :
      // le stock a pu bouger depuis, on ne peut pas simplement reposer une
      // ancienne valeur.
      const ids = [...new Set((lignes || []).map((l) => l.product_id).filter(Boolean))];
      const { data: produits } = ids.length
        ? await supabaseAdmin.from("products").select("id, name, sizes_stock").in("id", ids)
        : { data: [] };

      const rendus = [];
      const manques = [];
      for (const ligne of regrouperParVariante(lignes || [])) {
        const produit = (produits || []).find((p) => p.id === ligne.product_id);
        if (!ligne.size || !produit || !produit.sizes_stock) continue;
        const actuel = lireStock(produit.sizes_stock, ligne.size, ligne.color) || 0;
        const rendu = ecrireStock(
          produit.sizes_stock, ligne.size, ligne.color, actuel + ligne.quantity);
        const { error } = await supabaseAdmin
          .from("products")
          .update({ sizes_stock: rendu, stock: stockTotal(rendu) })
          .eq("id", produit.id);
        if (error) {
          console.error("[stock] restitution refusee pour", produit.id, ":", error.message);
          manques.push((produit.name || produit.id) + " " + (ligne.color ? ligne.color + " " : "")
            + ligne.size + " +" + ligne.quantity);
          continue;
        }
        produit.sizes_stock = rendu;
        rendus.push((produit.name || produit.id) + " " + (ligne.color ? ligne.color + " " : "")
          + ligne.size + " +" + ligne.quantity);
      }

      try {
        const lignesMail = ["Stock rendu : "
          + (rendus.length ? esc(rendus.join(" · ")) : "aucun article à rendre")];
        if (manques.length) {
          lignesMail.push("<strong>À CORRIGER À LA MAIN</strong> — n'a pas pu être rendu : "
            + esc(manques.join(" · ")));
        }
        await alerteAdmin("Commande annulée " + (commande.order_number || ""),
          lignesMail, "Voir les commandes");
      } catch (err) {
        console.error("[email] avis d'annulation ignore :", err && err.message);
      }

      return res.status(200).json({
        success: true,
        stock_rendu: rendus,
        stock_non_rendu: manques,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
