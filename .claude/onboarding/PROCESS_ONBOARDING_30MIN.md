# ARTEASY — Onboarding client en 30 minutes
Version 1 — 27 septembre 2026
Tiré de l'onboarding réel de Les Confitures de Pascal (97 articles, 53 produits,
412 lignes de recette) et des erreurs qui ont coûté du temps dessus.

> Les 30 minutes sont le **temps du client**. La création de la base, elle,
> est scriptée et prend 10 minutes de notre côté, sans le client.

---

## LE PRINCIPE — pourquoi 30 minutes suffisent

Sur 97 articles chez Pascal, **36 étaient déductibles mécaniquement de la liste
des produits** (1 étiquette par parfum, 1 verre, 1 capsule, 1 étiquette
couvercle partagés). On ne demande jamais au client ce qu'on peut déduire.

La liste des produits finis est la colonne vertébrale : elle donne les
étiquettes, les emballages, les recettes à remplir, et la vérification de
complétude. On part toujours d'elle.

---

## PHASE 0 — Le kit de démarrage (client seul, 10 min, avant le rendez-vous)

Message à envoyer tel quel au client :

> Pour préparer ton espace, rassemble 4 choses. Pas besoin de fichier Excel,
> des photos suffisent.
>
> 1. La liste de ce que tu vends, avec le prix de vente HT. Ton tarif, ton
>    site, tes étiquettes ou juste une photo de ton rayon : ce que tu as.
> 2. Tes 3 dernières factures fournisseurs. Photo ou PDF.
> 3. Une seule recette écrite, celle que tu fais le plus souvent, avec le
>    nombre de pots que ça donne. Exemple : 10 kg de fraises + 8 kg de sucre
>    donnent 78 pots de 230 g.
> 4. Ton en-tête de facture : raison sociale, SIRET, n° de TVA, IBAN.
>
> Si tu as un Excel, encore mieux : envoie-le tel quel, on s'adapte.

### Ce que chaque pièce produit

| Pièce fournie | Ce qu'on en tire |
|---|---|
| Liste de vente | produits finis, prix de vente, et par déduction les étiquettes |
| Factures fournisseurs | fournisseurs, articles matières, prix d'achat, unités, codes fournisseurs |
| 1 recette + rendement | le gabarit de toutes les recettes, et le taux d'évaporation |
| En-tête de facture | l'entreprise, la TVA, l'IBAN des factures |

### Les 3 cas de figure — aucun ne bloque

**Cas A — il a un Excel.** On le prend tel quel. Si les en-têtes matchent nos
modèles, l'import est déterministe : zéro IA, zéro risque, zéro coût. Sinon
l'IA mappe les colonnes.

**Cas B — il a du papier ou des PDF.** Photos dans Import de données. L'IA
extrait. On relit avant d'écrire.

**Cas C — il n'a rien d'écrit.** Entretien guidé de 30 minutes avec les
6 questions de la phase 1. On tape pendant qu'il parle. C'est le cas le plus
fréquent chez un artisan.

---

## PHASE 1 — Les 30 minutes, dans cet ordre

### T+0 à T+4 — L'entreprise (5 réponses)
Raison sociale, SIRET, n° TVA, adresse, IBAN. Plus le taux de TVA par défaut.
→ Admin > Mon entreprise.
Pourquoi en premier : sans ça, aucune facture ne sort, et c'est la donnée la
plus rapide à obtenir.

### T+4 à T+9 — La liste des produits finis
Question : « Liste-moi tout ce que tu vends, avec le prix HT. »
On note : nom exact tel qu'il l'écrit sur son étiquette, prix de vente HT,
et le format (230 g, 50 cl…).

Deux questions qui évitent une reprise complète :
- « Comment tu identifies un produit chez toi : un code, un code-barres, rien ? »
  → c'est la référence. Chez Pascal ce sont ses codes-barres EAN.
- « Deux parfums qui ont le même nom mais un format différent, ça existe ? »

### T+9 à T+14 — Fournisseurs et familles d'achat
Question : « Chez qui tu achètes, et qu'est-ce que tu prends chez chacun ? »
On note : nom, contact, email, délai de livraison.

