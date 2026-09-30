# Dossier produit ArtEasy
Document de passation — destiné à une équipe externe (prestataire technique, product manager, growth marketer) qui reprend le produit pour le lancer, le maintenir et le faire croître.

**Version :** 30 septembre 2026
**Rédigé à partir de :** l'audit direct du code source (`harimalal/ERP-ARTISAN`), de la base Supabase de production, et de `CLAUDE.md` (les règles internes du projet).
**Ce que ce document n'est pas :** un historique de développement. C'est une photographie de ce qui existe réellement aujourd'hui, pensée pour que quelqu'un qui n'a jamais vu le projet puisse en reprendre la responsabilité sans redécouvrir les pièges à ses dépens.

**Convention utilisée partout dans ce document :** chaque fait technique est marqué
✅ **Vérifié dans le code / la base** — je l'ai lu directement, ce n'est pas une supposition
⚠️ **Écart constaté** — ce que la landing ou la doc annonce ne correspond pas à ce que le code fait
❓ **À vérifier avec le fondateur** — je n'ai pas la source pour trancher

---

## 1. Résumé exécutif

ArtEasy (nom de code interne : AppMee) est un **ERP web pour artisans transformateurs** — des professionnels qui achètent une matière première, la transforment, et vendent le produit fini à des professionnels (épiceries, magasins, marchés). Le cas d'usage fondateur est une conserverie de confitures artisanales, mais l'architecture est **volontairement générique** : le même code doit pouvoir servir une bougie, un cosmétique, un chocolat ou une bière, sans modification de code — seulement par la donnée (catégories, unités, recettes propres à chaque tenant).

**Où en est le produit aujourd'hui (✅ vérifié en base) :**
- **1 client réel en production** : Les Confitures de Pascal, onboardé et actif.
- **6 tenants existent en base au total** (Pascal + 5 autres), mais un seul est un client réel actif suivi ; les autres semblent être des comptes de test/démo antérieurs — ❓ à confirmer avec le fondateur avant toute campagne d'acquisition, pour ne pas polluer les métriques de croissance avec de faux comptes.
- Landing page publique (`arteasy.fr`), tracking Plausible actif, prise de rendez-vous par Cal.com, **aucune formule payante intégrée automatiquement** (voir section 7 — le paiement est géré manuellement par le fondateur aujourd'hui, ce n'est pas un abonnement Stripe en self-service).
- Application fonctionnelle et déployée en continu (Netlify), avec une discipline de code et de vérification déjà écrite (`CLAUDE.md`), mais **sans équipe** : un seul opérateur (le fondateur, assisté par Claude Code) a écrit et exploité tout le système jusqu'ici.

**Ce que ce dossier permet de faire :** recruter ou briefer un(e) développeur/développeuse, un(e) product manager et un(e) growth marketer, et leur donner en une seule lecture la carte complète du produit, de sa technique et de son marché — pour qu'ils puissent, ensemble, écrire la feuille de route des 90 prochains jours sans redemander au fondateur ce qui est déjà dans ce document.

---

## 2. Le produit

### 2.1 — Le problème résolu

Un artisan transformateur (confiturier, savonnier, chocolatier, brasseur…) gère aujourd'hui son activité dans des outils disjoints : un carnet ou un tableur pour le stock, un autre pour les commandes clients, la facturation à la main, et aucune vue sur son coût de revient réel. ArtEasy réunit ces flux dans **un seul système**, avec la promesse centrale : *ce que je vends dépend de ce que j'ai en stock, ce que j'ai en stock dépend de ce que je fabrique, ce que je fabrique dépend de mes recettes.* Casser ce fil (stock qui ne descend pas à la vente, coût de revient jamais recalculé) est la classe de bug la plus coûteuse du produit — voir section 5.

### 2.2 — Cible et proposition de valeur (telles qu'écrites sur la landing, ✅ vérifiées dans `index.html`)

> « Si vous achetez des matières, vous fabriquez, et vous vendez à des magasins ou sur des marchés : confiture, jus, sirop, chocolat, savon, cosmétique, miel, conserves, biscuiterie, bière, kombucha. »

Promesse d'installation : **« Installation par le fondateur en 20 minutes »** (texte meta de la landing) — ⚠️ **écart constaté** : le processus d'onboarding réellement documenté et exécuté sur le premier client (`.claude/onboarding/PROCESS_ONBOARDING_30MIN.md`) est budgété à **30 minutes**, pas 20. Les deux textes existent dans le repo sans avoir été réconciliés — à corriger avant toute mise en avant commerciale du chiffre, pour ne pas promettre un délai qu'on ne tient pas au premier client suivant.

