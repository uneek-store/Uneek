// Televerser une photo de produit dans le stockage, au lieu de la garder
// en base.
//
// Pourquoi : les photos etaient enregistrees en base64 DANS la colonne
// image_urls. Mesure du 21 septembre : 13 produits pesaient 1,2 Mo et
// mettaient 2,5 s a arriver, parce que chaque photo principale fait environ
// 200 Ko de texte. Devenues des fichiers, elles ne passent plus par le
// catalogue : le JSON tombe a quelques kilo-octets et le navigateur va
// chercher les images en parallele, une seule fois, puis les garde.
//
// Le panneau continue de redimensionner la photo a 800 px avant l'envoi :
// ce qui arrive ici est deja leger.
//
// Compatibilite : rien n'est migre. Les anciennes photos restent en base64
// dans image_urls et s'affichent comme avant — une balise <img> ne fait pas
// la difference entre une adresse et une donnee. Les deux cohabitent.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";
import { limiter } from "../lib/limite.js";
import crypto from "crypto";

const SEAU = "product-images";
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// Le panneau envoie du 800 px compresse : au-dela, c'est que quelque chose
// n'a pas fonctionne cote navigateur.
const POIDS_MAX = 1_500_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const acces = controlerAcces(req, { marque: true, nom: "/api/creator/photo" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  // La marque vient du jeton signe, jamais de la requete : personne ne peut
  // deposer un fichier dans le dossier d'une autre marque.
  const marque = (acces.session && acces.session.brand_id) || "sans-marque";

  // 40 photos par tranche de 10 minutes : large pour un createur qui remplit
  // sa boutique, etroit pour qui voudrait remplir le stockage.
  if (limiter(req, res, {
    cle: "photo",
    max: 40,
    secondes: 600,
    message: "Trop de photos envoyées d'un coup. Réessaie dans quelques minutes.",
  })) return;

  try {
    const donnee = (req.body && req.body.data) || "";
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(donnee);
    if (!m) {
      return res.status(400).json({ error: "Format d'image non accepté" });
    }

    const type = m[1];
    const binaire = Buffer.from(m[2], "base64");
    if (!binaire.length) {
      return res.status(400).json({ error: "Image vide" });
    }
    if (binaire.length > POIDS_MAX) {
      return res.status(413).json({ error: "Image trop lourde" });
    }

    const nom = marque + "/" + Date.now() + "-"
      + crypto.randomBytes(6).toString("hex") + "." + TYPES[type];

    const { error: erreurDepot } = await supabaseAdmin.storage
      .from(SEAU)
      .upload(nom, binaire, { contentType: type, upsert: false, cacheControl: "31536000" });

    if (erreurDepot) {
      console.error("[photo] depot refuse :", erreurDepot.message);
      return res.status(500).json({ error: "Envoi de l'image impossible" });
    }

    const { data } = supabaseAdmin.storage.from(SEAU).getPublicUrl(nom);
    const url = data && data.publicUrl;
    if (!url) {
      console.error("[photo] aucune adresse publique pour", nom);
      return res.status(500).json({ error: "Envoi de l'image impossible" });
    }

    return res.status(200).json({ url });
  } catch (err) {
    console.error("[photo] erreur :", err && err.message);
    return res.status(500).json({ error: "Envoi de l'image impossible" });
  }
}
