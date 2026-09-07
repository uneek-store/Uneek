// API : /api/auth
// POST → connexion créateur ou admin, changement email/mot de passe

import { supabaseAdmin } from "./lib/supabase.js";
import { creerJeton, lireJeton, jetonDeLaRequete,
  creerJetonClient, lireJetonClient } from "./lib/session.js";
import { limiter } from "./lib/limite.js";
import crypto from "crypto";

// Hash simple du mot de passe (en production, utiliser bcrypt)
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Générer un token de session simple
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Generer un token client
function generateCustomerToken(customerId) {
  const random = crypto.randomBytes(16).toString("hex");
  return Buffer.from(`${customerId}:${random}`).toString("base64");
}

// Ancien format de jeton client, conserve pour memoire : il n'est plus
// accepte nulle part depuis le 7 septembre (constat 09). Ne pas s'en servir.
// eslint-disable-next-line no-unused-vars
function parseCustomerToken(token) {
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

  // Plafond large : laisse passer un usage normal (une page de connexion
  // fait 1 a 3 appels), coupe une boucle automatique.
  if (limiter(req, res, { cle: "auth", max: 60, secondes: 60 })) return;

  try {
    const { action, email, password, name } = req.body;

    // Plafond serre sur tout ce qui touche a un identifiant : c'est la porte
    // par laquelle on essaie de deviner un mot de passe, mille fois de suite.
    // 10 essais par tranche de 5 minutes suffisent largement a quelqu'un qui
    // se trompe de touche.
    const ACTIONS_SENSIBLES = ["login", "register", "register_creator",
      "customer_login", "customer_register", "change_password", "change_email"];
    if (ACTIONS_SENSIBLES.includes(action)) {
      if (limiter(req, res, {
        cle: "identifiants",
        max: 10,
        secondes: 300,
        message: "Trop de tentatives. Attends quelques minutes avant de réessayer.",
      })) return;
    }

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
          .select("id, name, slug, is_active")
          .eq("id", account.brand_id)
          .single();
        // is_active dit si la boutique est en pause. Le panneau createur lit
        // "status" : on lui donne les deux, on ne retire rien.
        brand = data
          ? { ...data, status: data.is_active === false ? "blocked" : "active" }
          : data;
      }

      // Jeton signe : le serveur pourra verifier qu'il vient bien de lui.
      // Si AUTH_SECRET manque, on retombe sur l'ancien jeton aleatoire
      // pour ne pas empecher la connexion.
      const token = creerJeton(account) || generateToken();

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

      // AVANT (jusqu'au 7 septembre) : le compte etait retrouve par le SEUL
      // mot de passe, sans jamais regarder qui envoyait la requete. Deviner
      // le mot de passe de n'importe quel compte suffisait donc a en changer
      // l'adresse e-mail — c'est-a-dire a le prendre. L'en-tete Authorization
      // etait lue dans une variable qui n'etait ensuite jamais utilisee.
      //
      // MAINTENANT : il faut un jeton signe valide, et on ne touche qu'au
      // compte de ce jeton. Volontairement independant d'AUTH_MODE : une
      // prise de controle de compte ne doit jamais "passer en cas de doute".
      const lecture = lireJeton(jetonDeLaRequete(req));
      if (!lecture.ok || !lecture.session || !lecture.session.id) {
        console.warn("[auth] change_email refuse — " + (lecture.raison || "sans session"));
        return res.status(401).json({
          error: "Reconnecte-toi avant de changer ton adresse e-mail",
        });
      }

      // Le mot de passe est verifie par la base, sur CE compte precis.
      const { data: accounts } = await supabaseAdmin
        .from("creator_accounts")
        .select("id, email")
        .eq("id", lecture.session.id)
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

      // Le compte etait retrouve par le SEUL mot de passe. Le 31 aout j'ai
      // ajoute la restriction au compte connecte, mais avec un repli
      // permissif : sans session, on continuait quand meme. Ce repli etait la
      // faille — il suffisait de deviner un mot de passe, n'importe lequel,
      // pour en prendre le compte. Constate exploitable en direct le 7
      // septembre. Il n'y a plus de repli.
      const lectureMdp = lireJeton(jetonDeLaRequete(req));
      if (!lectureMdp.ok || !lectureMdp.session || !lectureMdp.session.id) {
        console.warn("[auth] change_password refuse — " + (lectureMdp.raison || "sans session"));
        return res.status(401).json({
          error: "Reconnecte-toi avant de changer ton mot de passe",
        });
      }

      const { data: accounts } = await supabaseAdmin
        .from("creator_accounts")
        .select("id")
        .eq("id", lectureMdp.session.id)
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
    // --- REGISTER CREATEUR (auto-inscription par code d'invitation) ---
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

    // --- CUSTOMER REGISTER (inscription client) ---
    if (action === "customer_register") {
      const { first_name, last_name, nickname } = req.body;

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

      // Jeton signe, comme pour les createurs. generateCustomerToken ne sert
      // plus que de repli si AUTH_SECRET venait a manquer.
      const token = creerJetonClient(customer.id) || generateCustomerToken(customer.id);

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

    // --- CUSTOMER LOGIN (connexion client) ---
    if (action === "customer_login") {
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

      const token = creerJetonClient(customer.id) || generateCustomerToken(customer.id);

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

    // --- CUSTOMER PROFILE (profil client) ---
    if (action === "customer_profile") {
      const lectureClient = lireJetonClient(jetonDeLaRequete(req));
      if (!lectureClient.ok) {
        console.warn("[auth] customer_profile refuse — " + lectureClient.raison);
        return res.status(401).json({
          error: "Session expirée. Reconnecte-toi.",
          reconnexion: true,
        });
      }
      const customerId = lectureClient.customerId;

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

    // --- CUSTOMER UPDATE PROFILE (modification du profil client) ---
    if (action === "customer_update_profile") {
      const lectureMaj = lireJetonClient(jetonDeLaRequete(req));
      if (!lectureMaj.ok) {
        console.warn("[auth] customer_update_profile refuse — " + lectureMaj.raison);
        return res.status(401).json({
          error: "Session expirée. Reconnecte-toi.",
          reconnexion: true,
        });
      }
      const customerId = lectureMaj.customerId;

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


    return res.status(400).json({ error: "Action invalide. Utilisez 'login', 'register', 'register_creator', 'change_email', 'change_password', 'customer_login', 'customer_register', 'customer_profile' ou 'customer_update_profile'" });
  } catch (err) {
    console.error("Auth API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
