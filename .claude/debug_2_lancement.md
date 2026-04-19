# AppMee — Lancement du debug
**Version :** Session #12 · 19 avril 2026
*(ancien debug_1_regles.md fusionné ici)*

> Ce fichier s'enclenche dès qu'un bug est signalé.
> Suivre la séquence dans l'ordre — ne jamais sauter d'étape.

---

## SÉQUENCE DE LANCEMENT — Dans cet ordre, toujours

### Étape 1 — Identifier le fichier exact

**Action :** demander à l'utilisateur de cliquer sur le lien bleu dans la console Chrome.

```
F12 → Console → cliquer sur le lien bleu à droite de l'erreur
                ex : achats.js:340:5
```

Ne pas analyser le texte de l'erreur avant d'avoir le fichier et la ligne exacte.
Le texte ment. Le lien dit la vérité.

---

### Étape 2 — Poser les 3 questions de diagnostic

Avant de toucher au code :

```
1. Quelle est la cause racine ? (pas le symptôme visible)
2. Quels autres fichiers appellent cette zone ?
3. Ce fix touche-t-il Supabase ou une Netlify Function ?
```

---

### Étape 3 — Classer l'erreur

#### Erreurs JS / Chrome

| Erreur affichée | Piège fréquent | Vrai diagnostic |
|-----------------|---------------|----------------|
| `SyntaxError: Unexpected token 'catch'` à `app:1241` | Chercher dans `app.html` | Cliquer le lien bleu → erreur dans un module importé |
| `Unexpected identifier 'xxx'` ligne 1 | Chercher le mot partout | Module avec syntaxe cassée — cliquer le lien bleu |
| `cannot insert non-DEFAULT value into column` | Chercher une erreur JS | Colonne `GENERATED ALWAYS AS` Supabase — supprimer le champ du payload |
| `article_id null` → rejeté Supabase | Chercher une erreur de logique | Cache vide — onglet jamais visité — appliquer Règle 11 |
| `TypeError: X is not a function` | Chercher une faute de frappe | Fonction non exportée depuis db.js — vérifier le commit GitHub |
| `Cannot read properties of null` | Chercher une race condition | Guard DOM manquant — `if (!el) return` — Règle 21A |

#### Erreurs Netlify Functions

| Code | Cause probable | Action |
|------|---------------|--------|
| 404 | Mauvaise URL | Vérifier l'endpoint `/api/nom-tirets` (Règle 3) |
| 500 sans log | `console.error()` absent du catch | Ajouter le log, redéployer, relire (Règle 6) |
| 500 avec log | Lire le message exact | Netlify → Functions → Function log |
| "Tenant introuvable" | `session.user.id` utilisé à la place de `getTenantId()` | Remplacer (Règle 1) |
| Variable manquante | `.env` local non déployé | Netlify → Environment variables |

---

### Étape 4 — Vérifier les points de friction AppMee

Avant tout fix, cocher cette liste :

```
[ ] URL Netlify Function → /api/nom-tirets (jamais /.netlify/functions/nom)
[ ] tenantId → getTenantId() depuis auth.js (jamais session.user.id)
[ ] Event custom → listener présent dans app.html
[ ] Import CSV → _massImport() appelle vraiment Supabase
[ ] 500 sans log → console.error('[fn] ERREUR:', err.message, err.stack) présent
[ ] GitHub "pas mis à jour" → MD5 identique = pas de commit = normal
[ ] Bug non reproductible → Ctrl+Shift+R fait avant de tester
[ ] Erreur app:1241 → cliquer le lien bleu, pas lire le texte
[ ] Fichier édité dans GitHub → réécrire complet si 2ème erreur (Règle 15/16)
[ ] Cache vide → onglet jamais visité → appliquer Règle 11
```

---

### Étape 5 — Vérifier les variables d'environnement

Avant tout debug sur une Netlify Function :

```
SUPABASE_URL         ✓ dans Netlify → Environment variables
SUPABASE_SERVICE_KEY ✓ dans Netlify → Environment variables
ANTHROPIC_API_KEY    ✓ dans Netlify → Environment variables
```

Si une variable manque → la corriger en premier. Rien d'autre.

---

### Étape 6 — Appliquer le fix et valider

**Format du fix à produire :**
```
CAUSE RACINE : [explication précise]

FICHIER : [nom] — FONCTION : [nom]

AVANT :
[code original exact du fichier uploadé]

APRÈS :
[code modifié]

AUTRES FICHIERS IMPACTÉS : [liste ou "aucun"]
VALIDATION : [score checks X/X]
```

**Checklist avant de livrer :**
```
[ ] Syntaxe validée avec node
[ ] Score checks X/X passé (Règle 12)
[ ] Fichier complet généré (pas de patch partiel)
[ ] Règle 21A — DOM garanti dans tous les contextes d'appel
[ ] Règle 21B — cas vide, nominal, doublon, limite, interdit testés
```

**Checklist après déploiement :**
```
[ ] Ctrl+Shift+R effectué
[ ] Console → zéro erreur rouge
[ ] Network → statut attendu
[ ] Navigation privée → même comportement
[ ] Double clic bouton → aucune duplication
[ ] Supabase → données correctes
```
