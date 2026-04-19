# AppMee — Protocole de livraison
**Version :** Session #12 · 19 avril 2026

> Lire avant toute livraison de code.
> Les règles 12 et 21 vivent dans `2_INSTRUCTIONS_ARCHITECTURE.md` — ce fichier contient les formats de réponse et le template de rapport.

---

## FORMAT DE RÉPONSE — Avant de coder

```
X modifications détectées :

EN UNE PASSE (fichiers indépendants) :
- [modif A] → fichier X — isolée

EN SÉQUENCE (dépendances) :
- Bloc 1 : [modif B] → à déployer en premier
- Bloc 2 : [modif C] → nécessite que B soit testé avant

Scénarios Règle 21A : [contextes d'appel — DOM garanti ? cache garanti ?]
Scénarios Règle 21B : [cas vide / nominal / doublon / limite / interdit — couverts ?]
Impact utilisateur : aucun / [feature concernée]
Impact infrastructure : neutre / [détail si non neutre]
Risque : Faible / Moyen / Élevé
→ Je lance ?
```

---

## FORMAT DE RÉPONSE — Après livraison

```
Score vérification : X/X ✅
Fichiers livrés :
- [fichier] → [chemin GitHub exact] → [nature de la modif]
Ordre de déploiement : [liste si séquence requise / "passe unique" si non]
⚠ Ctrl+Shift+R obligatoire après déploiement
```

---

## RAPPORT DE FIN DE SESSION — OBLIGATOIRE

Quand l'utilisateur dit qu'il arrête, générer `Rapport_developpement_code_DDMMYY.md` :

```markdown
# AppMee — Rapport de session #N
**Date :** JJ mois AAAA | **Durée :** ~X heures | **Statut :** [résumé]

---

## 1. LIVRABLES PAR THÉMATIQUE
| Thématique | Détail | Fichier(s) | Statut |
|------------|--------|-----------|--------|

## 2. ERREURS — CAUSE ET SOLUTION
| # | Thématique | Erreur | Cause racine | Solution |
|---|-----------|--------|-------------|----------|

## 3. ÉTAT DE L'APPLICATION

### Modules métier
| Module | État | Notes |
|--------|------|-------|
| Dashboard | ✅ / ⚠️ / ❌ | |
| Stock Articles | | |
| Produits Finis | | |
| Commandes | | |
| Production | | |
| Achats | | |
| Livraisons & Factures | | |
| Recettes | | |
| Admin | | |

### Infrastructure
| Composant | État | Notes |
|-----------|------|-------|
| Supabase | ✅ Actif | |
| Netlify | ✅ Actif | |
| GitHub | ✅ Stable | |

## 4. PROCHAINES ÉTAPES
| Priorité | Action | Complexité | Fichier |
|----------|--------|-----------|---------|

## 5. FICHIERS MODIFIÉS CETTE SESSION
| Fichier | Chemin GitHub | Nature |
|---------|--------------|--------|
```

**Le rapport est complet — état total à jour, pas uniquement les delta de la session.**

---

## CHECKLIST FIN DE SESSION

```
[ ] Rapport généré avec date du jour (DDMMYY)
[ ] Tous les fichiers modifiés listés avec chemin GitHub exact
[ ] Prochaines étapes prioritaires confirmées
[ ] Nouvelles règles documentées si applicable
[ ] Ancien rapport archivé hors projet si > 1 session de retard
[ ] Ctrl+Shift+R rappelé
```
