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
  // Ajoutee le 8 septembre. pending_transfers enregistre CE QU'UNEEK DOIT A
  // CHAQUE CREATEUR pour chaque vente encaissee : c'est elle que lit le
  // virement automatique a 14 jours (api/cron/stripe-transfers.js).
  // Elle etait absente de cette liste depuis le branchement de Stripe : la
  // sauvegarde nocturne ne la contenait pas. En cas de perte de la base, on
  // aurait retrouve les commandes et l'argent encaisse, mais plus aucune
  // trace de ce qui restait a reverser. Trouve par le garde-fou.
  "pending_transfers",
];

// Volontairement absente de la liste : "admin_notifications". La sauvegarde du
// 31 aout a revele qu'elle n'existe pas dans la base — le code croyait y ecrire.
// La laisser ici ferait afficher "table non sauvegardee" en rouge dans le mail
// quotidien, tous les jours, pour rien : une alarme qui sonne toujours est une
// alarme qu'on cesse de lire. Le garde-fou verifie qu'aucune table reellement
// utilisee par le code ne manque a la liste.

// LES EMPREINTES DE MOTS DE PASSE NE SORTENT PAS DE LA BASE
// (constat 10 de l'audit du 7 septembre)
// La sauvegarde partait chaque nuit par e-mail vers une boite Gmail, avec
// dedans password_hash pour chaque compte createur et chaque client. Ces
// empreintes sont du SHA-256 sans sel : un dictionnaire les retrouve en
// quelques minutes pour tout mot de passe courant. Une boite mail n'est pas
// l'endroit ou les ranger, et une sauvegarde n'a pas besoin d'elles pour
// etre restaurable : au pire, on renvoie un lien de reinitialisation.
//
// Ce qui reste a faire, separement : remplacer SHA-256 par un vrai algorithme
// de mot de passe (bcrypt ou argon2). Ce chantier deconnecte tout le monde
// une fois, il se decide.
const CHAMPS_SECRETS = {
  creator_accounts: ["password_hash"],
  customers: ["password_hash"],
};

export function sansSecrets(table, lignes) {
  const champs = CHAMPS_SECRETS[table];
  if (!champs) return lignes;
  return lignes.map((l) => {
    const copie = { ...l };
    for (const champ of champs) {
      if (champ in copie) copie[champ] = "(non sauvegardé — voir sauvegarde.js)";
    }
    return copie;
  });
}

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
    const brutes = sansSecrets(table, data || []);
    const lignes = avecImages ? brutes : sansImages(table, brutes);
    contenu[table] = lignes;
    resume[table] = lignes.length;
  }

  const sauvegarde = {
    _sauvegarde: {
      date: new Date().toISOString(),
      site: "uneek.store",
      photos_incluses: avecImages,
      empreintes_mots_de_passe: "volontairement exclues",
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
