// API : /api/auth
// POST → connexion créateur ou admin, changement email/mot de passe

import { supabaseAdmin } from "./lib/supabase.js";
import crypto from "crypto";

// Hash simple du mot de passe (en production, utiliser bcrypt)
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Générer un token de session simple
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, email, password, name } = req.body;

    // --- LOGIN ---
    if (action === "login") {
      if (!email || !password) {
        return res.status(400).json({ error: "Email et mot de passe requis" });
      }

      const { data: account, error } = await supabaseAdmin
        .from("creator_accounts")
        .select("id, email, full_name, is_admin, brand_id")
        .eq("email", email.toLowerCase())
        .eq("password_hash", hashPassword(password))
        .single();

      if (error || !account) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect" });
      }

      // Si c'est un créateur, récupérer les infos de sa marque
      let brand = null;
      if (account.brand_id) {
        const { data } = await supabaseAdmin
          .from("brands")
          .select("id, name, slug")
          .eq("id", account.brand_id)
          .single();
        brand = data;
      }

      const token = generateToken();

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: account.id,
          email: account.email,
          name: account.full_name,
          is_admin: account.is_admin,
          brand,
        },
      });
    }

    // --- REGISTER (création de compte créateur par l'admin) ---
    if (action === "register") {
      if (!email || !password || !name) {
        return res.status(400).json({ error: "Email, mot de passe et nom requis" });
      }

      // Vérifier que l'email n'existe pas déjà
      const { data: existing } = await supabaseAdmin
        .from("creator_accounts")
        .select("id")
        .eq("email", email.toLowerCase())
        .single();

      if (existing) {
        return res.status(409).json({ error: "Un compte avec cet email existe déjà" });
      }

      const { data: account, error } = await supabaseAdmin
        .from("creator_accounts")
        .insert({
          email: email.toLowerCase(),
          password_hash: hashPassword(password),
          full_name: name,
          is_admin: false,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating account:", error);
        return res.status(500).json({ error: "Erreur création compte" });
      }

      return res.status(201).json({ success: true, account_id: account.id });
    }

    // --- CHANGE EMAIL ---
    if (action === "change_email") {
      const { new_email } = req.body;
      if (!new_email || !password) {
        return res.status(400).json({ error: "Nouvel email et mot de passe requis" });
      }

      // Récupérer l'identité via le token Authorization
      const authHeader = req.headers.authorization;
      // Pour l'instant, on vérifie le mot de passe via l'email actuel
      // On cherche un compte avec ce mot de passe
      const { data: accounts } = await supabaseAdmin
        .from("creator_accounts")
        .select("id, email")
        .eq("password_hash", hashPassword(password));

      if (!accounts || accounts.length === 0) {
        return res.status(401).json({ error: "Mot de passe incorrect" });
      }

      // Vérifier que le nouvel email n'est pas déjà pris
      const { data: emailCheck } = await supabaseAdmin
        .from("creator_accounts")
        .select("id")
        .eq("email", new_email.toLowerCase())
        .single();

      if (emailCheck) {
        return res.status(409).json({ error: "Cet email est déjà utilisé" });
      }

      const account = accounts[0];
      const { error: updateErr } = await supabaseAdmin
        .from("creator_accounts")
        .update({ email: new_email.toLowerCase() })
        .eq("id", account.id);

      if (updateErr) {
        console.error("Error updating email:", updateErr);
        return res.status(500).json({ error: "Erreur mise à jour" });
      }

      return res.status(200).json({ success: true, message: "Email mis à jour" });
    }

    // --- CHANGE PASSWORD ---
    if (action === "change_password") {
      const { old_password, new_password } = req.body;
      if (!old_password || !new_password) {
        return res.status(400).json({ error: "Ancien et nouveau mot de passe requis" });
      }

      if (new_password.length < 6) {
        return res.status(400).json({ error: "Le mot de passe doit faire au moins 6 caractères" });
      }

      // Trouver le compte avec l'ancien mot de passe
      const { data: accounts } = await supabaseAdmin
        .from("creator_accounts")
        .select("id")
        .eq("password_hash", hashPassword(old_password));

      if (!accounts || accounts.length === 0) {
        return res.status(401).json({ error: "Mot de passe actuel incorrect" });
      }

      const account = accounts[0];
      const { error: updateErr } = await supabaseAdmin
        .from("creator_accounts")
        .update({ password_hash: hashPassword(new_password) })
        .eq("id", account.id);

      if (updateErr) {
        console.error("Error updating password:", updateErr);
        return res.status(500).json({ error: "Erreur mise à jour" });
      }

      return res.status(200).json({ success: true, message: "Mot de passe mis à jour" });
    }

    return res.status(400).json({ error: "Action invalide. Utilisez 'login', 'register', 'change_email' ou 'change_password'" });
  } catch (err) {
    console.error("Auth API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
