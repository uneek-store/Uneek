// API : /api/brands
// GET → liste toutes les marques actives
// GET ?slug=xxx → une marque spécifique avec ses produits
//
// CETTE ADRESSE EST PUBLIQUE : la boutique en a besoin sans connexion.
// Tout ce qu'elle renvoie est donc lisible par n'importe qui sur Internet.
// Elle a longtemps renvoye l'ADRESSE E-MAIL des createurs — une donnee
// personnelle, en libre acces. Les colonnes sont maintenant listees une par
// une : plus de "select *", pour qu'une colonne ajoutee un jour a la table
// ne se retrouve pas publiee sans que personne l'ait decide.
//
// REVERS DE CETTE PRUDENCE, constate le 2 septembre : une colonne oubliee
// dans la liste n'arrive jamais a la boutique. "story" et "banner_position"
// manquaient — le createur ecrivait, la base enregistrait, la page
// n'affichait rien. Toute colonne affichee par la page marque doit figurer
// ici. Le garde-fou le verifie desormais.
// Le panneau admin lit ces memes marques, e-mails compris, sur
// /api/admin/brands, qui exige un jeton administrateur.

import { supabaseAdmin } from "./lib/supabase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { slug } = req.query;

    // Une marque spécifique avec ses produits
    if (slug) {
      const { data: brand, error } = await supabaseAdmin
        .from("brands")
        .select("id, name, slug, tagline, city, year, image_url, logo_url, is_active, created_at, instagram, banner_position" + ", products(*)")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (error || !brand) return res.status(404).json({ error: "Marque non trouvée" });

      // Filtrer pour ne montrer que les produits publiés
      brand.products = (brand.products || []).filter((p) => p.is_published);
      return res.status(200).json(brand);
    }

    // Liste de toutes les marques actives (avec créateur)
    const { data, error } = await supabaseAdmin
      .from("brands")
      .select("id, name, slug, tagline, city, year, image_url, logo_url, banner_position, products(count), creator_accounts(full_name)")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching brands:", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }

    const brands = (data || []).map(b => ({
      ...b,
      product_count: b.products?.[0]?.count || 0,
      creator_name: b.creator_accounts?.[0]?.full_name || "",
      products: undefined,
      creator_accounts: undefined,
    }));
    return res.status(200).json(brands);
  } catch (err) {
    console.error("Brands API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
