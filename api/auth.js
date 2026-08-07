// API : /api/auth
// POST → connexion créateur ou admin

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

    // --- REGISTER CREATOR (avec code d'invitation) ---
    if (action === "register_creator") {
      const { invite_code } = req.body;
      if (!email || !password || !invite_code) {
        return res.status(400).json({ error: "Email, mot de passe et code d'invitation requis" });
      }

      // Vérifier le code d'invitation
      const { data: app, error: appError } = await supabaseAdmin
        .from("partner_applications")
        .select("*")
        .eq("invite_code", invite_code.toUpperCase())
        .eq("status", "accepted")
        .single();

      if (appError || !app) {
        return res.status(400).json({ error: "Code d'invitation invalide ou déjà utilisé" });
      }

      if (app.invite_used) {
        return res.status(400).json({ error: "Ce code a déjà été utilisé pour créer un compte" });
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

      // Créer la marque
      const brandSlug = app.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      const { data: brand, error: brandError } = await supabaseAdmin
        .from("brands")
        .insert({
          name: app.brand_name,
          slug: brandSlug,
          email: email.toLowerCase(),
          instagram: app.instagram || null,
          city: null,
          story: app.message || null,
          is_active: true,
        })
        .select()
        .single();

      if (brandError) {
        console.error("Error creating brand:", brandError);
        return res.status(500).json({ error: "Erreur création de la marque" });
      }

      // Créer le compte créateur
      const { data: account, error: accountError } = await supabaseAdmin
        .from("creator_accounts")
        .insert({
          email: email.toLowerCase(),
          password_hash: hashPassword(password),
          full_name: app.contact_name,
          is_admin: false,
          brand_id: brand.id,
        })
        .select()
        .single();

      if (accountError) {
        console.error("Error creating creator account:", accountError);
        return res.status(500).json({ error: "Erreur création du compte" });
      }

      // Marquer le code comme utilisé
      await supabaseAdmin
        .from("partner_applications")
        .update({ invite_used: true })
        .eq("id", app.id);

      return res.status(201).json({
        success: true,
        message: "Compte créé ! Tu peux maintenant te connecter.",
      });
    }

    return res.status(400).json({ error: "Action invalide. Utilisez 'login', 'register' ou 'register_creator'" });
  } catch (err) {
    console.error("Auth API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
