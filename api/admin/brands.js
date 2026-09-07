// API : /api/admin/brands
// GET    → liste des marques AVEC l'e-mail du créateur (réservé admin)
// DELETE → supprimer une marque et notifier le créateur

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
// Ce fichier avait sa propre fonction d'envoi, qui appelait Resend en direct.
// Elle contournait donc le filtre des adresses fictives : supprimer une marque
// inventee aurait ecrit a une vraie personne. Elle utilisait aussi un autre
// expediteur (onboarding@resend.dev). Tout passe par le module commun.
import { envoyer, alerteAdmin, esc } from "../lib/email.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS");
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
        .select("id, name, slug, tagline, city, year, image_url, logo_url, email, is_active, products(count), creator_accounts(full_name, email)")
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

  // --- PATCH : mettre une marque en pause, ou la reactiver ---
  // Rien n'est supprime : on bascule is_active. Une marque en pause reste
  // dans la liste ci-dessus, sinon l'admin ne pourrait plus la reactiver.
  if (req.method === "PATCH") {
    const { brand_id, is_active } = req.body || {};
    if (!brand_id) return res.status(400).json({ error: "brand_id requis" });
    if (typeof is_active !== "boolean") {
      return res.status(400).json({ error: "is_active doit valoir true ou false" });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("brands")
        .update({ is_active })
        .eq("id", brand_id)
        .select("id, name, is_active")
        .maybeSingle();

      if (error) {
        console.error("Error updating brand status:", error);
        return res.status(500).json({ error: "Erreur serveur" });
      }
      if (!data) return res.status(404).json({ error: "Marque introuvable" });

      return res.status(200).json({
        success: true,
        brand_id: data.id,
        is_active: data.is_active,
        message: data.is_active ? "Marque reactivee" : "Marque mise en pause",
      });
    } catch (err) {
      console.error("Patch brand error:", err);
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

      // CONSTAT 15 — ON REGARDE AVANT DE DETRUIRE
      //
      // L'ancienne version enchainait quatre suppressions sans jamais lire
      // le resultat des trois premieres. supabase-js ne leve pas d'erreur :
      // il renvoie { error }. Une suppression refusee passait donc pour
      // reussie et on continuait.
      //
      // Le cas concret : une marque qui a deja vendu. Ses produits sont
      // references par des lignes de commande, la base refuse de les
      // supprimer — mais le compte createur, lui, n'est reference par rien
      // et disparaissait pour de bon. Resultat : la marque et ses produits
      // restaient en ligne, le createur n'avait plus de compte pour y
      // toucher, et il ne recevait meme pas l'e-mail (on rendait la main
      // avant). Etat impossible a rattraper sans passer par la base.
      //
      // Maintenant : on verifie d'abord que tout est supprimable. Si une
      // seule chose bloque, on ne touche a RIEN et on explique pourquoi.

      const { data: products, error: errLecture } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .eq("brand_id", brand_id);

      if (errLecture) {
        console.error("Error reading brand products:", errLecture);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      const productIds = (products || []).map((p) => p.id);

      // Une piece deja vendue interdit la suppression du produit. Autant le
      // dire tout de suite, plutot que de le decouvrir a mi-parcours.
      if (productIds.length > 0) {
        const { data: vendus, error: errVentes } = await supabaseAdmin
          .from("order_items")
          .select("id, product_name")
          .in("product_id", productIds);

        if (errVentes) {
          console.error("Error checking sales:", errVentes);
          return res.status(500).json({ error: "Erreur serveur" });
        }

        if (vendus && vendus.length > 0) {
          return res.status(409).json({
            error: "Cette marque a déjà vendu : ses produits sont rattachés à "
              + vendus.length + " ligne(s) de commande et ne peuvent pas être supprimés "
              + "sans effacer l'historique des ventes. Mets-la plutôt en pause : "
              + "elle disparaît du site, et tout reste en ordre.",
            a_vendu: true,
            lignes_de_commande: vendus.length,
          });
        }
      }

      // A partir d'ici, chaque suppression est verifiee. La premiere qui
      // echoue arrete tout : ce qui a deja ete supprime l'a ete dans l'ordre
      // des dependances, donc l'etat reste coherent, et on dit exactement ou
      // on s'est arrete.
      const etapes = [
        productIds.length > 0
          ? { quoi: "les modifications en attente des produits",
              faire: () => supabaseAdmin.from("product_edits").delete().in("product_id", productIds) }
          : null,
        { quoi: "les modifications en attente de la marque",
          faire: () => supabaseAdmin.from("product_edits").delete().eq("brand_id", brand_id) },
        { quoi: "les produits",
          faire: () => supabaseAdmin.from("products").delete().eq("brand_id", brand_id) },
        { quoi: "le compte créateur",
          faire: () => supabaseAdmin.from("creator_accounts").delete().eq("brand_id", brand_id) },
        { quoi: "la marque",
          faire: () => supabaseAdmin.from("brands").delete().eq("id", brand_id) },
      ].filter(Boolean);

      const faites = [];
      for (const etape of etapes) {
        const { error: errEtape } = await etape.faire();
        if (errEtape) {
          console.error("[suppression marque] arret sur « " + etape.quoi + " » :", errEtape.message);
          try {
            await alerteAdmin("Suppression de marque interrompue",
              [
                "<strong>" + esc(brandName) + "</strong>",
                "Arrêté sur : " + esc(etape.quoi),
                "Déjà supprimé : " + esc(faites.join(" · ") || "rien"),
                "Raison : " + esc(errEtape.message || ""),
              ],
              "Ouvrir le panneau admin");
          } catch (e) {
            console.error("[email] alerte suppression ignoree :", e && e.message);
          }
          return res.status(500).json({
            error: "La suppression s'est arrêtée sur « " + etape.quoi + " ». "
              + (faites.length
                  ? "Ce qui précède a bien été supprimé : " + faites.join(", ") + ". "
                  : "Rien n'a été supprimé. ")
              + "Rien d'autre n'a été touché.",
            etape_bloquante: etape.quoi,
            deja_supprime: faites,
          });
        }
        faites.push(etape.quoi);
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