### 2.3 — Modèle économique actuel (✅ vérifié dans `index.html`)

| Formule | Prix | Engagement |
|---|---|---|
| Mensuel | 39 € / mois | Sans engagement, résiliable à tout moment |
| Semestriel | 197 € / 6 mois | -16 % vs mensuel |
| Annuel | 379 € / an | -19 % vs mensuel |

- Les trois formules incluent l'installation et l'import des données — pas de frais d'entrée séparé.
- **Aucune différence fonctionnelle entre les formules** dans le code : la table `tenants` porte une colonne `plan`, mais **aucune ligne du code applicatif ne lit cette colonne pour activer ou brider une fonctionnalité** ⚠️. Le champ existe, rien ne le consomme. Une constante `PLANS_QUOTA_IA` (starter/pro/business à 20/100/illimité) est déclarée dans `js/config.js` mais n'est référencée nulle part ailleurs dans le code ⚠️ — c'est un vestige d'un modèle de tarification par quota IA qui n'a jamais été branché. Le vrai plafond IA en vigueur aujourd'hui est un plafond **unique et partagé par tenant**, indépendant du plan payé (voir section 4.5).
- **Paiement non automatisé** ⚠️ : aucune intégration Stripe n'existe dans le code (recherche exhaustive sur tous les fichiers HTML — zéro résultat). D'après `CLAUDE.md`, les liens de paiement sont « côté utilisateur » : le fondateur gère l'encaissement manuellement, hors du produit. **Il n'existe aucun webhook qui active ou coupe automatiquement un compte selon le paiement.** C'est le premier chantier structurant pour un product manager qui veut industrialiser l'acquisition : sans facturation automatique, chaque client payant est une tâche manuelle du fondateur.

### 2.4 — Canal d'acquisition actuel (✅ vérifié)

- Landing publique unique (`index.html`) avec formulaire de capture de lead qui écrit directement dans une base Notion via une Netlify Function (`notion-lead.js`) — c'est le CRM actuel : une base Notion, pas d'outil CRM dédié.
- Prise de rendez-vous : Cal.com (`cal.com/hari.arteasy/30min`), lien en dur dans le JS de la landing.
- Historique de prospection documenté (`MISSIONS/2026-09-04-rattrapage-semaine-0/`) : extraction et enrichissement d'une liste de ~150-200 prospects issus de l'Agence Bio (annuaire officiel des producteurs bio français) — c'est la seule source de prospection structurée qui existe à ce jour, pas un canal payant ou une régie publicitaire.
- Aucun tunnel de conversion self-service : aujourd'hui, un prospect réserve un appel, le fondateur onboarde à la main. **Le produit n'a jamais été vendu sans intervention humaine directe du fondateur.**

---

## 3. Fonctionnalités, module par module

Chaque module ci-dessous est un fichier `js/modules/*.js` chargé dans `app.html`. Taille de fichier donnée pour indiquer la densité réelle de logique (✅ compté directement, `wc -l`) — utile pour évaluer la charge de reprise en main d'un développeur.

### 3.1 — Dashboard (`js/modules/dashboard.js`, 256 lignes)
Vue d'accueil : 5 indicateurs clés (alertes stock, articles commandés, valeur des commandes, factures à relancer, ordres de fabrication en cours), une table d'alertes stock articles, une table de stock produits finis sous seuil, les dernières commandes. Purement une vue de lecture agrégée — aucune écriture ne part d'ici, sauf le clic « Commander » qui ouvre le modal d'achat pré-rempli.

### 3.2 — Stock Articles (`js/modules/stock.js`, 636 lignes)
Gestion des matières premières et consommables : fiche article (référence, nom, catégorie, unité, prix d'achat, fournisseur, seuil d'alerte, stock), recherche insensible aux accents et à la casse, filtres par colonne, tri, inventaire manuel unitaire (une correction de stock = une ligne dans `mouvements`, jamais une écrasement silencieux) et inventaire global (correction en masse). Case **Hors stock** par article : exclut la ligne de toutes les alertes sans effacer sa quantité — pensée pour les matières qu'on ne veut pas suivre (eau, énergie) ou qu'on met en pause. Les catégories ne sont **pas codées en dur** : elles sont déduites des valeurs déjà présentes chez le tenant, donc chaque métier voit les siennes sans toucher au code (confiture : Fruit/Ingrédient/Verre/Capsule/Étiquette ; une bougie aurait Cire/Mèche/Parfum).

