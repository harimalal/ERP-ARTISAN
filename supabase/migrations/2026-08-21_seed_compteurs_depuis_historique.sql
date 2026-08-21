-- ============================================================
-- ARTEASY — Correction : amorcer compteurs depuis l'historique existant
-- À exécuter dans le SQL Editor Supabase (une seule fois).
-- Idempotent : peut être relancé sans erreur (GREATEST ne fait jamais reculer un compteur).
--
-- BUG CORRIGÉ : la migration 2026-08-15_priorite1_flux_facturation.sql crée
-- la table `compteurs` vide. next_ref('CMD') pour un tenant ayant déjà
-- CMD0001 (créé avant la migration, via l'ancien nextRef client) retourne
-- CMD0001 à son premier appel → violation de contrainte unique dès la
-- première commande créée après bascule. Repro confirmée en direct le
-- 21/08/2026 (session Claude) : createCommande a échoué avec
-- "duplicate key value violates unique constraint commandes_tenant_id_ref_key".
-- Concerne tout tenant ayant déjà des commandes/factures/BC/livraisons
-- avant le passage à la numérotation serveur — donc potentiellement tous
-- les tenants actifs, sur leur tout premier document créé après migration.
-- ============================================================

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- CMD depuis commandes
  FOR rec IN
    SELECT tenant_id, MAX((regexp_match(ref, '^CMD0*([0-9]+)'))[1]::int) AS maxval
    FROM commandes WHERE ref ~ '^CMD[0-9]+'
    GROUP BY tenant_id
  LOOP
    INSERT INTO compteurs (tenant_id, prefix, valeur) VALUES (rec.tenant_id, 'CMD', rec.maxval)
    ON CONFLICT (tenant_id, prefix) DO UPDATE SET valeur = GREATEST(compteurs.valeur, EXCLUDED.valeur);
  END LOOP;

  -- FAC depuis factures
  FOR rec IN
    SELECT tenant_id, MAX((regexp_match(ref, '^FAC0*([0-9]+)'))[1]::int) AS maxval
    FROM factures WHERE ref ~ '^FAC[0-9]+'
    GROUP BY tenant_id
  LOOP
    INSERT INTO compteurs (tenant_id, prefix, valeur) VALUES (rec.tenant_id, 'FAC', rec.maxval)
    ON CONFLICT (tenant_id, prefix) DO UPDATE SET valeur = GREATEST(compteurs.valeur, EXCLUDED.valeur);
  END LOOP;

  -- BC depuis achats (ref = racine du BC, ex: BC0007)
  FOR rec IN
    SELECT tenant_id, MAX((regexp_match(ref, '^BC0*([0-9]+)'))[1]::int) AS maxval
    FROM achats WHERE ref ~ '^BC[0-9]+'
    GROUP BY tenant_id
  LOOP
    INSERT INTO compteurs (tenant_id, prefix, valeur) VALUES (rec.tenant_id, 'BC', rec.maxval)
    ON CONFLICT (tenant_id, prefix) DO UPDATE SET valeur = GREATEST(compteurs.valeur, EXCLUDED.valeur);
  END LOOP;

  -- LIV depuis livraisons
  FOR rec IN
    SELECT tenant_id, MAX((regexp_match(ref, '^LIV0*([0-9]+)'))[1]::int) AS maxval
    FROM livraisons WHERE ref ~ '^LIV[0-9]+'
    GROUP BY tenant_id
  LOOP
    INSERT INTO compteurs (tenant_id, prefix, valeur) VALUES (rec.tenant_id, 'LIV', rec.maxval)
    ON CONFLICT (tenant_id, prefix) DO UPDATE SET valeur = GREATEST(compteurs.valeur, EXCLUDED.valeur);
  END LOOP;
END $$;

-- ============================================================
-- VÉRIFICATION (à exécuter après la migration)
-- ============================================================
-- SELECT * FROM compteurs ORDER BY tenant_id, prefix;
--
-- Comparer avec les vrais max par tenant :
-- SELECT tenant_id, 'CMD' AS prefix, MAX(ref) FROM commandes GROUP BY tenant_id
-- UNION ALL
-- SELECT tenant_id, 'FAC', MAX(ref) FROM factures GROUP BY tenant_id
-- UNION ALL
-- SELECT tenant_id, 'BC', MAX(ref) FROM achats GROUP BY tenant_id
-- UNION ALL
-- SELECT tenant_id, 'LIV', MAX(ref) FROM livraisons GROUP BY tenant_id;
-- ============================================================
