// API : /api/creator/products
// GET  → liste les produits du créateur connecté
// POST → soumettre un nouveau produit ou modifier stock directement
// DELETE → supprimer un produit (notifie l'admin)

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const brand_id = req.method === "GET" ? req.query.brand_id : req.body.brand_id;

    if (!brand_id) {
      return res.status(400).json({ error: "brand_id requis" });
    }

    // --- LISTE DES PRODUITS DU CRÉATEUR ---
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("brand_id", brand_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching creator products:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(data || []);
    }

    // --- POST: NEW PRODUCT OR MODIFICATION ---
    if (req.method === "POST") {
      const { product_id, edit_type, name, price, category, description, sizes_stock, image_url, image_urls, variants, commission_percent } = req.body;

      // EDIT MODE: update product directly (stock, name, price, etc.)
      // --- MODIFICATION : soumise a la validation de l'admin ---
      // Cette branche ecrivait directement dans la table products : aucune
      // demande n'arrivait dans le panneau admin, alors que le panneau
      // createur annonce "La modification sera validee par UNEEK". Elle
      // ignorait aussi variants, commission_percent et image_url, qui
      // etaient donc perdus a chaque modification.
      if (edit_type === "modification" && product_id) {
        const changes = {};
        if (name) changes.name = name;
        if (price !== undefined && price !== null && price !== "") changes.price = parseFloat(price);
        if (category) changes.category = category;
        if (description !== undefined) changes.description = description;
        if (Array.isArray(image_urls)) {
          // Un tableau vide est un choix explicite : le createur a tout retire.
          changes.image_urls = image_urls;
          changes.image_url = image_urls[0] || '';
        } else if (image_url) {
          changes.image_url = image_url;
        }
        if (Array.isArray(variants)) changes.variants = variants;
        if (commission_percent !== undefined && commission_percent !== null) {
          changes.commission_percent = parseFloat(commission_percent);
        }
        // Le stock est operationnel, pas editorial : il s'applique tout de
        // suite, sans validation. Tout le reste passe par l'admin.
        let stockApplied = false;
        if (sizes_stock && Object.keys(sizes_stock).length > 0) {
          const totalStock = Object.values(sizes_stock).reduce(
            (s, q) => s + (parseInt(q) || 0), 0);
          const { error: stockError } = await supabaseAdmin
            .from("products")
            .update({
              sizes_stock,
              sizes: Object.keys(sizes_stock),
              stock: totalStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", product_id)
            .eq("brand_id", brand_id);

          if (stockError) {
            console.error("Error updating stock:", stockError);
            return res.status(500).json({ error: "Erreur mise à jour du stock" });
          }
          stockApplied = true;
        }

        // Rien d'autre que le stock : pas de demande a creer.
        if (Object.keys(changes).length === 0) {
          if (stockApplied) {
            return res.status(200).json({
              success: true,
              stock_only: true,
              message: "Stock mis à jour",
            });
          }
          return res.status(400).json({ error: "Aucune modification à soumettre" });
        }

        const { data: edit, error } = await supabaseAdmin
          .from("product_edits")
          .insert({
            product_id,
            brand_id,
            is_new_product: false,
            changes,
            submitted_by: null,
            status: "pending",
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating product edit:", error);
          return res.status(500).json({ error: "Erreur soumission" });
        }

        return res.status(200).json({
          success: true,
          stock_applied: stockApplied,
          message: stockApplied
            ? "Stock mis à jour. Les autres changements sont soumis à validation UNEEK."
            : "Modification soumise — en attente de validation par UNEEK",
          edit_id: edit.id,
        });
      }

      // NEW PRODUCT: submit for approval
      if (edit_type === "new" || !product_id) {
        const product_data = { name, price, category, description, sizes_stock, image_url };
        if (Array.isArray(image_urls) && image_urls.length > 0) {
          product_data.image_urls = image_urls;
          product_data.image_url = image_urls[0];
        }
        // Ces deux champs etaient saisis par le createur puis jetes.
        if (Array.isArray(variants)) product_data.variants = variants;
        if (commission_percent !== undefined && commission_percent !== null) {
          product_data.commission_percent = parseFloat(commission_percent);
        }

        const { data: edit, error } = await supabaseAdmin
          .from("product_edits")
          .insert({
            product_id: null,
            brand_id,
            is_new_product: true,
            changes: product_data,
            submitted_by: null,
            status: "pending",
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating product edit:", error);
          return res.status(500).json({ error: "Erreur soumission" });
        }

        return res.status(201).json({
          success: true,
          message: "Nouveau produit soumis — en attente de validation par UNEEK",
          edit_id: edit.id,
        });
      }

      return res.status(400).json({ error: "edit_type requis (new ou modification)" });
    }

    // --- SUPPRIMER UN PRODUIT ---
    if (req.method === "DELETE") {
      const { product_id } = req.body;

      if (!product_id) {
        return res.status(400).json({ error: "product_id requis" });
      }

      // Vérifier que le produit appartient bien à cette marque
      const { data: product, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, name, brand_id")
        .eq("id", product_id)
        .eq("brand_id", brand_id)
        .single();

      if (fetchErr || !product) {
        return res.status(404).json({ error: "Produit non trouvé" });
      }

      // Récupérer le nom de la marque pour la notification
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("name")
        .eq("id", brand_id)
        .single();

      // Supprimer le produit
      const { error: deleteErr } = await supabaseAdmin
        .from("products")
        .delete()
        .eq("id", product_id);

      if (deleteErr) {
        console.error("Error deleting product:", deleteErr);
        return res.status(500).json({ error: "Erreur suppression" });
      }

      // Notifier l'admin par email (via Supabase Edge Function ou simple log)
      // On insère une notification dans une table pour que l'admin la voie
      try {
        await supabaseAdmin.from("admin_notifications").insert({
          type: "product_deleted",
          message: `Le créateur ${brand?.name || "inconnu"} a supprimé le produit "${product.name}"`,
          brand_id,
          product_id,
          read: false,
        });
      } catch (notifErr) {
        // Si la table n'existe pas encore, on log simplement
        console.log(
          `[NOTIFICATION] Produit supprimé: "${product.name}" par ${brand?.name || brand_id}`
        );
      }

      return res.status(200).json({
        success: true,
        message: "Produit supprimé",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator products API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