### 3.3 — Stock Produits Finis (`js/modules/produits.js`, 499 lignes)
Catalogue des produits vendus : référence, nom, prix de vente, seuil, stock, coût de revient et marge calculée à l'affichage (jamais stockée — donc toujours juste tant que la recette et les prix d'achat le sont, voir section 5). Bouton **Produire** (ouvre la planification d'un ordre de fabrication) et **Inventaire** (correction manuelle de stock, même logique que les articles). Case Hors stock identique à celle des articles. La modification des champs (nom, prix, seuil, TVA, stock) se fait exclusivement depuis Admin — ce module ne fait qu'afficher et agir sur le stock/la production.

### 3.4 — Recettes (`js/modules/recettes.js`, 423 lignes)
Nomenclature de chaque produit fini : liste des articles nécessaires et leur quantité pour produire **une unité** du produit. Affichage au décimal le plus précis pour que l'artisan voie la vraie quantité par pot/pièce plutôt qu'une valeur arrondie trompeuse. C'est la pièce centrale du calcul de coût de revient (`Σ quantité × prix d'achat` de chaque ligne).

### 3.5 — Commandes clients (`js/modules/commandes.js`, 422 lignes)
Pipeline commande client en 5 étapes : à produire → planifié → en production → prêt → clôturée. Import IA d'un bon de commande client photographié (voir 4.5). Marquage « prioritaire » avec bandeau visuel distinct.

### 3.6 — Production (`js/modules/production.js`, 970 lignes — le plus gros module métier)
Planification des ordres de fabrication (calendrier hebdo/bimensuel/mensuel), calcul du manque en articles pour honorer les commandes planifiées (respecte la case Hors stock), génération d'un numéro de lot et clôture d'OF avec traçabilité clients servis, historique de production repliable. ⚠️ **Écart constaté avec la landing** : une diapositive de démonstration sur `index.html` affiche un badge « ✦ IA optimisé » sur un écran de planification. **Aucune logique d'intelligence artificielle n'existe dans ce module** (recherche exhaustive du mot « IA » et « Anthropic » dans le fichier — zéro résultat). La planification est manuelle et chronologique. Le badge est une maquette commerciale, pas une fonctionnalité livrée — à ne jamais présenter comme existante à un prospect qui poserait la question.

### 3.7 — Achats fournisseurs (`js/modules/achats.js`, 850 lignes)
Bons de commande fournisseurs : création en un clic depuis une alerte de stock, quantité auto-suggérée (seuil moins stock actuel), groupement par fournisseur, statuts (brouillon → envoyé → en cours → reçu), PDF conforme (mentions légales de l'entreprise du tenant). Historique repliable, statistiques (total / à faire / envoyé / clos).

### 3.8 — Facturation (`js/modules/livraisons.js`, 530 lignes)
Nommé « Livraisons & Factures » dans le code, affiché **Facturation** dans l'interface. Génère la facture au moment de la livraison, décrémente le stock produit fini, gère la TVA multi-taux, calcule les relances (facture non réglée après 30 jours).

### 3.9 — Messages à l'équipe (`js/modules/messagesEquipe.js`, 137 lignes)
Tableau type Trello minimal pour la communication interne d'une petite équipe (artisan + 1-2 personnes). Le plus petit module, aucune dépendance complexe.

### 3.10 — Onboarding / Import de données (`js/modules/onboarding.js`, 554 lignes + page dédiée `import-donnees.html`)
Point d'entrée pour créer la base d'un nouveau client : import de fichiers (Excel/CSV aux en-têtes reconnus → import déterministe sans IA, ou photos/PDF → extraction par IA). C'est le module le plus critique pour la vitesse d'acquisition : plus il est fiable, moins l'onboarding d'un nouveau client coûte de temps humain. Voir `.claude/onboarding/PROCESS_ONBOARDING_30MIN.md` pour le procédé complet, déjà éprouvé sur un client réel.

### 3.11 — Admin (`js/modules/admin.js`, 1762 lignes — plus de 2× le module suivant)
De loin le plus gros fichier du projet. Regroupe : fiche entreprise (SIRET, TVA, IBAN, coordonnées bancaires pour les factures), CRUD complet articles/produits/clients/fournisseurs, gestion des catégories (renommage, fusion), import de masse (mapping déterministe ou assisté par IA), export de gabarits Excel. C'est ici que passent tous les changements de données qui ne sont pas un simple ajustement de stock. **Point d'attention pour un développeur qui reprend le projet : ce fichier est trop gros pour être modifié sans lecture préalable complète — deux erreurs de syntaxe de suite y imposent, par convention du projet, une réécriture complète plutôt qu'un patch chirurgical (`CLAUDE.md`, règle 15).**

### 3.12 — Ce qui n'existe pas encore
- Pas d'application mobile — c'est une web app responsive uniquement.
- Pas de facturation récurrente automatisée (section 2.3).
- Pas de rôle applicatif différencié (section 4.6).
- Pas de multi-langue.
- Pas d'export comptable (vers un logiciel de comptabilité externe).

---

## 4. Architecture technique

### 4.1 — Vue d'ensemble de la stack (✅ vérifié)

```
Frontend  : HTML + CSS + JavaScript vanilla (ES modules), aucun framework
Hébergement : Netlify (build statique + Netlify Functions serverless)
Base de données : Supabase (PostgreSQL managé) — auth, RLS, RPC
IA         : API Anthropic (Claude), appelée depuis 2 Netlify Functions
CRM léger  : Notion (réception des leads du formulaire landing)
Analytics  : Plausible (RGPD-friendly, sans cookie de tracking tiers)
Tests      : suites Python (Playwright, E2E) + tests unitaires Node (.mjs)
```

Aucune dépendance front-end n'est installée par un bundler : `package.json` ne liste que deux dépendances serveur (`@anthropic-ai/sdk`, `@supabase/supabase-js`) et une dépendance de test (`@playwright/test`). Le client Supabase est chargé côté navigateur directement depuis un CDN (`esm.sh`/`jsdelivr`), pas de build step. **Conséquence pour un développeur : il n'y a rien à « compiler ». Modifier un fichier `.js` ou `.css` et déployer, c'est tout.**

### 4.2 — Modèle multi-tenant (✅ vérifié, c'est le point le plus critique du système)

19 tables PostgreSQL, **RLS (Row Level Security) activé sur les 19** (vérifié via l'inspecteur Supabase). Chaque table métier porte une colonne `tenant_id`. La règle absolue du projet, écrite en toutes lettres dans `CLAUDE.md` et learnée à la dure cette session même (voir encart ci-dessous) :

> **Toujours filtrer par `tenant_id` obtenu via `getTenantId()` (`js/auth.js`), jamais par `session.user.id`.** Ce sont deux UUID différents : l'un identifie l'utilisateur Supabase Auth, l'autre le tenant (l'entreprise). Une requête qui oublie ce filtre lit les données de **tous les tenants à la fois** — 6 aujourd'hui, un nombre qui grandit à chaque client signé.

**Retour d'expérience direct :** au cours de ce projet, une requête non filtrée par tenant a fait apparaître de faux doublons et a conduit à créer 18 lignes de données chez le mauvais client avant d'être détectée et corrigée. Un développeur qui reprend ce projet doit traiter cette règle comme non négociable, pas comme une bonne pratique parmi d'autres.

**Rôle applicatif (`users.role`) :** la colonne existe, mais ❓ **aucune vérification de ce champ n'a été trouvée dans le code JavaScript** (recherche exhaustive). L'app ne semble donc pas empêcher un utilisateur authentifié d'un tenant de faire, techniquement, tout ce qu'un autre rôle pourrait faire dans son propre tenant — les seules restrictions observées (ex. « modification des produits réservée à Admin ») sont des choix d'interface (le bouton n'existe que dans la page Admin), pas des permissions imposées côté serveur. **À vérifier en priorité par le développeur qui reprend le projet, avant d'ouvrir des comptes à plusieurs utilisateurs par tenant.**

### 4.3 — Netlify Functions (✅ vérifié — 3 fonctions, chacune avec son vrai chemin d'appel)

| Fichier | Chemin réel appelé (`config.path`) | Rôle |
|---|---|---|
| `ai_analyse_bc.js` | `/api/ai_analyse_bc` | Analyse un bon de commande fournisseur (PDF/image) par Claude, pour pré-remplir un achat |
| `ai_extract_doc.js` | `/api/ai-extract-batch` | Extraction de données depuis des documents scannés — utilisé par l'onboarding et l'import de masse Admin |
| `notion-lead.js` | (appelé en dur côté landing, pas de `config.path`) | Écrit chaque lead du formulaire landing dans la base Notion |

⚠️ **Incohérence de convention constatée** : `CLAUDE.md` fixe une règle explicite — *« URL appelée : `/api/nom-avec-tirets`. Nom fichier GitHub : `nom_underscore.js`. »* — et une constante `API.aiAnalyseBC` dans `js/config.js` déclare `/api/ai-analyse-bc` (avec tiret) en suivant cette règle. **Mais le chemin réellement exposé par la fonction (`export const config = { path: '/api/ai_analyse_bc' }`) utilise un tiret bas**, et c'est ce chemin exact — pas la constante — qu'`app.html` appelle en dur. La constante `API.aiAnalyseBC` n'est donc utilisée nulle part dans le code ⚠️ : c'est un vestige mort qui documente une convention que la fonction elle-même ne respecte pas. Rien n'est cassé aujourd'hui (l'appel réel fonctionne), mais un développeur qui suivrait la règle de `CLAUDE.md` à la lettre pour ajouter une 4ᵉ fonction IA se tromperait de chemin s'il copiait `ai_analyse_bc.js` comme modèle plutôt que `ai_extract_doc.js`, qui lui respecte la convention.

### 4.4 — Sécurité (✅ vérifié dans `netlify.toml` et le code)

- En-têtes de sécurité globaux : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, permissions caméra/micro/géoloc désactivées par défaut.
- Tous les répertoires internes (`.claude/`, `SESSIONS/`, `MISSIONS/`, `PLAYBOOK/`, `docs/`, `netlify/`, `supabase/`, `tests/`, `.hermes/`) sont explicitement bloqués (redirection 404 forcée) malgré le fait que Netlify serve tout le repo par défaut (`publish = "."`). **Ce document, une fois commité, est donc protégé de la même manière — non accessible publiquement, mais versionné.**
- Clés serveur (`SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `NOTION_API_KEY`) : exclusivement lues côté Netlify Functions via `process.env`, jamais exposées au frontend — vérifié, aucune fuite trouvée dans le code client.
- Chaque appel IA vérifie la session Supabase Auth côté fonction avant d'agir (`verifierSession`) et dérive le tenant depuis l'utilisateur authentifié, jamais depuis un champ envoyé par le client — bonne pratique respectée.

