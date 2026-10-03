// FRAIS DE PORT — la seule reference (decidee le 30 septembre 2026).
//
// Le client paie :
//   - la LIVRAISON, une seule fois par commande, quel que soit le nombre de
//     marques : c'est l'argument d'UNEEK ("un panier, une livraison") ;
//   - des FRAIS DE SERVICE, par marque du panier (preparer et suivre chaque
//     colis, service client, remboursement si un colis n'arrive pas).
//
// Chaque createur envoie lui-meme son colis et recoit un FORFAIT par marque
// et par commande (pas par produit) :
//   - client dans le meme pays que la marque : la livraison seule ;
//   - client dans un autre pays : livraison + frais de service de sa marque,
//     l'etiquette coutant plus cher quand le colis passe une frontiere.
// Le forfait s'ajoute au virement deja prevu, 21 jours apres l'expedition.
//
// Tout est en CENTIMES : pas d'arrondi flottant sur de l'argent.

export const TARIFS = {
  livraison: 490,          // payee une fois par commande
  service_par_marque: 150, // payee par marque du panier
};

// Pays livres au lancement. La cle est le code ISO : c'est lui qui voyage,
// jamais le nom affiche (i18n.js traduit les textes des <option>).
export const PAYS_LIVRES = {
  BE: "Belgique",
  FR: "France",
  NL: "Pays-Bas",
  LU: "Luxembourg",
  DE: "Allemagne",
  ES: "Espagne",
};

// Une marque dont le pays d'expedition n'est pas encore renseigne est
// traitee comme belge : c'est le cas de toutes les marques du lancement.
export const PAYS_MARQUE_PAR_DEFAUT = "BE";

export function paysValide(code) {
  const c = String(code || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PAYS_LIVRES, c) ? c : null;
}

// paysClient : code ISO du pays de livraison.
// marques    : [{ brand_id, pays }] — une entree par marque du panier
//              (les doublons sont regroupes ici).
// Renvoie les montants en centimes.
export function calculerFrais(paysClient, marques) {
  const client = paysValide(paysClient);
  const parMarque = new Map();
  for (const m of marques || []) {
    if (!m || !m.brand_id) continue;
    const id = String(m.brand_id);
    if (!parMarque.has(id)) parMarque.set(id, paysValide(m.pays) || PAYS_MARQUE_PAR_DEFAUT);
  }
  const nbMarques = parMarque.size;
  const livraison = nbMarques > 0 ? TARIFS.livraison : 0;
  const service = TARIFS.service_par_marque * nbMarques;

  const forfaits = {};
  let totalForfaits = 0;
  for (const [id, paysMarque] of parMarque) {
    const autrePays = !client || paysMarque !== client;
    const f = TARIFS.livraison + (autrePays ? TARIFS.service_par_marque : 0);
    forfaits[id] = f;
    totalForfaits += f;
  }

  return {
    pays_client: client,
    nb_marques: nbMarques,
    livraison,                     // centimes, payes par le client
    service,                       // centimes, payes par le client
    total_frais: livraison + service,
    forfaits,                      // { brand_id: centimes verses au createur }
    total_forfaits: totalForfaits,
    solde_uneek: livraison + service - totalForfaits, // peut etre negatif
  };
}
