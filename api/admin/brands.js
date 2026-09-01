// API : /api/admin/brands
// GET    → liste des marques AVEC l'e-mail du créateur (réservé admin)
// DELETE → supprimer une marque et notifier le créateur

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
// Ce fichier avait sa propre fonction d'envoi, qui appelait Resend en direct.
// Elle contournait donc le filtre des adresses fictives : supprimer une marque
// inventee aurait ecrit a une vraie personne. Elle utilisait aussi un autre
// expediteur (onboarding@resend.dev). Tout passe par le module commun.
import { envoyer, esc } from "../lib/email.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Reserve aux administrateurs. En mode observation, un echec est
  // seulement trace dans les logs — rien n'est bloque.
  const acces = controlerAcces(req, { admin: true, nom: "/api/admin/brands" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  // La meme liste que /api/brands, mais avec l'e-mail : celui-ci n'a rien a
  // faire sur l'adresse publique, et le panneau admin en a besoin.
  if (req.method === "GET") {
    try {
      const { data, error } = await supabaseAdmin
        .from("brands")
        .select("id, name, slug, tagline, city, year, image_url, logo_url, email, products(count), creator_accounts(full_name, email)")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Error fetching admin brands:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      const brands = (data || []).map((b) => ({
        ...b,
        product_count: b.products?.[0]?.count || 0,
        creator_name: b.creator_accounts?.[0]?.full_name || "",
        // L'adresse du compte createur prime : c'est celle qui recoit
        // reellement les e-mails. Celle de la marque sert de repli.
        email: b.creator_accounts?.[0]?.email || b.email || "",
        products: undefined,
        creator_accounts: undefined,
      }));
      return res.status(200).json(brands);
    } catch (err) {
      console.error("Admin brands GET error:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

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

      // 1b. Supprimer aussi les product_edits directement liés à la marque
      //     (nouveaux produits en attente avec product_id NULL)
      await supabaseAdmin
        .from("product_edits")
        .delete()
        .eq("brand_id", brand_id);

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
        // envoyer() ne leve jamais et applique le filtre des adresses fictives.
        // Les noms sont echappes : une marque appelee <b>X</b> casserait sinon
        // la mise en page de l'e-mail.
        emailResult = await envoyer({
          to: creatorEmail,
          subject: 'UNEEK — Votre marque a été retirée',
          html:
            '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">'
            + '<h2 style="font-size:20px">UNEEK</h2>'
            + '<p>Bonjour ' + esc(creatorName) + ',</p>'
            + '<p>Nous vous informons que votre marque <strong>' + esc(brandName) + '</strong> a été retirée de la plateforme UNEEK.</p>'
            + '<p>Vos produits et votre compte créateur associés ont été supprimés.</p>'
            + '<p>Si vous avez des questions, contactez-nous à <a href="mailto:contact@uneek.store">contact@uneek.store</a>.</p>'
            + '<p style="color:#888;font-size:12px;margin-top:24px">— L\'équipe UNEEK</p>'
            + '</div>',
        });
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
