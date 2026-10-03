# Nomenclature articles — Les Confitures de Pascal (tenant 0cbb535e-3bc1-43f5-b7f3-83d1285436b4)

Date : 2026-09-27
Portée : ce tenant uniquement. Aucun autre tenant touché.

## Règle appliquée

Références
- Fruits : FRT-<NOM DU FRUIT> (qualificatif ajouté seulement quand plusieurs
  articles portent le même fruit : origine ou forme).
- Ingrédients : ING-<NOM>.
- Le code fournisseur qui servait de référence (LR BIO, Aquitaine Biologie,
  SVP Negoce) n'est pas perdu : il est reporté en fin de nom après « · »,
  pour rester utilisable au moment de commander.

Noms
- Le nom commence toujours par le fruit. Plus de « VRAC … » ni de « PRUNE … »
  en tête.
- Le reste de la description du fournisseur est conservé (variété, origine,
  calibre, catégorie, conditionnement).

## Tables mises à jour

- articles.ref et articles.nom (40 lignes)
- mouvements.ref — la trace d'inventaire pointe sur la nouvelle référence
- achats.article_nom — le nom figé sur les 12 bons de commande brouillon

Les recettes ne sont pas touchées : elles pointent sur articles.id, pas sur la
référence. Aucune quantité modifiée.

## Sauvegarde avant / après

Voir SESSIONS/2026-09-27-nomenclature-articles-pascal.json

## Fusion des doublons de fruits (validée le 2026-09-27)

Un seul article par fruit, utilisé dans toutes les recettes, prix achat
harmonisé à 4,80 € le kg.

| Fruit | Article conservé | Articles supprimés |
|---|---|---|
| Kiwi | FRT-KIWI — Kiwi bio | FRT-KIWI-IT, FRT-KIWI-NZ, FRT-KIWI-ES |
| Poire | FRT-POIRE — Poire bio | FRT-POIRE-CONFERENCE |
| Rhubarbe | FRT-RHUBARBE — Rhubarbe bio | FRT-RHUBARBE-FRAIS |
| Fruit de la passion | FRT-PASSION — Fruit de la passion bio | FRT-PASSION-2 |

L'article conservé est celui qui était déjà le plus utilisé en recette.
Les 2 lignes de recette qui pointaient sur un doublon ont été repointées :
Confiture Kiwi Mangue Passion 230g (kiwi 0,0764 kg) et Confiture Kiwi
Passion 230g (passion 0,073 kg). Aucun produit n'utilisait déjà l'article
canonique, donc aucune ligne en double n'a été créée.

Stock : 10 kg transférés de FRT-KIWI-ES vers FRT-KIWI. Les autres doublons
étaient à zéro.

Point non tranché — FRT-KIWI-NZ portait 20 en unité COL au prix de 49 €.
Impossible de savoir s'il s'agissait de 20 kg ou de 20 colis (soit environ
200 kg). La quantité n'a donc PAS été transférée : le stock kiwi est à
10 kg, à corriger par un inventaire.

Contrôle d'invariance : coût total des recettes 80,661355 € avant et après.
Les deux articles échangés étaient au même prix, le coût de revient des
produits est donc inchangé.

## Rattachement des fournisseurs (2026-09-27)

| Périmètre | Fournisseur écrit en base | Lignes |
|---|---|---|
| Catégorie Étiquette (les 50, étiquette couvercle comprise) | Imprimerie du Court-Bran (ICB) | 50 |
| Catégorie Capsule — Capsule T066 Twist-Off | Massilly Conservor | 1 |
| ING-SUCRE | SVP Negoce | 0 (déjà en place) |

Le nom écrit dans articles.fournisseur est le nom exact de la fiche
fournisseur du tenant, pas l'abréviation. Sans ça l'application traiterait
« ICB » et « Imprimerie du Court-Bran (ICB) » comme deux fournisseurs
distincts : le regroupement des bons de commande se scinderait en deux et la
liste déroulante du modal article ne présélectionnerait rien.

« Couvercle » a été compris comme la capsule métallique Twist-Off T066 : la
fiche Massilly Conservor porte elle-même « verrerie, capsules, palettes ».
L'étiquette couvercle, elle, reste une étiquette et part chez ICB.

