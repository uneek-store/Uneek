// API : /api/creator/orders
// GET  → liste les commandes d'une marque (pour le panneau créateur)
// POST → marquer un item comme expédié

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { commandeExpediee } from "../lib/email.js";
import { TRANSPORTEURS, nomTransporteur, normaliserNumero, lienSuivi } from "../lib/suivi.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Compte connecte, et uniquement sur SA marque. En mode
  // observation, un echec est seulement trace dans les logs.
  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/orders" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

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
        .select("*, orders(order_number, customer_name, customer_nickname, customer_email, shipping_address, status, lang, created_at), products(name)")
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
        // Numero de suivi (30 septembre 2026) : saisi par le createur au
        // moment de marquer l'article expedie.
        tracking_number: item.tracking_number || null,
        tracking_carrier: item.tracking_carrier || null,
        tracking_carrier_name: nomTransporteur(item.tracking_carrier) || null,
        tracking_url: item.tracking_number ? lienSuivi(item.tracking_number) : null,
        shipped_at: item.shipped_at || null,
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
      // action : "ship", la seule valeur envoyee par le panneau.
      const { order_item_id, action } = req.body;
      if (action && !(action === "ship")) {
        return res.status(400).json({ error: "Action inconnue" });
      }

      if (!order_item_id) {
        return res.status(400).json({ error: "order_item_id requis" });
      }

      // AVANT (jusqu'au 7 septembre) : cet appel ne portait qu'un
      // order_item_id. Le controle d'acces plus haut compare bien la marque
      // demandee a celle du jeton — mais il ne peut comparer que ce qu'on lui
      // donne, et le corps de cette requete ne contenait aucun brand_id. Un
      // createur pouvait donc marquer expedie l'article d'une autre marque,
      // et le client de cette marque recevait un "ton colis est parti".
      //
      // MAINTENANT : la marque vient du jeton signe, jamais de la requete —
      // le meme modele que api/creator/marque.js. L'administrateur, lui,
      // reste autorise partout.
      const session = acces.session || {};
      const marqueDuJeton = session.brand_id || null;

      const { data: ligneCible, error: errLigne } = await supabaseAdmin
        .from("order_items")
        .select("id, brand_id, order_id")
        .eq("id", order_item_id)
        .maybeSingle();

      if (errLigne) {
        console.error("Error reading order item:", errLigne);
        return res.status(500).json({ error: "Erreur serveur" });
      }
      if (!ligneCible) {
        return res.status(404).json({ error: "Article introuvable" });
      }

      if (!session.admin) {
        if (!marqueDuJeton) {
          return res.status(403).json({ error: "Aucune marque associée à ce compte" });
        }
        if (String(ligneCible.brand_id || "") !== String(marqueDuJeton)) {
          console.warn("[auth] REFUS — expedition d'un article d'une autre marque"
            + " — jeton " + marqueDuJeton + " / article " + ligneCible.brand_id);
          return res.status(403).json({ error: "Cet article n'appartient pas à ta marque" });
        }
      }

      // NUMERO DE SUIVI OBLIGATOIRE (30 septembre 2026). Le createur envoie
      // lui-meme, avec son transporteur : sans numero, UNEEK ne peut ni
      // verifier l'envoi ni donner au client de quoi suivre son colis. Le
      // controle est ICI, cote serveur : un bouton masque dans la page se
      // contourne en dix secondes.
      // Place APRES le controle de la marque : un article d'une autre
      // marque est refuse (403) avant meme de regarder le numero.
      const numero = normaliserNumero(req.body.tracking_number);
      const transporteur = String(req.body.tracking_carrier || "").trim();
      if (!numero) {
        return res.status(400).json({ error: "Numéro de suivi manquant ou invalide (6 à 40 lettres ou chiffres)" });
      }
      if (!Object.prototype.hasOwnProperty.call(TRANSPORTEURS, transporteur)) {
        return res.status(400).json({ error: "Choisis le transporteur" });
      }

      // Un numero ne sert qu'a UN colis : celui de cette commande, pour
      // cette marque. Reutiliser le numero d'un autre colis, c'est annoncer
      // au client un envoi qui n'est pas le sien.
      const { data: dejaPris, error: errDoublon } = await supabaseAdmin
        .from("order_items")
        .select("id, order_id, brand_id")
        .eq("tracking_number", numero);
      if (errDoublon) {
        console.error("Error checking tracking number:", errDoublon);
        return res.status(500).json({ error: "Erreur serveur" });
      }
      const autreColis = (dejaPris || []).some((l) =>
        String(l.order_id || "") !== String(ligneCible.order_id || "")
        || String(l.brand_id || "") !== String(ligneCible.brand_id || ""));
      if (autreColis) {
        return res.status(409).json({ error: "Ce numéro de suivi est déjà utilisé pour un autre colis" });
      }

      // UN SEUL COLIS PAR MARQUE ET PAR COMMANDE : tous les articles de
      // cette marque dans cette commande, encore a expedier, partent avec
      // ce numero. Sans ca, un client qui prend deux pieces chez la meme
      // marque verrait l'une "expediee" et l'autre "a expedier".
      let idsColis = [ligneCible.id];
      if (ligneCible.order_id) {
        const { data: memeCommande, error: errColis } = await supabaseAdmin
          .from("order_items")
          .select("id, fulfillment_status")
          .eq("order_id", ligneCible.order_id)
          .eq("brand_id", ligneCible.brand_id);
        if (errColis) {
          console.error("Error reading parcel items:", errColis);
          return res.status(500).json({ error: "Erreur serveur" });
        }
        const dejaParties = ["shipped", "delivered", "returned"];
        (memeCommande || []).forEach((l) => {
          if (dejaParties.indexOf(l.fulfillment_status) === -1 && idsColis.indexOf(l.id) === -1) {
            idsColis.push(l.id);
          }
        });
      }

      const expedition = {
        fulfillment_status: "shipped",
        tracking_number: numero,
        tracking_carrier: transporteur,
        shipped_at: new Date().toISOString(),
      };
      // Une mise a jour par ligne : quelques lignes au plus, et chaque
      // erreur est regardee (supabase-js renvoie { error }, il ne leve pas).
      for (const id of idsColis) {
        const { error } = await supabaseAdmin
          .from("order_items")
          .update(expedition)
          .eq("id", id);
        if (error) {
          console.error("Error updating fulfillment:", error);
          return res.status(500).json({ error: "Erreur mise à jour" });
        }
      }

      // Prevenir le client. Des requetes simples plutot qu'une jointure
      // imbriquee : les embeds PostgREST echouent durement au moindre nom
      // de colonne inexact, et on ne veut pas risquer l'expedition pour un
      // e-mail.
      try {
        const lignes = [];
        for (const id of idsColis) {
          const { data: l } = await supabaseAdmin
            .from("order_items")
            .select("order_id, brand_id, product_name, size, color, quantity")
            .eq("id", id)
            .maybeSingle();
          if (l) lignes.push(l);
        }
        const ligne = lignes[0];

        if (ligne && ligne.order_id) {
          const { data: commande } = await supabaseAdmin
            .from("orders")
            .select("order_number, customer_name, customer_nickname, customer_email, shipping_address, lang")
            .eq("id", ligne.order_id)
            .maybeSingle();

          let nomMarque = "";
          if (ligne.brand_id) {
            const { data: marque } = await supabaseAdmin
              .from("brands").select("name").eq("id", ligne.brand_id).maybeSingle();
            nomMarque = (marque && marque.name) || "";
          }

          if (commande && commande.customer_email) {
            await commandeExpediee(
              commande,
              lignes.map((l) => (nomMarque ? { ...l, brand_name: nomMarque } : l)),
              nomMarque,
              { numero, transporteur: nomTransporteur(transporteur), lien: lienSuivi(numero) });
          } else {
            console.warn("[email] pas d'adresse client pour la commande", ligne.order_id);
          }
        }
      } catch (err) {
        console.error("[email] avis d'expedition ignore :", err && err.message);
      }

      return res.status(200).json({
        success: true,
        message: "Marqué comme expédié",
        tracking_number: numero,
        tracking_carrier: transporteur,
        items: idsColis,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator orders API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