### 4.5 — Garde-fou IA (✅ vérifié, `netlify/lib/quota_ia.js`)

Plafond unique : **350 appels IA par semaine et par tenant**, remis à zéro chaque lundi 00:00 (heure de Paris). L'appel est **réservé avant** d'interroger Claude (RPC `reserver_appel_ia` en base) — deux clics simultanés ne peuvent pas dépasser le quota, et un appel réservé compte même si l'appel à Claude échoue ensuite. C'est un garde-fou de coût, pas un levier commercial (il ne varie pas avec le plan payé, malgré l'existence de la constante morte `PLANS_QUOTA_IA` mentionnée en 2.3).

### 4.6 — Base de données — les 19 tables (✅ vérifié, requête directe sur le schéma)

`tenants`, `users`, `articles`, `produits`, `recettes`, `clients`, `fournisseurs`, `commandes`, `commande_lignes`, `production_of`, `achats`, `livraisons`, `factures`, `facture_lignes`, `mouvements`, `compteurs`, `import_scan_items`, `ai_usage`, `ai_usage_semaine`, `messages_equipe`.

Points structurels à connaître :
- `articles.categorie` et `fournisseurs.categorie` sont des **champs texte libres**, pas des tables de référence — les catégories d'un métier sont les valeurs que ses propres lignes portent déjà. C'est un choix délibéré de généricité (documenté et retesté sur plusieurs métiers fictifs pendant cette session : bougies, cosmétiques, chocolats), pas un oubli de modélisation.
- Les colonnes `hors_stock` (articles et produits) sont des booléens simples — leur seul effet est d'exclure la ligne des calculs d'alerte (`estSurveille()` / `sousSeuil()` dans `js/ui.js`), jamais de la stocker à zéro ni de la masquer.
- `produits.cout_revient` est une colonne **stockée**, pas calculée par une vue ou un trigger — elle doit être recalculée manuellement après tout changement de recette ou de prix d'achat. Un audit direct sur le client réel a trouvé 46 produits sur 47 dont ce champ était désynchronisé de la recette réelle avant recalcul — **c'est un risque récurrent, pas un incident isolé**, tant qu'aucun trigger ou recalcul automatique n'est mis en place.

### 4.7 — Tests (✅ vérifié)

- 4 suites end-to-end en Python (`tests/*.spec.py`) : flux complet, import IA admin, réinitialisation mot de passe, contrôle UI de la TVA.
- 2 tests unitaires Node (`tests/unit/*.test.mjs`) : déduplication d'entités, détection de modèle de fichier import.
- **Aucun test automatisé n'est branché sur une CI** (pas de workflow GitHub Actions trouvé dans le repo) — les suites existent mais leur exécution avant déploiement est aujourd'hui une discipline manuelle (`CLAUDE.md` : « Lancer avant tout déploiement de feature »), pas un filet de sécurité automatique. **Premier chantier technique évident pour un prestataire dev qui reprend le projet.**

---

## 5. Interdépendances et points de fragilité connus

Cette section existe pour qu'un nouveau développeur ne redécouvre pas, un par un, les pièges déjà payés cette année.

### 5.1 — La chaîne de vérité : recette → coût → marge
```
articles.prix  ──┐
                  ├──▶ Σ(quantité × prix) ──▶ produits.cout_revient (stocké, PAS recalculé automatiquement)
recettes.quantite ┘                                    │
                                                         ▼
                                    produits.prix_vente − cout_revient = marge (calculée à l'affichage, jamais stockée)
```
Toute modification en masse de prix d'achat ou de recette doit être suivie d'un recalcul explicite de `cout_revient` sur tous les produits concernés — sinon la marge affichée au client est fausse silencieusement. **Aucun garde-fou automatique n'existe aujourd'hui contre cet oubli.**

### 5.2 — Les 10 points d'alerte stock, et pourquoi ils doivent tous passer par les mêmes deux fonctions
`estSurveille(item)` et `sousSeuil(item)` (`js/ui.js`) sont les **seules** fonctions autorisées à décider si un article ou un produit doit déclencher une alerte. Dix endroits différents du code en dépendent (KPI dashboard, badge de la sidebar, table d'alertes, plan de fabrication, articles à commander, compteurs de la page Stock, pré-remplissage d'inventaire, table produits du dashboard, calcul du manque en production, compteurs de la page Produits finis). **Si un développeur réimplémente localement la condition `stock <= seuil` au lieu d'appeler ces fonctions, la case Hors stock cesse de fonctionner à cet endroit précis, silencieusement.**

### 5.3 — Les événements custom (`appmee:*`)
Chaque module peut déclencher un événement (`document.dispatchEvent(new CustomEvent('appmee:xxx'))`) que `app.html` seul est censé écouter. Règle du projet : **tout nouvel événement dispatché doit avoir son écouteur ajouté dans `app.html` avant livraison**, sinon il ne se passe rien silencieusement à l'usage. Liste actuelle des événements actifs : `appmee:showPdf`, `appmee:editProduit`, `appmee:planifierOF`, `appmee:openAchatFor`, `appmee:datachanged`, `appmee:navigate`, `appmee:editFacture`.

### 5.4 — Les caches locaux par module
Chaque module garde son propre cache en mémoire (`_articles`, `_produits`, etc.), rechargé à chaque `render()`. Un onglet jamais visité a un cache vide : le code qui en dépend (génération de référence, contrôle de doublon avant sauvegarde) doit recharger explicitement avant d'agir — c'est une règle documentée (`CLAUDE.md`, règle 11) parce qu'elle a déjà causé des bugs en production.

### 5.5 — `js/modules/admin.js` est un point de convergence unique
Presque toute écriture de données non liée au stock quotidien (fiche entreprise, CRUD articles/produits/clients/fournisseurs, catégories, import de masse) passe par ce seul fichier de 1762 lignes. Une régression ici a le rayon d'impact le plus large du projet.

### 5.6 — Le multi-tenant est le risque n°1, pas un détail (rappel de 4.2)
Toute nouvelle requête Supabase écrite sans `.eq('tenant_id', tid())` est un risque de fuite de données inter-clients, pas juste un bug fonctionnel. Voir l'encart en section 4.2.

---

## 6. Grille de lecture rapide — ce qui est réel, ce qui est vitrine, ce qui manque

| Sujet | État réel |
|---|---|
| Planification de production « optimisée par IA » (landing) | ⚠️ N'existe pas dans le code. Planification manuelle chronologique. |
| Quota IA différencié par plan payant | ⚠️ Constante déclarée, jamais branchée. Un seul quota, identique pour tous. |
| Facturation récurrente automatique | ⚠️ N'existe pas. Encaissement et activation de compte manuels par le fondateur. |
| Rôles utilisateur (permissions) | ❓ Colonne en base, aucune application trouvée dans le code JS. |
| Multi-tenant / RLS | ✅ Réel et actif sur les 19 tables — mais la discipline `tenant_id` dans le code applicatif reste le vrai rempart. |
| Import de données (Excel déterministe + IA) | ✅ Réel, testé et documenté sur un client réel. |
| Recalcul de coût de revient | ⚠️ Existe comme opération manuelle, pas automatique — désynchronisation fréquente constatée. |
| Tests automatisés | ✅ Suites existantes et pertinentes — ⚠️ pas de CI, exécution manuelle. |
| Onboarding 20 min vs 30 min | ⚠️ Deux chiffres différents coexistent dans le repo (landing vs procédure interne). |

---

## 7. Cible et marché — ce qu'un growth marketer doit savoir avant d'écrire une seule campagne

### 7.1 — Le persona validé (pas hypothétique — c'est celui du client réel)
Un artisan transformateur, souvent seul ou en très petite équipe, qui vend en B2B (épiceries, magasins, marchés, parfois export). Il tient aujourd'hui sa gestion sur tableur ou papier. Le signal d'achat le plus fort observé : la douleur du **coût de revient jamais su avec certitude**, et celle du **stock qui ne reflète pas la réalité de l'atelier**.

### 7.2 — Ce qui rend la cible plus large ou plus étroite qu'elle ne paraît
La landing énumère 10 filières (confiture, jus, sirop, chocolat, savon, cosmétique, miel, conserves, biscuiterie, bière, kombucha), mais **la seule filière réellement éprouvée en production est la confiture**. Chaque autre filière est une hypothèse non testée : les catégories libres et le moteur de recette généraliste (section 4.6) rendent l'extension crédible techniquement, mais **aucun onboarding réel n'a encore eu lieu hors confiture**. Un growth marketer doit traiter les 9 autres filières comme un pari à valider par un deuxième client pilote avant d'y mettre du budget d'acquisition.

### 7.3 — Le canal d'acquisition n'est pas encore reproductible
Le seul client signé l'a été par contact direct du fondateur, onboardé à la main. Il n'existe **aucune preuve encore que le produit se vend sans l'intervention personnelle du fondateur.** Le premier travail d'un growth marketer n'est donc pas d'augmenter le volume d'un canal existant, mais de **construire et valider un premier canal reproductible sans le fondateur dans la boucle** — la landing, le tracking Plausible et la liste de prospects Agence Bio sont les briques déjà en place pour ça, pas un canal déjà prouvé.

### 7.4 — Objection commerciale la plus prévisible
Le prix (39 €/mois) est bas comparé à un ERP généraliste, ce qui est une force ; mais l'absence de paiement en self-service (section 2.3) signifie qu'aujourd'hui, **chaque nouveau client payant est encore une tâche manuelle** — un vrai frein si le growth marketer réussit à générer plus de demande que le fondateur seul ne peut onboarder à la main. C'est un problème à résoudre en parallèle de l'acquisition, pas après.

---

## 8. Ce dont chaque rôle a besoin pour démarrer

### 8.1 — Prestataire technique / développeur

**À lire dans cet ordre, avant la première ligne de code :**
1. Ce document (vue d'ensemble).
2. `CLAUDE.md` — les règles de code non négociables du projet (21 règles, dont la règle tenant_id et la règle des événements custom, sections 4.2 et 5.3 ici).
3. `.claude/2_INSTRUCTIONS_ARCHITECTURE.md`, `.claude/debug_*.md` — protocole de diagnostic et de livraison déjà rodé.
4. `.claude/onboarding/PROCESS_ONBOARDING_30MIN.md` — comment une nouvelle base client se crée, avec le script de contrôle SQL associé.

**Accès à demander avant de commencer :**
- Accès en écriture au repo GitHub `harimalal/ERP-ARTISAN`.
- Accès au projet Supabase de production (au minimum lecture ; écriture pour les migrations).
- Accès au site Netlify (déploiement, variables d'environnement : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `NOTION_API_KEY`).
- Accès à la base Notion des leads (si des évolutions du formulaire landing sont prévues).

**Premiers chantiers évidents identifiés dans ce dossier** (à prioriser avec le PM, pas à lancer seul) :
- Recalcul automatique de `cout_revient` (5.1) — le bug le plus coûteux en confiance client.
- Décider si les rôles utilisateur doivent devenir réels (4.2) avant d'ouvrir des comptes à plusieurs personnes par tenant.
- Brancher une CI minimale sur les suites de tests existantes (4.7).
- Réconcilier les incohérences listées en section 6.

### 8.2 — Product manager

**À apporter à la première réunion avec le fondateur :**
- Ce document, avec la section 6 comme ordre du jour de clarification (chaque ligne ⚠️ ou ❓ est une décision produit à prendre, pas un bug à corriger sans discussion — par exemple, automatiser la facturation est un choix stratégique, pas juste technique).
- Une décision explicite sur le statut des 5 tenants non-Pascal en base (2.1) avant toute mesure de rétention ou de churn.

**Ce que le PM doit arbitrer en premier :**
1. Le modèle de plan (39/197/379) doit-il enfin différencier une fonctionnalité réelle, ou rester un choix de durée pure ? (2.3)
2. Le rôle utilisateur doit-il devenir une vraie permission avant le 2ᵉ client, ou peut-il attendre ? (4.2)
3. Quelle filière au-delà de la confiture teste-t-on en second, et avec quel budget d'onboarding humain avant qu'un canal self-service existe ? (7.2, 7.3)

### 8.3 — Growth marketer

**Ce qui existe déjà et qu'il ne faut pas reconstruire :**
- Landing `arteasy.fr`, tracking Plausible, formulaire de capture vers Notion, lien de prise de rendez-vous Cal.com.
- Une liste de prospects qualifiés (Agence Bio, ~150-200 lignes) déjà enrichie — voir `MISSIONS/2026-09-04-rattrapage-semaine-0/` pour la méthode d'extraction, réutilisable pour étendre la liste.

**Ce qu'il doit accepter en entrant :**
- Le produit n'a **qu'un seul client de référence**, et une seule filière prouvée (confiture). Toute promesse marketing sur les 9 autres filières de la landing doit être présentée comme une capacité technique, pas comme un cas d'usage vérifié — sous peine de décevoir un prospect signé sur un métier jamais réellement testé.
- Le tunnel de conversion s'arrête aujourd'hui à un rendez-vous humain, pas à un paiement. Toute action growth doit être calibrée sur la capacité réelle du fondateur (ou d'un onboarder dédié) à traiter les rendez-vous générés, pas sur un volume théorique.

---

## 9. Glossaire métier (transposable à un autre secteur)

| Terme dans le code | Signification |
|---|---|
| Tenant | Une entreprise cliente. Isole toutes ses données des autres. |
| Article | Une matière première ou un composant acheté (fruit, emballage, épice…). |
| Produit (produit fini) | Ce que le tenant vend — calculé à partir d'une recette. |
| Recette | La nomenclature : quels articles, en quelle quantité, pour fabriquer une unité d'un produit. |
| OF (ordre de fabrication) | Une session de production planifiée, qui consomme des articles et produit du stock fini. |
| Hors stock | Un article ou produit volontairement exclu des alertes de rupture, sans effacer sa quantité. |
| Coût de revient | Somme du coût des articles d'une recette — stocké, à recalculer manuellement après tout changement de prix ou de recette. |

---

## 10. Contacts et accès à transmettre (checklist jour 1)

```
[ ] Accès GitHub harimalal/ERP-ARTISAN (écriture pour le dev, lecture pour PM/growth)
[ ] Accès Netlify (déploiement + variables d'environnement)
[ ] Accès Supabase (projet de production)
[ ] Accès Notion (base des leads)
[ ] Accès Plausible (analytics arteasy.fr)
[ ] Accès Cal.com (agenda de rendez-vous commerciaux)
[ ] Nom et coordonnées du client réel (Les Confitures de Pascal) — pour tout PM/dev qui a besoin d'un cas réel pour tester
[ ] Clarification du statut des 5 tenants non-Pascal (section 2.1)
```

---

*Document généré à partir d'un audit direct du code et de la base de production le 30 septembre 2026. Toute affirmation marquée ✅ a été vérifiée par lecture de fichier ou requête SQL au moment de la rédaction — pas par mémoire ou supposition. Les points ❓ doivent être tranchés avec le fondateur avant d'être considérés comme des faits.*
