# Onboarding IA — Import Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'import Excel à colonnes fixes du module Admin AppMee par un import universel multi-fichiers/multi-formats (PDF, image, Excel, CSV) piloté par l'IA, avec dédoublonnage déterministe et validation humaine limitée aux cas ambigus.

**Architecture:** Option C — le navigateur orchestre le scan (upload, appel IA fichier par fichier, dédup) mais chaque résultat est écrit immédiatement dans une table Supabase de staging (`import_scan_items`), pour survivre à un incident pendant un scan long. Tri déterministe en amont pour les fichiers qui matchent déjà un ancien modèle (zéro IA, zéro risque). Import final uniquement sur confirmation explicite, via les fonctions `create*` déjà existantes.

**Tech Stack:** Netlify Functions (Node, `@anthropic-ai/sdk`, `@supabase/supabase-js`), Supabase Postgres, Vanilla JS frontend, SheetJS (XLSX) déjà chargé côté client.

**Spec:** `docs/superpowers/specs/2026-08-21-onboarding-ia-admin-design.md` (commit da15f70)

## Global Constraints

- Texte brut dans toute communication de session (jamais utilisé pour le contenu de fichiers livrés — s'applique uniquement aux réponses conversationnelles).
- `tenantId` toujours via `getTenantId()` de `js/auth.js` — jamais `session.user.id`.
- Toute Netlify Function appelée sur `/api/nom-avec-tirets`, jamais `/.netlify/functions/nom`. Nom de fichier en `snake_case`.
- Tout event `dispatchEvent(new CustomEvent('appmee:xxx'))` doit avoir un listener vérifié dans `app.html` avant livraison.
- Vérifier le schéma Supabase réel (`information_schema.columns`) avant tout `insert`/`update` avec un nouveau champ — non vérifiable depuis cet environnement, chaque tâche touchant Supabase inclut une étape de vérification manuelle par l'utilisateur.
- Logging systématique dans le catch principal de chaque Netlify Function : `console.error('[nom_function] ERREUR:', err.message, err.stack)`.
- Jamais de note "à compléter" — tout appel Supabase réellement implémenté.
- Après import réussi, dispatcher `appmee:datachanged` et recharger les modules concernés (pattern existant, Règle 5).
- Simuler les scénarios Règle 21B (vide, nominal, doublon, multiple, limite, interdit, temporel) avant de considérer une tâche livrable — repris en détail dans la Tâche 10.
- Aucune clé API (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`) dans le code frontend.

---

## Interfaces communes (référence pour toutes les tâches)

Schéma de champs par type d'entité (déduit du code réel d'admin.js, section 6 du spec) :
- `client` : `{ nom, siret, email, tel, adresse, contact, cpt, notes }`
- `fournisseur` : `{ nom, siret, contact, email, tel, adresse, iban, delai, categorie }`
- `article` : `{ ref, nom, categorie, unite, prix, fournisseur, seuil, stock }`
- `produit` : `{ ref, nom, prix, seuil, stock }`

Ligne `import_scan_items` (voir Tâche 1) :
`{ id, tenant_id, batch_id, fichier_nom, page_source, type_entite, champs (jsonb), confiance, statut, doublon_de_id, extrait_source, created_at }`
`statut` ∈ `'a_creer' | 'deja_existant' | 'doublon_possible' | 'confirme' | 'ignore'`
`confiance` ∈ `'haute' | 'moyenne' | 'basse'`

Contrat `/api/ai-extract-batch` (voir Tâche 3) :
Requête : `{ fichier: string(base64), extension: string, tenantId: string, token: string }`
Réponse succès : `{ ok: true, entites: [{ type, champs, confiance, page_source, extrait_source }], document_type_detecte: string, avertissements: string[] }`
Réponse erreur : `{ ok: false, error: string, code?: string }`

---

### Tâche 1 : Migration Supabase — table de staging + compteur onboarding

**Files:**
- Create: `supabase/migrations/2026-08-22_import_scan_items.sql`

**Interfaces:**
- Produces: table `import_scan_items` (colonnes listées ci-dessus), colonne `tenants.onboarding_ia_utilise boolean default false`.

- [ ] **Step 1: Écrire la migration**

```sql
-- 2026-08-22_import_scan_items.sql
-- Table de staging pour le scan IA de l'onboarding Admin (import universel).
-- Chaque entité détectée par le scan y est écrite immédiatement (résilience
-- si le navigateur se ferme pendant un lot de fichiers) puis lue par
-- l'écran de validation avant import définitif dans clients/fournisseurs/
-- articles/produits.

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

CREATE POLICY import_scan_items_tenant_isolation ON import_scan_items
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS onboarding_ia_utilise boolean NOT NULL DEFAULT false;
```

Note pour l'exécutant : la policy RLS ci-dessus suppose que le JWT Supabase porte `tenant_id` — à adapter au pattern RLS réellement utilisé par les autres tables du projet (vérifier avec `SELECT policyname, qual FROM pg_policies WHERE tablename = 'clients';` avant d'appliquer, pour rester cohérent avec l'existant plutôt que d'inventer un nouveau pattern).

- [ ] **Step 2: Vérifier le schéma des tables existantes avant d'appliquer**

Demander à l'utilisateur d'exécuter dans le SQL Editor Supabase :
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tenants' ORDER BY ordinal_position;
SELECT policyname, qual FROM pg_policies WHERE tablename = 'clients';
```
Confirmer que `tenants` n'a pas déjà de colonne `onboarding_ia_utilise` sous un autre nom, et adapter la policy RLS de la migration au pattern retourné avant de continuer.

- [ ] **Step 3: Appliquer la migration**

L'utilisateur exécute le fichier dans Supabase SQL Editor (pattern déjà utilisé pour toutes les migrations précédentes du projet, cf. `2026-08-21_seed_compteurs_depuis_historique.sql`).

- [ ] **Step 4: Vérifier**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'import_scan_items' ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_ia_utilise';
```
Attendu : les deux requêtes retournent des lignes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-08-22_import_scan_items.sql
git commit -m "feat(db): table import_scan_items + compteur onboarding_ia_utilise"
```

---

### Tâche 2 : db.js — accès à la table de staging

**Files:**
- Modify: `js/db.js` (ajouter une nouvelle section en fin de fichier, après la section FOURNISSEURS)

**Interfaces:**
- Consumes: `tid()` (helper interne existant de `db.js` qui retourne `getTenantId()`), client `supabase` déjà initialisé en haut du fichier.
- Produces: `createImportScanItem(item)`, `getImportScanItems(batchId)`, `updateImportScanItem(id, changes)`, `deleteImportScanItems(batchId)`, `getOpenImportBatch()`, `markOnboardingIAUtilise()`, `getOnboardingIAUtilise()` — utilisées par `js/modules/admin.js` (Tâches 5-8).

- [ ] **Step 1: Ajouter les fonctions dans db.js**

```js
/* -------------------------------------------------------
   IMPORT SCAN IA (staging onboarding Admin)
------------------------------------------------------- */

export async function createImportScanItem(item) {
  const { data, error } = await supabase
    .from('import_scan_items')
    .insert({ ...item, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createImportScanItem', error);
  return data;
}

export async function getImportScanItems(batchId) {
  const { data, error } = await supabase
    .from('import_scan_items')
    .select('*')
    .eq('tenant_id', tid())
    .eq('batch_id', batchId)
    .order('created_at');
  if (error) handleError('getImportScanItems', error);
  return data;
}

export async function updateImportScanItem(id, changes) {
  const { data, error } = await supabase
    .from('import_scan_items')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateImportScanItem', error);
  return data;
}

export async function deleteImportScanItems(batchId) {
  const { error } = await supabase
    .from('import_scan_items')
    .delete()
    .eq('tenant_id', tid())
    .eq('batch_id', batchId);
  if (error) handleError('deleteImportScanItems', error);
}

export async function getOpenImportBatch() {
  const { data, error } = await supabase
    .from('import_scan_items')
    .select('batch_id, created_at')
    .eq('tenant_id', tid())
    .not('statut', 'in', '(confirme,ignore)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) handleError('getOpenImportBatch', error);
  return data ? data.batch_id : null;
}

export async function getOnboardingIAUtilise() {
  const { data, error } = await supabase
    .from('tenants')
    .select('onboarding_ia_utilise')
    .eq('id', tid())
    .single();
  if (error) handleError('getOnboardingIAUtilise', error);
  return !!data?.onboarding_ia_utilise;
}

export async function markOnboardingIAUtilise() {
  const { error } = await supabase
    .from('tenants')
    .update({ onboarding_ia_utilise: true })
    .eq('id', tid());
  if (error) handleError('markOnboardingIAUtilise', error);
}
```

- [ ] **Step 2: Valider la syntaxe**

Run: `node --check js/db.js`
Expected: aucune sortie (fichier valide).

- [ ] **Step 3: Vérification manuelle contre Supabase réel**

Après la Tâche 1 appliquée, dans la console navigateur de l'app connectée (session réelle, pas de mock — cohérent avec la pratique du projet) :
```js
const item = await createImportScanItem({ batch_id: crypto.randomUUID(), fichier_nom: 'test.pdf', type_entite: 'client', champs: { nom: 'Test' }, confiance: 'haute' });
console.log(item);
const items = await getImportScanItems(item.batch_id);
console.log(items.length === 1);
await deleteImportScanItems(item.batch_id);
```
Attendu : `item.id` défini, `items.length === 1`, aucune erreur dans la console.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "feat(db): fonctions d'acces import_scan_items + compteur onboarding IA"
```

---

### Tâche 3 : Netlify Function — `/api/ai-extract-batch`

**Files:**
- Modify: `netlify/functions/ai_extract_doc.js` (réécriture complète — le fichier existe mais n'est appelé par aucun code frontend actuel, vérifié par recherche exhaustive avant cette tâche, donc zéro régression possible)
- Modify: `js/config.js:43` (corriger la constante d'URL)

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` (variables d'environnement Netlify déjà configurées — utilisées par `ai_analyse_bc.js`, mêmes noms).
- Produces: endpoint `POST /api/ai-extract-batch`, contrat décrit dans la section Interfaces communes ci-dessus. Consommé par `js/modules/admin.js` (Tâche 6).

- [ ] **Step 1: Réécrire le fichier complet**

```js
/* -------------------------------------------------------
   AppMee — netlify/functions/ai_extract_doc.js
   Scan universel pour l'onboarding Admin : un fichier
   (PDF/image) peut contenir plusieurs entités de types
   différents (client, fournisseur, article, produit).
   Aucun mode fixe — la catégorisation est automatique.

   SÉCURITÉ :
   - Clé Anthropic injectée par Netlify AI Gateway
   - Clé Supabase SERVICE_KEY côté serveur uniquement
   - Vérification session avant chaque appel IA
   - Quota mensuel ignoré uniquement pour le tout premier
     onboarding d'un tenant (tenants.onboarding_ia_utilise = false)
   - Aucune clé exposée au navigateur

   Entrée  (POST JSON) :
     { fichier: string (base64), extension: string,
       tenantId: string, token: string }

   Sortie (JSON) :
     { ok: true, entites: [...], document_type_detecte, avertissements }
     { ok: false, error: string, code?: string }
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const PLANS_QUOTA = { starter: 20, pro: 100, business: Infinity };
const MOIS_COURANT = () => new Date().toISOString().slice(0, 7);

const TYPES_VALIDES = ['client', 'fournisseur', 'article', 'produit'];

const SCHEMA_PROMPT = `{
  "document_type_detecte": "bon de commande | facture | bon de livraison | carte de visite | catalogue fournisseur | export tableur | illisible | autre",
  "entites": [
    {
      "type": "client | fournisseur | article | produit",
      "champs": { /* voir schemas ci-dessous selon le type */ },
      "confiance": "haute | moyenne | basse",
      "page_source": nombre entier ou null,
      "extrait_source": "courte citation du document justifiant l'extraction"
    }
  ],
  "avertissements": ["chaîne libre si quelque chose mérite l'attention de l'utilisateur"]
}

Schémas de champs par type :
client      : {"nom":"","siret":"","email":"","tel":"","adresse":"","contact":"","cpt":"","notes":""}
fournisseur : {"nom":"","siret":"","contact":"","email":"","tel":"","adresse":"","iban":"","delai":"","categorie":""}
article     : {"ref":"","nom":"","categorie":"","unite":"","prix":"","fournisseur":"","seuil":"","stock":""}
produit     : {"ref":"","nom":"","prix":"","seuil":"","stock":""}`;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Variables Supabase manquantes');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifierSession(token, supabase) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Session invalide ou expirée');
  return user;
}

async function resoudreQuota(tenantId, supabase) {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('plan, onboarding_ia_utilise')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw new Error('Tenant introuvable');

  if (!tenant.onboarding_ia_utilise) {
    return { hors_quota: true, mois: null, appels: 0, limite: null };
  }

  const mois = MOIS_COURANT();
  const limite = PLANS_QUOTA[tenant.plan] ?? PLANS_QUOTA.starter;
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('appels')
    .eq('tenant_id', tenantId)
    .eq('mois', mois)
    .maybeSingle();
  const appels = usage?.appels || 0;

  if (appels >= limite) {
    throw new Error(`Quota IA atteint (${appels}/${limite} appels ce mois). Passez au plan supérieur.`);
  }
  return { hors_quota: false, mois, appels, limite };
}

async function incrementerQuota(tenantId, mois, appelsActuels, tokensUsed, supabase) {
  await supabase
    .from('ai_usage')
    .upsert({
      tenant_id:  tenantId,
      mois,
      appels:     appelsActuels + 1,
      tokens:     tokensUsed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,mois' });
}

function buildPrompt() {
  return `Tu es un assistant d'extraction de données pour une application ERP artisanale française.

Analyse ce document et identifie TOUTES les entités qu'il contient parmi : client, fournisseur, article, produit.
Un document peut contenir plusieurs entités de types différents (ex : un bon de livraison = 1 client + plusieurs articles).
Un document peut contenir plusieurs documents logiques distincts (ex : plusieurs factures dans un seul PDF) — dans ce cas, indique la page_source de chaque entité pour les distinguer, ne fusionne jamais des informations venant de documents différents dans une seule entité.

Retourne UNIQUEMENT un objet JSON valide (sans backticks ni texte autour) au format suivant :
${SCHEMA_PROMPT}

Règles strictes :
- Ne jamais inventer de donnée absente du document. Champ absent → chaîne vide "".
- Si le texte est flou, partiellement illisible, ou l'extraction incertaine → confiance "basse", jamais "haute" par défaut.
- Si le document est totalement illisible ou vide → document_type_detecte: "illisible", entites: [].
- SIRET : chiffres uniquement, sans espaces. IBAN : format standard (FR76...).
- Réponse en français.`;
}

function buildContent(fichierBase64, extension, prompt) {
  const isImage   = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  const mediaType = isImage
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : 'application/pdf';
  const mediaBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fichierBase64 } }
    : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fichierBase64 } };
  return [mediaBlock, { type: 'text', text: prompt }];
}

function parseReponseIA(rawText) {
  const cleaned = rawText.replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}

  const patterns = [/```json\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/, /(\{[\s\S]*\})/];
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  }

  console.error('[ai_extract_doc] parseReponseIA — reponse brute non parseable:', rawText.slice(0, 500));
  return { document_type_detecte: 'illisible', entites: [], avertissements: ['Réponse IA non exploitable — vérifiez manuellement'] };
}

