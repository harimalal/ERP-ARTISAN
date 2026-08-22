AppMee — Onboarding IA module Admin — Design
Date : 21 août 2026
Statut : validé par l'utilisateur (option C), prêt pour writing-plans

---

1. PROBLÈME

L'import actuel des données admin (clients, fournisseurs, articles, produits) impose un format Excel à colonnes fixes, un fichier par entité, modèle à télécharger et remplir manuellement. Testé par l'utilisateur : plus de 2h pour un onboarding. Impossible à imposer à un client final d'un logiciel censé lui faire gagner du temps.

Fichiers concernés aujourd'hui : js/modules/admin.js (_bindImportMasse, _massLoad, _massImport, _dlTemplate), netlify/functions/ai_extract_doc.js (existe, 3 modes fixes entreprise/client/fournisseur, un fichier à la fois, mode choisi manuellement — vérifié non appelé par le frontend actuel, donc libre à retravailler sans risque de régression), netlify/functions/ai_analyse_bc.js (scan de bon de commande pour le module Commandes — hors sujet, non touché).

---

2. OBJECTIF

Un seul point d'entrée : une zone de dépôt, n'importe quel format (PDF, image, Excel, CSV), plusieurs fichiers d'un coup, un même fichier pouvant contenir plusieurs entités de types différents (ex. un bon de livraison = 1 client + plusieurs articles). Delia catégorise et extrait automatiquement. Intervention humaine limitée à la validation des cas ambigus (~10% attendu), par simple clic, jamais de ressaisie complète.

Scope de cette version : clients, fournisseurs, articles, produits.
Hors scope, décidé avec l'utilisateur : commandes historiques (données transactionnelles, pas des données de référence — l'ancien import par modèle Excel reste disponible en secours si un cas rare l'exige), recettes (dissociées de l'admin, spec séparée après validation du pattern ici).

---

3. ARCHITECTURE RETENUE — Option C

3 options évaluées avec l'utilisateur avant de trancher :

