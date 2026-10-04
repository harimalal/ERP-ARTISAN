# AppMee / ArtEasy — Cockpit de lancement production (objectif 100 → 1000 clients)

Créé le 04 octobre 2026, suite à un audit live (Supabase + Netlify + revue de code) mené pendant la session de travail. Ce fichier est un document vivant : à cocher et mettre à jour au fur et à mesure, pas un rapport figé. Chaque point part d'un constat vérifié en direct sur l'infrastructure réelle du projet, pas d'une checklist générique.

Statut global au 04/10/2026 : **NE PAS lancer à grande échelle en l'état.** Les volets 1 et 2 sont bloquants.

---

## Volet 1 — Infrastructure (BLOQUANT)

### Problématique
Supabase tourne sur le plan gratuit de l'organisation "HUBBIX AI" (plan `free`). Netlify tourne sur un plan `nf_team_dev`, un plan de développement, sur une équipe de type "Personal". Ce sont des plans de test, pas des plans de production. Limites connues des plans gratuits : base de données plafonnée en taille, pas de vraies sauvegardes automatiques (pas de PITR), le projet Supabase peut se mettre en pause après une semaine d'inactivité, bande passante et minutes de build Netlify plafonnées. Avec 1000 clients actifs, ces plafonds sautent vite — ce n'est pas une question de "si" mais de "quand", et ce sera brutal (coupure de service) plutôt que progressif.

### À faire
- [ ] Passer l'organisation Supabase en plan Pro (25$/mois pour démarrer) avant toute ouverture à de nouveaux clients payants.
- [ ] Vérifier et upgrader le plan Netlify selon le trafic attendu (bande passante, minutes de build, invocations de functions).
- [ ] Faire un test de restauration de sauvegarde Supabase une fois le plan Pro actif — ne pas supposer que "ça marche", le vérifier.
- [ ] Vérifier qu'aucune mise en pause automatique ne peut survenir sur le plan payant.

---

## Volet 2 — Fiabilité des déploiements (BLOQUANT)

### Problématique
Vécu concrètement deux fois pendant cette session : un push vers la branche `main` n'a pas déclenché de build Netlify automatiquement, nécessitant un déclenchement manuel depuis le dashboard Netlify. Sans surveillance, personne ne s'en aperçoit tant qu'un utilisateur ne signale pas un bug qui n'existe en fait plus dans le code mais encore sur le site en ligne. À 1000 clients, ce délai invisible devient un vrai risque business.

### À faire
- [ ] Mettre en place une alerte (mail ou Slack) si un build Netlify échoue ou ne se déclenche pas après un push sur `main`.
- [ ] Documenter la procédure de déclenchement manuel (Deploys → Trigger deploy) pour que ce ne soit pas qu'un réflexe gardé dans la tête d'une seule personne.
- [ ] Vérifier après chaque déploiement que le commit déployé correspond bien au dernier commit de `main` (outil Netlify MCP `get-project` / `get-deploy-for-site`, déjà utilisé cette session pour diagnostiquer).

---

## Volet 3 — Base de données & sécurité

### Problématique
Audité avec l'outil `get_advisors` de Supabase (sécurité + performance) le 04/10/2026.

Bon point : RLS (isolation entre tenants) activée sur les 20 tables de la base — c'est la base indispensable et elle est là.

