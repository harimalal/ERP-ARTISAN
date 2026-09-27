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
Non écrites — en attente de clarification. Détail dans la réponse à
l'utilisateur du 2026-09-27.

### Stock épices — onglet "ingrédients", colonne C (grammes → kg)
7 correspondances directes (Pectine LM, Poivre, Clou de girofle,
Cardamome, Badiane, Gingembre, Cannelle) + 1 ingrédient créé (Noix de
muscade bio, ING-NOIX-MUSCADE, absent du catalogue, 600g).

### Contrôle
Invariant coût recettes inchangé : 80,661355 € avant et après — confirme
que seuls stock, seuil et hors_stock ont été touchés, jamais un prix.
0 anomalie stock positif + hors_stock, sur produits comme sur étiquettes.
