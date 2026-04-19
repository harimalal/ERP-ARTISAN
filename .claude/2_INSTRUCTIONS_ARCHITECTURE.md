# AppMee — Instructions architecture & modification de code
**Version mise à jour :** Session #12 · 18 avril 2026

> Lire avant toute modification de code.
> L'architecture complète est accessible via le repo GitHub connecté au projet.
> En cas de bug → lire `debug_1_regles.md` puis `debug_2_lancement.md`.

---

## RÈGLES ABSOLUES APPMEE

### Règle 1 — tenantId
Toujours `getTenantId()` depuis `/js/auth.js`. **Jamais** `session.user.id`.
`user.id` = UUID Auth Supabase. `tenant_id` = UUID table `tenants`. Ce sont deux valeurs différentes.

### Règle 2 — Events custom
Chaque `dispatchEvent(new CustomEvent('appmee:xxx'))` dans un module **doit** avoir son listener dans `app.html`.

Listeners actifs à ce jour :
- `appmee:showPdf` ✓
- `appmee:editProduit` ✓
- `appmee:planifierOF` ✓
- `appmee:openAchatFor` ✓
- `appmee:datachanged` ✓
- `appmee:navigate` ✓
- `appmee:editFacture` ✓

Tout nouvel event dispatché → ajouter son listener dans `app.html` avant livraison.

### Règle 3 — URL Netlify Functions
- URL appelée : `/api/nom-avec-tirets`
- Nom fichier GitHub : `nom_underscore.js`
- **Jamais** `/.netlify/functions/nom`

### Règle 4 — Import masse
Toujours implémenter les vrais appels Supabase dans `_massImport()`. **Jamais** de note "à compléter".

### Règle 5 — Rechargement post-import
Après import masse → dispatcher `appmee:datachanged` avec `entity: 'import_masse'`.
Le listener dans `app.html` recharge tous les modules via `Promise.allSettled`.

### Règle 6 — Netlify Functions — logging
Toujours dans le catch principal :
```js
console.error('[nom_function] ERREUR:', err.message, err.stack)
```
Sans ça, les logs Netlify sont vides.

### Règle 7 — addEventListener vs onclick
Utiliser `onclick` (écrasé) au lieu de `addEventListener` (accumulé) quand `render()` est appelé plusieurs fois.

### Règle 8 — Ordre dispatch → openModal
Dispatcher `appmee:xxx` **avant** `openModal` — l'event est synchrone, l'init doit précéder l'affichage.

### Règle 9 — Un seul endroit ouvre chaque modal
Soit le module via `openModal`, soit `app.html` via listener — **jamais les deux**.

### Règle 10 — Jamais de fix sans diagnostic
Séquence : Cartographie → Diagnostic → Fix → Validation.
Ne jamais coder avant d'avoir identifié la cause racine.
→ Détail complet : `debug_1_regles.md`

### Règle 11 — Recharger les caches avant toute opération critique
Les caches locaux sont vides si l'onglet n'a jamais été visité.
Pattern obligatoire avant `nextRef` et avant tout `save` :
```js
try { [_achats, _articles] = await Promise.all([getAchats(), getArticles()]); } catch (_) {}
```
S'applique à : `achats.js`, `commandes.js`, `livraisons.js`, `production.js`
→ Détail complet : `debug_1_regles.md`

### Règle 12 — Vérification obligatoire avant livraison
Script de vérification systématique — patterns présents, patterns absents, intégrité fichier.
Score attendu : X/X. Jamais de livraison sans vérification.
→ Détail complet : `debug_1_regles.md`

### Règle 13 — Upload du fichier source avant tout fix
`project_knowledge_search` retourne des extraits, pas les fichiers complets.
Upload obligatoire avant tout `str_replace`.
→ Détail complet : `debug_1_regles.md`

### Règle 14 — Cliquer sur le lien fichier:ligne avant toute analyse
Le lien bleu `fichier.js:ligne:col` dans Chrome est toujours la vérité.
Ne jamais analyser le texte de l'erreur sans avoir cliqué le lien.
→ Détail complet : `debug_1_regles.md`

### Règle 15 — 2 erreurs de syntaxe = réécriture complète du fichier
Dès le 2ème patch chirurgical échoué → générer le fichier entier, valider avec `node`, livrer en Ctrl+A.
→ Détail complet : `debug_1_regles.md`

