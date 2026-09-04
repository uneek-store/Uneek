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
//   image_url       : la banniere
//   banner_position : quelle partie de la photo reste visible
//
// Le texte de presentation a existe du 2 septembre au 2 septembre : Axel l'a
// retire. La colonne "story" reste en base avec ce qui y avait ete ecrit —
// on retire une fonctionnalite, on ne detruit pas de donnee.
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

// Une banniere pese lourd : elle est stockee en texte dans la base. Le
// panneau la redimensionne deja avant l'envoi ; ce plafond est le garde-fou
// cote serveur, celui qui ne depend pas du navigateur du createur.
const IMAGE_MAX_OCTETS = 700 * 1024;

const SITE = process.env.SITE_URL || "https://www.uneek.store";

// Les champs qui existent depuis toujours. banner_position est traitee a
// part : elle a ete ajoutee plus tard, et le code doit fonctionner meme si la
// commande SQL n'a pas encore ete passee.
const CHAMPS = "id, name, slug, tagline, city, year, image_url";

// null = on ne sait pas encore, true/false = constate en interrogeant la base.
// Cette memoire ne vit que le temps d'une instance Vercel : si la colonne est
// ajoutee plus tard, une nouvelle instance la trouvera.
let cadrageDisponible = null;

// 0 = on garde le haut de la photo, 50 = le centre, 100 = le bas.
function cadrageValide(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}

// Distingue "cette colonne n'existe pas" de "cette marque n'existe pas".
// Sans ca, une marque introuvable ferait croire que la colonne manque.
function colonneManquante(error) {
  const m = String((error && error.message) || "").toLowerCase();
  return m.includes("banner_position") || m.includes("column");
}

async function lireMarque(brandId) {
  if (cadrageDisponible !== false) {
    const r = await supabaseAdmin
      .from("brands").select(CHAMPS + ", banner_position").eq("id", brandId).single();
    if (!r.error) { cadrageDisponible = true; return { data: r.data, cadrage: true }; }
    if (!colonneManquante(r.error)) return { data: null, error: r.error, cadrage: true };
    console.warn("[page marque] colonne banner_position absente — cadrage desactive");
    cadrageDisponible = false;
  }
  const r2 = await supabaseAdmin.from("brands").select(CHAMPS).eq("id", brandId).single();
  return { data: r2.data, error: r2.error, cadrage: false };
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
      const { data, error, cadrage } = await lireMarque(brandId);
      if (error || !data) return res.status(404).json({ error: "Marque non trouvée" });
      return res.status(200).json({
        ...data,
        banner_position: cadrageValide(data.banner_position) === null ? 50 : cadrageValide(data.banner_position),
        cadrage_disponible: cadrage,
      });
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

      const { data: avant, error: errAvant, cadrage } = await lireMarque(brandId);
      if (errAvant || !avant) return res.status(404).json({ error: "Marque non trouvée" });

      const maj = {};
      let banniereChangee = false;
      let cadrageChange = false;

      if (Object.prototype.hasOwnProperty.call(corps, "image_url")) {
        const verdict = imageAcceptable(corps.image_url);
        if (!verdict.ok) return res.status(400).json({ error: verdict.raison });
        if (verdict.valeur !== (avant.image_url || null)) {
          maj.image_url = verdict.valeur;
          banniereChangee = true;
        }
      }

      // Le cadrage n'est enregistre que si la base sait le retenir.
      if (cadrage && Object.prototype.hasOwnProperty.call(corps, "banner_position")) {
        const valeur = cadrageValide(corps.banner_position);
        if (valeur !== null) {
          const actuel = cadrageValide(avant.banner_position);
          if (valeur !== (actuel === null ? 50 : actuel)) {
            maj.banner_position = valeur;
            cadrageChange = true;
          }
        }
      }

      if (!banniereChangee && !cadrageChange) {
        return res.status(200).json({
          success: true, inchange: true, ...avant, cadrage_disponible: cadrage,
        });
      }

      const champsRendus = CHAMPS + (cadrage ? ", banner_position" : "");
      const { data: apres, error } = await supabaseAdmin
        .from("brands")
        .update(maj)
        .eq("id", brandId)
        .select(champsRendus)
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
        if (cadrageChange) quoi.push("cadrage de la bannière ajusté");

        const lignes = [
          "<strong>" + esc(apres.name) + "</strong>",
          "Modification : " + esc(quoi.join(" · ")),
        ];
        lignes.push('<a href="' + SITE + "/marque/" + encodeURIComponent(apres.slug || "")
          + '">Voir la page</a>');

        await alerteAdmin("Une marque a modifié sa page", lignes, "Ouvrir le panneau admin");
      } catch (err) {
        console.error("[email] alerte page marque ignoree :", err && err.message);
      }

      return res.status(200).json({
        success: true,
        ...apres,
        banner_position: cadrageValide(apres.banner_position) === null ? 50 : cadrageValide(apres.banner_position),
        cadrage_disponible: cadrage,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Creator marque API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
