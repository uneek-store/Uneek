// API : /api/partner-apply
// POST → soumettre une candidature "Devenir Partenaire"

import { supabaseAdmin } from "./lib/supabase.js";
import { alerteAdmin, esc } from "./lib/email.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { brand_name, contact_name, email, instagram, website, message } = req.body;

    if (!brand_name || !contact_name || !email) {
      return res.status(400).json({ error: "Nom de marque, nom de contact et email requis" });
    }

    const { data, error } = await supabaseAdmin
      .from("partner_applications")
      .insert({
        brand_name,
        contact_name,
        email: email.toLowerCase(),
        instagram: instagram || null,
        website: website || null,
        message: message || null,
        status: "new",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating application:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    try {
      await alerteAdmin("Nouvelle candidature de marque", [
        "<strong>" + esc(brand_name) + "</strong>",
        esc(contact_name) + " — " + esc(email),
        instagram ? "Instagram : " + esc(instagram) : null,
        website ? "Site : " + esc(website) : null,
      ], "Voir la candidature");
    } catch (err) {
      console.error("[email] alerte candidature ignoree :", err && err.message);
    }

    return res.status(201).json({
      success: true,
      message: "Candidature envoyée ! L'équipe UNEEK te recontactera bientôt.",
    });
  } catch (err) {
    console.error("Partner apply API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
