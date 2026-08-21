-- ============================================================
-- ARTEASY — Table de staging import_scan_items + compteur onboarding_ia_utilise
-- À exécuter dans le SQL Editor Supabase (une seule fois).
-- Idempotent : peut être relancé sans erreur (IF NOT EXISTS partout).
--
-- Contexte : scan IA de l'onboarding Admin (import universel). Chaque
-- entité détectée par le scan est écrite immédiatement en base (résilience
-- si le navigateur se ferme pendant un lot de fichiers) puis lue par
-- l'écran de validation avant import définitif dans clients/fournisseurs/
-- articles/produits.
--
-- RLS — NOTE IMPORTANTE POUR L'EXÉCUTANT :
-- Le brief de la tâche proposait `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
-- (JWT custom claim). Cette hypothèse a été écartée après lecture des
-- migrations déjà appliquées dans ce repo : 2026-08-15_priorite1_flux_facturation.sql
-- crée la policy `facture_lignes_tenant` avec le pattern
-- `tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1)`,
-- et js/auth.js confirme que le tenant_id de session est résolu via une
-- requête sur la table `users` (colonne tenant_id) keyée sur l'utilisateur
-- authentifié — pas via une claim JWT custom. La policy ci-dessous reprend
-- donc ce pattern pour rester cohérente avec le reste du schéma.
-- Cette déduction s'appuie sur les fichiers de migration locaux, pas sur
-- une lecture live de pg_policies pour la table `clients` (impossible dans
-- cet environnement, pas d'accès Supabase). À confirmer avant application
-- avec la requête de vérification fournie dans le rapport de tâche —
-- si le pattern réel sur `clients` diffère, adapter la clause USING/WITH
-- CHECK ci-dessous avant d'exécuter ce fichier.
-- ============================================================

CREATE TABLE IF NOT EXISTS import_scan_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id       uuid NOT NULL,
  fichier_nom    text NOT NULL,
  page_source    integer,
  type_entite    text NOT NULL CHECK (type_entite IN ('client', 'fournisseur', 'article', 'produit')),
  champs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  confiance      text NOT NULL CHECK (confiance IN ('haute', 'moyenne', 'basse')),
  statut         text NOT NULL DEFAULT 'a_creer' CHECK (statut IN ('a_creer', 'deja_existant', 'doublon_possible', 'confirme', 'ignore')),
  doublon_de_id  uuid,
  extrait_source text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_scan_items_batch ON import_scan_items (tenant_id, batch_id);

ALTER TABLE import_scan_items ENABLE ROW LEVEL SECURITY;

-- Policy alignée sur le pattern réel du projet (cf. note ci-dessus) :
-- resolution du tenant via la table users, pas via un claim JWT.
DROP POLICY IF EXISTS "import_scan_items_tenant" ON import_scan_items;
CREATE POLICY "import_scan_items_tenant" ON import_scan_items
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1));

-- Compteur onboarding : un tenant qui a déjà utilisé le scan IA une fois
-- (permet d'adapter l'UI — ex: ne plus remontrer l'onboarding par défaut).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS onboarding_ia_utilise boolean NOT NULL DEFAULT false;

-- ============================================================
-- VÉRIFICATION (à exécuter après la migration)
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'import_scan_items' ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_ia_utilise';
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'import_scan_items';
-- ============================================================
