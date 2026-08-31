// API : /api/cron/sauvegarde
// Sauvegarde automatique quotidienne, envoyee par e-mail.
//
// POURQUOI CE FICHIER EXISTE
// Le bouton du panneau admin marche, mais il suppose qu'Axel y pense. Une
// sauvegarde qui depend de quelqu'un finit toujours par s'arreter. Vercel
// appelle donc cette adresse chaque nuit (voir "crons" dans vercel.json),
// elle prepare l'export leger et l'envoie en piece jointe.
//
// Le mail sert aussi d'alarme : le jour ou il n'arrive plus, c'est que
// quelque chose ne tourne plus.
//
// QUI PEUT L'APPELER
//   - Vercel, qui presente l'en-tete "Authorization: Bearer <CRON_SECRET>"
//   - l'administrateur connecte, pour declencher un envoi de test
// Personne d'autre : sans CRON_SECRET configuree, l'adresse refuse tout
// appel automatique plutot que de rester ouverte.

import crypto from "crypto";
import zlib from "zlib";
import { construireSauvegarde } from "../lib/sauvegarde.js";
import { lireJeton, jetonDeLaRequete } from "../lib/session.js";
import { envoyer, esc, dateFr } from "../lib/email.js";

// Ou part la sauvegarde. Volontairement pas d'adresse personnelle en dur :
// ce depot est public, une adresse ecrite ici serait ramassee par les robots
// a spam. L'adresse reelle est mise dans la variable SAUVEGARDE_EMAIL sur
// Vercel ; sans elle, la sauvegarde part sur l'adresse du site.
const DESTINATAIRE = process.env.SAUVEGARDE_EMAIL
  || process.env.ADMIN_EMAIL
  || "contact@uneek.store";

// Au-dela de cette taille, on compresse : un JSON de plusieurs dizaines de
// Mo se fait refuser par la messagerie. Le .gz s'ouvre d'un double-clic sur
// Mac et redonne le .json.
const SEUIL_COMPRESSION = 8 * 1024 * 1024;

// Comparaison a duree constante : deux chaines de longueurs differentes
// feraient lever timingSafeEqual, d'ou le passage par un condense.
function memeSecret(a, b) {
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function secretDeLaRequete(req) {
  const brut = req.headers.authorization || req.headers.Authorization || "";
  return String(brut).replace(/^Bearer\s+/i, "").trim();
}

function poidsLisible(octets) {
  if (octets < 1024) return octets + " o";
  if (octets < 1024 * 1024) return (octets / 1024).toFixed(0) + " Ko";
  return (octets / (1024 * 1024)).toFixed(1) + " Mo";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const attendu = process.env.CRON_SECRET;
  const parCron = !!attendu && memeSecret(secretDeLaRequete(req), attendu);
  // Volontairement independant de AUTH_MODE : meme en mode observation, cette
  // adresse ne doit s'ouvrir qu'a un jeton administrateur reellement valide.
  const lecture = lireJeton(jetonDeLaRequete(req));
  const parAdmin = !parCron && lecture.ok && lecture.session && lecture.session.admin === true;

  if (!parCron && !parAdmin) {
    if (!attendu) {
      console.error("[cron] CRON_SECRET absente — sauvegarde automatique inactive");
    }
    return res.status(401).json({ error: "Non autorisé" });
  }

  try {
    const { sauvegarde, resume, echecs } = await construireSauvegarde({ avecImages: false });

    const json = JSON.stringify(sauvegarde, null, 2);
    const brut = Buffer.from(json, "utf8");
    const jour = new Date().toISOString().slice(0, 10);

    let fichier = Buffer.from(brut);
    let nom = "uneek-sauvegarde-" + jour + ".json";
    let compresse = false;
    if (brut.length > SEUIL_COMPRESSION) {
      fichier = zlib.gzipSync(brut);
      nom = nom + ".gz";
      compresse = true;
    }

    const lignes = Object.keys(resume).map(
      (t) => '<tr><td style="padding:3px 14px 3px 0;font-size:14px">' + esc(t) + '</td>'
        + '<td style="padding:3px 0;font-size:14px;text-align:right">' + resume[t] + '</td></tr>'
    ).join("");

    const total = Object.keys(resume).reduce((s, t) => s + resume[t], 0);

    const html =
      '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
      + 'max-width:520px;color:#111;line-height:1.6">'
      + '<p style="margin:0 0 14px;font-size:16px">Sauvegarde du ' + esc(dateFr(new Date())) + '</p>'
      + '<p style="margin:0 0 16px;font-size:14px">Le fichier joint contient tout le contenu '
      + 'de la base UNEEK, sans les photos. Garde-le : c\'est la copie de secours du jour.</p>'
      + '<table style="border-collapse:collapse;margin:0 0 16px">' + lignes
      + '<tr><td style="padding:6px 14px 0 0;font-size:14px;font-weight:600;border-top:1px solid #ddd">Total</td>'
      + '<td style="padding:6px 0 0;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #ddd">'
      + total + '</td></tr></table>'
      + '<p style="margin:0 0 8px;font-size:13px;color:#666">Fichier : ' + esc(nom)
      + ' — ' + poidsLisible(fichier.length)
      + (compresse ? ' (compressé, double-clic pour l\'ouvrir)' : '') + '</p>'
      + (echecs.length
          ? '<p style="margin:0 0 8px;font-size:13px;color:#b00">Tables non sauvegardées : '
            + esc(echecs.join(", ")) + '</p>'
          : '')
      + '<p style="margin:16px 0 0;font-size:13px;color:#666">Si tu ne reçois plus ce message, '
      + 'c\'est que la sauvegarde automatique ne tourne plus.</p>'
      + '</div>';

    const envoi = await envoyer({
      to: DESTINATAIRE,
      subject: "Sauvegarde UNEEK — " + jour,
      html,
      attachments: [{ filename: nom, content: fichier.toString("base64") }],
    });

    console.log("[cron] sauvegarde " + jour + " : " + total + " lignes, "
      + fichier.length + " octets, envoi=" + (envoi && envoi.sent));

    return res.status(200).json({
      ok: true,
      date: jour,
      lignes_par_table: resume,
      tables_en_echec: echecs,
      poids_octets: fichier.length,
      compresse,
      email: envoi,
    });
  } catch (err) {
    console.error("[cron] echec de la sauvegarde :", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
