-- ============================================================
-- ARTEASY — Migration TVA multi-taux par produit/article
-- À exécuter dans le SQL Editor Supabase.
-- Idempotent : peut être relancé sans erreur.
-- ============================================================

-- 1. TVA par produit fini (ventes)
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 20;

-- 2. TVA par article (achats — matières premières, emballages)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 20;

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('produits','articles') AND column_name = 'taux_tva';
