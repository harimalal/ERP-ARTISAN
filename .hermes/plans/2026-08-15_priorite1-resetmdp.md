# ARTEASY — Priorité 1 (flux commande→facturation) + Reset mot de passe

> **Mode :** plan puis exécution en agents séquencés, gate de vérification entre chaque étape, double-check Playwright.
> **Objectif :** bon du premier coup. Aucune étape ne démarre sans que la précédente soit vérifiée.

**Goal:** Fiabiliser la transmission d'information commande→facturation (lien client_id/fournisseur_id, lignes de facture figées, numérotation séquentielle serveur, TVA multi-taux) et sécuriser le reset de mot de passe.

**Architecture:** Netlify + Supabase + Vanilla JS. Les données passent par `js/db.js` (point unique). Les migrations SQL se font côté Supabase (SQL editor ou clé service). Le frontend reste en modules ES (`js/modules/*.js`).

**Tech Stack:** Supabase (Postgres + PostgREST + Auth), Netlify Functions, Vanilla JS, Playwright (v1.61.0, node v22) pour le double-check.

---

## PRÉREQUIS BLOQUANTS (à confirmer avant toute exécution)

1. **Schéma Supabase exact.** Aucun fichier SQL dans le repo, et l'API anon est bloquée par RLS (tables vides en lecture). Pour faire les migrations (nouvelles colonnes, table `facture_lignes`, fonction RPC de numérotation), il faut l'un des deux :
   - la clé `SUPABASE_SERVICE_KEY` (déjà dans les env vars Netlify, copiable depuis le dashboard Supabase), OU
   - un dump du schéma (SQL editor → export).

2. **URL de redirection reset mdp.** Le code envoie `redirectTo: origin + '/login.html'`. Hari dit avoir ajouté l'URL dans Supabase. Il faut confirmer la valeur EXACTE ajoutée dans *Authentication → URL Configuration → Redirect URLs* (et Site URL). Si Supabase contient `https://arteasy.fr/login` mais que le code envoie `https://arteasy.fr/login.html`, le lien est rejeté.

3. **Compte de test.** Pour le double-check Playwright du flux complet (connexion → commande → livraison → facture), un compte de test avec un tenant peuplé (ou vide) est nécessaire.

---

## CHANTIER A — Priorité 1 : flux commande → facturation

### Étape A0 — Récupérer le schéma exact (GATE)
- Lire `information_schema.columns` pour : `clients`, `fournisseurs`, `commandes`, `commande_lignes`, `factures`, `achats`, `tenants`, `articles`, `produits`, `recettes`.
- Noter les colonnes existantes, en particulier : `commandes.client_id` existe-t-il déjà ? `factures` a-t-il `client_id`, `siret_client`, `taux_tva` ? `achats` a-t-il `fournisseur_id` ?
- **Vérification :** liste des colonnes par table consignée dans le plan. Sans ça, on ne code pas.

### Étape A1 — Migration SQL (GATE)
Créer (via SQL editor ou clé service) :
1. Colonne `client_id uuid` sur `commandes` et `factures` (FK → clients.id, nullable pour rétro-compat).
2. Colonne `fournisseur_id uuid` sur `achats` (FK → fournisseurs.id).
3. Colonne `siret_client text` + `adresse_client text` sur `factures` (mentions légales).
4. Colonne `taux_tva numeric` déjà présente sur `factures` (vérifier) ; ajouter `taux_tva` par ligne si absent sur `commande_lignes`.
5. Table `facture_lignes` : `id uuid pk`, `tenant_id uuid`, `facture_id uuid fk`, `produit_id uuid`, `produit_nom text`, `quantite numeric`, `prix_unitaire numeric`, `taux_tva numeric`, `total_ht numeric`, `total_ttc numeric`, `created_at`.
6. Fonction RPC `next_ref(prefix text)` : séquence par tenant, retourne `CMD0001`, `FAC0001`, `BC0001`, `LIV0001` sans trou, thread-safe (SELECT ... FOR UPDATE sur une table `compteurs`).
7. Table `compteurs` : `tenant_id uuid`, `prefix text`, `valeur int`, PK (tenant_id, prefix).
- **Vérification :** `SELECT` de chaque objet créé + test manuel de `next_ref` (2 appels consécutifs → 2 valeurs distinctes).

### Étape A2 — db.js : nouvelles fonctions (GATE)
- `nextRefServeur(prefix)` → appelle la RPC `next_ref`.
- `getFactureLignes(factureId)`, `createFactureLignes(factureId, lignes)`.
- `getClientById(id)`, `getFournisseurById(id)`.
- Modifier `createCommande` pour accepter et persister `client_id`.
- Modifier `createFacture` pour accepter `client_id`, `siret_client`, `adresse_client`.
- Modifier `createAchat` pour accepter `fournisseur_id`.
- **Vérification :** `node --check` sur db.js + revue des signatures.

