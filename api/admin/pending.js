// API : /api/admin/pending
// GET → liste toutes les modifications (pending, approved, rejected)
// POST → approuver ou rejeter une modification

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // TODO: Vérifier que c'est bien l'admin (via le token)

  try {
    // --- LISTE DE TOUTES LES MODIFICATIONS ---
    // --- LISTE DE TOUS LES PRODUITS (publies ou non) ---
    // /api/products ne renvoie que is_published = true : les produits non
    // publies etaient invisibles partout, y compris dans l'admin.
    if (req.method === "GET" && req.query.type === "products") {
      // Pas de jointure imbriquee ici : embarquer brands(name) agit comme un
      // INNER JOIN et masquait les produits dont la marque est absente ou
      // inactive. On fait deux requetes et on associe cote serveur.
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching all products:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      const { data: brandRows } = await supabaseAdmin
        .from("brands")
        .select("id, name");
      const brandMap = {};
      (brandRows || []).forEach((b) => {
        brandMap[b.id] = b.name;
      });

      const products = (data || []).map((p) => ({
        ...p,
        brand_name: brandMap[p.brand_id] || "(marque introuvable)",
        image_url: (p.image_urls && p.image_urls.length > 0) ? p.image_urls[0] : "",
      }));

      const summary = {
        total: products.length,
        published: products.filter((p) => p.is_published).length,
        unpublished: products.filter((p) => !p.is_published).length,
        without_image: products.filter((p) => !p.image_urls || p.image_urls.length === 0).length,
      };

      // ?summary=1 : reponse compacte, sans les images base64, pour pouvoir
      // diagnostiquer l'etat du catalogue sans charger plusieurs Mo.
      if (req.query.summary) {
        return res.status(200).json({
          ...summary,
          items: products.map((p) => ({
            id: p.id,
            name: p.name,
            brand_name: p.brand_name,
            price: p.price,
            is_published: p.is_published,
            has_image: !!(p.image_urls && p.image_urls.length > 0),
          })),
        });
      }

      return res.status(200).json({ ...summary, products });
    }

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("product_edits")
        .select("*, brands(name), products(name, price, category, description, variants, commission_percent, image_urls, sizes_stock), creator_accounts(full_name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching pending edits:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json(data || []);
    }

    // --- APPROUVER OU REJETER ---
    if (req.method === "POST") {
      const { edit_id, action, admin_note, commission_percent, product_id } = req.body;

      // --- PUBLIER / DEPUBLIER UN PRODUIT ---
      if (action === "publish" || action === "unpublish") {
        if (!product_id) {
          return res.status(400).json({ error: "product_id requis" });
        }
        const { error: pubError } = await supabaseAdmin
          .from("products")
          .update({ is_published: action === "publish" })
          .eq("id", product_id);

        if (pubError) {
          console.error("Error updating is_published:", pubError);
          return res.status(500).json({ error: "Erreur mise à jour" });
        }

        return res.status(200).json({
          success: true,
          message: action === "publish" ? "Produit publié" : "Produit dépublié",
        });
      }

      if (!edit_id || !["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "edit_id et action (approve/reject) requis" });
      }

      // Récupérer la modification
      const { data: edit, error: editError } = await supabaseAdmin
        .from("product_edits")
        .select("*")
        .eq("id", edit_id)
        .single();

      if (editError || !edit) {
        return res.status(404).json({ error: "Modification non trouvée" });
      }

      if (action === "approve") {
        const c = edit.changes || {};
        // Mapper les champs changes → colonnes products
        const productData = {};
        if (c.name) productData.name = c.name;
        if (c.price) productData.price = c.price;
        if (c.category) productData.category = c.category;
        if (c.description) productData.description = c.description;
        if (c.image_url) productData.image_urls = [c.image_url];
        if (Array.isArray(c.variants)) productData.variants = c.variants;
        if (c.sizes_stock) {
                    productData.sizes_stock = c.sizes_stock;
          productData.sizes = Object.keys(c.sizes_stock);
          productData.stock = Object.values(c.sizes_stock).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
        }
        if (c.stock_quantity) productData.stock = c.stock_quantity;

        // Commission: priorité au body admin, sinon lire depuis changes du créateur
        const finalCommission = (commission_percent !== undefined && commission_percent !== null)
          ? parseFloat(commission_percent)
          : (c.commission_percent !== undefined ? parseFloat(c.commission_percent) : null);
        if (finalCommission !== null) {
          productData.commission_percent = finalCommission;
        }

        if (edit.is_new_product) {
          const slug = (c.name || "produit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
          const { error: createError } = await supabaseAdmin
            .from("products")
            .insert({
              ...productData,
              slug,
              brand_id: edit.brand_id,
              is_published: true,
              is_pending_review: false,
            });

          if (createError) {
            console.error("Error creating product:", createError);
            return res.status(500).json({ error: "Erreur création produit" });
          }
        } else {
          const { error: updateError } = await supabaseAdmin
            .from("products")
            .update({
              ...productData,
              is_pending_review: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", edit.product_id);

          if (updateError) {
            console.error("Error updating product:", updateError);
            return res.status(500).json({ error: "Erreur mise à jour produit" });
          }
        }
      }

      // Marquer la modification comme approuvée/rejetée
      const { error: statusError } = await supabaseAdmin
        .from("product_edits")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          admin_note: admin_note || null,
        })
        .eq("id", edit_id);

      if (statusError) {
        console.error("Error updating edit status:", statusError);
        return res.status(500).json({ error: "Erreur mise à jour statut" });
      }

      return res.status(200).json({
        success: true,
        message: action === "approve" ? "Modification approuvée" : "Modification rejetée",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin pending API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
