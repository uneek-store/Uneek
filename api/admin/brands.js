// API : /api/admin/brands
// DELETE → supprimer une marque et notifier le créateur

import { supabaseAdmin } from "../lib/supabase.js";

// Envoyer un email via Resend (si configuré)
async function sendEmail(to, subject, html) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not configured' };
    try {
          const res = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ from: 'UNEEK <onboarding@resend.dev>', to, subject, html })
          });
          const data = await res.json();
          return { sent: res.ok, data };
    } catch (err) {
          console.error('Email error:', err);
          return { sent: false, error: err.message };
    }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "DELETE") {
        const { brand_id } = req.body || {};
        if (!brand_id) {
                return res.status(400).json({ error: "brand_id requis" });
        }

      try {
              // 0. Récupérer les infos de la marque + email créateur AVANT suppression
          const { data: brand } = await supabaseAdmin
                .from("brands")
                .select("name, email")
                .eq("id", brand_id)
                .single();

          const { data: creator } = await supabaseAdmin
                .from("creator_accounts")
                .select("email, full_name")
                .eq("brand_id", brand_id)
                .single();

          const creatorEmail = creator?.email || brand?.email;
              const creatorName = creator?.full_name || 'Créateur';
              const brandName = brand?.name || 'Votre marque';

          // 1. Supprimer les pending_edits liés aux produits de cette marque
          const { data: products } = await supabaseAdmin
                .from("products")
                .select("id")
                .eq("brand_id", brand_id);

          if (products && products.length > 0) {
                    const productIds = products.map(p => p.id);
                    await supabaseAdmin
                      .from("product_edits")
                      .delete()
                      .in("product_id", productIds);
          }

          // 2. Supprimer les produits de la marque
          await supabaseAdmin
                .from("products")
                .delete()
                .eq("brand_id", brand_id);

          // 3. Supprimer les comptes créateurs liés
          await supabaseAdmin
                .from("creator_accounts")
                .delete()
                .eq("brand_id", brand_id);

          // 4. Supprimer la marque
          const { error } = await supabaseAdmin
                .from("brands")
                .delete()
                .eq("id", brand_id);

          if (error) {
                    console.error("Error deleting brand:", error);
                    return res.status(500).json({ error: "Erreur suppression de la marque" });
          }

          // 5. Notifier le créateur par email
          let emailResult = { sent: false };
              if (creatorEmail) {
                        emailResult = await sendEmail(
                                    creatorEmail,
                                    'UNEEK — Votre marque a été retirée',
                                    '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">'
                                    + '<h2 style="font-size:20px">UNEEK</h2>'
                                    + '<p>Bonjour ' + creatorName + ',</p>'
                                    + '<p>Nous vous informons que votre marque <strong>' + brandName + '</strong> a été retirée de la plateforme UNEEK.</p>'
                                    + '<p>Vos produits et votre compte créateur associés ont été supprimés.</p>'
                                    + '<p>Si vous avez des questions, contactez-nous à <a href="mailto:contact@uneek.store">contact@uneek.store</a>.</p>'
                                    + '<p style="color:#888;font-size:12px;margin-top:24px">— L\'équipe UNEEK</p>'
                                    + '</div>'
                                  );
              }

          return res.status(200).json({
                    success: true,
                    message: "Marque supprimée avec succès",
                    notification: {
                                email: creatorEmail,
                                sent: emailResult.sent
                    }
          });
      } catch (err) {
              console.error("Delete brand error:", err);
              return res.status(500).json({ error: "Erreur serveur" });
      }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
