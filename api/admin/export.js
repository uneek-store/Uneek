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

import { controlerAcces } from "../lib/session.js";
// La liste des tables et la construction du fichier vivent dans lib/sauvegarde.js :
// la tache nocturne (/api/cron/sauvegarde) produit exactement la meme chose.
import { construireSauvegarde } from "../lib/sauvegarde.js";

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
    const { sauvegarde } = await construireSauvegarde({ avecImages });

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