Points trouvés :
- **19 clés étrangères sans index** sur quasiment toutes les tables (`commandes`, `commande_lignes`, `factures`, `livraisons`, `production_of`, `recettes`, `achats`, `clients`, `fournisseurs`, `messages_equipe`, `users`...). Invisible avec 5 clients et quelques centaines de lignes. À 1000 clients avec de l'historique qui s'accumule, chaque écran qui filtre par `tenant_id` ou une relation (ce qui est systématique dans une appli multi-tenant) se met à ralentir.
- **3 fonctions serveur exécutables par n'importe qui**, même non connecté (rôle `anon`) : `my_tenant_id`, `next_ref`, `handle_new_user`. En plus, leur `search_path` n'est pas figé (faille standard PostgreSQL de détournement de `search_path`). Aucune fuite de données constatée aujourd'hui, mais c'est une faille de sécurité standard à corriger avant ouverture publique.
- **Protection mot de passe compromis désactivée** dans Supabase Auth (vérification contre HaveIBeenPwned.org) — gratuite à activer.
- **Politique RLS de `facture_lignes`** réévalue `auth.<function>()` à chaque ligne au lieu d'une fois par requête (pattern `(select auth.function())` à utiliser) — impact performance, mineur au volume actuel, à corriger avant que le volume grossisse.
- **Non vérifié, à tester explicitement** : que chaque politique RLS bloque bien l'ÉCRITURE (clause `WITH CHECK`), pas seulement la lecture. Faille multi-tenant classique : RLS bloque la lecture croisée mais oublie parfois l'écriture croisée, qui passe alors silencieusement.

### À faire
- [ ] Ajouter les 19 index manquants sur les clés étrangères (migration SQL, ~1h de travail, zéro risque fonctionnel — ajout pur).
- [ ] Restreindre `my_tenant_id`, `next_ref`, `handle_new_user` au rôle `authenticated` (retirer l'accès `anon`) et figer leur `search_path`.
- [ ] Activer la protection mot de passe compromis dans Supabase Auth.
- [ ] Corriger la politique RLS de `facture_lignes` avec le pattern `(select auth.function())`.
- [ ] Test d'isolation multi-tenant en écriture : créer 2 tenants de test, depuis le compte du tenant A tenter d'insérer une ligne avec le `tenant_id` du tenant B dans chaque table sensible (`commandes`, `clients`, `factures`...) — doit être refusé partout. À rejouer après tout changement de schéma ou de politique RLS.

---

## Volet 4 — Dette technique restante côté code

### Problématique
Issue de la revue de code générale menée cette session (findings reportés et partiellement corrigés : facture non persistée, doublon BC, références en course sur articles/produits/OF, client IA jamais laissé vide — tous corrigés et déployés). Deux points identifiés mais volontairement non touchés, car leur correction risquait de casser des écrans existants sans un vrai travail de conception :

- `getCommandes`, `getAchats`, `getOFs`, `getFactures` (js/db.js) n'ont aucune limite de lignes et rechargent tout l'historique à chaque ouverture d'onglet. Combiné au manque d'index du Volet 3, c'est la combinaison qui ralentira l'appli en premier à l'échelle.
- Les imports en masse (`admin.js`, `_confirmerImport` et consorts) insèrent ligne par ligne au lieu d'un insert groupé — lent sur gros volume, pas bloquant si les premiers clients n'importent pas des milliers de lignes d'un coup.

### À faire
- [ ] Concevoir une vraie pagination (ou des requêtes dédiées par écran) pour `getCommandes`/`getAchats`/`getOFs`/`getFactures`, en particulier pour les vues historique (commandes archivées, factures réglées).
- [ ] Revoir les imports en masse pour un insert groupé par lot, en gardant la tolérance aux erreurs ligne par ligne (ne pas perdre la fonctionnalité "une ligne en erreur ne bloque pas les autres").

---

## Volet 5 — Plan de tests et de non-régression

### Problématique
Couverture de test automatisée quasi nulle aujourd'hui : 2 tests unitaires (`dedup-entites`, `detecter-modele`, quelques centaines de ms d'exécution). Il existe 4 scripts Playwright (`tests/flux-complet.spec.py`, `tests/import-ia-admin.spec.py`, `tests/reset-mdp.spec.py`, `tests/tva-ui-check.spec.py`) mais ce sont des tests manuels : ils demandent un serveur local lancé à la main et des identifiants dans un fichier temporaire (`/tmp/test_creds.json`). Rien ne garantit qu'ils tournent avant un déploiement, même si CLAUDE.md le demande — c'est une bonne pratique écrite, pas un garde-fou réel.

