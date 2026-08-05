// API : /api/admin/applications
// GET  → liste les candidatures partenaires
// POST → accepter ou refuser une candidature

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("partner_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching applications:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json({ applications: data || [] });
    }

    if (req.method === "POST") {
      const { id, action } = req.body;

      if (!id || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "id et action (accept/reject) requis" });
      }

      const { error } = await supabaseAdmin
        .from("partner_applications")
        .update({ status: action === "accept" ? "accepted" : "rejected" })
        .eq("id", id);

      if (error) {
        console.error("Error updating application:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      return res.status(200).json({
        success: true,
        message: action === "accept" ? "Candidature acceptée" : "Candidature refusée",
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin applications API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
