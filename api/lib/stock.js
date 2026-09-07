// LA REGLE DE STOCK, ECRITE UNE FOIS (constat 19 de l'audit du 7 septembre)
//
// POURQUOI CE FICHIER EXISTE
// La meme regle etait recopiee a sept endroits : index.html, admin.html,
// creator.html, creator-v2.html, api/orders.js, et sous une autre forme dans
// api/creator/products.js et api/admin/pending.js. Sept copies qui doivent
// dire la meme chose, sans que rien ne le verifie. Le jour ou l'une change,
// le panneau createur et la boutique ne comptent plus pareil — et personne
// ne s'en apercoit avant qu'un client commande une piece qui n'existe pas.
//
// Ce fichier est desormais LA reference. Les fonctions serveur l'importent.
// Les trois pages HTML ne peuvent pas importer un module (ce sont des pages
// autonomes, sans etape de construction) : elles gardent donc leur copie,
// mais le garde-fou compare leur resultat a celui d'ici sur une trentaine de
// cas. Une divergence devient impossible a rater.
//
// SIZES_STOCK A DEUX FORMES, DANS LA MEME COLONNE
//   a plat        { S: 3, M: 1 }
//   par couleur   { noir: { S: 3 }, gris: { S: 1 } }
// Tout ce qui suit lit et ecrit indifferemment dans l'une ou l'autre.

// EXACTEMENT la liste des trois pages HTML. Ne pas y ajouter de taille
// sans l'ajouter aussi dans index.html, admin.html et creator-v2.html :
// le garde-fou compare les quatre et refuse le push en cas d'ecart.
// (Le 7 septembre, j'y avais glisse un "3XL" absent des pages — le
// garde-fou l'a refuse, et c'etait exactement son travail.)
export const ORDRE_TAILLES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'];

// Une taille se range dans l'un de quatre groupes, dans cet ordre :
//   0 les tailles connues (XS, S, M...)   1 les tailles chiffrees (38, 40)
//   2 tout le reste, par ordre alphabetique   3 "unique", toujours en dernier
export function rangTaille(t) {
  var v = String(t == null ? '' : t).trim().toUpperCase();
  var i = ORDRE_TAILLES.indexOf(v);
  if (i !== -1) return [0, i, ''];
  if (/^[0-9]+([.,][0-9]+)?$/.test(v)) return [1, parseFloat(v.replace(',', '.')), ''];
  if (v === 'UNIQUE' || v === 'TAILLE UNIQUE') return [3, 0, ''];
  return [2, 0, v];
}

export function comparerTailles(a, b) {
  var ra = rangTaille(a), rb = rangTaille(b);
  if (ra[0] !== rb[0]) return ra[0] - rb[0];
  if (ra[1] !== rb[1]) return ra[1] - rb[1];
  return ra[2] < rb[2] ? -1 : (ra[2] > rb[2] ? 1 : 0);
}

// Vrai si la premiere valeur est elle-meme un objet : c'est ce qui distingue
// { noir: { S: 3 } } de { S: 3 }.
export function stockParCouleur(ss) {
  if (!ss || typeof ss !== "object") return false;
  const vals = Object.keys(ss).map((k) => ss[k]);
  if (!vals.length) return false;
  return vals[0] !== null && typeof vals[0] === "object" && !Array.isArray(vals[0]);
}

// Met les deux formes a plat : une ligne par couple couleur/taille.
export function stockLignes(ss) {
  if (!ss || typeof ss !== 'object') return [];
  const out = [];
  if (stockParCouleur(ss)) {
    Object.keys(ss).forEach(c => {
      const tailles = ss[c] || {};
      Object.keys(tailles).forEach(t => {
        out.push({ couleur: c, taille: t, qte: parseInt(tailles[t]) || 0 });
      });
    });
  } else {
    Object.keys(ss).forEach(t => {
      out.push({ couleur: null, taille: t, qte: parseInt(ss[t]) || 0 });
    });
  }
  // On range les tailles sans toucher a l'ordre des couleurs : le createur
  // choisit l'ordre de ses couleurs, pas celui des tailles.
  var ordreCouleur = [];
  out.forEach(function (l) {
    if (ordreCouleur.indexOf(l.couleur) === -1) ordreCouleur.push(l.couleur);
  });
  out.sort(function (a, b) {
    var ca = ordreCouleur.indexOf(a.couleur), cb = ordreCouleur.indexOf(b.couleur);
    if (ca !== cb) return ca - cb;
    return comparerTailles(a.taille, b.taille);
  });
  return out;
}

export function stockTailles(ss) {
  const vues = [];
  stockLignes(ss).forEach(l => { if (vues.indexOf(l.taille) === -1) vues.push(l.taille); });
  return vues;
}

// Le total, toutes tailles et toutes couleurs confondues.
export function stockTotal(ss) {
  return stockLignes(ss).reduce((n, l) => n + l.qte, 0);
}

// Combien reste-t-il de cette taille ? Sans couleur precisee sur un produit
// qui en a, on additionne toutes les couleurs.
export function lireStock(ss, taille, couleur) {
  if (!ss || !taille) return null;
  if (stockParCouleur(ss)) {
    if (!couleur) {
      return Object.keys(ss).reduce((n, c) => n + (parseInt((ss[c] || {})[taille]) || 0), 0);
    }
    if (!ss[couleur]) return null;
    return parseInt(ss[couleur][taille]) || 0;
  }
  return parseInt(ss[taille]) || 0;
}

// Rend une NOUVELLE structure : on ne modifie jamais celle qu'on a recue,
// sinon la valeur d'origine serait perdue et on ne pourrait plus revenir en
// arriere (c'est ce dont depend la restitution de stock, constat 02).
export function ecrireStock(ss, taille, couleur, valeur) {
  if (stockParCouleur(ss)) {
    if (!couleur || !ss[couleur]) return ss;
    return { ...ss, [couleur]: { ...ss[couleur], [taille]: valeur } };
  }
  return { ...ss, [taille]: valeur };
}

// Les cas de reference. Le garde-fou s'en sert pour verifier que les copies
// restees dans les pages HTML repondent exactement comme ce fichier.
// Toute regle ajoutee ici doit etre ajoutee a cette liste.
export const CAS_DE_REFERENCE = [
  null,
  undefined,
  {},
  { S: 3 },
  { S: 3, M: 1, L: 0 },
  { M: 1, S: 3 },
  { XL: 2, S: 1, M: 4, L: 3 },
  { "38": 2, "40": 1, "36": 5 },
  { unique: 7 },
  { S: "3", M: "abc", L: null },
  { noir: { S: 4, M: 3 } },
  { noir: { M: 3, S: 4 }, gris: { S: 1 } },
  { gris: { S: 1 }, noir: { M: 3, S: 4 } },
  { noir: {} },
  { noir: { S: 0 }, blanc: { S: 0 } },
  { "Bleu ciel": { XS: 1, XXL: 2 } },
];
