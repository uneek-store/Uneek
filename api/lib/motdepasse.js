// LE MOT DE PASSE : COMMENT IL EST RANGE, ET POURQUOI CA A CHANGE
//
// AVANT (jusqu'au 3 octobre 2026) : SHA-256, une seule passe, sans sel.
// Le code le disait lui-meme : « Hash simple du mot de passe (en production,
// utiliser bcrypt) ». SHA-256 est fait pour etre RAPIDE — c'est sa raison
// d'etre. Une carte graphique en calcule des milliards par seconde. Et sans
// sel, deux personnes qui choisissent le meme mot de passe ont exactement la
// meme empreinte : une seule table pre-calculee les ouvre toutes les deux.
// Concretement, si la base fuitait, « soleil123 » tomberait immediatement.
//
// MAINTENANT : scrypt. Lent exprès, et gourmand en memoire exprès — c'est ce
// qui rend une attaque par force brute couteuse meme avec du bon materiel.
// Chaque empreinte a son propre sel tire au sort, donc deux mots de passe
// identiques donnent deux empreintes differentes.
//
// POURQUOI scrypt ET PAS bcrypt : scrypt est dans Node, livre avec la
// plate-forme. bcrypt demanderait une dependance de plus a installer sur
// Vercel a chaque deploiement — une piece mobile en plus sous l'ecran de
// connexion, qui est la derniere chose qu'on veut voir casser.
//
// LE PASSAGE SE FAIT SANS RIEN DEMANDER A PERSONNE
// Les empreintes SHA-256 deja en base restent acceptees : verifier() reconnait
// les deux formats. A la premiere connexion reussie, api/auth.js remplace
// l'ancienne empreinte par une empreinte scrypt (voir rafraichirEmpreinte).
// Aucun createur, aucun client n'a de mot de passe a reinitialiser.
//
// CE QU'ON NE PEUT PLUS FAIRE, ET C'EST VOULU
// Avant, le mot de passe se verifiait dans la requete SQL :
//     .eq("password_hash", hashPassword(password))
// Avec un sel par empreinte, c'est impossible : on ne peut pas recalculer
// l'empreinte de quelqu'un d'autre sans son sel. On lit donc la ligne par son
// e-mail (ou son identifiant), PUIS on compare. C'est la facon normale de
// faire, et c'est ce que api/auth.js fait maintenant partout.

import crypto from "crypto";

// 2^15 iterations, 8 blocs, 1 passe : environ 32 Mo de memoire et quelques
// dizaines de millisecondes par verification. Assez lent pour decourager une
// attaque, assez rapide pour une page de connexion.
const N = 32768;
const R = 8;
const P = 1;
const LONGUEUR = 32;
// Node refuse par defaut au-dela de 32 Mo : on donne la place qu'il faut.
const MEMOIRE_MAX = 128 * N * R * 2;

const MARQUEUR = "scrypt$";

// Une empreinte SHA-256 nue, c'est 64 caracteres hexadecimaux. C'est a ca
// qu'on reconnait l'ancien format — le nouveau commence par "scrypt$".
export function estAncienneEmpreinte(empreinte) {
  return typeof empreinte === "string" && /^[0-9a-f]{64}$/i.test(empreinte);
}

// L'ancien calcul, garde UNIQUEMENT pour relire ce qui est deja en base.
// Ne jamais s'en servir pour ecrire une nouvelle empreinte.
function ancienneEmpreinte(mdp) {
  return crypto.createHash("sha256").update(String(mdp)).digest("hex");
}

function derive(mdp, sel) {
  return new Promise((resoudre, rejeter) => {
    crypto.scrypt(
      String(mdp), sel, LONGUEUR,
      { N, r: R, p: P, maxmem: MEMOIRE_MAX },
      (err, cle) => (err ? rejeter(err) : resoudre(cle))
    );
  });
}

// Fabrique l'empreinte a ranger en base. Le format porte ses propres reglages,
// pour qu'un durcissement futur ne rende pas les empreintes d'aujourd'hui
// illisibles.
export async function fabriquer(mdp) {
  const sel = crypto.randomBytes(16);
  const cle = await derive(mdp, sel);
  return MARQUEUR + N + "$" + R + "$" + P + "$"
    + sel.toString("hex") + "$" + cle.toString("hex");
}

function comparerSur(a, b) {
  // timingSafeEqual exige deux tampons de meme longueur, sinon il leve.
  const ta = Buffer.from(String(a), "utf8");
  const tb = Buffer.from(String(b), "utf8");
  if (ta.length !== tb.length) return false;
  return crypto.timingSafeEqual(ta, tb);
}

// Le sel du leurre : quand aucune empreinte n'existe (adresse inconnue), on
// fait quand meme un vrai calcul avant de repondre non. Sans ca, une adresse
// inconnue repondrait beaucoup plus vite qu'un mot de passe faux, et il
// suffirait de chronometrer les reponses pour savoir qui a un compte.
const SEL_LEURRE = Buffer.from("uneek-leurre-temps-constant-0001");

export async function verifier(mdp, empreinte) {
  if (typeof mdp !== "string" || mdp.length === 0) return false;

  if (typeof empreinte !== "string" || empreinte.length === 0) {
    await derive(mdp, SEL_LEURRE);
    return false;
  }

  if (empreinte.startsWith(MARQUEUR)) {
    const bouts = empreinte.slice(MARQUEUR.length).split("$");
    if (bouts.length !== 5) {
      console.warn("[mot de passe] empreinte scrypt illisible");
      await derive(mdp, SEL_LEURRE);
      return false;
    }
    const [n, r, p, selHex, cleHex] = bouts;
    let cle;
    try {
      cle = await new Promise((resoudre, rejeter) => {
        crypto.scrypt(
          mdp, Buffer.from(selHex, "hex"), cleHex.length / 2,
          { N: Number(n), r: Number(r), p: Number(p), maxmem: MEMOIRE_MAX },
          (err, k) => (err ? rejeter(err) : resoudre(k))
        );
      });
    } catch (e) {
      console.warn("[mot de passe] calcul scrypt impossible :", e && e.message);
      return false;
    }
    return comparerSur(cle.toString("hex"), cleHex);
  }

  if (estAncienneEmpreinte(empreinte)) {
    return comparerSur(ancienneEmpreinte(mdp), empreinte);
  }

  console.warn("[mot de passe] empreinte de format inconnu en base");
  await derive(mdp, SEL_LEURRE);
  return false;
}
