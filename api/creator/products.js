// API : /api/creator/products
// GET  → liste les produits du créateur connecté
// POST → soumettre un nouveau produit ou modifier stock directement
// DELETE → supprimer un produit (notifie l'admin)

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { alerteAdmin, esc } from "../lib/email.js";

// sizes_stock a deux formes : plate { S: 3 } ou par couleur { Rouge: { S: 3 } }.
function aplatirStock(ss) {
  if (!ss || typeof ss !== "object") return [];
  const vals = Object.keys(ss).map((k) => ss[k]);
  const parCouleur = vals.length && vals[0] !== null
    && typeof vals[0] === "object" && !Array.isArray(vals[0]);
  const lignes = [];
  if (parCouleur) {
    Object.keys(ss).forEach((coul) => {
      const t = ss[coul] || {};
      Object.keys(t).forEach((taille) => {
        lignes.push({ couleur: coul, taille, qte: parseInt(t[taille]) || 0 });
      });
    });
  } else {
    Object.keys(ss).forEach((taille) => {
      lignes.push({ couleur: null, taille, qte: parseInt(ss[taille]) || 0 });
    });
  }
  return lignes;
}

// Regle UNEEK : au moins 3 pieces des qu'une combinaison est proposee.
// Verifiee ICI, cote serveur : le controle du navigateur peut etre contourne,
// et il ne couvrait que la creation, jamais la modification.
// --- Details du produit ---------------------------------------------------
// Chaque marque ecrivait sa description comme elle voulait : avec trente
// marques, la boutique devenait un patchwork. On demande donc des champs
// plutot qu'un texte, et les trois premiers sont obligatoires.
// Les valeurs de coupe et d'entretien sont fermees : une marque ne peut pas
// inventer sa propre formulation, c'est ce qui garde les fiches coherentes.

const COUPES = ["Ample", "Classique", "Ajustée"];
const ENTRETIENS = [
  "Lavage à 30°", "Lavage à 40°", "Lavage à la main",
  "Pas de sèche-linge", "Pas de repassage", "Nettoyage à sec",
];

function detailsManquants(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    return ["la composition", "la coupe", "au moins une consigne d'entretien"];
  }
  const manque = [];
  if (!String(d.composition || "").trim()) manque.push("la composition");
  if (!COUPES.includes(String(d.coupe || ""))) manque.push("la coupe");
  const e = d.entretien;
  if (!Array.isArray(e) || e.filter((x) => ENTRETIENS.includes(x)).length === 0) {
    manque.push("au moins une consigne d'entretien");
  }
  return manque;
}

// Ne garde que les champs connus et les valeurs autorisees : rien de ce qui
// vient du navigateur n'entre tel quel en base.
function nettoyerDetails(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return {};
  const propre = {};
  const texte = (v) => String(v == null ? "" : v).trim().slice(0, 200);
  if (texte(d.composition)) propre.composition = texte(d.composition);
  if (COUPES.includes(String(d.coupe || ""))) propre.coupe = String(d.coupe);
  if (Array.isArray(d.entretien)) {
    const gardes = d.entretien.filter((x) => ENTRETIENS.includes(x));
    if (gardes.length) propre.entretien = gardes;
  }
  if (texte(d.mannequin)) propre.mannequin = texte(d.mannequin);
  if (texte(d.fabrique)) propre.fabrique = texte(d.fabrique);
  return propre;
}