Reste sans fournisseur après cette passe : 14 fruits, 11 ingrédients et le
verre Bonta 212 ml.

## Recalcul des coûts de revient (2026-09-27)

47 produits recalculés depuis leur recette, 46 valeurs ont changé.
6 produits sans recette portaient un coût inventé de 1,80 € : remis à 0, la
colonne Marge affiche « à définir » au lieu d'un chiffre faux.

La marge n'est pas une colonne stockée : elle est calculée à l'affichage
(prix de vente − coût de revient). Elle est donc juste partout où le coût
est juste.

Coût de revient : de 0,7735 € à 3,6226 €, moyenne 1,7162 €.
Marge moyenne 3,111 €, taux moyen 215,7 %, aucune marge négative.

Contrôle : somme des coûts stockés 80,660600 € contre invariant recettes
80,661355 €. L'écart de 0,000755 € est l'arrondi à 4 décimales appliqué à
chacun des 47 produits. Aucun produit désynchronisé.

### Ce qui reste faux, et pourquoi — par ordre d'impact

1. CONFITURE FRAMBOISE MYRTILLE CASSIS 230G — coût 3,62 € contre 1,72 € de
   moyenne. Sa recette pèse 775 g d'entrée pour un pot de 230 g, ratio 3,37
   quand toutes les autres sont à 1,20. Les 3 fruits portent chacun
   0,1461 kg, qui est visiblement le poids TOTAL de fruit, recopié sur
   chaque ligne. Valeur probable : 0,0487 kg par fruit et 0,1096 kg de
   sucre, soit un coût d'environ 1,93 €. Non corrigé : consigne de ne pas
   toucher aux quantités de recette.
2. 20 recettes anciennes à ratio 1,00 et au coût identique de 1,7325 €.
   Elles ont été saisies en poids de sortie (230 g répartis fruit/sucre),
   donc sans l'évaporation, et avec les mêmes quantités pour tous les
   parfums. Coût plausible mais génerique, pas réel.
3. 6 recettes sans verre, capsule ni étiquette : coût sous-estimé de 0,96 €
   par pot (verre 0,25 + capsule 0,60 + 2 étiquettes 0,11).
4. 11 ingrédients à prix 0 : pectine (30 recettes), jus de citron (26),
   mélange d'épices (24), eau (17), vanille (9), cannelle, gingembre,
   cardamome, poivre, badiane, clou de girofle. L'eau est légitimement à 0,
   les autres manquent.
5. 5 produits sans prix de vente : marge incalculable.

## Inventaire de fin septembre (2026-09-27)

Source : fichier stock_2026_sept.xlsx fourni par l'utilisateur, deux onglets.

### Seuils et valeurs directes
- Seuil de tous les produits finis (53) : 70
- Seuil de toutes les étiquettes (51) : 100
- Stock Verre Bonta 212 ml : 150

