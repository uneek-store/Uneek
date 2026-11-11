// API : /api/admin/pending
// GET → liste toutes les modifications (pending, approved, rejected)
// POST → approuver ou rejeter une modification

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { reponseValidation } from "../lib/email.js";

// Vrai si "ordre" est une selection rangee de n photos : au moins une,
// chaque index entre 0 et n-1, aucun en double. L'admin peut ainsi changer
// l'ordre ET retirer des photos (poubelle), mais jamais en inventer.
function estUnRangement(ordre, n) {
  if (!Array.isArray(ordre) || ordre.length < 1 || ordre.length > n || n < 1) return false;
  const vus = new Set();
  for (const v of ordre) {
    if (!Number.isInteger(v) || v < 0 || v >= n || vus.has(v)) return false;
    vus.add(v);
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Reserve aux administrateurs. En mode observation, un echec est
  // seulement trace dans les logs — rien n'est bloque.
  const acces = controlerAcces(req, { admin: true, nom: "/api/admin/pending" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });


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
        .select("*, brands(name), products(*), creator_accounts(full_name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching pending edits:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }


      // ?summary=1 : metadonnees seules, sans les images base64. Une reponse
      // complete pese plusieurs Mo, ce qui rend tout diagnostic impossible.
      if (req.query.summary) {
        return res.status(200).json({
          total: (data || []).length,
          items: (data || []).map((e) => ({
            id: e.id,
            created_at: e.created_at,
            brand_id: e.brand_id,
            brand_name: e.brands?.name,
            is_new_product: e.is_new_product,
            status: e.status,
            name: e.changes?.name,
            price: e.changes?.price,
            variants: e.changes?.variants,
            photos: Array.isArray(e.changes?.image_urls)
              ? e.changes.image_urls.length
              : (e.changes?.image_url ? 1 : 0),
          })),
        });
      }

      return res.status(200).json(data || []);
    }

    // --- APPROUVER OU REJETER ---
    if (req.method === "POST") {
      const { edit_id, action, admin_note, commission_percent, product_id, image_order } = req.body;

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
        const c = Object.assign({}, edit.changes || {});
        // ORDRE DES PHOTOS choisi par l'admin dans la demande (2 novembre
        // 2026) : image_order = [index de la 1re, de la 2e, ...]. N'est pris
        // en compte que si c'est une selection valide des photos (chaque
        // photo au plus une fois, aucune inventee) : sinon on garde l'ordre
        // du createur. Les couleurs des photos suivent le meme rangement.
        // Depuis la poubelle, image_order peut aussi en contenir MOINS : les
        // photos absentes ne sont pas publiees.
        if (Array.isArray(c.image_urls) && estUnRangement(image_order, c.image_urls.length)) {
          const photos = c.image_urls;
          const couleurs = Array.isArray(c.image_colors) ? c.image_colors : null;
          c.image_urls = image_order.map((i) => photos[i]);
          if (couleurs) c.image_colors = image_order.map((i) => couleurs[i] || null);
          c.image_url = c.image_urls[0] || c.image_url;
        }
        // Mapper les champs changes → colonnes products
        const productData = {};
        if (c.name) productData.name = c.name;
        if (c.price) productData.price = c.price;
        if (c.category) productData.category = c.category;
        if (c.description) productData.description = c.description;
        // image_urls est une colonne tableau : on y met toutes les photos.
        if (Array.isArray(c.image_urls)) {
          productData.image_urls = c.image_urls;
          // Sans cette ligne, le createur range ses photos par couleur, la
          // demande part, l'admin valide — et le rangement est perdu.
          if (Array.isArray(c.image_colors)) {
            productData.image_colors = c.image_urls.map((u, i) => c.image_colors[i] || null);
          }
        } else if (c.image_url) {
          productData.image_urls = [c.image_url];
        }
        // La colonne de la table products s'appelle "colors", pas "variants".
        // Ecrire dans variants faisait echouer toute l'approbation.
        if (Array.isArray(c.variants)) productData.colors = c.variants;
        // Sans cette ligne, les details saisis par le createur etaient perdus
        // au moment de l'approbation.
        if (c.details && typeof c.details === "object") productData.details = c.details;
        if (c.sizes_stock) {
          // sizes_stock a deux formes : plate { S: 3 } ou par couleur
          // { Rouge: { S: 3 } }. On aplatit pour calculer sizes et stock.
          const lignes = [];
          const vals = Object.keys(c.sizes_stock).map(k => c.sizes_stock[k]);
          const parCouleur = vals.length && vals[0] !== null
            && typeof vals[0] === "object" && !Array.isArray(vals[0]);
          if (parCouleur) {
            Object.keys(c.sizes_stock).forEach((coul) => {
              const t = c.sizes_stock[coul] || {};
              Object.keys(t).forEach((taille) => {
                lignes.push({ taille, qte: parseInt(t[taille]) || 0 });
              });
            });
          } else {
            Object.keys(c.sizes_stock).forEach((taille) => {
              lignes.push({ taille, qte: parseInt(c.sizes_stock[taille]) || 0 });
            });
          }
          const tailles = [];
          lignes.forEach((l) => {
            if (l.qte > 0 && tailles.indexOf(l.taille) === -1) tailles.push(l.taille);
          });
          productData.sizes_stock = c.sizes_stock;
          productData.sizes = tailles;
          productData.stock = lignes.reduce((s, l) => s + l.qte, 0);
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
          const base = (c.name || "produit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "produit";
          // ADRESSE DEJA PRISE (11 novembre 2026) : un 2e « Cotton Beanie »
          // (le rouge, apres le noir) voulait la meme adresse /produit/cotton-beanie.
          // La base refusait, et l'admin ne pouvait plus approuver. On prend
          // la premiere adresse libre : cotton-beanie, cotton-beanie-2, -3...
          let dejaPris = [];
          try {
            const lu = await supabaseAdmin.from("products").select("slug").like("slug", base + "%");
            dejaPris = lu.data || [];
          } catch (e) { dejaPris = []; }   // le doublon sera rattrape a l'insertion
          const pris = new Set(dejaPris.map((x) => x.slug));
          let slug = base;
          for (let n = 2; pris.has(slug) && n < 500; n++) slug = base + "-" + n;

          let createError = null;
          for (let essai = 0; essai < 3; essai++) {
            const r = await supabaseAdmin
              .from("products")
              .insert({
                ...productData,
                slug,
                brand_id: edit.brand_id,
                is_published: true,
                is_pending_review: false,
              });
            createError = r.error;
            // Adresse prise entre-temps (code 23505 = doublon) : on en prend une autre.
            if (createError && createError.code === "23505") {
              slug = base + "-" + Date.now().toString(36).slice(-4);
              continue;
            }
            break;
          }

          if (createError) {
            console.error("Error creating product:", createError);
            // L'admin voit la vraie raison : « Erreur création produit » seul
            // ne permettait pas de savoir quoi corriger.
            return res.status(500).json({
              error: "Erreur création produit" + (createError.message ? " : " + createError.message : ""),
            });
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

      // Prevenir le createur de la decision. Enferme dans un try : un echec
      // d'envoi ne doit pas annuler une validation deja enregistree.
      try {
        // maybeSingle() renvoyait une ERREUR des qu'une marque avait deux
        // comptes createurs : le createur ne recevait alors jamais la
        // reponse, elle partait a l'adresse de la marque. On prend la liste
        // et on choisit, comme pour les virements et la notification de
        // commande : celui qui a relie Stripe, sinon celui qui n'est pas
        // administrateur.
        const { data: comptesMarque } = await supabaseAdmin
          .from("creator_accounts")
          .select("email, full_name, lang, is_admin, stripe_account_id")
          .eq("brand_id", edit.brand_id);
        const candidats = comptesMarque || [];
        const compte = candidats.find((x) => x.stripe_account_id)
          || candidats.find((x) => !x.is_admin)
          || candidats[0]
          || null;
        const { data: marque } = await supabaseAdmin
          .from("brands")
          .select("name, email")
          .eq("id", edit.brand_id)
          .maybeSingle();

        const destinataire = (compte && compte.email) || (marque && marque.email);
        if (destinataire) {
          await reponseValidation(
            destinataire,
            (compte && compte.full_name) || (marque && marque.name) || "",
            {
              approuve: action === "approve",
              nomProduit: (edit.changes && edit.changes.name) || "ton produit",
              estNouveau: !!edit.is_new_product,
              note: admin_note || "",
            },
            (compte && compte.lang) || null
          );
        } else {
          console.warn("[email] aucune adresse pour la marque", edit.brand_id);
        }
      } catch (err) {
        console.error("[email] reponse de validation ignoree :", err && err.message);
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
