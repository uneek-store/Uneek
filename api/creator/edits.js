// API : /api/creator/edits
// GET → liste les soumissions d'une marque (toutes : pending, approved, rejected)

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

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
            .select("*, products(name, price, category, description, variants, commission_percent, image_urls, sizes_stock)")
      .eq("brand_id", brand_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching creator edits:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    return res.status(200).json({ edits: data || [] });
  } catch (err) {
    console.error("Creator edits API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