function nettoyerEntites(rawEntites) {
  if (!Array.isArray(rawEntites)) return [];
  return rawEntites
    .filter(e => e && TYPES_VALIDES.includes(e.type) && e.champs && typeof e.champs === 'object')
    .map(e => ({
      type:           e.type,
      champs:         Object.fromEntries(Object.entries(e.champs).map(([k, v]) => [k, v == null ? '' : String(v).trim()])),
      confiance:       ['haute', 'moyenne', 'basse'].includes(e.confiance) ? e.confiance : 'basse',
      page_source:     Number.isInteger(e.page_source) ? e.page_source : null,
      extrait_source:  typeof e.extrait_source === 'string' ? e.extrait_source.slice(0, 300) : '',
    }));
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Méthode non autorisée' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ ok: false, error: 'Corps de requête invalide' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { fichier, extension, tenantId, token } = body;

  if (!fichier || !extension || !tenantId || !token) {
    return new Response(JSON.stringify({ ok: false, error: 'Champs manquants : fichier, extension, tenantId, token' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const extOk = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension.toLowerCase());
  if (!extOk) {
    return new Response(JSON.stringify({ ok: false, error: `Extension non supportée : ${extension}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    await verifierSession(token, supabase);
    const quota = await resoudreQuota(tenantId, supabase);

    const anthropic = new Anthropic();
    const prompt    = buildPrompt();
    const content   = buildContent(fichier, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-5',
      max_tokens: 2000,
      messages:   [{ role: 'user', content }],
    });

    const rawText    = response.content.map(c => c.text || '').join('');
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const parsed      = parseReponseIA(rawText);
    const entites      = nettoyerEntites(parsed.entites);

    if (!quota.hors_quota) {
      await incrementerQuota(tenantId, quota.mois, quota.appels, tokensUsed, supabase);
    }

    return new Response(JSON.stringify({
      ok: true,
      entites,
      document_type_detecte: parsed.document_type_detecte || 'autre',
      avertissements: Array.isArray(parsed.avertissements) ? parsed.avertissements : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[ai_extract_doc] ERREUR:', err.message, err.stack);
    const isQuota = err.message?.includes('Quota IA');
    return new Response(JSON.stringify({
      ok: false, error: err.message || 'Erreur serveur', code: isQuota ? 'QUOTA_EXCEEDED' : 'SERVER_ERROR',
    }), { status: isQuota ? 429 : 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const config = { path: '/api/ai-extract-batch' };
```

- [ ] **Step 2: Corriger la constante dans js/config.js**

Dans `js/config.js`, ligne 43, remplacer :
```js
  aiExtractDoc: '/api/ai-extract-doc',
```
par :
```js
  aiExtractDoc: '/api/ai-extract-batch',
```

- [ ] **Step 3: Valider la syntaxe**

Run: `node --check netlify/functions/ai_extract_doc.js && node --check js/config.js`
Expected: aucune sortie.

- [ ] **Step 4: Vérifier les 3 variables d'environnement Netlify**

Demander confirmation à l'utilisateur que `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` sont bien définies dans Netlify → Environment variables (déjà utilisées par `ai_analyse_bc.js`, donc normalement déjà présentes — à confirmer, pas à supposer, Règle 3 du projet).

- [ ] **Step 5: Test manuel après déploiement**

Depuis la console navigateur de l'app connectée, avec un petit PDF de test converti en base64 :
```js
const resp = await fetch('/api/ai-extract-batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fichier: '<base64_test>', extension: 'pdf', tenantId: getTenantId(), token: (await supabase.auth.getSession()).data.session.access_token }),
});
console.log(await resp.json());
```
Attendu : `ok: true`, `entites` est un tableau (vide ou rempli selon le contenu du PDF de test), pas d'erreur 500.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/ai_extract_doc.js js/config.js
git commit -m "feat(ia): fonction ai-extract-batch multi-entites, remplace le mode fixe"
```

---

### Tâche 4 : admin.js — détection déterministe des anciens modèles (Étape 1)

**Files:**
- Modify: `js/modules/admin.js` (nouvelle fonction pure, à ajouter juste avant `_bindImportMasse`, ligne ~739)
- Test: `tests/unit/detecter-modele.test.mjs`

**Interfaces:**
- Produces: `_detecterTypeModele(headers)` — utilisée par `_onFichiersDeposes` (Tâche 6) pour décider si un fichier Excel/CSV saute l'IA.
- Consumes: aucune dépendance externe, fonction pure sur un tableau de chaînes.

- [ ] **Step 1: Écrire le test (Node natif, sans dépendance)**

```js
// tests/unit/detecter-modele.test.mjs
import assert from 'node:assert';
import { _detecterTypeModeleTest as detecter } from '../../js/modules/admin.js';

// Cas nominal — match exact
assert.strictEqual(
  detecter(['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock']),
  'articles'
);

// Cas nominal — tolérance casse/accents/espaces
assert.strictEqual(
  detecter(['Réf', ' Nom ', 'Catégorie', 'Unité', 'Prix', 'Fournisseur', 'Seuil', 'Stock']),
  'articles'
);

// Cas clients
assert.strictEqual(
  detecter(['nom', 'email', 'tel', 'adresse', 'notes']),
  'clients'
);

// Cas vide — aucun header ne matche
assert.strictEqual(detecter(['colonne_inconnue', 'autre']), null);

// Cas limite — headers partiels (sous-ensemble), ne doit pas matcher un mauvais type
assert.strictEqual(detecter(['nom', 'prix']), null);

console.log('detecter-modele.test.mjs — OK');
```

Note : ce test importe `_detecterTypeModeleTest` qui n'existe pas encore — attendu à ce stade (Step 2 le fait échouer).

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `node tests/unit/detecter-modele.test.mjs`
Expected: FAIL — `_detecterTypeModeleTest` is not exported / undefined.

- [ ] **Step 3: Implémenter dans admin.js**

Ajouter avant `_bindImportMasse` :
```js
/* -------------------------------------------------------
   DÉTECTION DÉTERMINISTE DES ANCIENS MODÈLES
   Si un fichier Excel/CSV matche déjà un modèle connu,
   il saute l'IA — zéro risque, zéro coût.
------------------------------------------------------- */
const _MODELES_CONNUS = {
  articles:     ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'],
  produits:     ['ref', 'nom', 'prix', 'seuil', 'stock'],
  clients:      ['nom', 'email', 'tel', 'adresse', 'notes'],
  fournisseurs: ['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie'],
};

function _normaliserHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _detecterTypeModele(headers) {
  const normalises = (headers || []).map(_normaliserHeader).sort();
  for (const [type, colonnes] of Object.entries(_MODELES_CONNUS)) {
    const attendu = [...colonnes].sort();
    if (normalises.length === attendu.length && normalises.every((h, i) => h === attendu[i])) {
      return type;
    }
  }
  return null;
}
```

Ajouter en fin de fichier (zone d'export déjà existante ou juste avant `export function init` / `export function render`) :
```js
export const _detecterTypeModeleTest = _detecterTypeModele;
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `node tests/unit/detecter-modele.test.mjs`
Expected: `detecter-modele.test.mjs — OK`

- [ ] **Step 5: Valider la syntaxe complète du fichier**

Run: `node --check js/modules/admin.js`
Expected: aucune sortie.

- [ ] **Step 6: Commit**

```bash
git add js/modules/admin.js tests/unit/detecter-modele.test.mjs
git commit -m "feat(admin): detection deterministe des anciens modeles Excel"
```

---

### Tâche 5 : admin.js — dédoublonnage déterministe (Étape 3)

**Files:**
- Modify: `js/modules/admin.js` (nouvelle section, après la fonction ajoutée en Tâche 4)
- Test: `tests/unit/dedup-entites.test.mjs`

**Interfaces:**
- Produces: `_normaliserNom(nom)`, `_matchEntiteExistante(entite, existants)` — utilisées par `_deduplicquerLot` (Tâche 7).
- Consumes: aucune dépendance externe (fonctions pures). `existants` : `{ clients: [], fournisseurs: [], articles: [], produits: [] }` (tableaux déjà chargés depuis `getClients()`/`getFournisseurs()`/`getArticles()`/`getProduits()`, réutilisant les caches `_clients`/`_fournisseurs`/`_articles`/`_produits` déjà présents dans `admin.js`).

- [ ] **Step 1: Écrire le test**

```js
// tests/unit/dedup-entites.test.mjs
import assert from 'node:assert';
import { _matchEntiteExistanteTest as match } from '../../js/modules/admin.js';

const existants = {
  clients: [{ id: 'c1', nom: 'Épicerie Martin', email: 'contact@epicerie.fr' }],
  fournisseurs: [{ id: 'f1', nom: 'Fournisseur A', siret: '12345678900012' }],
  articles: [{ id: 'a1', ref: 'A0001', nom: 'Pot verre 50ml' }],
  produits: [],
};

// Cas nouveau — aucune correspondance
let r = match({ type: 'client', champs: { nom: 'Client Totalement Nouveau' } }, existants);
assert.strictEqual(r.statut, 'nouveau');

// Cas existant fort — nom quasi-exact + champ clé identique (email)
r = match({ type: 'client', champs: { nom: 'Epicerie Martin', email: 'contact@epicerie.fr' } }, existants);
assert.strictEqual(r.statut, 'existant');
assert.strictEqual(r.correspondance.id, 'c1');

// Cas ambigu — nom proche mais aucun champ clé pour confirmer
r = match({ type: 'client', champs: { nom: 'Epicerie Martin', email: '' } }, existants);
assert.strictEqual(r.statut, 'ambigu');

// Cas fournisseur — match par siret même si nom différent (raison sociale changée)
r = match({ type: 'fournisseur', champs: { nom: 'Nouveau Nom SARL', siret: '12345678900012' } }, existants);
assert.strictEqual(r.statut, 'existant');
assert.strictEqual(r.correspondance.id, 'f1');

// Cas article — match par ref exacte
r = match({ type: 'article', champs: { ref: 'A0001', nom: 'Pot verre 50ml' } }, existants);
assert.strictEqual(r.statut, 'existant');

// Cas limite — nom vide, ne doit jamais planter
r = match({ type: 'client', champs: { nom: '' } }, existants);
assert.strictEqual(r.statut, 'nouveau');

console.log('dedup-entites.test.mjs — OK');
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `node tests/unit/dedup-entites.test.mjs`
Expected: FAIL — `_matchEntiteExistanteTest is not a function`.

- [ ] **Step 3: Implémenter dans admin.js**

```js
/* -------------------------------------------------------
   DÉDOUBLONNAGE DÉTERMINISTE
   Jamais laissé à l'IA — comparaison floue sur le nom,
   confirmation par un champ clé (email/tel/siret/ref).
------------------------------------------------------- */
function _normaliserNom(nom) {
  return String(nom || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

const _CHAMPS_CLES = {
  client:      ['email', 'siret', 'tel'],
  fournisseur: ['siret', 'email', 'iban'],
  article:     ['ref'],
  produit:     ['ref'],
};

const _COLLECTIONS = { client: 'clients', fournisseur: 'fournisseurs', article: 'articles', produit: 'produits' };

function _matchEntiteExistante(entite, existants) {
  const collection = existants[_COLLECTIONS[entite.type]] || [];
  const nomCible    = _normaliserNom(entite.champs.nom);

  if (!nomCible && entite.type !== 'article' && entite.type !== 'produit') {
    return { statut: 'nouveau', correspondance: null };
  }

  const refCible = _normaliserNom(entite.champs.ref);
  const clesType  = _CHAMPS_CLES[entite.type] || [];

  for (const existant of collection) {
    const refExistant = _normaliserNom(existant.ref);
    if ((entite.type === 'article' || entite.type === 'produit') && refCible && refExistant && refCible === refExistant) {
      return { statut: 'existant', correspondance: existant };
    }

    const nomExistant = _normaliserNom(existant.nom);
    const nomProche    = nomCible && nomExistant && (nomCible === nomExistant || nomExistant.includes(nomCible) || nomCible.includes(nomExistant));
    if (!nomProche) continue;

    const champCleConfirme = clesType.some(champ => {
      const v1 = _normaliserNom(entite.champs[champ]);
      const v2 = _normaliserNom(existant[champ]);
      return v1 && v2 && v1 === v2;
    });

    if (champCleConfirme || nomCible === nomExistant) {
      return { statut: 'existant', correspondance: existant };
    }
    return { statut: 'ambigu', correspondance: existant };
  }

  return { statut: 'nouveau', correspondance: null };
}
```

Ajouter à côté de l'export de test déjà ajouté en Tâche 4 :
```js
export const _matchEntiteExistanteTest = _matchEntiteExistante;
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `node tests/unit/dedup-entites.test.mjs`
Expected: `dedup-entites.test.mjs — OK`

- [ ] **Step 5: Valider la syntaxe complète**

Run: `node --check js/modules/admin.js`

- [ ] **Step 6: Commit**

```bash
git add js/modules/admin.js tests/unit/dedup-entites.test.mjs
git commit -m "feat(admin): dedoublonnage deterministe des entites scannees"
```

---

### Tâche 6 : admin.js — orchestration du scan IA (Étape 2)

**Files:**
- Modify: `js/modules/admin.js` (nouvelle section après le dédoublonnage)

**Interfaces:**
- Consumes: `createImportScanItem`, `updateImportScanItem`, `getOpenImportBatch`, `getOnboardingIAUtilise`, `markOnboardingIAUtilise` (Tâche 2), `config.endpoints.aiExtractDoc` (Tâche 3), `getTenantId()` de `js/auth.js` (déjà importé dans `admin.js`), `_detecterTypeModele` (Tâche 4).
- Produces: `_onFichiersDeposes(fileList)`, `_lancerScanLot(fichiers, batchId)` — appelées par le binding de la dropzone (Tâche 8), et consommées en aval par `_deduplicquerLot` (Tâche 7).

- [ ] **Step 1: Implémenter l'orchestration**

```js
/* -------------------------------------------------------
   SCAN IA — ORCHESTRATION (Étape 2)
   Concurrence limitée, écriture progressive en staging
   pour survivre à un incident pendant un lot long.
------------------------------------------------------- */
const _CONCURRENCE_MAX = 3;
let _scanEnCours = false;

async function _lireFichierBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Lecture fichier échouée : ' + file.name));
    reader.readAsDataURL(file);
  });
}

async function _scannerFichierIA(file, batchId, onProgress) {
  const extension = file.name.split('.').pop().toLowerCase();
  try {
    const fichierBase64 = await _lireFichierBase64(file);
    const session = await getSession();
    const resp = await fetch(config.endpoints.aiExtractDoc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fichier: fichierBase64, extension, tenantId: getTenantId(), token: session.access_token }),
    });
    const data = await resp.json();

    if (!data.ok) {
      onProgress({ fichier: file.name, statut: 'echec', message: data.error });
      return;
    }

    for (const entite of data.entites) {
      await createImportScanItem({
        batch_id:       batchId,
        fichier_nom:    file.name,
        page_source:    entite.page_source,
        type_entite:    entite.type,
        champs:         entite.champs,
        confiance:      entite.confiance,
        statut:         'a_creer',
        extrait_source: entite.extrait_source,
      });
    }

    onProgress({ fichier: file.name, statut: 'termine', nbEntites: data.entites.length, avertissements: data.avertissements });
  } catch (err) {
    console.error('[admin] _scannerFichierIA ERREUR:', err.message, err.stack);
    onProgress({ fichier: file.name, statut: 'echec', message: err.message });
  }
}

async function _lancerScanLot(fichiers, batchId, onProgress) {
  if (!(await getOnboardingIAUtilise())) {
    await markOnboardingIAUtilise();
  }

  let index = 0;
  let traites = 0;
  const total = fichiers.length;

  async function _travailleur() {
    while (index < fichiers.length) {
      const i = index++;
      await _scannerFichierIA(fichiers[i], batchId, (etat) => {
        traites++;
        onProgress({ ...etat, traites, total, pourcentage: Math.round((traites / total) * 100) });
      });
    }
  }

  const travailleurs = Array.from({ length: Math.min(_CONCURRENCE_MAX, fichiers.length) }, () => _travailleur());
  await Promise.all(travailleurs);
}

async function _onFichiersDeposes(fileList) {
  if (_scanEnCours) return;
  _scanEnCours = true;

  const fichiers = Array.from(fileList);
  const TAILLE_MAX = 15 * 1024 * 1024;
  const EXT_OK = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'xlsx', 'xls', 'csv'];

  const rejetes = [];
  const accepted = fichiers.filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!EXT_OK.includes(ext)) { rejetes.push({ nom: f.name, raison: 'format non supporté' }); return false; }
    if (f.size > TAILLE_MAX) { rejetes.push({ nom: f.name, raison: 'fichier trop volumineux (>15 Mo)' }); return false; }
    return true;
  });

  if (rejetes.length) _afficherFichiersRejetes(rejetes);
  if (!accepted.length) { _scanEnCours = false; return; }

  const excelDirects = [];
  const aScannerIA   = [];

  for (const f of accepted) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') { aScannerIA.push(f); continue; }
    try {
      const headers = await _lireHeadersFichier(f, ext);
      const type = _detecterTypeModele(headers);
      if (type) excelDirects.push({ file: f, type });
      else aScannerIA.push(f);
    } catch { aScannerIA.push(f); }
  }

  if (excelDirects.length) await _importerModelesConnus(excelDirects);

  if (aScannerIA.length) {
    const batchId = crypto.randomUUID();
    _afficherProgressionScan(0, aScannerIA.length);
    await _lancerScanLot(aScannerIA, batchId, (etat) => _afficherProgressionScan(etat.traites, etat.total, etat));
    await _deduplicquerLot(batchId);
    await _renderEcranValidation(batchId);
  }

  _scanEnCours = false;
}

function _lireHeadersFichier(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (ext === 'csv') {
          const first = String(e.target.result).split('\n')[0] || '';
          resolve(first.split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, '')));
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          resolve(rows[0] || []);
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier échouée'));
    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}
```

Note pour l'exécutant : `getSession()` doit exister ou être ajouté dans `js/auth.js` (retourne `{ access_token }` depuis la session Supabase courante) — vérifier son existence avant d'écrire cette tâche ; si absent, l'ajouter en une fonction d'une ligne (`export async function getSession() { const { data } = await supabase.auth.getSession(); return data.session; }`) dans `js/auth.js`, à côté de `getTenantId()`.

- [ ] **Step 2: Valider la syntaxe**

Run: `node --check js/modules/admin.js`

- [ ] **Step 3: Vérification manuelle — cas nominal**

En session réelle : déposer un seul PDF de test lisible contenant un nom de client identifiable. Vérifier en console que `createImportScanItem` est appelé (log réseau Supabase), que la barre de progression passe à 100%, et qu'une ligne apparaît dans `import_scan_items` via `SELECT * FROM import_scan_items ORDER BY created_at DESC LIMIT 5;` côté Supabase.

- [ ] **Step 4: Vérification manuelle — cas Excel ancien modèle**

Déposer un fichier généré par l'ancien `_dlTemplate('clients')` sans le modifier. Vérifier qu'aucun appel à `/api/ai-extract-batch` n'apparaît dans l'onglet Network (le fichier doit passer par `_importerModelesConnus`, implémentée en Tâche 8).

- [ ] **Step 5: Commit**

```bash
git add js/modules/admin.js
git commit -m "feat(admin): orchestration du scan IA multi-fichiers avec resilience"
```

---

### Tâche 7 : admin.js — application du dédoublonnage sur un batch (Étape 3, suite)

**Files:**
- Modify: `js/modules/admin.js`

**Interfaces:**
- Consumes: `_matchEntiteExistante` (Tâche 5), `getImportScanItems`, `updateImportScanItem` (Tâche 2), caches `_clients`/`_fournisseurs`/`_articles`/`_produits` déjà présents dans `admin.js` (rechargés si vides, pattern Règle 11 déjà appliqué ailleurs dans le module).
- Produces: `_deduplicquerLot(batchId)` — appelée par `_onFichiersDeposes` (Tâche 6), écrit le `statut` final de chaque ligne de staging.

- [ ] **Step 1: Implémenter**

```js
/* -------------------------------------------------------
   APPLICATION DU DÉDOUBLONNAGE SUR UN LOT (Étape 3)
------------------------------------------------------- */
async function _deduplicquerLot(batchId) {
  const [clients, fournisseurs, articles, produits] = await Promise.all([
    _clients.length ? _clients : getClients(),
    _fournisseurs.length ? _fournisseurs : getFournisseurs(),
    _articles.length ? _articles : getArticles(),
    _produits.length ? _produits : getProduits(),
  ]);
  const existants = { clients, fournisseurs, articles, produits };

  const items = await getImportScanItems(batchId);
  const dejaTraites = { clients: [], fournisseurs: [], articles: [], produits: [] };

  for (const item of items) {
    const cible = { type: item.type_entite, champs: item.champs };
    const contreExistants = _matchEntiteExistante(cible, existants);
    const contreLot        = contreExistants.statut === 'nouveau'
      ? _matchEntiteExistante(cible, dejaTraites)
      : { statut: 'nouveau', correspondance: null };

    let statut = 'a_creer';
    let doublonDeId = null;

    if (contreExistants.statut === 'existant') { statut = 'deja_existant'; doublonDeId = contreExistants.correspondance.id; }
    else if (contreExistants.statut === 'ambigu') { statut = 'doublon_possible'; doublonDeId = contreExistants.correspondance.id; }
    else if (contreLot.statut !== 'nouveau') { statut = 'doublon_possible'; }

    await updateImportScanItem(item.id, { statut, doublon_de_id: doublonDeId });

    if (statut === 'a_creer') {
      dejaTraites[_COLLECTIONS[item.type_entite] || (item.type_entite + 's')].push({ id: item.id, nom: item.champs.nom, ref: item.champs.ref, email: item.champs.email, siret: item.champs.siret, iban: item.champs.iban });
    }
  }
}
```

- [ ] **Step 2: Valider la syntaxe**

Run: `node --check js/modules/admin.js`

- [ ] **Step 3: Vérification manuelle — cas doublon intra-lot**

Déposer 2 fichiers différents mentionnant le même fournisseur avec le même SIRET (mais des noms légèrement différents, ex. "Fournisseur A" et "FOURNISSEUR A SARL"). Après le scan, vérifier via `SELECT type_entite, champs->>'nom', statut FROM import_scan_items WHERE batch_id = '<id>';` qu'une seule ligne a le statut `a_creer` et l'autre `doublon_possible` ou `deja_existant`.

- [ ] **Step 4: Commit**

```bash
git add js/modules/admin.js
git commit -m "feat(admin): application du dedoublonnage sur un lot scanne"
```

---

### Tâche 8 : admin.js + app.html — écran de validation et import final (Étape 4)

**Files:**
- Modify: `js/modules/admin.js`
- Modify: `app.html:875-896` (contenu de `#modalImportMasse`)
- Modify: `app.html:1088` (condition du listener `appmee:datachanged`)

**Interfaces:**
- Consumes: `getImportScanItems`, `updateImportScanItem`, `deleteImportScanItems` (Tâche 2), `createClient`/`createFournisseur`/`createArticle`/`createProduit` (déjà exportées par `db.js`).
- Produces: `_renderEcranValidation(batchId)`, `_confirmerImport(batchId)` — point de sortie du flux complet, dispatch `appmee:datachanged`.

- [ ] **Step 1: Élargir le listener existant dans app.html**

`app.html:1088`, remplacer :
```js
      if (entity !== 'import_masse') return;
```
par :
```js
      if (!['import_masse', 'import_ia'].includes(entity)) return;
```

- [ ] **Step 2: Remplacer le contenu de la modal dans app.html**

`app.html:875-896`, remplacer le bloc existant par :
```html
<div class="modal-overlay" id="modalImportMasse"><div class="modal modal-lg">
  <div class="modal-hdr"><span class="modal-hdr-title">Import — Clients, fournisseurs, articles, produits</span><button class="modal-close" data-close="modalImportMasse">×</button></div>
  <div class="modal-body">
    <p style="font-size:12.5px;color:var(--ink-muted);margin-bottom:10px;">Dépose n'importe quel fichier — PDF, image, Excel, CSV, plusieurs à la fois. Delia identifie automatiquement les clients, fournisseurs, articles et produits qu'ils contiennent.</p>
    <div id="importDropzone" style="border:2px dashed var(--ui-brd);border-radius:8px;padding:24px;text-align:center;cursor:pointer;">
      <input type="file" id="importFileInput" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" style="display:none">
      <span>Glisse tes fichiers ici ou clique pour choisir</span>
    </div>
    <div id="importRejetes" style="display:none;margin-top:10px;" class="alert-box alert-danger"></div>
    <div id="importProgression" style="display:none;margin-top:12px;"></div>
    <div id="importValidation" style="display:none;margin-top:12px;"></div>
  </div>
  <div class="modal-ftr">
    <button class="btn btn-ghost" data-close="modalImportMasse">Fermer</button>
    <button class="btn btn-primary" id="importBtnConfirmer" disabled style="opacity:.5;">Importer la sélection</button>
  </div>
</div></div>
```

- [ ] **Step 3: Implémenter le rendu de progression, l'écran de validation et l'import final dans admin.js**

```js
/* -------------------------------------------------------
   UI PROGRESSION + VALIDATION + IMPORT FINAL (Étape 4)
------------------------------------------------------- */
function _afficherFichiersRejetes(rejetes) {
  const el = document.getElementById('importRejetes');
  if (!el) return;
  el.style.display = 'flex';
  el.textContent = rejetes.map(r => `${r.nom} : ${r.raison}`).join(' • ');
}

function _afficherProgressionScan(traites, total, etat) {
  const el = document.getElementById('importProgression');
  if (!el) return;
  el.style.display = 'block';
  const pourcentage = total ? Math.round((traites / total) * 100) : 0;
  el.innerHTML = `<div style="font-size:12px;margin-bottom:4px;">Scan en cours : ${traites}/${total} fichiers (${pourcentage}%)${etat?.fichier ? ' — ' + esc(etat.fichier) : ''}</div>
    <div style="background:var(--ui-bg2);border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--ui-green);height:100%;width:${pourcentage}%;transition:width .2s;"></div></div>`;
}

const _LABELS_TYPE = { client: 'Clients', fournisseur: 'Fournisseurs', article: 'Articles', produit: 'Produits' };

async function _renderEcranValidation(batchId) {
  const items = await getImportScanItems(batchId);
  const el = document.getElementById('importValidation');
  if (!el) return;
  el.style.display = 'block';
  el.dataset.batchId = batchId;

  const parType = { client: [], fournisseur: [], article: [], produit: [] };
  for (const item of items) parType[item.type_entite]?.push(item);

  el.innerHTML = Object.entries(parType).filter(([, arr]) => arr.length).map(([type, arr]) => `
    <div style="margin-top:10px;">
      <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;">${_LABELS_TYPE[type]} détectés : ${arr.length}</div>
      ${arr.map(item => _renderLigneValidation(item)).join('')}
    </div>`).join('') || '<p style="font-size:12.5px;color:var(--ink-muted);">Aucune entité détectée dans ce lot.</p>';

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => _traiterActionValidation(btn.dataset.itemId, btn.dataset.action, batchId));
  });

  _majBoutonConfirmer(items);
}

function _renderLigneValidation(item) {
  const enAttente  = item.statut === 'doublon_possible' || (item.confiance === 'basse');
  const dejaConnu  = item.statut === 'deja_existant';
  const couleur    = dejaConnu ? 'var(--ink-muted)' : enAttente ? 'var(--ui-orange, #c77)' : 'var(--ui-green)';
  const nomAffiche = item.champs.nom || item.champs.ref || '(sans nom)';

  return `<div data-item-row="${item.id}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-left:3px solid ${couleur};margin-bottom:4px;font-size:12px;">
    <div>
      <strong>${esc(nomAffiche)}</strong>
      <span style="color:var(--ink-muted);margin-left:6px;">confiance ${item.confiance}${dejaConnu ? ' — déjà existant' : ''}${item.statut === 'doublon_possible' ? ' — doublon possible' : ''}</span>
    </div>
    ${dejaConnu ? '' : `<div style="display:flex;gap:4px;">
      <button class="btn btn-outline btn-sm" data-item-id="${item.id}" data-action="confirmer">✓</button>
      <button class="btn btn-outline btn-sm" data-item-id="${item.id}" data-action="ignorer">✗</button>
    </div>`}
  </div>`;
}

async function _traiterActionValidation(itemId, action, batchId) {
  const statut = action === 'confirmer' ? 'confirme' : 'ignore';
  await updateImportScanItem(itemId, { statut });
  await _renderEcranValidation(batchId);
}

function _majBoutonConfirmer(items) {
  const btn = document.getElementById('importBtnConfirmer');
  if (!btn) return;
  const enAttente = items.some(i => i.statut === 'a_creer' || i.statut === 'doublon_possible');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.textContent = enAttente ? 'Importer (les lignes en attente seront ignorées)' : 'Importer la sélection';
}

async function _confirmerImport(batchId) {
  const btn = document.getElementById('importBtnConfirmer');
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }

  const items = await getImportScanItems(batchId);
  const aImporter = items.filter(i => i.statut === 'a_creer' || i.statut === 'confirme');

  const counts = { clients: 0, fournisseurs: 0, articles: 0, produits: 0 };
  const errors = [];

  for (const item of aImporter) {
    try {
      if (item.type_entite === 'client' && item.champs.nom) {
        await createClient({ nom: item.champs.nom, siret: item.champs.siret, email: item.champs.email, tel: item.champs.tel, adresse: item.champs.adresse, contact: item.champs.contact, cpt: item.champs.cpt, notes: item.champs.notes });
        counts.clients++;
      } else if (item.type_entite === 'fournisseur' && item.champs.nom) {
        await createFournisseur({ nom: item.champs.nom, siret: item.champs.siret, contact: item.champs.contact, email: item.champs.email, tel: item.champs.tel, adresse: item.champs.adresse, iban: item.champs.iban, delai: item.champs.delai, categorie: (item.champs.categorie || '').toLowerCase() });
        counts.fournisseurs++;
      } else if (item.type_entite === 'article' && item.champs.ref && item.champs.nom) {
        await createArticle({ ref: item.champs.ref, nom: item.champs.nom, categorie: (item.champs.categorie || 'autre').toLowerCase(), unite: item.champs.unite || 'unité', prix: parseFloat(String(item.champs.prix || '0').replace(',', '.')) || 0, fournisseur: item.champs.fournisseur || '', seuil: parseInt(item.champs.seuil || '0') || 0, stock: parseFloat(String(item.champs.stock || '0').replace(',', '.')) || 0 });
        counts.articles++;
      } else if (item.type_entite === 'produit' && item.champs.ref && item.champs.nom) {
        await createProduit({ ref: item.champs.ref, nom: item.champs.nom, prix_vente: parseFloat(String(item.champs.prix || '0').replace(',', '.')) || 0, seuil: parseInt(item.champs.seuil || '0') || 0, stock: parseFloat(String(item.champs.stock || '0').replace(',', '.')) || 0 });
        counts.produits++;
      } else {
        errors.push(`${item.type_entite} ignoré : champ obligatoire manquant`);
        continue;
      }
      await updateImportScanItem(item.id, { statut: 'confirme' });
    } catch (err) {
      errors.push(`${item.type_entite} ${item.champs.nom || item.champs.ref} : ${err.message}`);
    }
  }

  await deleteImportScanItems(batchId);

  if (btn) { btn.disabled = false; btn.textContent = 'Importer la sélection'; }
  closeModal('modalImportMasse');
  _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (errors.length) {
    showToast(`⚠ ${total} importés, ${errors.length} erreur(s). Voir console.`, 'warn');
    errors.forEach(e => console.warn('[ImportIA]', e));
  } else {
    showToast(`✅ Import : ${counts.clients} clients, ${counts.fournisseurs} fournisseurs, ${counts.articles} articles, ${counts.produits} produits.`);
  }

  const entities = Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => k);
  if (entities.length) {
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'import_ia', entities } }));
  }
}
```

- [ ] **Step 4: Valider la syntaxe**

Run: `node --check js/modules/admin.js`

- [ ] **Step 5: Vérification manuelle — cas nominal complet**

Flux complet en session réelle : déposer 1 PDF client + 1 PDF fournisseur lisibles → attendre la fin du scan → écran de validation affiche 2 lignes pré-cochées (confiance haute) → clic "Importer" → vérifier en base que le client et le fournisseur sont créés, que la modal se ferme, que le toast de succès s'affiche, que `admin.render()` a rechargé les listes visibles à l'écran.

- [ ] **Step 6: Vérification manuelle — cas ambigu**

Déposer un document dont le nom du client est proche d'un client déjà existant mais sans email/tel/siret pour confirmer → vérifier que la ligne apparaît surlignée, non pré-cochée, et que le clic "✓" puis "Importer" la traite correctement sans créer de doublon.

- [ ] **Step 7: Commit**

```bash
git add js/modules/admin.js app.html
git commit -m "feat(admin): ecran de validation et import final du scan IA"
```

---

### Tâche 9 : admin.js — branchement de la dropzone et import direct des anciens modèles

**Files:**
- Modify: `js/modules/admin.js` (remplacer `_bindImportMasse` et ajouter `_importerModelesConnus`, réutilisant la logique déjà présente dans l'ancien `_massImport` pour les 4 types concernés)

**Interfaces:**
- Consumes: `_onFichiersDeposes` (Tâche 6), `_detecterTypeModele` (Tâche 4), `createClient`/`createFournisseur`/`createArticle`/`createProduit`.
- Produces: `_bindImportIA()` appelée depuis `init()` du module (remplace l'appel à `_bindImportMasse()` existant, ligne 49).

- [ ] **Step 1: Remplacer `_bindImportMasse` par `_bindImportIA`**

Dans `js/modules/admin.js`, remplacer entièrement le corps actuel de `_bindImportMasse` (lignes 743-782, la fonction qui générait les zones par type) par :
```js
function _bindImportIA() {
  const dropzone = document.getElementById('importDropzone');
  const input    = document.getElementById('importFileInput');
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => _onFichiersDeposes(e.target.files));

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--ui-green)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--ui-brd)'; });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--ui-brd)';
    if (e.dataTransfer.files.length) _onFichiersDeposes(e.dataTransfer.files);
  });

  document.getElementById('importBtnConfirmer')?.addEventListener('click', () => {
    const batchId = document.getElementById('importValidation')?.dataset.batchId;
    if (batchId) _confirmerImport(batchId);
  });
}
```

Mettre à jour l'appel dans `init()`, ligne 49 : remplacer `_bindImportMasse();` par `_bindImportIA();`.

- [ ] **Step 2: Ajouter l'import direct pour les anciens modèles reconnus**

```js
async function _importerModelesConnus(excelDirects) {
  const counts = { clients: 0, fournisseurs: 0, articles: 0, produits: 0 };
  const errors = [];

  for (const { file, type } of excelDirects) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const rows = await _lireLignesFichier(file, ext);

    for (const r of rows) {
      try {
        if (type === 'clients') {
          const nom = String(r.nom || r.Nom || '').trim();
          if (!nom || _clients.find(c => c.nom === nom)) continue;
          const created = await createClient({ nom, email: String(r.email || '').trim(), tel: String(r.tel || '').trim(), adresse: String(r.adresse || '').trim(), notes: String(r.notes || '').trim() });
          _clients.push(created); counts.clients++;
        } else if (type === 'fournisseurs') {
          const nom = String(r.nom || r.Nom || '').trim();
          if (!nom || _fournisseurs.find(f => f.nom === nom)) continue;
          const created = await createFournisseur({ nom, contact: String(r.contact || '').trim(), email: String(r.email || '').trim(), tel: String(r.tel || '').trim(), adresse: String(r.adresse || '').trim(), delai: String(r.delai || '').trim(), categorie: String(r.categorie || '').trim().toLowerCase() });
          _fournisseurs.push(created); counts.fournisseurs++;
        } else if (type === 'articles') {
          const ref = String(r.ref || '').trim();
          const nom = String(r.nom || r.Nom || '').trim();
          if (!ref || !nom || _articles.find(a => a.ref === ref)) continue;
          const created = await createArticle({ ref, nom, categorie: String(r.categorie || 'autre').trim().toLowerCase(), unite: String(r.unite || 'unité').trim(), prix: parseFloat(String(r.prix || '0').replace(',', '.')) || 0, fournisseur: String(r.fournisseur || '').trim(), seuil: parseInt(r.seuil || '0') || 0, stock: parseFloat(String(r.stock || '0').replace(',', '.')) || 0 });
          _articles.push(created); counts.articles++;
        } else if (type === 'produits') {
          const ref = String(r.ref || '').trim();
          const nom = String(r.nom || r.Nom || '').trim();
          if (!ref || !nom || _produits.find(p => p.ref === ref)) continue;
          const created = await createProduit({ ref, nom, prix_vente: parseFloat(String(r.prix || '0').replace(',', '.')) || 0, seuil: parseInt(r.seuil || '0') || 0, stock: parseFloat(String(r.stock || '0').replace(',', '.')) || 0 });
          _produits.push(created); counts.produits++;
        }
      } catch (err) { errors.push(`${type} : ${err.message}`); }
    }
  }

  _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total) showToast(`✅ ${total} lignes importées directement (format déjà reconnu).`);
  if (errors.length) errors.forEach(e => console.warn('[ImportModeleConnu]', e));
  if (total) document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'import_ia', entities: Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => k) } }));
}

function _lireLignesFichier(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (ext === 'csv') {
          const lines   = String(e.target.result).split('\n').filter(l => l.trim());
          const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''));
          resolve(lines.slice(1).map(line => {
            const vals = line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
            const obj  = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
          }));
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }));
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier échouée'));
    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}
```

Supprimer les fonctions devenues mortes : `_massLoad`, `_massUpdateTotal`, `_cap` (si non utilisée ailleurs — vérifier par `grep -n "_cap(" js/modules/admin.js` avant suppression), l'ancien corps de `_massImport` pour les blocs clients/fournisseurs/articles/produits (le bloc `recettes` et `commandes` de `_massImport` reste, hors scope de cette tâche — cf. section 10 du spec), et `_dlTemplate` peut rester en fonction non appelée par défaut ou être branchée à un lien discret "besoin d'un format précis ?" — décision produit mineure laissée à l'utilisateur au moment de la revue de cette tâche, ne pas la prendre unilatéralement.

- [ ] **Step 3: Valider la syntaxe**

Run: `node --check js/modules/admin.js`

- [ ] **Step 4: Vérification manuelle — cas ancien modèle**

Reprendre le test de la Tâche 6 Step 4 : déposer un fichier `arteasy_modele_clients.xlsx` généré par l'ancienne fonction `_dlTemplate('clients')`, vérifier l'import direct sans passer par le scan IA, toast de confirmation affiché, client visible dans la liste après rechargement.

- [ ] **Step 5: Commit**

```bash
git add js/modules/admin.js
git commit -m "feat(admin): branchement dropzone unique + import direct anciens modeles"
```

---

### Tâche 10 : Vérification finale et rapport de session

**Files:**
- Aucun fichier de code — vérification et documentation uniquement.

- [ ] **Step 1: Script de vérification (Règle 12 du projet)**

```bash
# Patterns attendus présents
grep -q "_detecterTypeModele" js/modules/admin.js && echo "OK detection modele"
grep -q "_matchEntiteExistante" js/modules/admin.js && echo "OK dedup"
grep -q "_lancerScanLot" js/modules/admin.js && echo "OK orchestration scan"
grep -q "_confirmerImport" js/modules/admin.js && echo "OK import final"
grep -q "import_ia" app.html && echo "OK listener etendu"
grep -q "/api/ai-extract-batch" netlify/functions/ai_extract_doc.js && echo "OK endpoint corrige"

# Patterns qui ne doivent plus apparaitre (dead code supprime)
grep -q "_massLoad\b" js/modules/admin.js && echo "ATTENTION _massLoad encore present" || echo "OK _massLoad supprime"

# Integrite syntaxique de tous les fichiers touches
node --check js/db.js && node --check js/modules/admin.js && node --check netlify/functions/ai_extract_doc.js && node --check js/config.js && echo "OK syntaxe tous fichiers"
```

- [ ] **Step 2: Simulation des scénarios Règle 21B**

Dérouler manuellement, en session réelle (compte de test), et cocher chacun :
```
[ ] Cas vide — PDF vierge déposé seul → document_type_detecte "illisible", écran de validation affiche "Aucune entité détectée", aucune erreur technique visible
[ ] Cas nominal — 1 PDF client clair → 1 ligne pré-cochée confiance haute, import en 1 clic
[ ] Cas doublon — même fournisseur dans 2 fichiers du lot → 1 seule création, l'autre marquée existant/doublon
[ ] Cas multiple — 10+ fichiers mélangés PDF/Excel/image → progression fluide, un échec isolé n'arrête pas le lot
[ ] Cas limite — document avec nom de client vide → jamais envoyé en insert, ligne absente ou rejetée proprement
[ ] Cas interdit — relancer l'onboarding après qu'il soit déjà marqué utilisé → repasse bien sous le quota mensuel standard (vérifier via ai_usage)
[ ] Cas temporel — fermer l'onglet pendant un scan de 10 fichiers, rouvrir 5 minutes après → items déjà scannés retrouvables via getImportScanItems(batchId) en base (reprise complète de l'écran non couverte par ce plan — limitation connue, voir note ci-dessous)
```

Note : la reprise automatique de l'écran de validation après fermeture d'onglet (détection via `getOpenImportBatch()`) n'est pas câblée dans ce plan — les fonctions `db.js` existent (Tâche 2) mais aucune tâche n'appelle `getOpenImportBatch()` au chargement du module Admin. Si ce cas s'avère fréquent en usage réel, ajouter une tâche courte : dans `init()` de `admin.js`, appeler `getOpenImportBatch()` et, si non nul, proposer "Reprendre le scan en cours" au lieu de rouvrir une dropzone vide.

- [ ] **Step 3: Test E2E Playwright (pattern existant du projet)**

Créer `tests/import-ia-admin.spec.py` sur le modèle de `tests/flux-complet.spec.py` (connexion réelle, navigation vers Admin, dépôt d'un fichier de test via `page.set_input_files`, attente de la fin du scan, vérification de la présence du toast de succès et de la nouvelle entrée dans la liste clients). Écrit et exécuté manuellement par l'utilisateur ou en session suivante, hors scope strict de ce plan si le temps manque — mais recommandé avant mise en prod vu l'ampleur du changement.

- [ ] **Step 4: Mettre à jour le rapport de session**

Ajouter une entrée dans `.claude/Rapport_developpement_code_DDMMYY.md` du jour de livraison, format standard du projet (section LIVRABLES PAR THÉMATIQUE + ÉTAT DE L'APPLICATION + PROCHAINES ÉTAPES), en listant explicitement la limitation de reprise automatique notée au Step 2.

---

## Self-Review

Couverture du spec : section 3 (architecture Option C) → Tâches 1, 2, 6. Section 4 (pipeline 4 étapes) → Tâches 4 (étape 1), 6 (étape 2), 5+7 (étape 3), 8 (étape 4). Section 5 (table staging) → Tâche 1. Section 6 (contrat fonction IA) → Tâche 3. Section 7 (garde-fous taille/format) → Tâche 6 Step 1 (`TAILLE_MAX`, `EXT_OK`). Section 8 (vérification schéma) → Tâche 1 Step 2. Section 9 (scénarios Règle 21B) → Tâche 10 Step 2. Section 10 (hors scope) → respecté, `_massImport` recettes/commandes non touché, `_dlTemplate` laissé en décision ouverte plutôt que supprimé unilatéralement.

Point ouvert assumé : la reprise automatique après fermeture d'onglet en cours de scan (mentionnée dans le spec comme bénéfice de l'option C) est rendue possible par les données en base (Tâche 2) mais son branchement UI n'est pas dans ce plan — noté explicitement en Tâche 10 plutôt que laissé en zone grise, à trancher avec l'utilisateur si le besoin se confirme en usage réel.