Puis la question des catégories, qui structure tout le stock :
« Si tu devais ranger tes achats en 5 ou 6 familles, lesquelles ? »
Chez Pascal : Fruit, Ingrédient, Verre, Capsule, Étiquette, Logistique.
Les catégories ne sont jamais figées dans le code : ce sont les siennes.

### T+14 à T+20 — Les articles
Trois sources, dans cet ordre, du moins coûteux au plus coûteux :

1. **Déduits de la liste produits** — 1 étiquette par parfum, plus les
   emballages partagés. On les génère, on ne les demande pas.
2. **Lus sur les factures fournisseurs** — matières premières avec prix,
   unité et code fournisseur.
3. **Le reste, à la voix** — ce qu'il achète sans facture sous la main.

Deux questions obligatoires ici :
- « Tes prix d'achat, tu les connais par article ou tu veux qu'on mette un
  prix moyen pour démarrer ? » Un prix moyen est acceptable — chez Pascal
  tous les fruits sont à 4,80 €/kg. Ne jamais bloquer l'onboarding sur les prix.
- « Qu'est-ce que tu ne veux pas suivre en stock ? » L'eau, le gaz, l'énergie.
  → case Hors stock, ils n'alertent jamais.

### T+20 à T+26 — Les recettes
On prend sa recette type et on la met au format par unité produite.

**Le piège de l'évaporation.** Chez Pascal la somme des ingrédients d'un pot
de 230 g fait 276 g : la cuisson évapore environ 17 %. Un client qui voit
276 g pour un pot de 230 g croit à une erreur. Il faut donc toujours
demander la recette en **poids d'entrée pour un lot**, plus le **rendement en
pots**, et diviser. Jamais « combien dans un pot ».

Formule : quantité par pot = poids d'entrée du lot ÷ nombre de pots obtenus.

Puis : « Tes autres recettes, c'est la même structure avec juste le fruit qui
change, ou il y a des cas à part ? » Chez Pascal 39 recettes sur 47 étaient
la même structure. On génère, on ne saisit pas 39 fois.

### T+26 à T+30 — Stock de départ et validation
« Aujourd'hui, tu as combien de pots finis et combien de matière ? »
Un ordre de grandeur suffit : le module Inventaire corrige en 10 secondes
par ligne, et l'inventaire global permet de tout saisir d'un coup.

Puis la validation — voir phase 4.

---

## PHASE 2 — Créer la base (10 min, sans le client)

### L'ordre est imposé par le code, il n'est pas négociable

```
1. tenant          (sinon tout le reste est orphelin)
2. fournisseurs    (référencés par nom dans les articles)
3. articles        (référencés par ref dans les recettes)
4. recettes        ← crée les produits finis manquants au passage
5. clients
6. stock initial   (inventaire global)
```

Pourquoi cet ordre : l'import de recettes cherche l'article par sa référence.
Si l'article n'existe pas encore, la ligne est rejetée avec le message
« Recette X : article Y introuvable ». L'import de recettes, lui, crée le
produit fini s'il manque, à partir de produit_ref, produit_nom et produit_prix.
Donc **un seul fichier recettes suffit à créer les produits ET les recettes**.

### Le minimum viable : 3 fichiers

- `fournisseurs.csv`
- `articles.csv`
- `recettes.csv` (crée les produits finis)

`clients.csv` et `commandes.csv` sont optionnels au démarrage.

### Les modèles sont dans .claude/onboarding/modeles/

Les en-têtes doivent être **exactement** ceux-là : l'application les reconnaît
alors sans passer par l'IA — import déterministe, aucun coût, aucun risque
d'interprétation.

| Fichier | Colonnes exactes |
|---|---|
| fournisseurs.csv | nom, contact, email, tel, adresse, delai, categorie |
| articles.csv | ref, nom, categorie, unite, prix, fournisseur, seuil, stock |
| produits.csv | ref, nom, prix, seuil, stock |
| recettes.csv | produit_ref, produit_nom, produit_prix, article_ref, quantite |
| clients.csv | nom, email, tel, adresse, notes |

