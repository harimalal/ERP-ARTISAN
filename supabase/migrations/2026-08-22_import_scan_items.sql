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
-- RLS — CONFIRMÉ EN LIVE (SELECT policyname, qual FROM pg_policies WHERE
-- tablename = 'clients';) : la policy réelle sur `clients` est
-- `clients_tenants` avec qual `tenant_id = my_tenant_id()` — une fonction
-- Postgres dédiée, pas une sous-requête inline ni une claim JWT. La policy
-- ci-dessous reprend ce pattern exact pour rester cohérente avec le reste
-- du schéma.
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

-- Policy alignée sur le pattern réel confirmé sur `clients` (cf. note ci-dessus).
DROP POLICY IF EXISTS "import_scan_items_tenant" ON import_scan_items;
CREATE POLICY "import_scan_items_tenant" ON import_scan_items
  FOR ALL
  USING (tenant_id = my_tenant_id())
  WITH CHECK (tenant_id = my_tenant_id());

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
