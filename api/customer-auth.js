// API : /api/customer-auth
// POST → inscription, connexion, profil client

import { supabaseAdmin } from "./lib/supabase.js";
import crypto from "crypto";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateToken(customerId) {
  // Token simple : base64(customerId:random)
  const random = crypto.randomBytes(16).toString("hex");
  return Buffer.from(`${customerId}:${random}`).toString("base64");
}

function parseToken(token) {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [customerId] = decoded.split(":");
    return customerId;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action } = req.body;

    // --- REGISTER ---
    if (action === "register") {
      const { email, password, first_name, last_name, nickname } = req.body;

      if (!email || !password || !first_name || !last_name) {
        return res.status(400).json({ error: "Email, mot de passe, prénom et nom requis" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Le mot de passe doit faire au moins 6 caractères" });
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
      if (!emailRe.test(email)) {
        return res.status(400).json({ error: "Adresse email invalide" });
      }

      // Vérifier que l'email n'existe pas
      const { data: existing } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("email", email.toLowerCase())
        .single();

      if (existing) {
        return res.status(409).json({ error: "Un compte avec cet email existe déjà" });
      }

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .insert({
          email: email.toLowerCase(),
          password_hash: hashPassword(password),
          first_name,
          last_name,
          nickname: nickname || null,
        })
        .select("id, email, first_name, last_name, nickname")
        .single();

      if (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ error: "Erreur création compte" });
      }

      const token = generateToken(customer.id);

      return res.status(201).json({
        success: true,
        token,
        customer: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          nickname: customer.nickname,
        },
      });
    }

    // --- LOGIN ---
    if (action === "login") {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email et mot de passe requis" });
      }

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .select("id, email, first_name, last_name, nickname")
        .eq("email", email.toLowerCase())
        .eq("password_hash", hashPassword(password))
        .single();

      if (error || !customer) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect" });
      }

      const token = generateToken(customer.id);

      return res.status(200).json({
        success: true,
        token,
        customer: {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          nickname: customer.nickname,
        },
      });
      }

    // --- PROFILE (GET) ---
    if (action === "profile") {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const customerId = parseToken(authHeader.split(" ")[1]);
      if (!customerId) {
        return res.status(401).json({ error: "Token invalide" });
      }

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .select("id, email, first_name, last_name, nickname, created_at")
        .eq("id", customerId)
        .single();

      if (error || !customer) {
        return res.status(404).json({ error: "Compte non trouvé" });
      }

      // Récupérer les commandes
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, total_amount, status, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      return res.status(200).json({
        success: true,
        customer,
        orders: orders || [],
      });
    }

    // --- UPDATE PROFILE ---
    if (action === "update_profile") {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Non authentifié" });
      }

      const customerId = parseToken(authHeader.split(" ")[1]);
      if (!customerId) {
        return res.status(401).json({ error: "Token invalide" });
      }

      const { first_name, last_name, nickname } = req.body;
      const updates = {};
      if (first_name) updates.first_name = first_name;
      if (last_name) updates.last_name = last_name;
      if (nickname !== undefined) updates.nickname = nickname || null;
      updates.updated_at = new Date().toISOString();

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .update(updates)
        .eq("id", customerId)
        .select("id, email, first_name, last_name, nickname")
        .single();

      if (error) {
        console.error("Error updating customer:", error);
        return res.status(500).json({ error: "Erreur mise à jour profil" });
      }

      return res.status(200).json({ success: true, customer });
    }

    return res.status(400).json({ error: "Action invalide" });
  } catch (err) {
    console.error("Customer auth API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