### Stock produits finis — onglet "stock 2709", colonne J (Total)
48 EAN distincts sur 60 lignes. Plusieurs lignes partagent le même EAN pour
des variantes de destination commerciale (LGEP, Schilliger, Bio C Bon) ou
de format (30g, 650g) : les totaux ont été sommés par EAN, car dans notre
ERP c'est le même produit physique, une seule fiche.
- 48 produits mis à jour (stock = total de l'onglet)
- 17 produits à stock 0 → hors_stock = true (règle explicite du client)
- 5 produits non couverts par cet inventaire (pas de ligne dans l'Excel,
  ce sont les 5 références en majuscules déjà signalées comme anomalies
  de données : FRAMBMYRTCAS230, GROSEILLE230, KIWIPOMME230, ORANGE230,
  ORANGECITRON230) — stock laissé inchangé, non traité ici.

### Stock étiquettes — dicté dans le chat
13 correspondances directes + 1 étiquette créée (Framboise Litchi
Champagne, qui a un produit existant depuis le lot précédent mais n'avait
jamais eu sa propre étiquette). Les 37 autres étiquettes du catalogue,
non citées dans la liste, mises à stock 0 et hors_stock = true.

6 lignes de la liste dictée ne correspondent à aucune étiquette ni aucun
produit existant dans la base : Pomme (200), Oignon (200), Kiwi citron
vert (400), Mûre (400), Citron vert (400), Mirabelle quench (400).
Non écrites. Décision utilisateur du 2026-09-27 : abandonnées
définitivement, pas de création d'article ni de produit pour ces 6 noms.
Ces 2 700 pots de stock d'étiquette restent absents de la base — si ces
parfums existent réellement chez Pascal, il faudra les faire remonter par
un futur import (produit + recette + étiquette), pas par un simple ajustement
de stock.

### Stock épices — onglet "ingrédients", colonne C (grammes → kg)
7 correspondances directes (Pectine LM, Poivre, Clou de girofle,
Cardamome, Badiane, Gingembre, Cannelle) + 1 ingrédient créé (Noix de
muscade bio, ING-NOIX-MUSCADE, absent du catalogue, 600g).

### Contrôle
Invariant coût recettes inchangé : 80,661355 € avant et après — confirme
que seuls stock, seuil et hors_stock ont été touchés, jamais un prix.
0 anomalie stock positif + hors_stock, sur produits comme sur étiquettes.

## Fournisseurs des fruits — règle agrumes / autres (2026-09-27)

Décision utilisateur : tous les articles Fruit répartis en deux groupes,
sans exception, y compris ceux qui avaient déjà un fournisseur renseigné.

- Agrumes (9) -> LR BIO : Bergamote, Citron, Citron vert, Clémentine,
  Mandarine, Orange, Orange (jus et zeste), Orange amère, Pamplemousse
- Tous les autres fruits (24) -> AQUITAINE BIOLOGIE

7 articles ont changé de fournisseur par rapport à ce qui existait avant
(Abricot, Cerise, Kiwi, Mirabelle, Poire, Quetsche, Reine Claude étaient
en LR BIO, passent en AQUITAINE BIOLOGIE). Les 6 agrumes qui n'avaient
aucun fournisseur (Bergamote, Citron vert, Clémentine, Orange, Orange jus
et zeste, Orange amère) sont désormais rattachés à LR BIO.

Contrôle : 33 fruits, 9 + 24 = 33, 0 fruit sans fournisseur. Reste sans
fournisseur : les 12 ingrédients (épices, pectine, eau, jus de citron,
mélange d'épices) — hors périmètre de cette règle, qui ne portait que sur
les fruits.

## Fournisseurs des épices (2026-09-27)

Deux fiches créées dans le tenant Les Confitures de Pascal :
- Alpi Nature — catégorie "épices"
- Louis François — catégorie "ingrédient technique" (le nom donné dans le
  chat était « Louis France » ; la source d'origine, l'onglet ingrédients
  de stock_2026_sept.xlsx, porte « Louis François ». J'ai retenu le nom de
  la source.)

Rattachement :
- Alpi Nature -> 9 articles : Badiane, Cannelle, Cardamome, Clou de
  girofle, Gingembre, Mélange d'épices, Noix de muscade (déjà en place
  depuis sa création), Poivre, Vanille
- Louis François -> Pectine LM

Vanille bio et Mélange d'épices bio n'étaient pas dans l'onglet ingrédients
de l'inventaire de septembre (qui ne listait que 8 lignes). Je les ai
rattachés à Alpi Nature par cohérence de catégorie — à confirmer si Pascal
les achète effectivement ailleurs.

Contrôle : 9 articles Alpi Nature, 1 article Louis François. Restent sans
fournisseur : Eau (jamais achetée), Jus de citron bio (pas une épice),
Verre Bonta 212 ml (probablement Massilly Conservor par cohérence avec la
capsule, non modifié sans confirmation).

## Démonstration réelle de l'auto-OF (2026-10-03)

TEST-CMD-03 passée au statut "planifié" (simulant le clic "avancer" de
l'interface, maintenant équipée du correctif commandePlanifiee). 3 OF créés
automatiquement, sans date, liés via commandes_ids : OF0001 (Orange Coing,
20), OF0002 (Griotte, 10), OF0003 (Rhubarbe, 15).

Effet vérifié : le manque en production (Plan de fabrication) retombe à 0
pour les 3 produits, puisque stock + OF planifié couvre maintenant la
demande cumulée (Griotte : 18 + 10 = 28 ≥ 22 ; Rhubarbe : 21 + 15 = 36 ≥ 25).
TEST-CMD-04, non planifiée, reste visible comme demande non couverte tant
qu'elle n'est pas, elle aussi, avancée à "planifié".

Ces 3 OF portent le même tag [TEST]/commandes_ids que les commandes
fictives — à supprimer avec elles sur demande.

## Batch « Améliorations » — Dashboard / Stock / Commandes / Production (2026-10-03)

Changement de CODE uniquement, valable pour tous les tenants. Aucune
donnée Pascal modifiée dans ce lot (lu seulement, pour vérifier en
conditions réelles sur TEST-CMD-01..05).

Root cause corrigée en premier (fondation du reste) : le listener
`appmee:datachanged` dans app.html ne réagissait qu'aux entités
'import_masse'/'import_ia' — tout changement de statut commande/production
ailleurs dans l'app ne synchronisait jamais les autres écrans. Élargi à
toute entité.

1. js/ui.js — `allouerStockSequentiel(stockDisponible, besoins)` : répartit
   le stock d'un produit entre ses commandes dans l'ordre d'enregistrement
   (la plus ancienne d'abord, tie-break = plus petite quantité entre deux
   commandes enregistrées au même instant). Fonction unique réutilisée par
   Commandes Clients ET Production — jamais deux calculs séparés qui
   pourraient diverger. Testée isolément (13 assertions, cas réels Griotte
   stock 18 / 10+12, Rhubarbe, stock 0, stock largement suffisant,
   tie-break) avant intégration.
   + `estAlerteDashboard(item)` : réservé aux 4 encarts d'alertes du
   Dashboard, exclut le stock à 0 (Stock Articles/Produits
   Finis/Production continuent de voir les vraies ruptures).
   + `selectStatutCmd()`/`restyleSelectStatutCmd()` : liste déroulante
   statut numérotée et colorée, remplace le bouton "Avancer", partagée
   entre Dashboard et Commandes Clients.
   + `stockStatus()` : stock à 0 affiche désormais "Hors stock" (au lieu
   de "Rupture").

2. Stock Articles (stock.js) + Produits Finis (produits.js) : suppression
   de la case "hors stock" manuelle et de tout ce qu'elle impliquait
   (colonne, checkbox, mise à jour en base). Remplacée par la règle :
   stock réel à 0 ⇒ badge "Hors stock" automatique, mais toujours une
   vraie alerte dans ces deux modules et en Production (seul le Dashboard
   l'exclut, via estAlerteDashboard).

3. Dashboard (dashboard.js + app.html) : le bloc commandes passe en
   premier sous les KPIs, renommé "Commandes Clients en cours" ; affiche
   toutes les commandes hors clôturée (plus de limite à 8) ; colonne
   Livraison (date_livraison) au lieu de la date de commande ; chaque
   ligne se déplie au clic pour voir les articles commandés ; statut
   changeable directement via la même liste déroulante que Commandes
   Clients (changerStatutCommande, importé depuis commandes.js — un seul
   code qui décide du changement de statut, jamais deux).

4. Commandes Clients (commandes.js) : bouton "Avancer" remplacé par la
   liste déroulante numérotée/colorée ; bouton aperçu PDF retiré ; la
   colonne Faisable de chaque ligne utilise désormais
   allouerStockSequentiel() au lieu de comparer bêtement la ligne au
   stock total (qui faisait comparer chaque commande au stock plein,
   sans tenir compte des commandes déjà enregistrées avant elle sur le
   même produit). Nouvelle commande : statut de départ "planifié" (plus
   "à produire") — elle apparaît donc immédiatement en Ordres de
   fabrication, sans date (choisie ensuite dans la liste des OF).
   `avancerStatutCommande` (db.js) et les constantes STATUTS_COMMANDE /
   STATUTS_COMMANDE_LABELS (config.js), devenues inutilisées par ce
   changement, ont été supprimées.

5. Production (production.js + app.html) : la table "Plan de
   fabrication" est remplacée par une vue consolidée par produit (une
   ligne par produit fini, stock / demande totale / OF en cours / reste
   à produire mis en avant), dépliable pour voir la répartition par
   client — vert = couvert par le stock actuel, rouge = à produire pour
   couvrir les autres clients — via allouerStockSequentiel(). La table
   "Articles à commander" reste inchangée (alerte matières premières,
   pas produits finis). La table "Ordres de fabrication" (dates, statuts,
   clôture) n'a pas été touchée : c'est elle qui agit réellement sur le
   stock à la clôture, la fusionner dans la nouvelle vue aurait fait
   perdre l'édition de date/statut par OF individuel — signalé pour
   validation si une fusion plus poussée est souhaitée.

Vérifié avant livraison : node --check sur les 10 fichiers touchés +
extraction/validation du script module de app.html ; test isolé des 13
assertions allouerStockSequentiel ; relecture manuelle contre les
commandes/produits réels de ce tenant (Griotte stock 18, Rhubarbe stock
21, tie-break sur commandes enregistrées au même instant) ; suite de
tests unitaires existante (2/2) toujours verte.

## Admin — onglets par section (2026-10-03)

Code uniquement, aucune donnée touchée. La page Admin affichait Mon
entreprise / Articles / Catégories / Produits finis / Clients /
Fournisseurs à la suite, en une seule page qui s'allonge. Remplacé par 5
onglets (un par section), affichage pur show/hide sur des conteneurs
`[data-admin-panel]` — chaque section garde exactement ses ids d'origine,
`init()`/`render()` de admin.js n'ont pas changé : aucune interdépendance
touchée avec le reste du code (recherche, formulaires d'édition,
suppression doublons, import IA/avancé). Catégories d'articles reste
nichée dans l'onglet Articles (details/summary existant, inchangé).

## Ordres de fabrication — commandes sans OF (2026-10-03, option 2)

Suite à la question « pourquoi les Ordres de fabrication ne listent pas
tous les produits manquants » : diagnostic posé (OF = décision de
production déjà prise ; Besoins de production par produit = calcul brut,
qu'un OF existe ou non) puis 2 options présentées. Option 2 retenue :
ajouter dans la table Ordres de fabrication les commandes (hors
clôturée/annulée) dont au moins une ligne n'a encore aucun OF actif qui la
couvre, avec un badge "Pas encore planifié" et un bouton "Créer OF"
(réutilise creerOFsPourCommande, idempotent) directement depuis la ligne.
Chaque ligne se déplie au clic pour voir les articles de ce bon de
commande et leurs quantités. La création/clôture d'OF elle-même n'est pas
touchée.

Vérifié en direct contre les vraies données de ce tenant (lecture seule) :
TEST-CMD-01 et TEST-CMD-02 (aucun OF) et TEST-CMD-04 (Griotte/Rhubarbe,
seules les lignes de TEST-CMD-03 sont couvertes par OF0002/OF0003)
apparaissent bien comme "Pas encore planifié" ; TEST-CMD-03 (couverte par
OF0001/2/3) et TEST-CMD-05 (couverte par OF0004 — créé en dehors de cette
session, probablement par Pascal lui-même sur son compte réel) n'y
apparaissent pas, à juste titre.

## Production — refonte par bon de commande + automatisation statut (2026-10-03)

Suite à la discussion sur "produit fini vs bulk/quantité qui couvre
plusieurs commandes" : confirmation que l'app fonctionne par produit fini
partout, et que produire pour plusieurs commandes à la fois (une fournée,
jamais un batch par client) doit être la norme — ce que la vue consolidée
par produit (Besoins de production) permettait déjà de voir, mais sans
pouvoir agir dessus.

1. Page Production réorganisée en 3 rôles distincts, pour que chaque vue
   des "commandes en cours" (Dashboard, Commandes Clients, Production)
   ait une fonction propre et ne répète pas les autres :
   - Commandes en cours (nouveau, prodCommandesTbody) : suivi client pur,
     une ligne par commande non clôturée (réf, client, livraison, statut
     — même contrôle que partout ailleurs), dépliable pour voir prêt
     (vert) / à produire (rouge) par ligne. Aucune action de production.
   - Besoins de production par produit (existant, enrichi) : bouton
     "Créer OF" quand reste à produire > 0 — crée UNE fournée qui couvre
     d'un coup toutes les commandes en attente de ce produit
     (creerOFPourProduit, commandes_ids = liste des commandes couvertes).
   - Ordres de fabrication (OF) : revenu à son rôle d'origine, liste des
     OF réels avec date/statut/clôture — la ligne "commandes sans OF"
     ajoutée la session précédente est retirée, remplacée par les 2
     points ci-dessus.
2. Bug corrigé dans _terminerFabrication (clôture d'un OF) : le passage
   automatique d'une commande à "prêt" comparait le stock brut du produit
   à la quantité de CHAQUE commande indépendamment (`pp.stock >=
   l.quantite`) — exactement le bug d'allocation déjà corrigé ailleurs
   cette session, mais oublié ici. Remplacé par
   allouerStockSequentiel() (nouvelle fonction _commandeEstCouverte).
   Vérifié sur les vraies données : Rhubarbe stock 21, TEST-CMD-03 (15)
   et TEST-CMD-04 (10) enregistrées au même instant — l'ancien calcul
   aurait déclaré TEST-CMD-03 "prête" (21 ≥ 15) en ignorant que
   TEST-CMD-04 consomme aussi ce stock ; le nouveau calcul la garde à
   juste titre non couverte (seulement 11 des 15 disponibles après
   allocation du tie-break).
3. Dashboard : table Commandes Clients en cours simplifiée à l'essentiel
   (réf, client, livraison, statut) — retrait du montant et de la liste
   d'articles dépliable, qui vivent déjà dans Commandes Clients et
   Production. But explicite : que chaque écran ait un intérêt propre.

## Production — planification depuis Commandes en cours, renommage (2026-10-03)

Suite directe du point précédent : la section "Commandes en cours" est
renommée "Ordres de fabrication" (le nom historique passe sur cette vue
par commande) ; l'ancienne table OF (dates/statuts/clôture, inchangée
dans son rôle) est renommée "Ordres de fabrication — suivi des lots"
pour ne pas avoir deux titres identiques. Les deux textes d'aide
("cliquer une ligne pour le détail…") passent en gris, petite taille,
moins proéminents que les titres. La phrase explicative "Reste à
produire : la quantité couvre toutes les commandes…" est retirée de
Besoins de production — redondante avec l'explication déjà donnée à
l'oral.

Le bouton "Créer OF" de Besoins de production par produit est retiré —
remplacé par une capacité plus directe : dans le détail dépliable d'une
commande (Ordres de fabrication), chaque ligne "à produire" porte
maintenant un champ date. Choisir une date y crée (ou, si un OF actif
couvre déjà ce produit, met à jour) la fournée qui couvre TOUTES les
commandes en attente de ce produit — jamais un OF par commande
(creerOFPourProduit accepte désormais une date, commandes_ids reste la
liste de toutes les commandes couvertes).

Point explicitement laissé de côté, car formulé au conditionnel par
l'utilisateur ("si on doit aller plus loin") : supprimer aussi l'ancienne
table "Ordres de fabrication — suivi des lots" et le bouton "+ Planifier
un OF". Je n'ai pas touché à ça — c'est l'endroit qui déclenche
réellement la clôture (décrément de stock, facture), je préfère une
confirmation explicite avant d'y toucher.

## Suppression de l'ancienne table OF + stock disponible net (2026-10-03)

Confirmation reçue : suppression de la table "Ordres de fabrication —
suivi des lots" et du bouton "+ Planifier un OF". La capacité qu'ils
portaient (date, statut, clôture réelle qui décrémente le stock et
facture) n'est pas perdue — elle est déplacée dans le détail dépliable
d'une commande (section Ordres de fabrication) : chaque ligne "à
produire" porte maintenant, en plus du champ date, le même sélecteur de
statut (À planifier/Planifié/En cours/Fabriqué/Clos/Annulé) et un bouton
de suppression, quand un OF existe déjà pour ce produit. Choisir "Clos"
déclenche exactement le même _terminerFabrication qu'avant (décrément
articles, entrée stock produit fini, facture si la commande devient
prête) — rien n'a changé dans ce mécanisme, seul son point d'accès a
bougé.

Nettoyage associé (code mort devenu orphelin par ce changement, ou déjà
orphelin d'une session précédente et remarqué au passage) : `_renderOFs`,
`_toggleDetailOF`, le formulaire "+ Planifier un OF" complet
(`initPlanifierModal`, `_addOFLigne`, `addOFLigne`, `_savePlanifier`),
`_creerOF` (déjà mort), `_achatsEnCoursPourArticle`/`_achats`/`getAchats`
(déjà morts depuis la refonte de Plan de fabrication plus tôt dans la
session). Les 2 autres boutons "Produire" qui ouvraient ce modal
(Produits Finis, Recettes) pointent maintenant vers la page Production
(`appmee:navigate`) au lieu d'ouvrir un modal qui n'existe plus.

Stock disponible net — la distinction demandée entre stock réel et stock
réellement disponible pour une NOUVELLE commande ou un nouvel OF.
Diagnostic : la plupart des calculs (Commandes Clients, Production)
utilisaient déjà allouerStockSequentiel() et géraient donc correctement
cette distinction — sauf un endroit resté sur l'ancien calcul naïf : le
petit texte d'aide affiché pendant la création d'une commande
(_updateCmdHint dans commandes.js), qui comparait la quantité saisie au
stock brut du produit, sans tenir compte de ce que les commandes déjà
enregistrées avaient déjà réservé sur ce même produit. Corrigé avec une
nouvelle fonction _stockDisponibleNet(produitId) : stock réel moins la
part déjà consommée par l'allocation séquentielle des commandes en
cours. Exemple réel : Griotte stock 18, déjà entièrement réservé par
TEST-CMD-03 (10) et TEST-CMD-04 (12) → une 6e commande sur ce produit
verrait maintenant "Disponible : 0" au lieu de "Stock : 18" comme avant.

Vérifié avant livraison : node --check sur tous les fichiers touchés +
script module app.html, recherche exhaustive de toute référence
résiduelle aux symboles supprimés (aucune trouvée), suite de tests
unitaires existante (2/2) toujours verte.

## Besoins de production / Articles à commander : bilan complet (2026-10-03)

Diagnostic : les deux tables du bas de la page Production
(_vueConsolideeParProduit et _renderBesoins) ne listaient que les
produits/articles ayant une commande ou un OF en cours — un produit sans
demande actuelle (ou un article sans manque actuel) disparaissait
entièrement du tableau. Ce n'est pas un bug introduit aujourd'hui, c'est
comme ça depuis la création de ces deux vues plus tôt dans la session ;
l'utilisateur a demandé explicitement un bilan complet : toutes les
confitures (53 produits chez ce tenant), toutes les matières premières
utilisées dans une recette (85 articles), chacune avec son statut (0
quand rien n'est dû), pas seulement celles en alerte.

Corrigé : _vueConsolideeParProduit() part maintenant de tous les
produits du tenant (plus seulement ceux avec OF/commande) ; _renderBesoins()
initialise chaque article de recette à 0 avant d'accumuler la demande
réelle. Dans les deux cas, le tri garde les plus urgents (reste à
produire / manque > 0) en premier, le reste (déjà couvert) en dessous
par ordre alphabétique — rien n'est caché, mais l'essentiel reste visible
sans défiler. Le calcul lui-même (allocation séquentielle, agrégation
par recette) n'a pas changé, seul le filtre d'affichage est retiré.

Signalé à l'utilisateur sans y toucher : les deux tables font
maintenant 53 et 85 lignes respectivement — un repli façon Historique
(details/summary, déjà utilisé ailleurs dans la page) pourrait les
raccourcir visuellement si besoin, pas demandé pour l'instant.

## Correction immédiate : périmètre trop large (2026-10-03)

L'utilisateur a corrigé tout de suite : "Seulement les produits dans
une commande" — pas tout le catalogue (53 produits), seulement ceux
réellement commandés au moins une fois. Nouvelle fonction partagée
_produitsCommandes() (produits référencés par au moins une ligne de
commande, tout statut confondu, + défensif les produits des OF
existants) utilisée à la fois par _vueConsolideeParProduit() et par
l'initialisation à 0 des articles dans _renderBesoins() — les deux
tables gardent donc le même périmètre. Vérifié sur les vraies données :
9 produits sur les 53 du catalogue ont déjà été commandés chez ce
tenant — c'est ce nombre qui apparaît maintenant, plus les 53.
