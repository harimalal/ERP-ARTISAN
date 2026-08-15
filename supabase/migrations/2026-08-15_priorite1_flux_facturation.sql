-- ============================================================
-- ARTEASY — Migration Priorité 1 : flux commande → facturation
-- À exécuter dans le SQL Editor Supabase (une seule fois).
-- Idempotent : peut être relancé sans erreur.
-- Basé sur le schéma réel (lu via PostgREST OpenAPI le 15/08/2026).
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLONNES MANQUANTES (alignées sur le code admin.js existant)
--    commandes.client_id existe DÉJÀ → rien à faire.
-- ------------------------------------------------------------

-- clients : le code admin.js référence déjà siret/contact/cpt
-- (fiche client) mais ces colonnes n'existent pas → bug latent corrigé.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS contact text;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cpt text;

-- fournisseurs : le code admin.js référence déjà siret (fiche fournisseur)
ALTER TABLE fournisseurs
  ADD COLUMN IF NOT EXISTS siret text;

-- factures : lien client + mentions légales
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS siret_client text;
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS adresse_client text;

-- achats : lien fournisseur
ALTER TABLE achats
  ADD COLUMN IF NOT EXISTS fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL;

-- tenants : taux de TVA par défaut (multi-taux)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 20;

-- ------------------------------------------------------------
-- 2. TABLE facture_lignes (lignes figées à l'émission)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facture_lignes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  facture_id    uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  produit_id    uuid,
  produit_nom   text,
  quantite      numeric NOT NULL DEFAULT 0,
  prix_unitaire numeric NOT NULL DEFAULT 0,
  taux_tva      numeric NOT NULL DEFAULT 20,
  total_ht      numeric NOT NULL DEFAULT 0,
  total_ttc     numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id);
CREATE INDEX IF NOT EXISTS idx_facture_lignes_tenant  ON facture_lignes(tenant_id);

-- ------------------------------------------------------------
-- 3. TABLE compteurs (numérotation séquentielle par tenant)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compteurs (
  tenant_id uuid NOT NULL,
  prefix    text NOT NULL,
  valeur    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, prefix)
);

-- ------------------------------------------------------------
-- 4. FONCTION RPC next_ref(prefix)
--    Retourne CMD0001, FAC0001, BC0001, LIV0001... sans trou.
--    Thread-safe via INSERT ... ON CONFLICT (incrément atomique).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_ref(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant uuid;
  v_val    integer;
BEGIN
  -- Récupérer le tenant depuis le JWT de la requête (auth.uid() → users.tenant_id)
  SELECT tenant_id INTO v_tenant
  FROM users
  WHERE id = auth.uid()
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant introuvable pour cet utilisateur';
  END IF;

  -- Incrément atomique (thread-safe)
  INSERT INTO compteurs (tenant_id, prefix, valeur)
  VALUES (v_tenant, p_prefix, 1)
  ON CONFLICT (tenant_id, prefix)
  DO UPDATE SET valeur = compteurs.valeur + 1
  RETURNING valeur INTO v_val;

  RETURN p_prefix || LPAD(v_val::text, 4, '0');
END;
$$;

-- ------------------------------------------------------------
-- 5. RLS sur les nouvelles tables (aligné sur le reste du schéma)
-- ------------------------------------------------------------
ALTER TABLE facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compteurs      ENABLE ROW LEVEL SECURITY;

-- Politique facture_lignes : le tenant ne voit que ses lignes
DROP POLICY IF EXISTS "facture_lignes_tenant" ON facture_lignes;
CREATE POLICY "facture_lignes_tenant" ON facture_lignes
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1));

-- compteurs : accessible uniquement via la fonction SECURITY DEFINER,
-- pas d'accès direct depuis le client.
DROP POLICY IF EXISTS "compteurs_no_direct" ON compteurs;
CREATE POLICY "compteurs_no_direct" ON compteurs
  FOR SELECT
  USING (false);

-- ------------------------------------------------------------
-- 6. GRANT d'exécution de la fonction aux utilisateurs authentifiés
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION next_ref(text) TO authenticated;

-- ============================================================
-- VÉRIFICATION (à exécuter après la migration)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('clients','fournisseurs','factures','achats','tenants','facture_lignes','compteurs')
--   ORDER BY table_name, ordinal_position;
--
-- Test de la fonction (connecté en tant qu'utilisateur du tenant) :
--   SELECT next_ref('FAC');  -- → FAC0001
--   SELECT next_ref('FAC');  -- → FAC0002
-- ============================================================
