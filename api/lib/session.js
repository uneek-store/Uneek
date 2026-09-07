// Jetons de session signes.
//
// LE PROBLEME QU'ON CORRIGE
// Jusqu'ici, se connecter renvoyait un nombre aleatoire qui n'etait stocke
// nulle part. Le serveur ne pouvait donc pas distinguer un vrai jeton d'un
// jeton invente, et ne le regardait meme pas : n'importe qui pouvait lire
// les commandes, les candidatures et les produits en attente.
//
// LA SOLUTION
// Le serveur signe le jeton avec AUTH_SECRET au moment de la connexion, et
// verifie cette signature a chaque requete. Aucune table a creer : la preuve
// voyage avec le jeton.
//
// DEUX MODES, pour ne jamais enfermer personne dehors
//   AUTH_MODE absente ou "observation"  -> on verifie, on ecrit dans les
//       logs, mais on laisse passer. C'est le mode de rodage.
//   AUTH_MODE = "strict"                -> on refuse pour de bon.
//
// Tant qu'AUTH_SECRET est absente, creerJeton renvoie null et l'appelant
// retombe sur l'ancien jeton : le site continue de fonctionner.

import crypto from "crypto";

const DUREE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function secret() {
  return String(process.env.AUTH_SECRET || "");
}

export function modeAuth() {
  return String(process.env.AUTH_MODE || "observation").toLowerCase();
}

function signature(corps) {
  return crypto.createHmac("sha256", secret()).update(corps).digest("base64url");
}

// --- fabrication -----------------------------------------------------------

export function creerJeton(compte) {
  if (!secret() || !compte) return null;
  const charge = {
    id: compte.id,
    email: compte.email,
    admin: !!compte.is_admin,
    brand_id: compte.brand_id || null,
    exp: Date.now() + DUREE_MS,
  };
  const corps = Buffer.from(JSON.stringify(charge)).toString("base64url");
  return corps + "." + signature(corps);
}

// --- lecture ---------------------------------------------------------------

export function lireJeton(jeton) {
  if (!secret()) return { ok: false, raison: "AUTH_SECRET absente du serveur" };
  if (!jeton || typeof jeton !== "string") return { ok: false, raison: "aucun jeton fourni" };

  const parts = jeton.split(".");
  if (parts.length !== 2) {
    return { ok: false, raison: "format inattendu (probablement un ancien jeton)" };
  }

  const attendue = signature(parts[0]);
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(attendue);
  // Comparaison a temps constant : comparer avec === laisserait deviner la
  // signature caractere par caractere en mesurant le temps de reponse.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, raison: "signature invalide" };
  }

  let charge;
  try {
    charge = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
  } catch {
    return { ok: false, raison: "contenu du jeton illisible" };
  }

  if (!charge || !charge.exp || charge.exp < Date.now()) {
    return { ok: false, raison: "jeton expire" };
  }

  // Les deux familles de jetons sont signees avec le meme secret. Sans cette
  // ligne, un jeton client — pourtant valablement signe — serait accepte ici
  // comme une session de createur, avec un id absent et aucun brand_id.
  if (charge.cid && !charge.id) {
    return { ok: false, raison: "jeton client presente comme jeton createur" };
  }

  return { ok: true, session: charge };
}

export function jetonDeLaRequete(req) {
  const h = req && req.headers && req.headers.authorization;
  if (!h || typeof h !== "string" || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

// --- jetons client ---------------------------------------------------------
//
// LE PROBLEME QU'ON CORRIGE (constat 09 de l'audit du 7 septembre)
// Les comptes createur et admin sont signes depuis le 31 aout. Les clients,
// eux, recevaient base64("<leur identifiant>:<hasard>"). L'identifiant se
// lisait en clair et le hasard n'etait verifie nulle part : fabriquer le
// jeton d'un autre client demandait de connaitre son identifiant, et rien
// d'autre. Ses commandes et son profil suivaient.
//
// Meme repli que pour les createurs : si AUTH_SECRET manque, creerJetonClient
// renvoie null et l'appelant garde l'ancien jeton. Personne n'est enferme
// dehors par une variable d'environnement oubliee.

export function creerJetonClient(customerId) {
  if (!secret() || !customerId) return null;
  const charge = { cid: String(customerId), exp: Date.now() + DUREE_MS };
  const corps = Buffer.from(JSON.stringify(charge)).toString("base64url");
  return corps + "." + signature(corps);
}

export function lireJetonClient(jeton) {
  if (!jeton || typeof jeton !== "string") return { ok: false, raison: "aucun jeton fourni" };
  if (!secret()) return { ok: false, raison: "AUTH_SECRET absente du serveur" };

  const parts = jeton.split(".");
  if (parts.length !== 2) {
    return { ok: false, raison: "ancien jeton client, non signe" };
  }

  const attendue = signature(parts[0]);
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, raison: "signature invalide" };
  }

  let charge;
  try {
    charge = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
  } catch {
    return { ok: false, raison: "contenu du jeton illisible" };
  }

  // Symetrique de la protection ci-dessus : un jeton de createur ne doit pas
  // pouvoir se faire passer pour un client.
  if (!charge || !charge.cid || charge.id) {
    return { ok: false, raison: "ce n'est pas un jeton client" };
  }
  if (!charge.exp || charge.exp < Date.now()) {
    return { ok: false, raison: "jeton expire" };
  }

  return { ok: true, customerId: String(charge.cid) };
}

function marqueDemandee(req) {
  try {
    if (req.query && req.query.brand_id) return String(req.query.brand_id);
    if (req.body && req.body.brand_id) return String(req.body.brand_id);
  } catch {
    /* rien */
  }
  return null;
}

// --- point de controle unique ---------------------------------------------
//
// options.admin  : reserve aux comptes administrateurs
// options.marque : le createur ne peut agir que sur SA marque
// options.nom    : libelle lisible dans les logs

export function controlerAcces(req, options = {}) {
  const strict = modeAuth() === "strict";
  const lu = lireJeton(jetonDeLaRequete(req));

  let ok = lu.ok;
  let raison = lu.raison || "";
  const session = lu.session || null;

  if (ok && options.admin && !session.admin) {
    ok = false;
    raison = "ce compte n'est pas administrateur";
  }

  if (ok && options.marque && !session.admin) {
    const demandee = marqueDemandee(req);
    if (demandee && String(session.brand_id || "") !== demandee) {
      ok = false;
      raison = "tentative d'acces a une autre marque que la sienne";
    }
  }

  const ou = (req.method || "?") + " " + (options.nom || "");
  if (ok) {
    console.log("[auth] ok — " + (session.admin ? "admin" : "createur")
      + " " + (session.email || "?") + " — " + ou);
  } else {
    console.warn("[auth] " + (strict ? "REFUS" : "observation (laisse passer)")
      + " — " + raison + " — " + ou);
  }

  if (strict) return { ok, raison, session };
  // En mode observation on laisse toujours passer : rien ne peut casser.
  return { ok: true, observe: !lu.ok || !ok, raison, session };
}
