Livrable bloc 3 (J3 du plan). Trois parties : la liste corrigée (Agence Bio), ce qui reste réellement à faire (Facebook), et l'enrichissement email en cours (canal retenu : emailing à froid).

=====================================================================
LISTE AGENCE BIO — v2, 476 lignes, filtrée sur la taille réelle d'entreprise
=====================================================================

Correctif du 05/09 : la première version (200 lignes, filtrée seulement par activité NAF + certification bio) laissait passer de gros groupes industriels — Bonduelle, Florette, D'Aucy, Gelagri étaient dans les premières lignes. Le filtre par métier ne suffisait pas à isoler le persona du plan ("artisan transformateur, seul ou 1-3 personnes").

Correction : ajout d'un filtre sur l'effectif salarié (donnée officielle INSEE, disponible dans la même API), retenu uniquement les tranches NN/00/01/02 — c'est-à-dire 0 à 5 salariés, cohérent avec "seul ou 1-3 personnes". Nouvelle extraction sur les mêmes 8 codes NAF, avec ce filtre en plus : 476 entreprises bio-certifiées, taille artisan, réparties sur :
- 10.39A/B — conserves et confitures : 150
- 10.82Z — chocolat et confiserie : 52
- 10.72Z — biscuiterie : 58
- 10.84Z — condiments : 34
- 11.03Z — cidre et vins de fruits : 32
- 11.07B — jus et boissons : 75
- 01.49Z — apiculture/miel : 75

Vérifié après filtrage : plus aucun grand groupe dans l'échantillon (contrôle sur les noms connus, zéro résultat).

Colonnes du fichier `02_prospects_agence_bio.csv` : SIRET, nom, effectif (tranche INSEE), activité (libellé + code NAF), code postal, commune, département, région, date de création, nombre d'établissements ouverts, email, site_web, instagram (ces 3 dernières vides — enrichissement en cours, voir section suivante).

476 lignes, largement au-dessus des 150 visées au plan — gardées toutes, aucune n'est jetée. Priorise par département/région si tu veux démarrer par une zone précise.

=====================================================================
ENRICHISSEMENT EMAIL — canal retenu : emailing à froid
=====================================================================

La base publique ne contient aucun email ni site web — recherche entreprise par entreprise nécessaire, pas d'API qui donne ça directement. Sur 476 lignes, un enrichissement exhaustif en une passe n'est pas réaliste dans une session — à faire par lots.

=====================================================================
GROUPES FACEBOOK — limite réelle, pas un oubli
=====================================================================

Le plan renvoyait à une "liste A3" comme si elle existait déjà — en vérifiant, l'annexe A3 du 29/08 contient une stratégie de mots-clés de recherche, pas une liste de 12-15 groupes nommés. Cette liste concrète n'a donc jamais été produite, ni le 29/08 ni maintenant : les groupes Facebook (contrairement aux pages publiques) ne sont pas indexés par la recherche web — Facebook les protège derrière une connexion. Je ne peux pas les lister depuis l'extérieur sans inventer des noms, ce que je ne ferai pas.

Ce que je peux te donner : les mots-clés de recherche à utiliser toi-même une fois connecté à Facebook (repris de l'annexe A3, toujours valides) :
"transformateurs" · "conserverie" · "vente directe producteurs" · "artisans agroalimentaire" · "micro-entreprise agroalimentaire" · "bio et local" + groupes régionaux de producteurs + groupes par produit (ex. "confituriers", "brasseurs bio")

Quelques pistes trouvées en recherche web (ce sont majoritairement des pages publiques, pas des groupes fermés à rejoindre — à vérifier toi-même sur Facebook) : "Artisans et Auto-entrepreneurs" (groupe généraliste avec déclinaisons régionales), "Micro-entrepreneur", "Aide et Entraide Indépendants", "Le coin des travailleurs indépendants". Aucune de ces quatre n'est spécifique à la transformation bio alimentaire — à toi de juger si elles valent la peine une fois dans Facebook, ou de chercher directement avec les mots-clés ci-dessus.
