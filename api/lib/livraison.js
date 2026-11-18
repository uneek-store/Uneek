// FRAIS DE PORT — la seule reference (regle du 18 novembre 2026, decidee par
// Axel ; remplace celle du 30 septembre : 4,90 EUR une fois + 1,50 EUR par marque).
//
// LE ROBOT CALCULATEUR. Son controleur, ecrit a part et autrement, est
// outils/tests/tests-controleur-frais.mjs : les deux doivent toujours tomber
// d'accord.
//
// Chaque marque du panier envoie son propre colis et compte :
//   - 4,90 EUR si elle expedie depuis le pays du client ;
//   - 9,40 EUR si elle expedie depuis un autre pays.
// Le client paie la somme, mais la somme ne depasse jamais 14,70 EUR :
//   1. on compte d'abord les marques etrangeres (9,40), puis celles du pays ;
//   2. on additionne tant que le total reste sous 14,70 EUR (ou l'atteint) ;
//   3. des qu'une marque ferait depasser 14,70 EUR, le client paie 14,70 EUR
//      + 2,50 EUR pour cette marque et 2,50 EUR pour CHAQUE marque qui suit.
// Exemples : 1 du pays 4,90 · 1 etrangere 9,40 · 3 du pays 14,70 ·
// 2 etrangeres 17,20 · 4 du pays 17,20 · 3 etrangeres 19,70.
// Il n'y a plus de frais de service : `service` vaut toujours 0 (le champ
// reste pour ne rien casser chez ceux qui le lisent).
//
// Chaque createur recoit un FORFAIT par marque et par commande (pas par
// produit) : exactement le prix de sa marque, 4,90 ou 9,40 EUR. UNEEK ne
// gagne rien sur la livraison et paie la difference au-dela du plafond.
// Le forfait s'ajoute au virement deja prevu, 21 jours apres l'expedition.
//
// Tout est en CENTIMES : pas d'arrondi flottant sur de l'argent.

export const TARIFS = {
  meme_pays: 490,      // marque qui expedie depuis le pays du client
  autre_pays: 940,     // marque qui expedie depuis un autre pays
  plafond: 1470,       // le total des marques ne depasse jamais ce montant...
  supplement: 250,     // ...ensuite, chaque marque en plus ajoute ceci
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
  // Ajoutes le 7 octobre 2026 (decision d'Axel).
  IT: "Italie",
  PT: "Portugal",
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

  // Le forfait de chaque marque = son prix. Pays du client inconnu : on
  // compte « autre pays » (le cas le plus cher pour le createur).
  const forfaits = {};
  let totalForfaits = 0;
  const prix = [];
  for (const [id, paysMarque] of parMarque) {
    const f = (client && paysMarque === client) ? TARIFS.meme_pays : TARIFS.autre_pays;
    forfaits[id] = f;
    totalForfaits += f;
    prix.push(f);
  }

  // Ce que paie le client : les plus chers d'abord, jusqu'au plafond, puis
  // un supplement par marque qui ne rentre plus.
  prix.sort((a, b) => b - a);
  let somme = 0;
  let depasse = false;
  let enPlus = 0;
  for (const p of prix) {
    if (!depasse && somme + p <= TARIFS.plafond) somme += p;
    else { depasse = true; enPlus += 1; }
  }
  const livraison = depasse ? TARIFS.plafond + enPlus * TARIFS.supplement : somme;

  return {
    pays_client: client,
    nb_marques: nbMarques,
    livraison,                     // centimes, payes par le client
    service: 0,                    // plus de frais de service depuis le 18/11/2026
    total_frais: livraison,
    forfaits,                      // { brand_id: centimes verses au createur }
    total_forfaits: totalForfaits,
    solde_uneek: livraison - totalForfaits, // 0, ou negatif au-dela du plafond
  };
}
