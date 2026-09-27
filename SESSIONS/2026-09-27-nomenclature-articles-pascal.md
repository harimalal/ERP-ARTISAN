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
