// API : servi a l'adresse /robots.txt (voir "rewrites" dans vercel.json)
//
// POURQUOI CE FICHIER EXISTE
// /robots.txt est le tout premier fichier que lit un robot — Google comme
// ceux de ChatGPT ou Perplexity. Jusqu'ici l'adresse renvoyait la page
// d'accueil du site (101 Ko de HTML) au lieu d'un fichier texte : du charabia
// pour un robot, et surtout aucun lien vers le plan du site.
//
// POURQUOI UNE FONCTION ET PAS UN SIMPLE FICHIER
// Le site repond sur trois adresses : www.uneek.store (la vraie),
// uneek.store (qui redirige) et uneek-store.vercel.app (l'adresse technique
// de Vercel). Cette derniere sert exactement le meme site : pour un moteur,
// c'est un site en double, et il en choisit un au hasard — parfois le mauvais.
// Un fichier fixe dirait la meme chose partout. Ici, on demande a ce que
// l'adresse technique ne soit pas indexee du tout.

const HOTE_CANONIQUE = "www.uneek.store";
const SITE = "https://" + HOTE_CANONIQUE;

export default function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  // Une heure de cache : assez pour ne pas recalculer a chaque robot, assez
  // court pour qu'une correction soit prise en compte le jour meme.
  res.setHeader("Cache-Control", "public, max-age=3600");

  const hote = String((req.headers && req.headers.host) || "").toLowerCase();

  // Tout ce qui n'est pas l'adresse officielle ne doit pas etre indexe.
  // uneek.store n'est pas concerne : il redirige (307) vers www avant meme
  // d'arriver ici.
  if (hote && hote !== HOTE_CANONIQUE) {
    return res.status(200).send(
      "# Adresse technique : le site officiel est " + SITE + "\n"
      + "User-agent: *\n"
      + "Disallow: /\n"
    );
  }

  return res.status(200).send([
    "# UNEEK — marques independantes",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Espaces prives : rien a indexer, et pas la peine d'essayer.",
    "Disallow: /admin",
    "Disallow: /creator",
    "Disallow: /api/",
    "",
    "# Pages personnelles ou sans interet pour un moteur.",
    "Disallow: /checkout",
    "Disallow: /profil",
    "Disallow: /connexion",
    "Disallow: /inscription",
    "",
    "Sitemap: " + SITE + "/sitemap.xml",
    "",
  ].join("\n"));
}
