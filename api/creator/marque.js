// API : /api/creator/marque
// GET  → ce que le createur peut modifier sur SA page publique
// POST → il modifie sa banniere et/ou son texte de presentation
//
// POURQUOI CE FICHIER EXISTE
// Jusqu'ici un createur ne pouvait toucher qu'a ses produits. Sa page de
// marque — la banniere et le texte qui la presentent — n'etait modifiable
// que par Axel, a la main, dans la base. Chaque marque doit pouvoir se
// raconter elle-meme.
//
// CE QU'IL PEUT CHANGER, ET RIEN D'AUTRE
//   image_url : la banniere
//   story     : un court texte de presentation
// Ni le nom, ni le slug (l'adresse de sa page changerait et tous les liens
// existants casseraient), ni l'e-mail, ni is_active. Le champ est nomme
// explicitement dans la mise a jour : impossible d'en glisser un autre en
// ajoutant une cle dans la requete.
//
// PUBLICATION IMMEDIATE, MAIS JAMAIS SILENCIEUSE
// Le createur publie sans attendre de validation — c'est le choix d'Axel,
// pour que ca reste fluide. En contrepartie, chaque changement declenche un
// e-mail a l'administrateur, avec ce qui a bouge et le lien vers la page.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { limiter } from "../lib/limite.js";
import { alerteAdmin, esc } from "../lib/email.js";

const TEXTE_MAX = 400;

// Une banniere pese lourd : elle est stockee en texte dans la base. Le
// panneau la redimensionne deja avant l'envoi ; ce plafond est le garde-fou
// cote serveur, celui qui ne depend pas du navigateur du createur.
const IMAGE_MAX_OCTETS = 700 * 1024;

const SITE = process.env.SITE_URL || "https://www.uneek.store";

function nettoyerTexte(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, TEXTE_MAX);
}

// Accepte une image envoyee par le panneau (data:image/...) ou une adresse
// https deja en base. Tout le reste est refuse : une valeur "javascript:..."
// ou un data:text/html finirait dans un attribut src de la page publique.
function imageAcceptable(v) {
  const s = String(v || "");
  if (!s) return { ok: true, valeur: null };
  if (s.length > IMAGE_MAX_OCTETS) {
    return { ok: false, raison: "L'image est trop lourde. Choisis-en une plus légère." };
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) {
    return { ok: true, valeur: s };
  }
  if (/^https:\/\/[^\s"'<>]+$/.test(s)) return { ok: true, valeur: s };
  return { ok: false, raison: "Format d'image non reconnu." };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/marque" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  // La marque vient du jeton signe, jamais de la requete. Meme si quelqu'un
  // glissait un autre brand_id dans le corps, il ecrirait sur la sienne.
  const session = acces.session || {};
  const brandId = session.brand_id
    || (session.admin ? (req.query.brand_id || (req.body && req.body.brand_id)) : null);

  if (!brandId) {
    return res.status(400).json({ error: "Aucune marque associée à ce compte" });
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("brands")
        .select("id, name, slug, tagline, city, year, image_url, story")
        .eq("id", brandId)
        .single();

      if (error || !data) return res.status(404).json({ error: "Marque non trouvée" });
      return res.status(200).json({ ...data, texte_max: TEXTE_MAX });
    }

    if (req.method === "POST") {
      // Une banniere par envoi, et les envois sont lourds : on plafonne.
      if (limiter(req, res, {
        cle: "page-marque",
        max: 20,
        secondes: 600,
        message: "Trop de modifications d'affilée. Réessaie dans quelques minutes.",
      })) return;

      const corps = req.body || {};

      const { data: avant, error: errAvant } = await supabaseAdmin
        .from("brands")
        .select("id, name, slug, image_url, story")
        .eq("id", brandId)
        .single();

      if (errAvant || !avant) return res.status(404).json({ error: "Marque non trouvée" });

      const maj = {};
      let banniereChangee = false;
      let texteChange = false;

      if (Object.prototype.hasOwnProperty.call(corps, "image_url")) {
        const verdict = imageAcceptable(corps.image_url);
        if (!verdict.ok) return res.status(400).json({ error: verdict.raison });
        if (verdict.valeur !== (avant.image_url || null)) {
          maj.image_url = verdict.valeur;
          banniereChangee = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(corps, "story")) {
        const texte = nettoyerTexte(corps.story);
        if (texte !== (avant.story || "")) {
          maj.story = texte || null;
          texteChange = true;
        }
      }

      if (!banniereChangee && !texteChange) {
        return res.status(200).json({ success: true, inchange: true, ...avant });
      }

      const { data: apres, error } = await supabaseAdmin
        .from("brands")
        .update(maj)
        .eq("id", brandId)
        .select("id, name, slug, tagline, city, year, image_url, story")
        .single();

      if (error) {
        console.error("Erreur mise a jour page marque :", error.message);
        return res.status(500).json({ error: "Erreur serveur" });
      }

      // L'e-mail ne doit jamais faire echouer la modification : elle est deja
      // enregistree a ce stade, et le createur voit sa page changer.
      try {
        const quoi = [];
        if (banniereChangee) quoi.push(maj.image_url ? "nouvelle bannière" : "bannière retirée");
        if (texteChange) quoi.push(maj.story ? "texte de présentation modifié" : "texte retiré");

        const lignes = [
          "<strong>" + esc(apres.name) + "</strong>",
          "Modification : " + esc(quoi.join(" · ")),
        ];
        if (texteChange && maj.story) {
          lignes.push("Nouveau texte : « " + esc(maj.story) + " »");
        }
        lignes.push('<a href="' + SITE + "/marque/" + encodeURIComponent(apres.slug || "")
          + '">Voir la page</a>');

        await alerteAdmin("Une marque a modifié sa page", lignes, "Ouvrir le panneau admin");
      } catch (err) {
        console.error("[email] alerte page marque ignoree :", err && err.message);
      }

      return res.status(200).json({ success: true, ...apres, texte_max: TEXTE_MAX });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator marque API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