### À faire
- [ ] Automatiser les 4 scripts Playwright existants dans un pipeline CI (GitHub Actions) qui tourne à chaque push vers `main`, avec des identifiants de test stockés en secret CI (pas dans un fichier `/tmp`).
- [ ] Ajouter des tests ciblés sur les zones déjà prouvées fragiles cette session :
  - création de commande → vérifier les OF implicites créés, vérifier l'absence de collision de référence même en cas de double clic/double soumission.
  - suppression de commande → bloquée si facture émise, acceptée sinon (avec nettoyage livraisons/OF).
  - import IA → client absent de la liste bien créé automatiquement, jamais de commande orpheline sans client.
- [ ] Test d'isolation multi-tenant en écriture (voir Volet 3).
- [ ] Test de charge basique : 20 à 50 utilisateurs simulés créant des commandes/articles en même temps, pour vérifier en conditions réelles l'absence de collision de référence et la tenue de charge de Supabase en plan Pro.
- [ ] Checklist de non-régression manuelle courte (pour qu'elle soit réellement suivie à chaque fois, pas 50 points qu'on finit par sauter) : connexion → création commande → création facture + vérification PDF → suppression commande → suppression facture → import IA d'un document → affichage calendrier production → déconnexion.

---

## Volet 6 — Mettre à jour sans impacter l'usage quotidien

### Problématique
Aujourd'hui, chaque modification part directement en production via `main`, avec un déploiement automatique dont la fiabilité n'est pas garantie (Volet 2). Avec 1000 clients qui utilisent l'app en continu pendant leurs heures de travail, le mode actuel "on pousse et on espère" devient risqué : un déploiement cassé ou en retard impacte tout le monde en même temps, sans avertissement.

### À faire
- [ ] Utiliser les Deploy Previews de Netlify (automatiques sur chaque branche/PR) pour valider visuellement un changement avant de le fusionner dans `main` — pas fait aujourd'hui, tout part directement sur la branche de travail puis `main`.
- [ ] Définir une fenêtre de déploiement (ex. tôt le matin, hors horaires de production des artisans) plutôt que des mises à jour à n'importe quelle heure.
- [ ] Formaliser dans `2_INSTRUCTIONS_ARCHITECTURE.md` la règle suivie cette session : toute migration de base de données touchant une donnée partagée entre plusieurs tenants (ex. compteurs de référence) se fait AVANT le changement de code qui en dépend, jamais après.
- [ ] Ajouter un canal de retour utilisateur visible dans l'app (bouton "signaler un problème" qui remonte le contexte technique automatiquement) — le module Messages équipe existe en interne, l'équivalent côté client n'existe pas encore.
- [ ] Définir un plan de rollback explicite (comment revenir à la version précédente rapidement si un déploiement casse quelque chose en prod).

---

## Volet 7 — Coûts : Claude, Supabase, Netlify

### Problématique
Le quota IA (`netlify/lib/quota_ia.js`) est bien conçu : 350 appels/semaine/tenant, réservé de façon atomique AVANT l'appel réel à Anthropic (protège contre un double-clic ou un abus qui ferait exploser la facture d'un coup). Mais la table censée suivre la consommation réelle (`ai_usage_semaine`) est **vide** à ce jour (vérifié en base le 04/10/2026) — soit la fonctionnalité IA n'a jamais tourné en usage normal, soit le suivi ne s'enregistre pas correctement. Sans ces chiffres, impossible de prédire la facture Anthropic à 1000 tenants.

Détail technique à vérifier : `ai_extract_doc.js` autorise jusqu'à 32000 tokens de réponse par appel (`max_tokens: 32000`), contre 1500 pour `ai_analyse_bc.js`. Une valeur de `max_tokens` surdimensionnée par rapport au besoin réel est une cause fréquente de facture IA qui explose sans qu'on s'en rende compte.

Modèle utilisé : `claude-sonnet-5` sur les deux fonctions.

