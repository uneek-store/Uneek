// Limiteur d'appels : combien de fois une meme adresse IP peut appeler une
// adresse sensible dans un laps de temps donne.
//
// POURQUOI CE FICHIER EXISTE
// Sans lui, n'importe qui peut appeler /api/auth dix mille fois par minute
// pour deviner un mot de passe, ou /api/orders en boucle pour faire grimper
// la facture Vercel et noyer la base de fausses commandes. Aucun compte n'est
// necessaire pour ca : il suffit d'une boucle de trois lignes.
//
// CE QU'IL FAUT SAVOIR SUR SES LIMITES — et c'est important
// Les fonctions Vercel sont sans memoire partagee : chaque instance a son
// propre compteur, et une instance qui dort perd le sien. Un attaquant reparti
// sur plusieurs instances passe donc sous le radar. Ce limiteur ralentit une
// attaque simple lancee depuis une machine ; il ne remplace pas le pare-feu
// Vercel, qui filtre en amont, avant meme que ce code ne s'execute.
// C'est une premiere porte, pas un mur.
//
// REGLE ABSOLUE : ce module ne doit jamais empecher un client legitime de
// commander. En cas de doute ou d'erreur interne, il laisse passer.

const compteurs = new Map();

const PURGE_MS = 10 * 60 * 1000;      // on fait le menage au plus toutes les 10 min
const OUBLI_MS = 60 * 60 * 1000;      // une IP inactive depuis 1h est oubliee
const MAX_ENTREES = 5000;             // garde-fou memoire

let dernierePurge = Date.now();

// Derriere Vercel, l'adresse du visiteur est dans x-forwarded-for.
// req.socket.remoteAddress ne donnerait que l'adresse du proxy.
export function ipDe(req) {
  try {
    const xff = req && req.headers && req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
    const reel = req && req.headers && req.headers["x-real-ip"];
    if (typeof reel === "string" && reel.trim()) return reel.trim();
  } catch {
    /* rien */
  }
  return "inconnue";
}

function purger(maintenant) {
  if (maintenant - dernierePurge < PURGE_MS && compteurs.size < MAX_ENTREES) return;
  dernierePurge = maintenant;
  for (const [id, dates] of compteurs) {
    if (!dates.length || maintenant - dates[dates.length - 1] > OUBLI_MS) {
      compteurs.delete(id);
    }
  }
  // Si malgre le menage la table reste enorme, on repart de zero : mieux vaut
  // un limiteur amnesique qu'une fonction qui sature sa memoire et tombe.
  if (compteurs.size > MAX_ENTREES) compteurs.clear();
}

// Renvoie true si l'appel doit etre REFUSE. Dans ce cas la reponse 429 a deja
// ete envoyee : l'appelant n'a plus qu'a s'arreter.
export function limiter(req, res, { cle, max, secondes, message }) {
  try {
    const maintenant = Date.now();
    purger(maintenant);

    const fenetre = secondes * 1000;
    const id = cle + "|" + ipDe(req);
    const dates = (compteurs.get(id) || []).filter((t) => maintenant - t < fenetre);

    if (dates.length >= max) {
      compteurs.set(id, dates);
      const attente = Math.max(1, Math.ceil((fenetre - (maintenant - dates[0])) / 1000));
      console.warn("[limite] " + cle + " refuse pour " + ipDe(req)
        + " (" + dates.length + " appels en " + secondes + "s)");
      res.setHeader("Retry-After", String(attente));
      res.status(429).json({
        error: message || "Trop de tentatives. Réessaie dans " + attente + " secondes.",
      });
      return true;
    }

    dates.push(maintenant);
    compteurs.set(id, dates);
    return false;
  } catch (err) {
    // Un bug ici ne doit jamais fermer la boutique.
    console.error("[limite] ignorée :", err && err.message);
    return false;
  }
}

// Pour les tests : remet les compteurs a zero.
export function reinitialiserLimites() {
  compteurs.clear();
  dernierePurge = Date.now();
}