---

## PHASE 3 — Contrôle chiffré (5 min)

Lancer `.claude/onboarding/sql/controle_onboarding.sql` en remplaçant le
tenant. Les 10 contrôles doivent tous renvoyer la valeur attendue.

| Contrôle | Attendu | Ce qu'il attrape |
|---|---|---|
| Articles / produits / recettes comptés | = ce qu'on a envoyé | un fichier partiellement importé |
| Produits sans aucune ligne de recette | 0 | le trou n°1 chez Pascal : 6 produits sur 53 |
| Recettes orphelines (article supprimé) | 0 | une référence article mal orthographiée |
| Références en doublon | 0 | deux articles pour la même chose |
| Articles jamais utilisés en recette | à justifier un par un | un article inutile ou une recette oubliée |
| Articles à prix 0 | à justifier | coût de revient faux, marge fausse |
| Unités hors kg / L / pièce | 0 | le piège n°2 : une unité de conditionnement |
| Produits sans prix de vente | 0 | pas de facturation possible |
| Produits sans étiquette dédiée | 0 | une étiquette oubliée |
| Coût de revient recalculé vs stocké | écart nul | un cout_revient jamais recalculé |

### Le contrôle qui vaut tous les autres : l'invariant de coût

Avant toute opération de masse, noter la somme `quantite × prix` de toutes les
lignes de recette. Après l'opération, elle doit être identique — ou varier
exactement du montant prévu. Un écart non prévu = une donnée cassée.
C'est ce contrôle qui a validé la conversion du sucre (8,861250 € avant et
après) et la fusion des doublons de fruits (80,661355 € avant et après).

---

## PHASE 4 — Validation client (5 min, une seule page)

Ne jamais faire valider un écran de base de données. Envoyer une page qui
tient sur un écran, avec :

1. **Les compteurs** : X produits, Y articles, Z recettes, N fournisseurs.
   « Ces chiffres correspondent à ton activité ? »
2. **Une recette complète en clair**, celle qu'il connaît le mieux, avec le
   coût de revient calculé et la marge.
   « Ce coût de revient te paraît juste ? »
3. **La liste de ses produits, à lire à voix haute.** C'est comme ça que
   Pascal a dit « ces 9-là sont les mêmes » et qu'on a supprimé les doublons
   avant qu'ils ne polluent ses recettes.
4. **Les 3 chiffres qu'on a inventés**, en les nommant : prix moyens,
   seuils par défaut, stocks estimés. Il valide ou corrige.

Une réponse « je ne sais pas » sur un point n'arrête pas l'onboarding : on
note le point, on met la valeur par défaut, on le marque à revoir.

---

## LES 12 RÈGLES PAYÉES CASH SUR PASCAL

1. **Toujours filtrer par tenant_id.** Une requête non filtrée lit les données
   de tous les clients à la fois. J'ai cru voir des doublons qui n'existaient
   pas, et j'ai créé 18 lignes chez le mauvais tenant. Vérifier l'identité du
   tenant par son email avant la première écriture.
2. **Une seule unité par nature : kg, L, pièce.** Jamais « sac 25 kg », jamais
   « colis », jamais « COL ». Une quantité en portion de sac perd de la
   précision à l'enregistrement et devient irréparable sans la source.
3. **Le nom commence par le mot qui distingue.** Fruit d'abord, pas
   « VRAC … » ni « PRUNE … ». Sinon le tri et la recherche sont inutilisables.
4. **Nomenclature de référence par famille.** FRT- pour les fruits, ING- pour
   les ingrédients, VERRE-, CAPSULE-, ETQ-. Jamais le code catalogue du
   fournisseur en référence.
5. **Mais ne jamais perdre le code fournisseur** : c'est lui qui sert à
   commander. Le garder dans le nom, ou mieux, dans une colonne dédiée.
6. **Dédoublonner avant l'import, pas après.** Un même fruit en 4 articles
   (4 origines de kiwi) fragmente le stock et les recettes.
7. **Un article par matière, pas par référence fournisseur.** L'origine et le
   calibre sont un détail d'achat, pas un article à gérer.
