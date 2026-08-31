// API : /api/admin/export
// GET → renvoie tout le contenu de la base, en JSON, pour sauvegarde.
//
// POURQUOI CE FICHIER EXISTE
// Le code du site est protege (GitHub + sauvegardes datees). Les donnees ne
// l'etaient pas : le plan Supabase gratuit ne fait aucune sauvegarde, et le
// tableau de bord affichait "Last backup : No backups". Une mauvaise commande
// SQL et les produits, commandes et comptes clients disparaissaient sans
// retour possible.
//
// Reserve a l'administrateur. Cette adresse n'a pu exister qu'a partir du
// moment ou l'authentification a ete mise en place : avant, elle aurait
// distribue toute la base a qui la demandait.

import { supabaseAdmin } from "../lib/supabase.js";
import { controlerAcces } from "../lib/session.js";

// Toutes les tables du projet. Si une nouvelle table apparait un jour, elle
// doit etre ajoutee ici, sinon elle ne sera jamais sauvegardee.
const TABLES = [
  "brands",
  "products",
  "creator_accounts",
  "customers",
  "orders",
  "order_items",
  "partner_applications",
  "product_edits",
];

// Les photos sont stockees en base64 dans la base : elles representent
// l'essentiel du poids. On peut les exclure pour obtenir un fichier leger,
// suffisant pour tout ce qui est commandes, clients et comptes.
function sansImages(table, lignes) {
  if (table !== "products" && table !== "product_edits") return lignes;
  return lignes.map((l) => {
    const copie = { ...l };
    if (Array.isArray(copie.image_urls)) {
      copie.image_urls = ["(" + copie.image_urls.length + " photo(s) non incluses)"];
    }
    if (copie.image_url) copie.image_url = "(photo non incluse)";
    if (copie.changes && typeof copie.changes === "object") {
      const c = { ...copie.changes };
      if (Array.isArray(c.image_urls)) {
        c.image_urls = ["(" + c.image_urls.length + " photo(s) non incluses)"];
      }
      if (c.image_url) c.image_url = "(photo non incluse)";
      copie.changes = c;
    }
    return copie;
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const acces = controlerAcces(req, { admin: true, nom: "/api/admin/export" });
  if (!acces.ok) return res.status(401).json({ error: "Non autorisé" });

  const avecImages = String(req.query.images || "1") !== "0";

  try {
    const contenu = {};
    const resume = {};
    const echecs = [];

    for (const table of TABLES) {
      const { data, error } = await supabaseAdmin.from(table).select("*");
      if (error) {
        // Une table absente ne doit pas faire echouer toute la sauvegarde :
        // mieux vaut un export partiel et signale qu'aucun export du tout.
        console.error("[export] table " + table + " :", error.message);
        echecs.push(table + " (" + error.message + ")");
        continue;
      }
      const lignes = avecImages ? (data || []) : sansImages(table, data || []);
      contenu[table] = lignes;
      resume[table] = lignes.length;
    }

    const sauvegarde = {
      _sauvegarde: {
        date: new Date().toISOString(),
        site: "uneek.store",
        photos_incluses: avecImages,
        lignes_par_table: resume,
        tables_en_echec: echecs,
        comment_restaurer:
          "Chaque cle est une table Supabase, chaque valeur la liste de ses lignes. "
          + "Pour restaurer : reinserer les lignes table par table, en commencant par "
          + "brands, puis creator_accounts et products, puis orders et order_items "
          + "(les dernieres dependent des premieres).",
      },
      ...contenu,
    };

    const jour = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="uneek-sauvegarde-' + jour + '.json"'
    );
    return res.status(200).json(sauvegarde);
  } catch (err) {
    console.error("Export API error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