Option A — tout en mémoire navigateur, rien sauvegardé pendant le scan.
Facilité haute, fiabilité faible : un incident (fermeture d'onglet, veille, coupure réseau) pendant un scan de 20-30 fichiers fait tout perdre, oblige à tout rescanner et repayer les appels IA. Écartée.

Option B — job serveur asynchrone avec file d'attente et suivi Realtime.
Facilité faible (nouvelle Function de fond, table de suivi de job, polling ou Realtime côté front), fiabilité très haute mais surdimensionnée pour un usage ponctuel (onboarding = une fois par tenant, pas un usage quotidien). Écartée.

Option C — orchestration navigateur + sauvegarde progressive en base (RETENUE).
Facilité moyenne, fiabilité haute : le navigateur pilote le scan (upload, appels IA, dédup) mais chaque résultat de fichier est écrit en base dès qu'il arrive. Un incident pendant le scan ne fait perdre que le fichier en cours de traitement au moment de l'incident, jamais le travail déjà fait. À la reconnexion, l'utilisateur retombe sur l'écran de validation avec tout ce qui a déjà été traité.

---

4. PIPELINE — 4 ÉTAPES

Étape 1 — Tri local déterministe, zéro IA, zéro risque
Pour chaque fichier Excel/CSV déposé : parse local (SheetJS, déjà en place dans admin.js). Comparaison des en-têtes de colonnes aux 4 anciens modèles connus (articles, produits, clients, fournisseurs — cf. _dlTemplate actuel), tolérance casse/accents. Match exact ou quasi-exact → import direct par le chemin déterministe existant (logique de _massImport reprise telle quelle pour ce cas), zéro appel IA, fiabilité 100%. Pas de match, ou fichier PDF/image → part en étape 2.
Ce tri protège les utilisateurs qui ont déjà un fichier propre et réduit le volume traité par l'IA au strict nécessaire.

Étape 2 — Scan IA, fichier par fichier
Nouvelle fonction Netlify (voir section 6) appelée une fois par fichier restant après l'étape 1. 2-3 fichiers en parallèle (limite de concurrence côté navigateur, évite de saturer le rate limit Anthropic). Chaque appel retourne une liste d'entités détectées avec type, champs extraits, niveau de confiance et extrait source (pour audit). Barre de progression : X/N fichiers scannés, pourcentage, état par fichier en direct (en cours / terminé — N entités trouvées / terminé avec avertissement / échec).
Chaque résultat de fichier est écrit immédiatement dans la table de staging (section 5) dès qu'il revient — c'est ce qui garantit la résilience de l'option C.

Étape 3 — Dédoublonnage déterministe, jamais laissé à l'IA
Une fois tous les fichiers scannés (ou à la reprise après incident), chaque entité en staging est comparée : (a) aux entités déjà en base pour ce tenant (clients/fournisseurs/articles/produits chargés une fois en cache au début de cette étape), (b) aux autres entités du même lot. Comparaison floue : nom insensible casse/accents/abréviations, en reprenant la logique déjà en place et éprouvée dans ai_analyse_bc.js.
3 issues possibles par entité :
- Nouveau, aucune correspondance → statut "à créer", pré-validé si confiance haute.
- Correspondance forte avec un existant (nom quasi-exact + un champ clé identique : email, tel, ou siret) → statut "déjà existant", ignoré automatiquement, affiché en informatif seulement.
- Correspondance ambiguë (nom proche, pas de champ clé pour confirmer) → statut "doublon possible", mis de côté pour validation humaine.
C'est cette étape déterministe qui garantit qu'aucun doublon n'est créé silencieusement — l'IA ne décide jamais seule d'une fusion.

Étape 4 — Validation, les ~10% humains
Écran récapitulatif groupé par type (Clients détectés : X, Fournisseurs : Y, Articles : Z, Produits : W), lu depuis la table de staging. Chaque ligne a un statut pré-calculé :
- Confiance haute, pas de doublon, champs obligatoires présents → pré-coché "à importer", zéro clic requis.
- Confiance basse, OU doublon possible, OU champ obligatoire manquant (ex. nom vide) → mis en évidence, décoché par défaut, nécessite un clic (Confirmer / Corriger en ligne / Ignorer).
Correction en ligne = édition rapide des champs affichés, jamais un nouveau formulaire complet à ressaisir. Bouton d'import final actif dès qu'il ne reste plus de ligne en attente de décision, ou l'utilisateur peut choisir d'ignorer les litigieuses et importer le reste. L'import définitif écrit en base via les fonctions create* existantes (createClient, createFournisseur, createArticle, createProduit), dispatch appmee:datachanged avec entity: 'import_ia' ensuite, comme le fait déjà _massImport (Règle 5).

---

5. TABLE DE STAGING — Supabase

Nouvelle table import_scan_items. Champs proposés (à valider contre le schéma réel avant migration, cf. section 8) :
id uuid, tenant_id uuid, batch_id uuid (regroupe les fichiers d'un même onboarding), fichier_nom text, page_source int nullable, type_entite text (client/fournisseur/article/produit), champs jsonb (données extraites brutes), confiance text (haute/moyenne/basse), statut text (a_creer/deja_existant/doublon_possible/confirme/ignore), doublon_de_id uuid nullable (référence vers l'entité existante en cas de correspondance), extrait_source text (pour audit, court), created_at timestamptz.
Le batch_id permet de reprendre un scan interrompu : au chargement de l'écran, si un batch_id sans import final existe pour le tenant, proposer de reprendre plutôt que de repartir de zéro. Nettoyage : les lignes confirmées/importées ou ignorées peuvent être purgées après import réussi (pas besoin de les garder indéfiniment).

---

6. FONCTION IA — CONTRAT

Réutilisation de netlify/functions/ai_extract_doc.js, retravaillée (actuellement non appelée par le frontend — zéro risque de régression) :
- Correction de l'URL enregistrée : /api/ai_extract_doc (actuel, viole la Règle 3) → /api/ai-extract-batch (nouveau nom, cohérent avec la nouvelle fonction et la convention tirets).
- Entrée : fichier (base64), extension, tenantId, token — suppression du paramètre mode (obsolète, la détection est maintenant automatique).
- Sortie : { ok: true, entites: [ { type, champs, confiance, page_source, extrait_source } ], document_type_detecte, avertissements: [] }.
- Prompt : catégorisation + extraction en un seul appel. Instruction explicite : un document peut contenir plusieurs entités de types différents et plusieurs entités du même type (ex. catalogue fournisseur = 1 fournisseur + N articles) ; ne jamais inventer une donnée absente ; confiance basse obligatoire si le texte est flou/illisible plutôt qu'une extraction hasardeuse ; si le fichier contient plusieurs documents logiques (ex. 50 factures dans un seul PDF), retourner un groupe d'entités par document avec sa page source, jamais tout fusionner en un bloc.
- Schémas de champs par type (repris des champs réellement utilisés dans admin.js, vérifiés dans le code) :
  client : nom, siret, email, tel, adresse, contact, cpt, notes.
  fournisseur : nom, siret, contact, email, tel, adresse, iban, delai, categorie.
  article : ref, nom, categorie, unite, prix, fournisseur, seuil, stock.
  produit : ref, nom, prix (prix_vente), seuil, stock.
- Quota : hors quota IA mensuel classique pour le tout premier onboarding d'un tenant (décidé avec l'utilisateur), via un compteur dédié onboarding_ia_utilise sur la table tenants (booléen ou timestamp), pour empêcher de relancer l'onboarding en boucle et scanner gratuitement en continu. Un onboarding déjà utilisé retombe sur le quota mensuel standard pour tout scan ultérieur.