### À faire
- [ ] Diagnostiquer pourquoi `ai_usage_semaine` est vide : la fonctionnalité IA n'est-elle pas utilisée, ou le suivi (`enregistrerTokensIA`) échoue-t-il silencieusement ? Vérifier les logs Netlify des deux fonctions.
- [ ] Une fois le suivi confirmé actif, surveiller la consommation réelle chaque semaine pendant au moins le premier mois après lancement, plutôt que de découvrir la facture a posteriori.
- [ ] Mettre en place une alerte (même un mail hebdomadaire automatisé) sur les tenants qui approchent leur quota de 350 appels/semaine.
- [ ] Vérifier que `max_tokens: 32000` sur `ai_extract_doc.js` correspond à un vrai besoin (gros documents multi-lignes) et pas à une valeur par défaut surdimensionnée.
- [ ] Faire une estimation chiffrée de la facture Anthropic dans 2 scénarios (usage réaliste moyen / usage maximal théorique à 1000 tenants) une fois les vraies données de consommation disponibles.

---

## Volet 8 — Conformité légale

### Problématique
L'application stocke des données personnelles de clients de clients (noms, emails, adresses des clients des artisans) — RGPD applicable. Elle émet aussi des factures, documents légaux en France soumis à une obligation de numérotation continue.

Point précis trouvé : le bouton "Supprimer" ajouté sur les factures cette session fait une **suppression physique** en base (`DELETE FROM factures`). Pour une facture réellement émise, l'usage comptable standard en France est un statut "annulée" qui conserve la ligne et sa référence, jamais une suppression réelle — pour ne jamais laisser de trou dans la numérotation en cas de contrôle fiscal. Le compteur atomique serveur pour le préfixe FAC est un bon point (pas de collision de numéro), mais il ne protège pas contre les trous laissés par une suppression.

### À faire
- [ ] Faire rédiger/valider CGU + politique de confidentialité RGPD par quelqu'un de qualifié (hors périmètre technique).
- [ ] Décider : faut-il restreindre la suppression physique de facture aux statuts non-finalisés (brouillon) uniquement, et passer à un statut "annulée" (conservant la ligne) pour toute facture déjà émise avec un numéro ? Si oui, je peux l'implémenter.
- [ ] Vérifier le même sujet pour les bons de commande fournisseur si une obligation de traçabilité s'applique.

---

## Checklist condensée — avant le go-live (vue d'ensemble)

```
[ ] Supabase en plan Pro (Volet 1)
[ ] Netlify sur un plan adapté au trafic attendu (Volet 1)
[ ] Test de restauration de sauvegarde Supabase effectué (Volet 1)
[ ] Alerte déploiement Netlify en place (Volet 2)
[ ] 19 index manquants ajoutés (Volet 3)
[ ] Fonctions anon restreintes + search_path figé (Volet 3)
[ ] Protection mot de passe compromis activée (Volet 3)
[ ] Test d'isolation multi-tenant en écriture passé (Volet 3)
[ ] Pagination/limite sur les grosses requêtes (Volet 4)
[ ] 4 scripts Playwright automatisés en CI (Volet 5)
[ ] Tests ciblés sur les zones fragiles ajoutés (Volet 5)
[ ] Test de charge basique effectué (Volet 5)
[ ] Deploy Previews utilisés avant merge main (Volet 6)
[ ] Canal de retour utilisateur en place (Volet 6)
[ ] Suivi conso IA actif et vérifié (Volet 7)
[ ] CGU / politique de confidentialité RGPD en place (Volet 8)
[ ] Position prise sur suppression vs annulation de facture (Volet 8)
```

---

## Historique de ce document

- 04/10/2026 — Création, suite à l'audit live Supabase (`get_advisors` sécurité + performance), Netlify (plan, fiabilité déploiement) et revue de code. Voir `SESSIONS/2026-09-27-nomenclature-articles-pascal.md` pour le détail des corrections déjà livrées cette même session.