### Règle 16 — Jamais éditer du JS dans GitHub
Seule opération autorisée : Ctrl+A → colle fichier complet validé → commit.
→ Détail complet : `debug_1_regles.md`

### Règle 17 — Délégation d'événements sur tableau : utiliser document en capture
Quand `tbody.onclick` est écrasé entre les renders, poser le listener sur `document` en phase capture (`true`), une seule fois dans `init()`, avec un guard `_delegationBound`.
Pattern à appliquer systématiquement pour tous les tableaux avec boutons d'action.

### Règle 18 — Toujours évaluer l'impact infrastructure avant de proposer
Avant toute modification de `netlify.toml`, `db.js`, headers HTTP ou Netlify Functions :
- Quantifier l'impact bandwidth / quota Supabase / performances
- Signaler si la solution augmente la consommation de ressources
- Proposer l'alternative la moins coûteuse en ressources qui résout le problème
→ Détail complet : `debug_4_posture.md`

### Règle 19 — Protéger ce qui fonctionne
Avant tout fix, vérifier que les features "✅ Fonctionnel" du rapport restent intactes.
Si un fix risque de casser une feature existante → le signaler avant de coder.
→ Détail complet : `debug_4_posture.md`

### Règle 20 — Proposer la solution la moins invasive
Hiérarchie : Configuration → Correction → Ajout → Refactoring → Réécriture.
Toujours commencer par le niveau le plus bas qui résout le problème.
→ Détail complet : `debug_4_posture.md`

### Règle 21 — Simuler tous les scénarios avant toute livraison
**Jamais de livraison sans simulation complète. Le code n'est pas fini quand il compile — il est fini quand un utilisateur réel peut s'en servir sans se poser de questions.**

#### 21A — Scénarios d'appel (contextes techniques)
```
□ Depuis où cette fonction peut-elle être appelée ?
□ Le DOM est-il garanti dans chaque contexte ? → Guard if (!el) return si non
□ Le cache est-il chargé dans chaque contexte ?
```

#### 21B — Scénarios de données (parcours utilisateur réels)
```
□ Cas vide        — aucune donnée existante en base
□ Cas nominal     — 1 élément, tout va bien
□ Cas doublon     — même entité déjà présente → que se passe-t-il ?
□ Cas multiple    — N éléments, comportement à l'échelle
□ Cas limite      — valeurs nulles, champs vides, prix à 0
□ Cas interdit    — statut qui doit bloquer l'action (envoye, recu, annule)
□ Cas temporel    — même action le lendemain, la semaine d'après
```

#### 21C — Question obligatoire avant livraison
> *"Si un artisan fait ça dans sa vraie journée de travail, qu'est-ce qu'il voit à l'écran ?"*

Si la réponse contient "doublon", "données perdues", "comportement inattendu" → **ne pas livrer**. Corriger d'abord.

#### Exemple vécu — BC multi-articles (Session #12)
Scénario manqué : "artisan commande Pot verre 50ml, puis le recommande 3 jours après"
→ `createAchat` aurait créé un doublon → non livrable avant correction `updateAchat`

→ Détail complet : `debug_4_posture.md`

---

## CONVENTIONS DE CODE

| Convention | Règle |
|---|---|
| Fonctions privées | Préfixe `_` — ex: `_renderTable`, `_bindForm` |
| Exports publics | `init()` et `render()` obligatoires dans chaque module |
| Cache local | Chaque module maintient son cache rechargé au `render()` |
| Clés CSV | `produit_ref` pour recettes, `commande_ref` pour commandes |
| Séparation create/edit | Variable `_editId = null` — `_handleSave()` route vers `_saveNew()` ou `_saveEdit()` |
| initXModal() | Toujours `async` — recharge ses propres données depuis Supabase, jamais depuis un paramètre |

---

## VÉRIFIER LE SCHÉMA SUPABASE AVANT TOUT INSERT

