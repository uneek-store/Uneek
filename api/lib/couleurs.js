// LA LISTE DES COULEURS, ECRITE UNE FOIS.
//
// Avant le 2 octobre 2026, chaque createur tapait ses couleurs a la main.
// Resultat dans la base : red/black/navy pour un produit, gris/noir pour un
// autre, Rouge/blanc/rose pour un troisieme. Trois langues, trois casses, et
// aucune traduction pour le client neerlandais qui lisait "Rouge".
//
// Pire : sizes_stock est range PAR COULEUR ({ noir: { S: 3 } }). Deux
// orthographes de la meme couleur, et le stock se dedouble en silence.
//
// Depuis, le createur choisit dans cette liste. Le code stocke est stable et
// sans accent ; le libelle francais est ce qui s'affiche, et i18n.js le
// traduit comme n'importe quel autre texte du site.

// ===== COULEURS UNEEK — copie de api/lib/couleurs.js =====
// Le garde-fou compare ce bloc, au caractere pres, dans index.html,
// creator-v2.html, admin.html et api/lib/couleurs.js. Ne le modifier qu'ici,
// puis le recopier partout.
var COULEURS_UNEEK = [
  { code: 'noir',        fr: 'Noir',          hex: '#121212' },
  { code: 'blanc',       fr: 'Blanc',         hex: '#FFFFFF' },
  { code: 'ecru',        fr: 'Écru',          hex: '#F1EADA' },
  { code: 'beige',       fr: 'Beige',         hex: '#D8C6A8' },
  { code: 'gris',        fr: 'Gris',          hex: '#9B9B9B' },
  { code: 'gris-chine',  fr: 'Gris chiné',    hex: '#BDBDBD' },
  { code: 'marron',      fr: 'Marron',        hex: '#6B4A2F' },
  { code: 'rouge',       fr: 'Rouge',         hex: '#C8102E' },
  { code: 'bordeaux',    fr: 'Bordeaux',      hex: '#6E1A2B' },
  { code: 'rose',        fr: 'Rose',          hex: '#E8A0BF' },
  { code: 'orange',      fr: 'Orange',        hex: '#E8632A' },
  { code: 'jaune',       fr: 'Jaune',         hex: '#F2C300' },
  { code: 'vert',        fr: 'Vert',          hex: '#2E7D4F' },
  { code: 'kaki',        fr: 'Kaki',          hex: '#6E7245' },
  { code: 'bleu-clair',  fr: 'Bleu clair',    hex: '#8FBCE6' },
  { code: 'bleu',        fr: 'Bleu',          hex: '#1F5FA9' },
  { code: 'marine',      fr: 'Bleu marine',   hex: '#1B2A4A' },
  { code: 'violet',      fr: 'Violet',        hex: '#6A4C93' },
  { code: 'argente',     fr: 'Argenté',       hex: '#C2C2C2' },
  { code: 'dore',        fr: 'Doré',          hex: '#C9A227' },
  { code: 'multicolore', fr: 'Multicolore',   hex: null }
];

// Ce que les createurs ont deja tape a la main, avant que la liste existe.
// Sans cette table, un produit enregistre en "black" perdrait sa pastille et
// son nom traduit le jour ou on passe a la liste fixe.
var ALIAS_COULEURS = {
  black: 'noir', white: 'blanc', grey: 'gris', gray: 'gris', navy: 'marine',
  red: 'rouge', pink: 'rose', green: 'vert', blue: 'bleu', yellow: 'jaune',
  brown: 'marron', purple: 'violet', silver: 'argente', gold: 'dore',
  beige: 'beige', khaki: 'kaki', burgundy: 'bordeaux', cream: 'ecru',
  zwart: 'noir', wit: 'blanc', grijs: 'gris', rood: 'rouge', groen: 'vert',
  blauw: 'bleu', schwarz: 'noir', weiss: 'blanc', grau: 'gris', rot: 'rouge',
  negro: 'noir', blanco: 'blanc', rojo: 'rouge', verde: 'vert', azul: 'bleu',
  'bleu-marine': 'marine', 'gris-chine': 'gris-chine', creme: 'ecru'
};

// 'Blanc', 'BLANC', 'blanc ', 'white' donnent tous 'blanc'. Une valeur
// inconnue est renvoyee telle quelle : un vieux produit garde son texte
// plutot que de disparaitre.
function codeCouleur(v) {
  if (v == null) return null;
  var s = String(v).trim();
  if (!s) return null;
  var k = s.toLowerCase()
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
    .replace(/[\s_]+/g, '-');
  for (var i = 0; i < COULEURS_UNEEK.length; i++) {
    if (COULEURS_UNEEK[i].code === k) return k;
  }
  if (Object.prototype.hasOwnProperty.call(ALIAS_COULEURS, k)) return ALIAS_COULEURS[k];
  return s;
}

// Le libelle est TOUJOURS en francais : c'est i18n.js qui le traduit a
// l'affichage, comme tout le reste du site. Rien a maintenir en double.
function libelleCouleur(v) {
  var c = codeCouleur(v);
  for (var i = 0; i < COULEURS_UNEEK.length; i++) {
    if (COULEURS_UNEEK[i].code === c) return COULEURS_UNEEK[i].fr;
  }
  return c == null ? '' : String(c);
}

function hexCouleur(v) {
  var c = codeCouleur(v);
  for (var i = 0; i < COULEURS_UNEEK.length; i++) {
    if (COULEURS_UNEEK[i].code === c) return COULEURS_UNEEK[i].hex;
  }
  return null;
}

// La pastille. Le blanc et l'ecru ont besoin d'un contour pour exister sur
// fond blanc ; le multicolore n'a pas de couleur, il a un degrade.
function pastilleCouleur(v, taille) {
  var t = taille || 16;
  var h = hexCouleur(v);
  var fond = h ? ('background:' + h)
    : 'background:conic-gradient(#C8102E,#F2C300,#2E7D4F,#1F5FA9,#6A4C93,#C8102E)';
  return '<span aria-hidden="true" style="display:inline-block;width:' + t + 'px;height:' + t
    + 'px;border-radius:50%;' + fond + ';border:1px solid rgba(0,0,0,0.18);flex:none"></span>';
}
// ===== fin du bloc COULEURS UNEEK =====

export { COULEURS_UNEEK, ALIAS_COULEURS, codeCouleur, libelleCouleur, hexCouleur, pastilleCouleur };
