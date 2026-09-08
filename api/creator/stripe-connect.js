// API : /api/creator/stripe-connect
// GET  → ou en est le createur : compte relie ? paiements autorises ?
// POST → cree (ou reprend) son compte Stripe et renvoie le lien d'inscription
//
// POURQUOI CE FICHIER EXISTE
// Jusqu'ici, aucun createur n'avait de compte Stripe. Les commandes etaient
// encaissees par UNEEK et la part du createur ne repartait jamais : le robot
// des virements a 14 jours tournait chaque nuit sur une liste toujours vide.
// Ce fichier est le premier maillon manquant — celui par lequel le createur
// declare a Stripe qui il est et sur quel compte il veut etre paye.
//
// CE QU'UNEEK NE VOIT JAMAIS
// L'identite et l'IBAN sont saisis chez Stripe, pas ici. Nous ne recevons en
// retour qu'un identifiant de compte (acct_...) et trois indicateurs d'etat.
// Aucune coordonnee bancaire ne transite par ce serveur ni par la base.
//
// POURQUOI ON N'UTILISE PAS controlerAcces ICI
// En mode "observation", controlerAcces laisse passer les jetons invalides
// pour ne bloquer personne pendant le rodage. C'est acceptable pour lire des
// produits ; ca ne l'est pas ici, ou une requete decide vers quel compte
// bancaire l'argent partira. On exige donc un jeton reellement signe, et
// l'identite du createur est lue DANS le jeton — jamais dans la requete.

import Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase.js";
import { lireJeton, jetonDeLaRequete } from "../lib/session.js";
import { limiter } from "../lib/limite.js";

const SITE = process.env.SITE_URL || "https://www.uneek.store";

// Les trois questions auxquelles Stripe repond sur un compte connecte.
// details_submitted : le createur est alle au bout du formulaire.
// charges_enabled   : Stripe accepte que des paiements lui soient rattaches.
// payouts_enabled   : Stripe accepte de virer sur son compte bancaire.
// Tant que payouts_enabled est faux, un virement echouerait : c'est cet
// indicateur qui decide si on affiche "pret" au createur.
function etatDuCompte(compte) {
  return {
    relie: true,
    dossier_complet: !!compte.details_submitted,
    paiements_actifs: !!compte.charges_enabled,
    virements_actifs: !!compte.payouts_enabled,
    // Ce que Stripe attend encore, s'il attend quelque chose.
    a_fournir: (compte.requirements && compte.requirements.currently_due) || [],
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Jeton reellement verifie, quel que soit AUTH_MODE (voir en-tete).
  const lu = lireJeton(jetonDeLaRequete(req));
  if (!lu.ok || !lu.session || !lu.session.id) {
    console.warn("[stripe-connect] refus :", lu.raison || "session absente");
    return res.status(401).json({ error: "Reconnecte-toi pour accéder à tes paiements." });
  }
  const creatorId = lu.session.id;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe non configuré côté serveur" });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // On relit le compte en base : le jeton dit qui, la base dit ou il en est.
  const { data: compte, error: erreurLecture } = await supabaseAdmin
    .from("creator_accounts")
    .select("id, email, full_name, brand_id, stripe_account_id")
    .eq("id", creatorId)
    .maybeSingle();

  if (erreurLecture || !compte) {
    console.error("[stripe-connect] compte introuvable :", creatorId, erreurLecture && erreurLecture.message);
    return res.status(404).json({ error: "Compte créateur introuvable" });
  }

  try {
    // --- GET : simple etat des lieux ---------------------------------------
    if (req.method === "GET") {
      if (!compte.stripe_account_id) {
        return res.status(200).json({ relie: false });
      }
      const distant = await stripe.accounts.retrieve(compte.stripe_account_id);
      return res.status(200).json(etatDuCompte(distant));
    }

    // --- POST : creer le compte si besoin, puis renvoyer le lien ------------
    // Creer un compte Stripe est une ecriture chez un tiers : on limite les
    // appels pour qu'un panneau qui boucle ne cree pas dix comptes.
    if (limiter(req, res, {
      cle: "stripe-connect",
      max: 10,
      secondes: 300,
      message: "Trop de tentatives. Réessaie dans quelques minutes.",
    })) return;

    let accountId = compte.stripe_account_id;

    if (!accountId) {
      // Express : Stripe heberge le formulaire d'identite et de compte
      // bancaire, et gere la verification reglementaire a notre place.
      const nouveau = await stripe.accounts.create({
        type: "express",
        email: compte.email || undefined,
        business_type: "individual",
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          creator_id: compte.id,
          brand_id: compte.brand_id || "",
          source: "uneek-creator-panel",
        },
      });
      accountId = nouveau.id;

      // Enregistre AVANT de renvoyer le lien : si le createur ferme l'onglet
      // en cours de route, on doit retrouver son compte au lieu d'en creer
      // un second a sa prochaine visite.
      const { error: erreurEcriture } = await supabaseAdmin
        .from("creator_accounts")
        .update({ stripe_account_id: accountId })
        .eq("id", compte.id);

      if (erreurEcriture) {
        console.error("[stripe-connect] compte Stripe cree mais non enregistre :",
          accountId, erreurEcriture.message);
        return res.status(500).json({
          error: "Compte Stripe créé mais non enregistré. Contacte UNEEK en citant : " + accountId,
        });
      }
      console.log("[stripe-connect] compte cree", accountId, "pour", compte.email);
    }

    // Le lien d'inscription est a usage unique et expire vite : on en
    // fabrique un neuf a chaque clic plutot que d'en stocker un.
    const lien = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: SITE + "/creator?stripe=refresh",
      return_url: SITE + "/creator?stripe=retour",
      type: "account_onboarding",
    });

    return res.status(200).json({ url: lien.url, compte: accountId });

  } catch (err) {
    console.error("[stripe-connect]", req.method, ":", err && err.message);
    return res.status(500).json({
      error: "Stripe est momentanément injoignable. Réessaie dans un instant.",
    });
  }
}