const STOCK_MINIMUM = 3;
function combinaisonsSousLeMinimum(ss) {
  return aplatirStock(ss)
    .filter((l) => l.qte > 0 && l.qte < STOCK_MINIMUM)
    .map((l) => (l.couleur ? l.couleur + " " : "") + l.taille + " (" + l.qte + ")");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Compte connecte, et uniquement sur SA marque. En mode
  // observation, un echec est seulement trace dans les logs.
  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/products" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

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
      const { product_id, edit_type, name, price, category, description, sizes_stock, image_url, image_urls, variants, commission_percent, details } = req.body;

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
        // Les details ne sont verifies que si le createur y a touche : sinon
        // une simple correction de stock sur un ancien produit serait
        // bloquee par des champs qui n'existaient pas quand il l'a cree.
        if (details !== undefined) {
          const manque = detailsManquants(details);
          if (manque.length > 0) {
            return res.status(400).json({
              error: "Il manque " + manque.join(", ") + " dans les détails du produit.",
            });
          }
          changes.details = nettoyerDetails(details);
        }
        // Le stock est operationnel, pas editorial : il s'applique tout de
        // suite, sans validation. Tout le reste passe par l'admin.
        let stockApplied = false;
        if (sizes_stock && Object.keys(sizes_stock).length > 0) {
          const fautives = combinaisonsSousLeMinimum(sizes_stock);
          if (fautives.length > 0) {
            return res.status(400).json({
              error: "Minimum " + STOCK_MINIMUM
                + " pièces par taille proposée — à corriger : " + fautives.join(", "),
            });
          }
          // sizes_stock a deux formes : plate { S: 3 } ou par couleur
          // { Rouge: { S: 3 } }. On aplatit pour recalculer sizes et stock.
          const vals = Object.keys(sizes_stock).map((k) => sizes_stock[k]);
          const parCouleur = vals.length && vals[0] !== null
            && typeof vals[0] === "object" && !Array.isArray(vals[0]);
          const lignes = [];
          if (parCouleur) {
            Object.keys(sizes_stock).forEach((coul) => {
              const t = sizes_stock[coul] || {};
              Object.keys(t).forEach((taille) => {
                lignes.push({ taille, qte: parseInt(t[taille]) || 0 });
              });
            });
          } else {
            Object.keys(sizes_stock).forEach((taille) => {
              lignes.push({ taille, qte: parseInt(sizes_stock[taille]) || 0 });
            });
          }
          const taillesDispo = [];
          lignes.forEach((l) => {
            if (l.qte > 0 && taillesDispo.indexOf(l.taille) === -1) taillesDispo.push(l.taille);
          });
          const totalStock = lignes.reduce((n, l) => n + l.qte, 0);

          const { error: stockError } = await supabaseAdmin
            .from("products")
            .update({
              sizes_stock,
              sizes: taillesDispo,
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

        try {
          const { data: marque } = await supabaseAdmin
            .from("brands").select("name").eq("id", brand_id).single();
          await alerteAdmin("Modification de produit à valider", [
            "<strong>" + esc(name || "Produit") + "</strong>",
            "Marque : " + esc((marque && marque.name) || brand_id),
          ], "Voir les modifications en attente");
        } catch (err) {
          console.error("[email] alerte modification ignoree :", err && err.message);
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
        if (sizes_stock) {
          const fautives = combinaisonsSousLeMinimum(sizes_stock);
          if (fautives.length > 0) {
            return res.status(400).json({
              error: "Minimum " + STOCK_MINIMUM
                + " pièces par taille proposée — à corriger : " + fautives.join(", "),
            });
          }
        }
        // Obligatoire des la creation : aucune nouvelle fiche ne peut etre
        // incomplete sur la boutique.
        const manqueDetails = detailsManquants(details);
        if (manqueDetails.length > 0) {
          return res.status(400).json({
            error: "Il manque " + manqueDetails.join(", ") + " dans les détails du produit.",
          });
        }

        const product_data = { name, price, category, description, sizes_stock, image_url };
        product_data.details = nettoyerDetails(details);
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

        try {
          const { data: marque } = await supabaseAdmin
            .from("brands").select("name").eq("id", brand_id).single();
          await alerteAdmin("Nouveau produit à valider", [
            "<strong>" + esc(name) + "</strong>",
            "Marque : " + esc((marque && marque.name) || brand_id),
            "Prix : " + esc(price) + " €",
          ], "Voir les produits en attente");
        } catch (err) {
          console.error("[email] alerte nouveau produit ignoree :", err && err.message);
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

      // Prevenir l'administrateur. Ce bloc inserait autrefois une ligne dans
      // une table "admin_notifications" qui n'a jamais existe : l'insertion
      // echouait en silence (supabase-js renvoie { error } au lieu de lever,
      // donc le catch de repli ne partait jamais) et personne n'etait averti.
      // Un e-mail arrive vraiment, et se lit sans ouvrir le panneau.
      try {
        await alerteAdmin("Produit supprimé par un créateur", [
          "<strong>" + esc(product.name) + "</strong>",
          "Marque : " + esc((brand && brand.name) || brand_id),
          "Cette suppression est définitive : le produit n'est plus en base.",
        ], "Ouvrir le panneau admin");
      } catch (err) {
        // Regle absolue : un e-mail ne fait jamais echouer l'action metier.
        // La suppression a deja eu lieu, elle reste un succes.
        console.error("[email] alerte suppression ignoree :", err && err.message);
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
