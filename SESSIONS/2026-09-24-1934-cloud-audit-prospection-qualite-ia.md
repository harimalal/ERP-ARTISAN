# AppMee (ARTEASY) — Rapport de session
**Date :** 24 septembre 2026 | **Durée :** session complète (Pilote multi-projets, audit robustesse, brief prospection, test qualité import IA) | **Statut :** ✅ 3 livrables Claude Docs produits et 2 fix de code déployés (parseur CSV admin.js, jeu de données démo). Test qualité IA terminé avec 3 défauts précis identifiés, correctifs non encore appliqués (en attente de décision).

---

## 1. LIVRABLES PAR THÉMATIQUE

| Thématique | Détail | Fichier(s) / Lien | Statut |
|---|---|---|---|
| Artefact "Pilote Multi-projets" | Inbox d'idées/tâches dictées (DropIt, ArtEasy, AppMee, Reflexia) avec triage IDÉE/TÂCHE, questions à choix fermés, bouton "Analyser maintenant". Bug bloquant trouvé et corrigé : les documents renvoyés par la capacité `db` sont gelés (`Object.freeze`) — toute mutation directe (`o._id = d.id`) plantait silencieusement tous les rendus. Fix : copie dans un nouvel objet avant ajout de `_id`. | https://claude.ai/artifact/NasX2tqBrmPDs8w66htCM9 | ✅ fonctionnel, vérifié par test Playwright avant/après |
| Routine "Pilote — relecture du flux" | Déclencheur planifié 9h et 14h (cron `0 7,12 * * *`), lance une nouvelle session à chaque tir pour relire le backlog du Pilote | trigger `trig_012LTz1U2aXwBHungrDdpa23` | ✅ créée |
| Brief prospection ArtEasy | Dossier complet pour un partenaire commercial à Madagascar (vente pure, pas d'offre fondateur) : produit, 3 profils clients, offre 39€/mois ou 397€/an, 3 scripts d'appel (prise de RDV / démo / closing), objections, liste rouge, + onglet check-list client pré-import (papier / PDF / Excel / CSV) | https://claude.ai/artifact/QMjDzzd7nNUeJPBg3YSskA | ✅ livré |
| Audit de robustesse AppMee | État des lieux infra pour 40-50 utilisateurs/jour actifs : RLS vérifié actif sur les 18 tables (requêtes Supabase directes), `next_ref()` atomique confirmé, faille trouvée — `ai_analyse_bc.js` (Import BC quotidien) n'a **aucun quota** d'appels IA contrairement à `ai_extract_doc.js` (onboarding). 5 war games + plan d'action priorisé | https://claude.ai/artifact/8zAPwHBAtZ4NG6YwePuC8y | ✅ livré |
| Fix parseur CSV import (Règle 15/16 respectée) | `_lireHeadersFichier`, `_lireOngletsFichier`, `_lireLignesFichier` utilisaient `split(/[,;]/)` naïf, cassait sur les adresses/champs contenant des virgules entre guillemets. Ajout de `_parserLigneCSV()` (parseur à état, respecte les guillemets), appelé aux 3 sites. Validé `node --check` + test direct adresse entre guillemets | js/modules/admin.js (commit bdd52fb) | ✅ déployé sur main |
| Jeu de données de démonstration | 75 bons de commande PDF (3 qualités × 25, avec pièges) + 4 CSV catalogue (produits, articles, clients, fournisseurs), au format d'import exact de l'app, classés dans un dossier dédié pour les démos commerciales de Hari | `demo-data/` (commits 301ce07 + merge b69d3ec) | ✅ déployé sur main |
| Test qualité extraction IA (Import BC) | 75 documents synthétiques avec vérité terrain, prompt et parseur strictement identiques à la prod (`ai_analyse_bc.js`), appel réel Claude Sonnet 5, puis **réconciliation via la vraie logique `_fuzzyMatch` de `app.html`** avant notation (ce que l'artisan voit réellement). Résultat : client 100%, lignes 90% global (99%/85%/83% par palier), hallucinations quasi nulles (3/382). Scoring initial trompeur (8%/2%/2%) auto-diagnostiqué et corrigé avant tout report au client — cause racine : ambiguïté du prompt sur le format `refDetectee`, pas un défaut du modèle. 3 défauts précis documentés avec fix recommandés | https://claude.ai/artifact/7fd5b477-857b-439d-ae46-aca813c09168 | ✅ livré — correctifs proposés, non encore appliqués (question posée à Hari en commentaire du doc) |

---

## 2. ERREURS — CAUSE ET SOLUTION

| # | Thématique | Erreur | Cause racine | Solution |
|---|---|---|---|---|
| 1 | Artefact Pilote | Boutons projet inutilisables, entrées jamais visibles | `docsOf()` posait `o._id` mais le rendu lisait `o.id` | Les deux champs posés |
| 2 | Artefact Pilote | Toujours rien ne s'affichait malgré le fix précédent | Root cause réelle : documents `db.get()`/`onSnapshot()` gelés (`Object.freeze`), toute mutation directe plante silencieusement | Copie dans un nouvel objet avant ajout de `_id`, prouvé par harnais Playwright reproduisant le gel |
| 3 | Test qualité IA | Résultats bruts implausibles (8%/2%/2% de lignes correctes, ~120 "hallucinations" par palier) | Sonnet renvoie `refDetectee` au format `ref:nom` (prompt ambigu) — comparaison directe contre la référence seule faussait tout le scoring | Réconciliation via la vraie logique `_fuzzyMatch` de `app.html` portée fidèlement dans le scorer, réutilisant les réponses déjà captées (0 coût API supplémentaire) |
| 4 | admin.js | Import CSV cassait sur les champs contenant des virgules entre guillemets (ex: adresses) | `split(/[,;]/)` naïf, ignore les guillemets, présent à 3 endroits dupliqués | `_parserLigneCSV()` — parseur à état respectant les guillemets, appelé aux 3 sites |

---

## 3. ÉTAT DE L'APPLICATION

### Modules métier
| Module | État | Notes |
|---|---|---|
| Dashboard | ✅ | RAS |
| Stock Articles | ✅ | RAS |
| Produits Finis | ✅ | RAS |
| Commandes | ✅ | RAS |
| Production | ✅ | RAS |
| Achats | ✅ | RAS |
| Livraisons & Factures | ✅ | RAS |
| Recettes | ✅ | RAS |
| Admin | ✅ | Import CSV corrigé pour les champs entre guillemets (bdd52fb) — import IA de bons de commande mesuré à 90% de lignes correctes en conditions dégradées, défauts précis identifiés (voir rapport qualité) |

### Infrastructure
| Composant | État | Notes |
|---|---|---|
| Supabase | ✅ Actif | RLS vérifié activé sur les 18 tables (audit du 24/09) |
| Netlify | ✅ Actif | `ai_analyse_bc.js` (Import BC quotidien) sans quota d'appels IA — risque identifié dans l'audit robustesse, non corrigé |
| GitHub | ✅ Stable | main à jour (b69d3ec) |

---

## 4. PROCHAINES ÉTAPES

| Priorité | Action | Complexité | Fichier |
|---|---|---|---|
| Haute | Décision Hari : appliquer les 3 fix du test qualité IA (format `refDetectee` bare-ref dans le prompt, ne pas écraser un `null` correct par le fuzzy fallback, abaisser le seuil de rapprochement à 0,35-0,40) | Faible | netlify/functions/ai_analyse_bc.js, app.html |
| Haute | Implémenter le quota hebdomadaire IA sur `ai_analyse_bc.js` (350/semaine/tenant discuté, jamais codé) — actuellement aucune protection contre un usage anormal | Moyenne | netlify/functions/ai_analyse_bc.js |
| Moyenne | Révoquer/rotationner la clé Anthropic de test utilisée pour le test qualité (confirmée test-only par Hari, non urgent) | Faible | — |
| Basse | Test comparatif Haiku (reporté — "teste seulement sonnet" pour cette session) | Moyenne | — |
| Basse | Démarrer l'outreach sur les 200 prospects avec le brief prospection livré | — | — |

---

## 5. FICHIERS MODIFIÉS CETTE SESSION

| Fichier | Chemin GitHub | Nature |
|---|---|---|
| js/modules/admin.js | js/modules/admin.js | Ajout `_parserLigneCSV()`, remplacement des 3 sites `split(/[,;]/)` (commit bdd52fb) |
| demo-data/ | demo-data/ | Nouveau dossier : 75 PDF bons de commande + 4 CSV catalogue pour démos commerciales (commits 301ce07, b69d3ec) |
| SESSIONS/2026-09-24-1934-cloud-audit-prospection-qualite-ia.md | SESSIONS/2026-09-24-1934-cloud-audit-prospection-qualite-ia.md | Ce rapport |

---

## 6. SUITE DE SESSION — mise en œuvre des points de l'audit (déployé sur main, e939173)

| Thématique | Détail | Fichier(s) | Statut |
|---|---|---|---|
| Quota IA 350/semaine | Compteur `ai_usage_semaine` + RPC atomique `reserver_appel_ia` (service_role seulement), réservé avant l'appel Anthropic, semaine ISO heure de Paris, partagé Import BC + onboarding. Tenant déduit de la session. Remplace le quota mensuel contournable (drapeau et compteur modifiables depuis le navigateur). Testé : 8/8 scénarios bout en bout (dont rafale de clics) + tests SQL en base | netlify/lib/quota_ia.js, ai_analyse_bc.js, ai_extract_doc.js, migration 2026-09-24_quota_ia_hebdo.sql | ✅ |
| Stock atomique | RPC `ajuster_stock_article/produit` (stock = greatest(0, stock + delta), sous RLS) pour réceptions, livraisons, production. Inventaire garde l'écriture absolue. Verrous anti double clic sur livraison et fin de fabrication | js/db.js, achats.js, livraisons.js, production.js, migration 2026-09-24_stock_atomique.sql | ✅ |
| Site public | 3 formules : 39€/mois sans engagement, 197€/6 mois (-16 %, mise en avant), 397€/an (-15 %). Brief partenaire aligné | index.html | ✅ |
| Import IA | Lecture du format "REF:Nom" + respect du null explicite du modèle : 382/382 lignes correctes, 0 inventée (rejoué avec le code réel de app.html) | app.html | ✅ |
| Suppressions bloquées | Message clair (FK 23503) ; deleteCommande ne vide plus une commande livrée de ses lignes | js/db.js, admin.js, commandes.js, produits.js | ✅ |
| Validation | 3 agents validateurs indépendants (serveur, application, site) — 0 bloquant, correctifs appliqués | — | ✅ |

Décisions à prendre (Hari) : prix de l'annuel (2 × 197 € = 394 € < 397 €), mention HT/TTC des prix, garantie 30 jours vs engagement 6/12 mois, publication publique des dossiers internes (publish = "."), recettes supprimées en cascade avec un article.

Non traités volontairement : extraction IA en fonction d'arrière-plan (refonte asynchrone), tests dans le déploiement (suites Python nécessitant des identifiants réels), page de statut.

## Artefacts Claude Docs produits cette session
- Pilote Multi-projets (inbox global) : https://claude.ai/artifact/NasX2tqBrmPDs8w66htCM9
- Brief prospection ArtEasy : https://claude.ai/artifact/QMjDzzd7nNUeJPBg3YSskA
- Audit de robustesse AppMee : https://claude.ai/artifact/8zAPwHBAtZ4NG6YwePuC8y
- Rapport qualité — Import IA : https://claude.ai/artifact/7fd5b477-857b-439d-ae46-aca813c09168