### Étape A3 — commandes.js : lier client_id (GATE)
- Dans `_saveCommande`, résoudre le client sélectionné en `client_id` (via `getClientByNom` ou `upsertClient`) et le passer à `createCommande`.
- Remplacer `nextRef('CMD', _commandes)` par `await nextRefServeur('CMD')`.
- **Vérification :** `node --check` + scénario Règle 21B (client nouveau vs existant).

### Étape A4 — livraisons.js : figer les lignes + TVA multi-taux (GATE)
- Dans `saveLivraison`, après `createFacture`, insérer les lignes dans `facture_lignes` (copie figée depuis `commande_lignes`).
- Remplacer `taux_tva: 20` en dur par le taux du tenant (ou par ligne).
- Remplacer `nextRef('FAC', _factures)` par `await nextRefServeur('FAC')`.
- Remplacer `nextRef('LIV', [])` par `await nextRefServeur('LIV')`.
- **Vérification :** `node --check` + scénario "facture figée même si commande modifiée après".

### Étape A5 — achats.js : fournisseur_id + numérotation serveur (GATE)
- Résoudre `fournisseur_id` à la création du BC et le persister.
- Remplacer `nextRef('BC', ...)` par `await nextRefServeur('BC')`.
- **Vérification :** `node --check`.

### Étape A6 — admin.js : TVA multi-taux (GATE)
- Ajouter un champ `taux_tva` par défaut dans la fiche entreprise (tenant) et l'utiliser partout au lieu de 20 en dur.
- **Vérification :** `node --check`.

### Étape A7 — PDF facture : mentions légales (GATE)
- Dans `_ouvrirFenetrePDFFac`, afficher SIREN + adresse du client (depuis `factures.siret_client` / `adresse_client`).
- Afficher les lignes depuis `facture_lignes` (figées) au lieu de `commande_lignes`.
- **Vérification :** `node --check` + aperçu visuel Playwright.

### Étape A8 — Double-check Playwright du flux complet (GATE FINAL)
- Script Playwright : connexion → créer commande (client + 2 produits) → vérifier BC auto-généré → livrer → vérifier facture créée avec lignes figées → ouvrir PDF → vérifier SIREN client + lignes.
- **Vérification :** toutes les assertions passent, zéro erreur console.

---

## CHANTIER B — Reset mot de passe

### Étape B1 — Vérifier l'URL de redirection (GATE)
- Confirmer la valeur exacte dans Supabase *Redirect URLs*.
- Aligner `redirectTo` du code sur cette valeur (probablement `https://arteasy.fr/login` au lieu de `/login.html`).
- **Vérification :** valeur alignée, test d'envoi réel.

### Étape B2 — Optimiser le token (GATE)
- Dans `detectResetToken`, après détection du hash, appeler explicitement `supabase.auth.getSession()` (ou attendre `onAuthStateChange`) avant d'afficher le panneau reset.
- Dans `handleReset`, vérifier qu'une session recovery est active avant `updateUser` ; sinon afficher "Lien expiré, redemandez un nouveau lien".
- Après reset réussi : `supabase.auth.signOut()` avant redirection login.
- **Vérification :** `node --check` + test Playwright de l'UI (panneaux forgot/reset s'affichent, messages d'erreur corrects).

### Étape B3 — Double-check Playwright UI (GATE FINAL)
- Script Playwright : charger `/login`, cliquer "Mot de passe oublié", vérifier panneau forgot, simuler hash recovery, vérifier panneau reset, tester validation (mots de passe différents → erreur).
- **Vérification :** assertions passent.

---

## FICHIERS IMPACTÉS

- `js/db.js` — nouvelles fonctions + signatures
- `js/modules/commandes.js` — client_id + nextRefServeur
- `js/modules/livraisons.js` — facture_lignes + TVA + nextRefServeur
- `js/modules/achats.js` — fournisseur_id + nextRefServeur
- `js/modules/admin.js` — TVA multi-taux
- `login.html` — reset mdp (redirectTo, token, signOut)
- Supabase — migrations SQL (colonnes, table facture_lignes, compteurs, RPC next_ref)
- `tests/` — scripts Playwright (nouveau)

## RISQUES / TRADE-OFFS

- **Rétro-compatibilité :** les nouvelles colonnes sont nullable, donc les données existantes (client_nom en texte) restent lisibles. Le lien client_id est progressif.
- **Numérotation serveur :** remplace le nextRef client. Risque de doublon éliminé, mais nécessite la RPC déployée AVANT le code frontend (ordre de déploiement : SQL → db.js → modules).
- **facture_lignes :** double le stockage (commande_lignes + facture_lignes) mais c'est le prix de la conformité (facture figée).
- **TVA multi-taux :** nécessite de définir le taux par produit ou par tenant. Décision à trancher en A6.

## ORDRE DE DÉPLOIEMENT (séquence obligatoire)

1. Migrations SQL (A1) — en premier, sinon le frontend casse.
2. db.js (A2).
3. Modules (A3 → A4 → A5 → A6 → A7).
4. login.html (B1 → B2).
5. Tests Playwright (A8, B3).