---

7. LIMITES ET GARDE-FOUS

Taille max par fichier : 15 Mo (aligné sur les limites raisonnables d'upload base64 vers une Netlify Function et l'API Anthropic). Nombre max de fichiers par lot : 30 (ajustable sans redesign — c'est une constante, pas une contrainte d'architecture). Extensions acceptées : pdf, png, jpg, jpeg, webp, xlsx, xls, csv. Fichiers rejetés au dépôt (mauvais format, trop lourd) affichés immédiatement, jamais envoyés au scan. PDF au-delà de la limite de pages gérée par l'API (traitement par vision) : message d'erreur explicite par fichier plutôt qu'un plantage silencieux, pas de découpage automatique en V1.

---

8. À VÉRIFIER AVANT IMPLÉMENTATION

Pas d'accès direct au schéma Supabase live depuis cet environnement (pas de CLI Supabase configuré, pas de migration SQL retrouvée pour les tables clients/fournisseurs/articles/produits — créées hors migrations versionnées). Les champs listés en section 6 sont déduits du code frontend réel (admin.js), fiables pour les champs utilisés par l'UI actuelle, mais à confirmer par une requête information_schema.columns avant d'écrire le premier insert, conformément à la règle du projet. Les colonnes nécessaires pour import_scan_items sont à créer via une nouvelle migration Supabase versionnée (contrairement aux tables historiques).

---

9. SCÉNARIOS À VALIDER AVANT LIVRAISON (Règle 21B)

Cas vide : lot déposé sans aucune entité détectable (ex. PDF vierge) → document_type_detecte = "illisible", aucune ligne en staging, message clair à l'utilisateur, pas d'erreur technique.
Cas nominal : 1 fichier, 1 entité claire, confiance haute → zéro clic, importé directement au clic final.
Cas doublon : même fournisseur présent dans 3 fichiers différents du même lot → une seule entité créée, les 2 autres détectées comme "déjà existant" (contre la première une fois confirmée) ou fusionnées en une seule proposition avant même l'écran de validation.
Cas multiple : lot de 30 fichiers, mélange PDF/Excel/image → progression fluide, aucun fichier ne bloque les autres (un échec isolé n'arrête pas le lot).
Cas limite : champ obligatoire absent (nom vide) → jamais envoyé à l'insert, systématiquement dans les 10% à valider ou rejeté avec message clair.
Cas interdit : tentative de relancer un onboarding déjà marqué utilisé pour repasser hors quota → bloqué, retombe sur le quota mensuel standard.
Cas temporel : scan commencé, navigateur fermé, reconnexion 2 jours après → batch_id retrouvé, écran de validation reprend avec les fichiers déjà traités, proposition de relancer le scan seulement pour les fichiers manquants.

---

10. HORS SCOPE (rappel)

Commandes historiques — import par modèle Excel existant conservé en secours. Recettes — spec séparée après ce module. Bouton de téléchargement des modèles Excel — retiré de l'écran principal, éventuellement conservé en option avancée discrète, à trancher en phase d'implémentation si besoin réel identifié.