Avant d'ajouter un champ dans un payload `insert` ou `update`, vérifier qu'il existe en base :
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'X' AND table_schema = 'public'
ORDER BY ordinal_position;
```
Ne jamais supposer qu'un champ existe parce qu'il est dans le cache JS.
Les colonnes `GENERATED ALWAYS AS` ne peuvent pas recevoir de valeur — les exclure du payload.

---

## CHECKLIST LISTENERS MODALS — Avant livraison

```
data-modal="modalCommande"     → initCommandeModal()      ✓
data-modal="modalPlanifier"    → initPlanifierModal()     ✓
data-modal="modalNewFacture"   → initNewFactureModal()    ✓
data-modal="modalAchat"        → initAchatModal()         ✓
data-modal="modalNewArticle"   → initNewArticleModal()    ✓
data-modal="modalNewProduit"   → initNewProduitModal()    ✓
```

---

## MODIFICATION DE CODE — Protocole

### Avant de toucher au code
1. **Lire le fichier concerné** — upload obligatoire (Règle 13)
2. **Évaluer l'impact** — fichiers impactés, dépendances, passe unique ou séquence
3. **Screenshot si UI** — ne jamais corriger un bug visuel sans voir l'écran
4. **Réécriture si 2ème erreur de syntaxe** — pas de patch chirurgical (Règle 15)

### Classification des modifications

| Type | Définition | Exemple |
|---|---|---|
| Isolée | 1 fichier, 0 dépendance | Supprimer un bouton, corriger un label |
| Locale | 1 fichier, impact sur 1 autre | Nouvelle fonction + listener dans app.html |
| Transversale | 2+ fichiers interdépendants | Nouvel event dispatché ET écouté |
| Structurelle | Touche l'architecture globale | Nouveau module, nouvelle table, nouvelle Function |

### Passe unique — quand c'est sûr
- Fichiers différents sans appel croisé
- Suppressions ou corrections locales
- Moins de 4 fichiers, pas de nouveau contrat entre modules

### Séquence obligatoire — quand c'est risqué
- Une modif crée une fonction qu'une autre appelle
- Touche `db.js`, `auth.js` ou `ui.js`
- Plus de 4 fichiers avec interactions

### Présentation avant de coder
```
X modifications détectées :

EN UNE PASSE :
- [modif A] → fichier X — isolée

EN SÉQUENCE :
- Bloc 1 : [modif B] → à faire en premier
- Bloc 2 : [modif C] → nécessite que B soit testé

Impact utilisateur : aucun / [feature concernée]
Impact infrastructure : neutre / [détail]
Risque : Faible / Moyen / Élevé — Je lance ?
```

### Vérification avant livraison
Script de vérification systématique (Règle 12) :
- Patterns clés présents (fonctions, listeners, exports)
- Patterns supprimés bien absents
- Intégrité fichier (pas de troncature)
- Score : X/Y vérifications passées

**Jamais de livraison sans vérification.**

---

## SÉCURITÉ — Non négociable

- `SUPABASE_SERVICE_KEY` et `ANTHROPIC_API_KEY` → jamais dans le frontend
- RLS Supabase activé — chaque tenant ne voit que ses données
- Bouton réseau → désactiver pendant l'appel (anti-double clic)
- Webhooks entrants → logique idempotente (peuvent arriver en double)

---

## CHECKLIST AVANT DÉPLOIEMENT PROD

```
[ ] Zéro clé API dans le code frontend
[ ] Zéro console.log avec données utilisateur ou tokens
[ ] Variables d'env définies dans Netlify (pas juste .env local)
[ ] Syntaxe validée avec node avant livraison
[ ] Score checks X/X passé
[ ] Règle 21A — scénarios d'appel validés (DOM, cache)
[ ] Règle 21B — scénarios de données validés (vide, nominal, doublon, limite, interdit, temporel)
[ ] Règle 21C — "qu'est-ce que l'artisan voit ?" — réponse acceptable
[ ] Impact utilisateur évalué — aucune régression
[ ] Impact infrastructure évalué — bandwidth, quota, performances
[ ] Ordre de déploiement défini si plusieurs fichiers liés
[ ] Test en navigation privée OK
[ ] Déconnexion + retour arrière → redirige vers login
[ ] Ctrl+Shift+R après déploiement avant de tester
```

---

## FICHIERS DE RÉFÉRENCE — Index complet

| Fichier | Contenu | Lire quand |
|---------|---------|-----------|
| `2_INSTRUCTIONS_ARCHITECTURE.md` | Règles 1–21 · Conventions · Protocole modification · Sécurité | Avant toute modification de code |
| `debug_1_regles.md` | Règles 10–16 avec protocoles complets | Avant tout debug |
| `debug_2_lancement.md` | Séquence de lancement debug étape par étape | Dès qu'un bug est signalé |
| `debug_3_utilisateur.md` | Quoi demander à l'utilisateur et comment | Quand le contexte est insuffisant |
| `debug_4_posture.md` | Posture d'analyse · Philosophie utilisateur · Règles 18–21 · Simulation | **Avant toute proposition de solution** |
