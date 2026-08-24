// API : /api/admin/applications
// GET → liste les candidatures partenaires
// POST → accepter ou refuser une candidature

import { supabaseAdmin } from "../lib/supabase.js";
import crypto from "crypto";

// Générer un code d'invitation lisible (ex: UNEEK-A3K7)
function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // pas de 0/O/1/I pour éviter confusion
  let code = "UNEEK-";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

      // --- AJOUT MANUEL D'UNE MARQUE ---
      // L'admin encode lui-meme une marque qui n'est pas passee par le
      // formulaire public. On cree une candidature deja acceptee, avec son
      // code : tout le parcours existant (register_creator cree la marque et
      // le compte a partir du code) fonctionne ensuite sans changement.
      if (action === "create_manual") {
        const { brand_name, contact_name, email, instagram, website, message } = req.body;

        if (!brand_name || !contact_name || !email) {
          return res.status(400).json({ error: "Nom de la marque, contact et email requis" });
        }
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) {
          return res.status(400).json({ error: "Adresse email invalide" });
        }

        const { data: dejaLa } = await supabaseAdmin
          .from("partner_applications")
          .select("id, status")
          .eq("email", email.toLowerCase())
          .maybeSingle();
        if (dejaLa) {
          return res.status(409).json({ error: "Une candidature existe déjà avec cet email" });
        }

        let inviteCode = generateInviteCode();
        for (let i = 0; i < 5; i++) {
          const { data: pris } = await supabaseAdmin
            .from("partner_applications")
            .select("id")
            .eq("invite_code", inviteCode)
            .maybeSingle();
          if (!pris) break;
          inviteCode = generateInviteCode();
        }

        const { data: created, error: createError } = await supabaseAdmin
          .from("partner_applications")
          .insert({
            brand_name,
            contact_name,
            email: email.toLowerCase(),
            instagram: instagram || null,
            website: website || null,
            message: message || "Ajoutée manuellement par UNEEK",
            status: "accepted",
            invite_code: inviteCode,
            invite_used: false,
          })
          .select()
          .single();

        if (createError) {
          console.error("Error creating manual application:", createError);
          return res.status(500).json({ error: "Erreur création de la marque" });
        }

        return res.status(201).json({
          success: true,
          message: "Marque ajoutée",
          invite_code: inviteCode,
          application: created,
        });
      }


      if (!id || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "id et action (accept/reject/create_manual) requis" });
      }

      if (action === "accept") {
        // Générer un code d'invitation unique
        let inviteCode = generateInviteCode();
        // Vérifier l'unicité (boucle au cas où)
        let attempts = 0;
        while (attempts < 5) {
          const { data: existing } = await supabaseAdmin
            .from("partner_applications")
            .select("id")
            .eq("invite_code", inviteCode)
            .single();
          if (!existing) break;
          inviteCode = generateInviteCode();
          attempts++;
        }

        const { error } = await supabaseAdmin
          .from("partner_applications")
          .update({
            status: "accepted",
            invite_code: inviteCode,
            invite_used: false,
          })
          .eq("id", id);

        if (error) {
          console.error("Error accepting application:", error);
          return res.status(500).json({ error: "Erreur serveur" });
        }

        return res.status(200).json({
          success: true,
          message: "Candidature acceptée",
          invite_code: inviteCode,
        });
      } else {
        // Refuser
        const { error } = await supabaseAdmin
          .from("partner_applications")
          .update({ status: "rejected" })
          .eq("id", id);

        if (error) {
          console.error("Error rejecting application:", error);
          return res.status(500).json({ error: "Erreur serveur" });
        }

        return res.status(200).json({
          success: true,
          message: "Candidature refusée",
        });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Admin applications API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
