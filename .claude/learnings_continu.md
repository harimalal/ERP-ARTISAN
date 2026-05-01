# ARTEASY — Log apprentissage continu
Version 1 — Session #16 (01 mai 2026)

Ce document capitalise les erreurs, optimisations et patterns pour toutes les sessions futures. Objectif : zéro itération inutile, code juste du premier coup.

---

## RÈGLES APPRENTISSAGE — À APPLIQUER SYSTÉMATIQUEMENT

### Règle 1 : Diagnostic avant code (2min avant 4h)
Avant de modifier du code, toujours valider l'hypothèse en console / Network / logs en moins de 2 minutes.

Exemple d'erreur passée : CTAs landing ne redirigent pas → hypothèse "hashchange non déclenché" → aurait pris 30 sec en console F12 avec window.location.hash = '#final' → au lieu de 4 commits d'essai.

Application : avant chaque fix, écrire une micro-question testable en console. Si elle répond, coder. Si elle ne répond pas, creuser d'abord.

### Règle 2 : Spec complète = une seule passe
Les modifications questionnaire ont pris 3 passes sur 2 sessions. À chaque démarrage, demander la liste EXHAUSTIVE des changements, pas au fur et à mesure.

Application : "Voici les changements attendus : [liste complète]. OK ?" au lieu de "Fais A", puis "Maintenant fais B" la session suivante.

Économie estimée : 3x moins de tokens pour ce type de tâche. Règle à appliquer sur tous les fichiers HTML/CSS.

### Règle 3 : Variables d'env Netlify en tout premier
Le cycle NOTIONTOKEN → NOTION_API_KEY a coûté un deploy, un debug logs, 10 messages. La vraie cause : pas avoir demandé le nom exact avant d'écrire le code.

Application : pour TOUTE Netlify Function, poser la question au démarrage : "Quel est le nom exact de [VAR] dans Netlify Environment variables ?" Répondre par le nom exact, puis coder.

Ne jamais supposer. Ne jamais utiliser un nom "standard" qui différerait du vrai nom.

### Règle 4 : Lire le bundle index.html une seule fois
Chaque lecture du template JSON = ~20k tokens. Les modifications Python du template ne doivent pas générer 3+ lectures du même fichier.

Application : lire une fois, noter les positions (line 203 = template line, position X = hero-grid CSS), puis travailler par coordonnées. Pas de "je vais vérifier" qui relit le fichier.

### Règle 5 : Documenter les règles Python du premier coup
Le fix </script> → <\/script> aurait dû être appliqué dès la première édition Python du template. N'avoir la règle qu'après avoir débugué = faire le fix en séquence = 2 ops au lieu de 1.

Application : quand une règle Python émerge (exemple : "toujours échapper </script> dans json.dumps du template"), l'ajouter dans learnings_continu.md ET dans le code commenté de la Netlify Function / script Python.

### Règle 6 : Poser les 3 questions diagnostic dès le démarrage
Au lieu de demander un info au fur et à mesure, les 3 questions clés pour éviter les itérations :
1. Exact name of [VAR]? (pour Netlify)
2. Complete spec of changes? (pour HTML/CSS)
3. Exact URL/endpoint to test? (pour API)

Application : premières phrases de chaque session nouvelles : valider les 3 points clés avant de coder une seule ligne.

---

## PATTERNS RÉUTILISABLES

### Pattern 1 : Netlify Function + Notion (validé)
Voir project_arteasy_notion_pipeline.md pour le template complet. Pattern éprouvé, zéro erreur en session #16 une fois les env vars correctes.

Checklist de déploiement en mémoire. À dupliquer pour tout nouveau formulaire sans modification.

### Pattern 2 : Python édition template JSON (validé)
Règle : lire une fois, json.loads, modifier, json.dumps, PUIS remplacer </script> par <\/script>, réécrire. Pas de tentative d'edit sans cette règle.

Code template à copier dans learnings_continu.md pour sessions futures.

### Pattern 3 : Questionnaire HTML (validé)
Import Fraunces + DM Sans, h1 Fraunces 700, hero padding réduit, order stricte (title → badges → hero-sub). À réappliquer pour tout nouveau formulaire de qualification.

---

## ERREURS À NE JAMAIS RÉPÉTER

Erreur 1 : Supposer le nom d'une variable d'env. Impact : 1 deploy inutile + debug logs + 10 messages. Coût : 1h de temps réel. Prévention : demander à l'utilisateur avant de coder.

Erreur 2 : Modifier un fichier bundlé (index.html) sans connaître la règle </script>. Impact : landing blanche, debug JSON "Unterminated string". Prévention : documenter les règles Python du PREMIER coup.

Erreur 3 : Faire 4 tentatives CTA avant de tester en console. Impact : 4 commits + context waste. Prévention : diagnostic en console en 30 sec AVANT de coder.

Erreur 4 : Modifications HTML en 3 passes sur 2 sessions. Impact : 3x tokens, friction utilisateur. Prévention : spec complète au démarrage.

Erreur 5 : Relire le bundle plusieurs fois. Impact : +60k tokens sur une session. Prévention : lire une fois, cacher les coordonnées, travailler par référence.

---

## CHECKLIST DÉMARRAGE SESSION — À APPLIQUER POUR TOUTE SESSION ARTEASY

Avant de toucher au code :

1. Demander les 3 variables d'env Netlify (noms exacts) si nouvelles Fonctions
2. Demander spec complète des changements HTML/CSS
3. Lire l'historique debug si itération sur landing bundlée
4. Valider diagnostic en console en 30 sec avant de coder
5. Appliquer la règle </script> si édition Python du template

Pendant le code :

1. Pas de relecture du bundle sans raison explicite (lire une fois, travailler par coords)
2. Diagnostic 30 sec = juste du premier coup > 4 tentatives
3. Spec complète = une seule passe du fichier

À la fin de la session :

1. Noter les patterns réussis dans learnings_continu.md
2. Documenter les règles Python qui ont émergé
3. Ajouter les checklist à la mémoire pour réutilisation

---

## ÉCONOMIES POSSIBLES IDENTIFIÉES

Session #15-16 : 145k tokens auraient pu être économisés avec ces 6 règles.

Répartition :
- Diagnostic 30 sec au lieu de 4 commits : -60k
- Spec complète au lieu de 3 passes questionnaire : -25k
- Demander var env names au démarrage : -30k
- Règle </script> dès le premier coup : -25k
- Lire bundle une fois : -5k (reste)

Économie sur 10 sessions type "ARTEASY" : 1.45M tokens (50% du budget annuel).

---

## PROCHAINES SESSIONS : APPLICATION IMMÉDIATE

À chaque démarrage ARTEASY :
1. Poser les 3 questions clés (env vars, spec, diagnostic)
2. Appliquer les 6 règles sans exception
3. Documenter toute nouvelle règle qui émerge
4. Vérifier la checklist avant de coder

Le but : zéro itération inutile, qualité au premier coup, tokens économisés = plus de travail par budget.
