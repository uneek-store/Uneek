-- =====================================================================
-- UNEEK — table des évènements produits (pour l'onglet « Mes stats »)
-- À exécuter UNE FOIS dans Supabase → SQL Editor, AVANT le déploiement.
-- =====================================================================
--
-- CE QU'ELLE CONTIENT, ET SURTOUT CE QU'ELLE NE CONTIENT PAS
-- Volontairement, aucune donnée personnelle : pas d'adresse IP, pas de
-- compte client, pas d'identifiant de visiteur, pas d'agent utilisateur.
-- On compte des passages sur des fiches produits, on ne suit personne.
-- Conséquence assumée : on saura « 287 vues », jamais « 41 personnes
-- différentes ». C'est le prix de n'avoir rien à déclarer, rien à
-- protéger et rien à effacer sur demande — et ça vaut le coup.
--
-- Le dédoublonnage (ne pas compter dix fois la même visite) est fait
-- côté navigateur, avec un marqueur qui meurt à la fermeture de l'onglet.
--
-- POURQUOI product_id EST DU TEXTE ET SANS CLÉ ÉTRANGÈRE
-- 1. Le type marche quel que soit le format réel des identifiants de
--    produits (uuid, entier, slug) : aucun risque d'échec à l'insertion.
-- 2. Surtout : une clé étrangère ferait ÉCHOUER la suppression d'une
--    marque côté admin dès qu'un de ses produits aurait des évènements.
--    Cette suppression est tout-ou-rien ; il ne faut rien qui la bloque.
-- Les lignes orphelines (produit supprimé) ne sont jamais relues :
-- l'onglet Mes stats ne lit que les évènements des produits existants
-- de la marque connectée.

create table if not exists public.product_events (
  id          bigserial primary key,
  product_id  text        not null,
  type        text        not null,
  size        text,
  color       text,
  created_at  timestamptz not null default now(),

  -- Seuls ces trois types sont acceptés. Un type inconnu est rejeté par la
  -- base même si l'API laissait passer : deuxième verrou.
  constraint product_events_type_valide
    check (type in ('vue', 'favori', 'panier'))
);

-- La requête de l'onglet Mes stats est toujours : « ces produits-là,
-- sur cette période ». C'est exactement l'index ci-dessous.
create index if not exists product_events_produit_date
  on public.product_events (product_id, created_at desc);

-- Pour le ménage périodique (voir plus bas).
create index if not exists product_events_date
  on public.product_events (created_at);

-- ---------------------------------------------------------------------
-- Sécurité : seules les fonctions serveur (clé service) y touchent.
-- Aucune politique n'est créée, donc avec RLS activé le navigateur ne
-- peut ni lire ni écrire directement. L'API est le seul chemin.
-- ---------------------------------------------------------------------
alter table public.product_events enable row level security;

-- ---------------------------------------------------------------------
-- MÉNAGE — à lancer de temps en temps, ou à brancher sur le cron de nuit.
-- Les stats ne regardent jamais plus loin que 3 mois ; garder un an
-- laisse de la marge pour comparer, au-delà c'est du poids pour rien.
-- ---------------------------------------------------------------------
-- delete from public.product_events where created_at < now() - interval '1 year';

-- ---------------------------------------------------------------------
-- VÉRIFIER QUE TOUT EST EN PLACE :
-- ---------------------------------------------------------------------
-- select count(*) from public.product_events;   -- doit renvoyer 0

-- ---------------------------------------------------------------------
-- POUR TOUT ANNULER (si jamais) :
-- ---------------------------------------------------------------------
-- drop table if exists public.product_events;
