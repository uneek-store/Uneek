// QUAND UN CREATEUR EST PAYE — la regle, a un seul endroit.
//
// Decision d'Axel, 3 octobre 2026 : le createur est paye 21 JOURS APRES
// L'EXPEDITION de son colis (et non plus 14 jours apres la commande).
//
// POURQUOI 21 JOURS APRES L'EXPEDITION
// Le client a 14 jours pour se retracter A PARTIR DE LA RECEPTION du colis.
// Environ 7 jours de livraison + 14 jours de retractation = 21 jours. Payer
// plus tot, c'est verser de l'argent qu'il faudra peut-etre reprendre.
//
// CONSEQUENCE VOULUE : un colis qui n'est pas marque « expedie » (avec son
// numero de suivi) n'est jamais paye. Tant que TOUTES les pieces de la marque
// dans la commande ne sont pas parties, le virement attend.
//
// Ce fichier est lu par le robot des virements (api/cron/stripe-transfers.js)
// et par l'onglet Finances (api/admin/versements.js) : les deux doivent
// toujours dire la meme chose.

export const JOURS_APRES_EXPEDITION = 21;
const UN_JOUR_MS = 24 * 60 * 60 * 1000;
const PARTIES = ["shipped", "delivered"];

// lignes : les order_items d'UNE marque dans UNE commande.
// repli  : date a utiliser si une piece est partie sans date d'expedition
//          (colis marques expedies avant le 30 septembre 2026).
// Rend le moment (en millisecondes) a partir duquel le virement peut partir,
// ou null si le colis n'est pas encore entierement expedie.
export function dateDeLiberation(lignes, repli) {
  if (!Array.isArray(lignes) || lignes.length === 0) return null;
  let dernier = 0;
  for (const l of lignes) {
    if (PARTIES.indexOf(l.fulfillment_status) === -1) return null;
    const t = new Date(l.shipped_at || repli || 0).getTime();
    if (!isFinite(t) || t <= 0) return null;
    if (t > dernier) dernier = t;
  }
  return dernier + JOURS_APRES_EXPEDITION * UN_JOUR_MS;
}

// Range les order_items par « commande|marque » pour retrouver vite le colis
// qui correspond a une ligne de pending_transfers.
export function rangerParColis(orderItems) {
  const parColis = new Map();
  for (const l of orderItems || []) {
    const cle = l.order_id + "|" + l.brand_id;
    if (!parColis.has(cle)) parColis.set(cle, []);
    parColis.get(cle).push(l);
  }
  return parColis;
}
