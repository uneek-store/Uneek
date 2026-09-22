// API : /api/creator/edits
// GET    → liste les soumissions d'une marque (pending, approved, rejected)
// DELETE → le createur retire une demande QU'IL A FAITE et qui attend encore

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { alerteAdmin, esc } from "../lib/email.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Compte connecte, et uniquement sur SA marque. En mode
  // observation, un echec est seulement trace dans les logs.
  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/edits" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  // --- RETIRER UNE DEMANDE ENCORE EN ATTENTE ---
  // La marque vient du jeton signe, jamais de la requete : meme en glissant
  // l'identifiant d'une demande d'une autre marque, on ne retire que la
  // sienne. Et seules les demandes "pending" partent : une demande deja
  // approuvee ou refusee fait partie de l'historique, on n'y touche pas.
  if (req.method === "DELETE") {
    const session = acces.session || {};
    const maMarque = session.brand_id || null;
    const { edit_id } = req.body || {};

    if (!edit_id) return res.status(400).json({ error: "edit_id requis" });
    if (!maMarque && !session.admin) {
      return res.status(403).json({ error: "Aucune marque associée à ce compte" });
    }

    const { data: demande, error: errLecture } = await supabaseAdmin
      .from("product_edits")
      .select("id, brand_id, status, is_new_product, changes, product_id")
      .eq("id", edit_id)
      .maybeSingle();

    if (errLecture) {
      console.error("Error reading edit:", errLecture);
      return res.status(500).json({ error: "Erreur serveur" });
    }
    if (!demande) return res.status(404).json({ error: "Demande introuvable" });

    if (!session.admin && String(demande.brand_id || "") !== String(maMarque)) {
      console.warn("[auth] REFUS — retrait d'une demande d'une autre marque");
      return res.status(403).json({ error: "Cette demande n'est pas la tienne" });
    }

    if (demande.status && demande.status !== "pending") {
      return res.status(409).json({
        error: "Cette demande a déjà été traitée par UNEEK : elle reste dans ton historique.",
      });
    }

    const { error: errSuppr } = await supabaseAdmin
      .from("product_edits")
      .delete()
      .eq("id", edit_id);

    if (errSuppr) {
      console.error("Error deleting edit:", errSuppr);
      return res.status(500).json({ error: "Erreur suppression" });
    }

    // L'e-mail ne doit jamais faire echouer le retrait : il est deja fait.
    try {
      const c = demande.changes || {};
      const nom = c.name || "(sans nom)";
      let marque = demande.brand_id;
      const { data: m } = await supabaseAdmin
        .from("brands").select("name").eq("id", demande.brand_id).maybeSingle();
      if (m && m.name) marque = m.name;

      await alerteAdmin("Une demande a été retirée par son créateur", [
        "<strong>" + esc(nom) + "</strong>",
        "Marque : " + esc(marque),
        demande.is_new_product ? "C'était une demande de nouveau produit."
                               : "C'était une demande de modification.",
        "Elle attendait encore ta validation : elle n'est plus dans ta liste.",
      ], "Ouvrir le panneau admin");
    } catch (err) {
      console.error("[email] alerte retrait de demande ignoree :", err && err.message);
    }

    return res.status(200).json({ success: true });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { brand_id } = req.query;
  if (!brand_id) {
    return res.status(400).json({ error: "brand_id requis" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("product_edits")
            .select("*, products(*)")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching creator edits:", error);
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
        brand_name: undefined,
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

    return res.status(200).json({ edits: data || [] });
  } catch (err) {
    console.error("Creator edits API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
