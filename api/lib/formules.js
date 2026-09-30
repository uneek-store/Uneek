// Les formules des marques (30 septembre 2026).
//
//   gratuit      les statistiques de base — la formule de DEPART de toute marque
//   pro          tout, payant. Pour l'instant Axel la pose a la main ; plus
//                tard, Stripe la posera tout seul quand la marque paie (et la
//                retirera quand elle arrete). Axel ne devra plus y toucher.
//   ambassadeur  tout, offert a vie. Axel seul decide, a la main, dans
//                l'admin > onglet Marques. Stripe n'y touchera jamais.
//
// Une seule reference ici : le jour ou le panneau createur verifie l'acces
// aux statistiques payantes, il appellera accesComplet(), jamais une liste
// recopiee ailleurs.

export const FORMULES = ["gratuit", "pro", "ambassadeur"];

// Toute marque sans formule connue (colonne pas encore creee, valeur vide)
// est traitee comme gratuite (decision d'Axel, 30 septembre).
export const FORMULE_PAR_DEFAUT = "gratuit";

export function formuleValide(v) {
  return typeof v === "string" && FORMULES.indexOf(v) !== -1;
}

export function formuleDe(marque) {
  const f = marque && marque.formule;
  return formuleValide(f) ? f : FORMULE_PAR_DEFAUT;
}

// Qui a droit aux statistiques completes (la partie payante) ?
export function accesComplet(formule) {
  return formule === "pro" || formule === "ambassadeur";
}