8. **Les recettes se saisissent en poids d'entrée par lot + rendement.**
   Jamais en poids par pot : l'évaporation rend le chiffre incompréhensible.
9. **Garder le fichier source.** 23 recettes de Pascal ont encore des
   quantités de sucre arrondies parce que la source d'origine a été perdue.
10. **Ne jamais bloquer sur les prix.** Un prix moyen documenté vaut mieux
    qu'un onboarding qui traîne une semaine.
11. **Demander tout de suite ce qui ne doit pas être suivi** (eau, gaz,
    énergie) et le cocher Hors stock. Sinon le tableau de bord crie au
    rouge dès le premier jour et le client perd confiance.
12. **Vérifier avant de livrer, avec des chiffres.** Compteurs, zéro
    orphelin, invariant de coût. Un « ça a marché » sans chiffre n'est pas
    une vérification.

---

## RÉCAPITULATIF — la checklist d'une page

```
AVANT (client, 10 min)
[ ] Liste de ce qu'il vend + prix HT
[ ] 3 dernières factures fournisseurs
[ ] 1 recette type + rendement en pots
[ ] En-tête de facture : raison sociale, SIRET, TVA, IBAN

PENDANT (30 min)
[ ] T+4   Entreprise saisie
[ ] T+9   Liste produits finis + mode de référence
[ ] T+14  Fournisseurs + 5 ou 6 familles d'achat
[ ] T+20  Articles : déduits, puis lus sur factures, puis à la voix
[ ] T+20  Prix connus ou prix moyen assumé
[ ] T+20  Ce qui ne doit pas être suivi en stock
[ ] T+26  Recette type au format lot + rendement
[ ] T+26  Les autres recettes : même structure ou cas à part
[ ] T+30  Stock de départ, ordre de grandeur

APRÈS (nous, 15 min)
[ ] Tenant créé, UUID noté, identité vérifiée par email
[ ] fournisseurs.csv importé
[ ] articles.csv importé
[ ] recettes.csv importé — produits créés au passage
[ ] Aucune erreur « article introuvable »
[ ] Les 10 contrôles SQL au vert
[ ] Invariant de coût noté
[ ] Page de validation envoyée au client
[ ] Les valeurs inventées listées et assumées
```

---

## ANNEXE — le script de contrôle passé sur Pascal le 27/09/2026

Preuve que les contrôles servent : lancé sur une base considérée comme
terminée, il a trouvé 6 anomalies en une requête.

| Contrôle | Résultat | Lecture |
|---|---|---|
| Fournisseurs / articles / produits / clients | 5 / 97 / 53 / 233 | conforme |
| Lignes de recette | 412 sur 47 produits | conforme |
| Produits sans recette | **6** | 6 parfums vendus non chiffrables |
| Recettes orphelines | 0 | bon |
| Références en doublon | 0 | bon |
| Doublons dans une recette | 0 | bon |
| Articles jamais utilisés | **12** | dont 8 étiquettes sans parfum associé |
| Articles sans prix | **11** | coût de revient faux sur ces lignes |
| Unités non conformes | 0 | bon depuis la fusion des kiwis |
| Produits sans prix de vente | **5** | non facturables |
| Recettes trop courtes | **5** | recettes sans verre, capsule ni étiquette |
| Coûts de revient désynchronisés | **46 sur 47** | marges affichées fausses |
| Invariant coût recettes | 80,661355 € | référence à noter |

Détail du plus gênant : 46 produits sur 47 ont un `cout_revient` stocké qui ne
correspond pas à leur recette. La plupart sont à 0 alors que la recette calcule
1,86 €. Conséquence visible par le client : la colonne Marge affiche
« à définir » ou un chiffre faux. Le champ n'est recalculé qu'à l'enregistrement
d'une fiche produit, pas quand un prix d'achat change.

**Règle qui en découle, à ajouter à la liste : après tout import ou tout
changement de prix d'achat, recalculer les coûts de revient de tous les
produits.** Sinon la première chose que le client regarde — sa marge — est
fausse.
