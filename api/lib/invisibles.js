// MARQUES INVISIBLES (14 novembre 2026) : en ligne et completement
// fonctionnelles (panneau createur, modifications, commandes test), mais
// absentes de tout ce que voit un client : listes, pages, plan du site.
// L'admin les voit en ouvrant une fois https://www.uneek.store/?apercu=1
// (et ?apercu=0 pour revenir a la vue client). On compare le slug.
//
// Pour cacher une autre marque : ajouter son slug ici (en minuscules).
export const MARQUES_INVISIBLES = ["testify"];

export function marqueInvisible(slug) {
  return MARQUES_INVISIBLES.indexOf(String(slug || "").trim().toLowerCase()) !== -1;
}
