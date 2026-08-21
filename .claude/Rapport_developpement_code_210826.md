# AppMee — Rapport de session
**Date :** 21 août 2026 | **Durée :** ~1 session (Tâches 1 à 10, plan onboarding-ia-admin) | **Statut :** Code complet, non déployé/testé en live

---

## 0. RÉSUMÉ EXÉCUTIF — LIRE EN PREMIER

Feature livrée : Onboarding IA — import Admin (dépôt libre de fichiers PDF/image/Excel, extraction multi-entités par IA, dédoublonnage déterministe, écran de validation, import final). Plan exécuté en 10 tâches (subagent-driven development), toutes complètes, review clean après 2 tours de correction (Tâche 3 : whitelist champs par type ; Tâche 9 : régression d'accès UI corrigée).

Ce que ce rapport documente n'est PAS une mise en production. Aucun code de cette feature n'a tourné dans un navigateur réel, contre une vraie base Supabase, ou via une vraie Netlify Function déployée. Tout le travail des Tâches 1 à 9 a été validé par : lecture de code croisée entre tâches, `node --check` sur chaque fichier touché, exécution de tests unitaires Node purs (mocks, sans réseau) pour la détection de modèle et le dédoublonnage, et relecture par un reviewer à chaque étape. Rien de tout cela ne remplace un test en session réelle avec compte utilisateur, base Supabase vivante et fonction Netlify déployée.

Trois blocages d'environnement expliquent pourquoi : pas d'accès à une base Supabase depuis cet environnement de travail (worktree isolé, pas de credentials DB), pas de serveur Netlify déployé, pas de navigateur pour piloter Playwright. La section 4 (PROCHAINES ÉTAPES) liste, dans l'ordre, tout ce qu'un humain doit faire pour faire passer cette feature de "code complet" à "vérifié en production".

---

## 1. LIVRABLES PAR THÉMATIQUE

| Thématique | Détail | Fichier(s) | Statut |
|------------|--------|-----------|--------|
| Table de staging du scan IA | `import_scan_items` (batch_id, type_entite, champs jsonb, confiance, statut, doublon_de_id, page_source, extrait_source) + colonne `tenants.onboarding_ia_utilise` | `supabase/migrations/2026-08-22_import_scan_items.sql` | ✅ Code complet, migration **NON appliquée** en base (pas d'accès DB depuis cet environnement) |
| Accès données staging + compteur onboarding | `createImportScanItem`, `getImportScanItems`, `updateImportScanItem`, `deleteImportScanItems`, `getOpenImportBatch`, `getOnboardingIAUtilise`, `markOnboardingIAUtilise` | `js/db.js` | ✅ Code complet, non testé contre une vraie table (la table n'existe pas encore en base) |
| Extraction IA multi-entités | Netlify Function réécrite : accepte PDF/image, détecte client/fournisseur/article/produit dans un même document, gère plusieurs documents logiques dans un même fichier (`page_source`), whitelist stricte des champs par type, gestion du quota (`ai_usage`) avec passe gratuite au premier usage (`onboarding_ia_utilise`) | `netlify/functions/ai_extract_doc.js` | ✅ Code complet, `node --check` propre, **jamais appelé en vrai** (pas de déploiement Netlify, pas d'appel Anthropic réel testé) |
| Détection déterministe d'anciens modèles Excel | `_detecterTypeModele(headers)` — reconnaît les 4 anciens formats CSV/Excel (articles, produits, clients, fournisseurs) par comparaison exacte des en-têtes, sans passer par l'IA | `js/modules/admin.js` | ✅ Code complet, couvert par test unitaire Node (`tests/unit/detecter-modele.test.mjs`) |
| Dédoublonnage déterministe | `_matchEntiteExistante(entite, existants)` — jamais laissé à l'IA, comparaison sur champ clé (email/siret/tel/iban/ref selon le type) puis nom approché en secours | `js/modules/admin.js` | ✅ Code complet, couvert par test unitaire Node (`tests/unit/dedup-entites.test.mjs`, 6 scénarios) |
| Application du dédoublonnage sur un lot scanné | `_deduplicquerLot(batchId)` — croise chaque item scanné contre la base existante ET contre le reste du lot en cours (doublon intra-lot) | `js/modules/admin.js` | ✅ Code complet, tracé manuellement (voir section 2 du présent rapport) |
| Orchestration du scan multi-fichiers | `_lancerScanLot` — pool de 3 workers concurrents, écriture progressive en staging (résilience si le navigateur crashe en cours de lot), échec d'un fichier isolé n'arrête pas le lot | `js/modules/admin.js` | ✅ Code complet, tracé manuellement |
| Écran de validation + import final | `_renderEcranValidation`, `_confirmerImport` — affichage par type d'entité, actions confirmer/ignorer par ligne, import en un clic des lignes `a_creer`/`confirme`, jamais d'insert si le champ obligatoire (nom, ou ref+nom) est vide | `js/modules/admin.js`, `app.html` | ✅ Code complet, tracé manuellement |
| Branchement dropzone unique + garde-fous | Une seule dropzone (`#importDropzone`) route vers l'IA ou l'import direct par ancien modèle selon détection ; garde-fous taille (15 Mo) et extension (`pdf,png,jpg,jpeg,webp,xlsx,xls,csv`) côté client | `js/modules/admin.js`, `app.html` | ✅ Code complet |
| Régression corrigée — accès import Excel recettes/commandes | La suppression du déclencheur `_massLoad` (ancien import masse) en Tâche 9 avait rendu l'import Excel des recettes et commandes inaccessible depuis l'UI (le code interne `_massImport` pour ces 2 types restait intact mais orphelin). Contredisait la Règle 19 (protéger l'existant) et la section 10 du spec ("l'ancien import Excel reste disponible en secours"). Corrigé par un point d'accès secondaire repliable "Import avancé (recettes, commandes)" dans la même modal, réutilisant `_massImport` tel quel pour ces 2 seuls types | `app.html`, `js/modules/admin.js` (commit `62f6c63`) | ✅ Corrigé, tracé — voir Ruling Tâche 9 dans le ledger du plan |
| Test E2E Playwright (écrit, non exécuté) | Connexion réelle → Admin → dépôt PDF client de test → attente scan → écran validation → import → toast → vérification liste Clients | `tests/import-ia-admin.spec.py`, `tests/fixtures/client-test.pdf` | ⚠️ Écrit, **non exécuté** — aucun serveur local ni navigateur disponible dans cet environnement |

---

## 2. VÉRIFICATIONS EFFECTUÉES DANS CETTE SESSION (Tâche 10)

### 2.1 — Script de vérification (Règle 12)

Exécuté réellement dans le worktree, sortie brute :

```
=== Patterns attendus presents ===
OK detection modele
OK dedup
OK orchestration scan
OK import final
OK listener etendu
OK endpoint corrige
=== Patterns qui ne doivent plus apparaitre ===
OK _massLoad supprime
=== Integrite syntaxique ===
OK syntaxe tous fichiers
```

Score : 7/7 ✅. Les 4 fichiers touchés (`js/db.js`, `js/modules/admin.js`, `netlify/functions/ai_extract_doc.js`, `js/config.js`) sont syntaxiquement valides (`node --check`). Aucune trace de l'ancien déclencheur `_massLoad`.

### 2.2 — Simulation des scénarios Règle 21B — statut honnête

Aucun de ces 7 scénarios n'a pu être **exécuté en session réelle** (pas de compte de test, pas de base Supabase vivante, pas de fonction Netlify déployée). Ce qui suit est un **traçage code par code** de chaque scénario à travers l'implémentation réelle (fichiers et numéros de ligne cités), pas une exécution vérifiée. Chaque ligne précise explicitement ce qui est tracé vs ce qui reste à confirmer en live.

**[ ] Cas vide** — PDF vierge déposé seul
Tracé : `netlify/functions/ai_extract_doc.js` retourne `document_type_detecte: "illisible", entites: []` quand le modèle IA ne trouve rien ou que la réponse est illisible (fonction `parseReponseIA`, ligne ~147-158). Côté client, `_scannerFichierIA` (admin.js ligne 849) ne crée aucune ligne `import_scan_items` si `data.entites` est vide. `_renderEcranValidation` (ligne 1035) affiche alors `"Aucune entité détectée dans ce lot."` (ligne 1049) — pas d'erreur technique visible. **Code cohérent avec le scénario attendu par inspection. Nécessite une confirmation live** (dépend du comportement réel du modèle Claude sur un vrai PDF vierge, jamais observé).

**[ ] Cas nominal** — 1 PDF client clair → 1 ligne pré-cochée confiance haute, import en 1 clic
Tracé : un item avec `statut: 'a_creer'` (dédoublonnage n'a rien trouvé) est inclus par défaut dans `aImporter` au moment de `_confirmerImport` (admin.js ligne 1096 : `items.filter(i => i.statut === 'a_creer' || i.statut === 'confirme')`) — donc pas besoin de cocher explicitement une case, le clic sur "Importer la sélection" suffit. **Code cohérent par inspection. Nécessite confirmation live** (dépend de la qualité réelle d'extraction IA sur un vrai document, jamais observée).

**[ ] Cas doublon** — même fournisseur dans 2 fichiers du lot → 1 seule création, l'autre marquée existant/doublon
Tracé en détail dans `_deduplicquerLot` (admin.js ligne 980) : le 1er item du fournisseur, non trouvé en base ni dans le lot déjà traité, prend `statut: 'a_creer'` et est ajouté à `dejaTraites`. Le 2e item (même fournisseur, fichier différent) est comparé contre `dejaTraites` via `_matchEntiteExistante` : match sur champ clé (siret/email/iban) ou nom approché → `contreLot.statut !== 'nouveau'` → `statut: 'doublon_possible'` (ligne 1004). Un item `doublon_possible` n'est PAS inclus dans `aImporter` sauf confirmation manuelle explicite de l'utilisateur. Résultat : 1 création, 1 marquée doublon possible — conforme. Note connue (documentée en Tâche 7, ledger) : `doublon_de_id` reste `null` pour ce cas précis (match intra-lot) — sans impact fonctionnel car l'UI ne lit que `item.statut`, jamais `doublon_de_id`. **Code cohérent par inspection, y compris ce détail mineur déjà documenté. Nécessite confirmation live** (dépend de la cohérence du champ clé extrait par l'IA entre les 2 fichiers).

**[ ] Cas multiple** — 10+ fichiers mélangés PDF/Excel/image → progression fluide, échec isolé n'arrête pas le lot
Tracé : `_lancerScanLot` (admin.js ligne 886) utilise un pool de 3 workers concurrents ; chaque appel `_scannerFichierIA` est encapsulé dans un `try/catch` qui ne relance jamais l'erreur — en cas d'échec, `onProgress` reçoit `{statut: 'echec', message}` et la boucle `_travailleur` continue sur le fichier suivant. Confirmé : un échec isolé ne bloque pas `Promise.all` des workers. **Finding découvert pendant cette vérification, non couvert par les tâches précédentes** : le garde-fou d'extension côté client (`EXT_OK`, admin.js ligne 915) accepte `xlsx/xls/csv` pour le scan IA de secours (si le fichier Excel ne correspond à aucun ancien modèle connu), mais côté serveur, `netlify/functions/ai_extract_doc.js` ligne 209 (`extOk`) n'autorise que `pdf/png/jpg/jpeg/webp` — un Excel/CSV non reconnu comme ancien modèle sera donc systématiquement rejeté par la fonction (`400 Extension non supportée`) s'il est envoyé au scan IA. Effet réel : conforme au scénario "échec isolé n'arrête pas le lot" (ce fichier échoue proprement, seul), mais un fichier Excel/CSV hors des 4 anciens modèles connus ne pourra JAMAIS être extrait par l'IA, contrairement à ce que suggère le texte de la dropzone ("Delia identifie automatiquement... Excel"). **À signaler à l'utilisateur — écart mineur entre le texte affiché et le comportement réel, pas un bug bloquant** (les 4 modèles Excel connus + tout PDF/image restent couverts).

**[ ] Cas limite** — document avec nom de client vide → jamais envoyé en insert
Tracé : `_confirmerImport` (admin.js ligne 1103) exige `item.champs.nom` (client/fournisseur) ou `item.champs.ref && item.champs.nom` (article/produit) avant d'appeler `createClient`/`createFournisseur`/`createArticle`/`createProduit`. Si absent, l'item tombe dans le `else` (ligne 1115) : `errors.push(...)`, `continue` — jamais d'appel `create*`. Ce comportement est indépendant de l'action de l'utilisateur dans l'écran de validation (même un item "confirmé" manuellement sans nom reste bloqué à l'import, la vérification est refaite au moment de l'import, pas seulement à l'affichage). L'item reste visible dans l'écran de validation sous le libellé `"(sans nom)"` (ligne 1062) plutôt que d'être masqué silencieusement. **Code cohérent par inspection, robuste même face à un clic utilisateur erroné. Nécessite confirmation live** pour l'expérience visuelle réelle du message d'erreur groupé.

**[ ] Cas interdit** — relancer l'onboarding après qu'il soit déjà marqué utilisé → repasse sous le quota mensuel standard
Tracé : `resoudreQuota` (`ai_extract_doc.js` ligne 78) lit `tenants.onboarding_ia_utilise`. Si `false` : passe gratuite illimitée (`hors_quota: true`), et `_lancerScanLot` (admin.js ligne 887) appelle `markOnboardingIAUtilise()` avant le premier scan du lot. Si `true` (déjà utilisé, cas du scénario) : quota mensuel standard appliqué selon le plan (`PLANS_QUOTA = { starter: 20, pro: 100, business: Infinity }`, ligne 28) contre la table `ai_usage`, avec `throw` bloquant si dépassé (ligne 100-102, code `QUOTA_EXCEEDED`, HTTP 429). Logique cohérente avec le scénario. **Code cohérent par inspection. Nécessite confirmation live** — dépend de données réelles dans `tenants.plan` et `ai_usage`, tables qui existent déjà en base (pas créées par ce plan) mais jamais exercées avec ce nouveau chemin de code.

**[ ] Cas temporel** — fermer l'onglet pendant un scan de 10 fichiers, rouvrir 5 min après → items retrouvables via `getImportScanItems(batchId)`
**Limitation connue et assumée, documentée explicitement dans le plan (Tâche 10, Step 2, note du brief).** La couche données fonctionne : `getImportScanItems(batchId)` (db.js ligne 773) permet bien de relire tous les items déjà écrits en staging pour un batch donné — l'écriture progressive de `_scannerFichierIA` (un `createImportScanItem` par entité extraite, au fur et à mesure, pas en fin de lot) garantit qu'aucune progression n'est perdue côté base. **Mais** aucune tâche de ce plan n'appelle `getOpenImportBatch()` (db.js ligne 805, qui existe et fonctionnerait) au chargement du module Admin — confirmé par grep : zéro occurrence de `getOpenImportBatch` dans `js/modules/admin.js`. Concrètement : si un utilisateur ferme l'onglet en plein scan et rouvre la modal Import 5 minutes après, il verra une dropzone vide, pas une reprise automatique de son lot en cours — alors que les données existent en base et seraient réaffichables. **Ce n'est pas un bug caché : c'est une limitation de périmètre assumée dans le plan.** Si ce cas s'avère fréquent en usage réel, ajouter une tâche courte : dans `init()` de `admin.js`, appeler `getOpenImportBatch()` et proposer "Reprendre le scan en cours" si non nul.

**Bilan Règle 21B : 6 scénarios sur 7 tracés comme cohérents par inspection de code (avec un finding mineur sur le cas multiple, extension Excel non reconnue), aucun exécuté en live. Le 7e (cas temporel) est une limitation de périmètre documentée et assumée, pas un point à "vérifier" mais un manque connu.** Voir section 4 pour la liste d'actions humaines nécessaires pour transformer ces traçages en vérifications réelles.

### 2.3 — Test E2E Playwright

Fichier écrit : `tests/import-ia-admin.spec.py`, sur le modèle de `tests/flux-complet.spec.py` (connexion réelle via `/tmp/test_creds.json`, helper `check()`, structure par étapes numérotées). Couvre : connexion, navigation Admin, ouverture modal Import, dépôt d'un fichier PDF de test (fixture fournie : `tests/fixtures/client-test.pdf`, PDF minimal généré contenant un nom de client, un SIRET et un email factices), attente de la fin du scan via `wait_for_function` sur l'affichage de `#importValidation` (timeout 60s, réaliste pour un vrai appel Anthropic), clic sur "Importer la sélection", vérification du toast, vérification que la modal se ferme, comparaison du nombre de lignes dans `#adminClientsTbody` avant/après.

**Non exécuté** — aucun serveur local (`localhost:8124`) lancé dans cet environnement, aucun `/tmp/test_creds.json` disponible, et de toute façon la fonction `/api/ai-extract-batch` ne peut pas répondre sans déploiement Netlify réel avec les 3 variables d'environnement configurées et la table `import_scan_items` existant en base. Ce test doit être exécuté par l'utilisateur (ou en session suivante avec accès à un environnement live) une fois les prérequis de la section 4 en place.

---

## 3. ÉTAT DE L'APPLICATION

### Modules métier

| Module | État | Notes |
|--------|------|-------|
| Dashboard | ✅ Fonctionnel | Non touché par ce plan |
| Stock Articles | ✅ Fonctionnel | Non touché — reste accessible via l'import Excel direct par ancien modèle si détecté, ou via le nouveau scan IA |
| Produits Finis | ✅ Fonctionnel | Idem Stock Articles |
| Commandes | ✅ Fonctionnel | Non touché par ce plan |
| Production | ✅ Fonctionnel | Non touché par ce plan |
| Achats | ✅ Fonctionnel | Non touché par ce plan |
| Livraisons & Factures | ✅ Fonctionnel | Non touché par ce plan |
| Recettes | ✅ Fonctionnel (import Excel restauré) | L'import Excel recettes reste accessible via "Import avancé" (repliable) dans la modal Import — régression Tâche 9 corrigée |
| Admin — Clients/Fournisseurs/Articles/Produits (référentiels) | ✅ Fonctionnel | Non touché par ce plan en dehors de l'ajout du bloc Import |
| **Admin — Onboarding IA import (nouvelle feature)** | ⚠️ **Code complet, non déployé/testé en live** | Dropzone unique, scan multi-entités par IA, dédoublonnage, écran de validation, import final. Migration DB non appliquée = **feature non fonctionnelle en l'état tant que la migration n'est pas passée** |

### Infrastructure

| Composant | État | Notes |
|-----------|------|-------|
| Supabase | ⚠️ Migration en attente | `supabase/migrations/2026-08-22_import_scan_items.sql` écrite et committée, **non appliquée**. La table `import_scan_items` et la colonne `tenants.onboarding_ia_utilise` n'existent pas encore en base — toute tentative d'usage de cette feature en l'état échouera (erreurs Supabase "relation does not exist" / colonne manquante) |
| Netlify | ⚠️ Non redéployé avec le nouveau code de la fonction | `ai_extract_doc.js` a été réécrit substantiellement (mode multi-entités au lieu du mode fixe) — nécessite un déploiement pour être actif en production |
| GitHub | ✅ Stable | Branche `feature/onboarding-ia-import-admin`, 13 commits, tous poussés localement dans le worktree (pas de push distant effectué dans cette session) |

---

## 4. PROCHAINES ÉTAPES

Liste consolidée de **tous** les REQUIRED_HUMAN_ACTION accumulés sur l'ensemble du plan (Tâches 1, 2, 3, 6, 10) — à traiter dans cet ordre, rien n'est fonctionnel avant l'étape 1 :

| Priorité | Action | Complexité | Fichier / Référence |
|----------|--------|-----------|---------|
| 1 — bloquant | Appliquer la migration `2026-08-22_import_scan_items.sql` dans le SQL Editor Supabase (crée `import_scan_items` + colonne `tenants.onboarding_ia_utilise`) | Faible | `supabase/migrations/2026-08-22_import_scan_items.sql` |
| 2 — bloquant | Vérifier `information_schema.columns` pour `import_scan_items` et `tenants.onboarding_ia_utilise` après application (confirmer que les colonnes correspondent exactement à ce que lit/écrit `js/db.js`) | Faible | Requête SQL fournie dans `task-1-report.md` |
| 3 — bloquant | Confirmer que la politique RLS appliquée sur `import_scan_items` suit bien le pattern déjà en place sur `facture_lignes_tenant` (migration `2026-08-15_priorite1_flux_facturation.sql`) + `js/auth.js` — pattern déduit et jugé cohérent par le reviewer de la Tâche 1, mais jamais vérifié contre une vraie politique RLS active | Faible | Voir Ruling Tâche 1 dans le ledger du plan |
| 4 — bloquant | Confirmer dans Netlify → Environment variables la présence des 3 variables : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` (nécessaires à `netlify/functions/ai_extract_doc.js`) | Faible | `.claude/debug_2_lancement.md` étape 5 |
| 5 — bloquant | Déployer la branche (ou merger + déployer) pour que `ai_extract_doc.js` réécrit (mode multi-entités) devienne actif | Faible | Déploiement Netlify standard |
| 6 | Dérouler en session réelle, avec un compte de test, les 7 scénarios Règle 21B tracés en section 2.2 de ce rapport — en particulier le cas doublon (fiabilité du champ clé extrait par l'IA) et le cas interdit (quota) | Moyenne | Voir section 2.2 |
| 7 | Exécuter `tests/import-ia-admin.spec.py` une fois les étapes 1-5 faites (nécessite `/tmp/test_creds.json` avec un compte réel) | Faible | `tests/import-ia-admin.spec.py` |
| 8 | Corriger ou clarifier l'écart trouvé en section 2.2 "Cas multiple" : soit ajouter `xlsx/xls/csv` à `extOk` côté `ai_extract_doc.js` (si l'intention est vraiment de tenter l'IA sur un Excel non reconnu), soit ajuster le texte de la dropzone pour ne plus laisser croire que tout Excel peut être extrait par l'IA | Faible | `netlify/functions/ai_extract_doc.js` ligne 209, ou `app.html` ligne ~878 |
| 9 — décision produit, non technique | Trancher si la reprise automatique de l'écran de validation après fermeture d'onglet (cas temporel, section 2.2) doit être câblée : appeler `getOpenImportBatch()` dans `init()` de `admin.js` et proposer "Reprendre le scan en cours" si un batch ouvert existe. Fonctions DB déjà prêtes (Tâche 2), ~15-20 lignes de câblage UI estimées | Faible | `js/modules/admin.js`, fonction `init()` |
| 10 — décision produit, non technique | `_dlTemplate` (téléchargement de modèle Excel type) a été laissé en décision ouverte en Tâche 9 plutôt que supprimé unilatéralement — statuer si ce bouton doit rester, être retiré, ou être mis à jour pour refléter le nouveau flux dropzone unique | Faible | Voir Ruling Tâche 9 dans le ledger du plan |

---

## 5. FICHIERS MODIFIÉS SUR L'ENSEMBLE DU PLAN (Tâches 1 à 10)

| Fichier | Chemin | Nature |
|---------|--------|--------|
| Migration table staging | `supabase/migrations/2026-08-22_import_scan_items.sql` | Nouveau — non appliqué en base |
| Accès données staging + onboarding | `js/db.js` | Modifié — +77 lignes (7 nouvelles fonctions) |
| Logique métier Admin (scan, dédup, validation, import) | `js/modules/admin.js` | Modifié en profondeur — +676/-lignes nettes (dead code `_massLoad` retiré, pipeline complet ajouté) |
| Fonction IA d'extraction multi-entités | `netlify/functions/ai_extract_doc.js` | Réécrit — mode multi-entités remplace le mode fixe (+270/-lignes nettes) |
| Endpoint IA (nom exporté) | `js/config.js` | Modifié — 1 ligne (`API.aiExtractDoc`) |
| Modal Import + listener étendu + bloc "Import avancé" | `app.html` | Modifié — +50 lignes |
| Tests unitaires détection modèle | `tests/unit/detecter-modele.test.mjs` | Nouveau |
| Tests unitaires dédoublonnage | `tests/unit/dedup-entites.test.mjs` | Nouveau |
| Infrastructure de test Node (import Supabase HTTPS) | `tests/unit/setup.mjs`, `tests/unit/loader.mjs` | Nouveau — ajouté pragmatiquement en Tâche 4, non demandé explicitement mais non bloquant |
| Test E2E Playwright (écrit, non exécuté) | `tests/import-ia-admin.spec.py` | Nouveau — Tâche 10 |
| Fixture PDF de test | `tests/fixtures/client-test.pdf` | Nouveau — Tâche 10, PDF minimal généré pour le test E2E |
| `.gitignore` | `.gitignore` | Modifié — +2 lignes |

---

## 6. RAPPEL D'EXÉCUTION

⚠ Rien de cette feature n'est utilisable tant que l'étape 1 de la section 4 (migration Supabase) n'est pas faite.
⚠ Ctrl+Shift+R obligatoire après tout déploiement, comme pour toute session AppMee.
⚠ Ce rapport est complet — état total à jour de l'application à l'issue du plan, pas uniquement le delta de la Tâche 10.
