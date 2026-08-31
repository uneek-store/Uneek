// Construction d'une sauvegarde complete de la base, en JSON.
//
// POURQUOI CE FICHIER EXISTE
// La meme sauvegarde est produite a deux endroits :
//   - /api/admin/export      quand Axel clique sur le bouton du panneau
//   - /api/cron/sauvegarde   chaque nuit, automatiquement, par e-mail
// La liste des tables doit rester UNE SEULE liste. Si elle etait recopiee,
// une table ajoutee un jour finirait sauvegardee d'un cote et oubliee de
// l'autre — et on ne s'en apercevrait que le jour ou il faut restaurer.

import { supabaseAdmin } from "./supabase.js";

// Toutes les tables du projet. Si une nouvelle table apparait un jour, elle
// doit etre ajoutee ici, sinon elle ne sera jamais sauvegardee.
export const TABLES = [
  "brands",
  "products",
  "creator_accounts",
  "customers",
  "orders",
  "order_items",
  "partner_applications",
  "product_edits",
  // Oubliee de la premiere version : le panneau admin y ecrit ses alertes
  // (nouveau produit en attente, etc.). Le garde-fou compare desormais cette
  // liste aux tables reellement utilisees par le code, pour que ca ne se
  // reproduise pas.
  "admin_notifications",
];

// Les photos sont stockees en base64 dans la base : elles representent
// l'essentiel du poids. On peut les exclure pour obtenir un fichier leger,
// suffisant pour tout ce qui est commandes, clients et comptes.
export function sansImages(table, lignes) {
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

// Lit toutes les tables et renvoie l'objet complet, pret a etre serialise.
// Une table en echec est signalee dans _sauvegarde.tables_en_echec : mieux
// vaut une sauvegarde partielle et annoncee qu'aucune sauvegarde du tout.
export async function construireSauvegarde({ avecImages = true } = {}) {
  const contenu = {};
  const resume = {};
  const echecs = [];

  for (const table of TABLES) {
    const { data, error } = await supabaseAdmin.from(table).select("*");
    if (error) {
      console.error("[sauvegarde] table " + table + " :", error.message);
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

  return { sauvegarde, resume, echecs };
}
