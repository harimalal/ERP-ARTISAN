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
