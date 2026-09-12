# Script vidéo — Onboarding IA import Admin (ARTEASY)

**Durée:** 10-12 minutes | **Ton:** Direct, concret, "voici ce qui a été construit et pourquoi" | **Audience:** Utilisateurs ARTEASY (artisans), équipe produit

---

## Accroche (0:00–0:45)

"Importer ses données dans un nouveau logiciel de gestion, c'est le moment où la plupart des gens abandonnent. Avant aujourd'hui, pour faire entrer ses clients, ses fournisseurs et ses articles dans ARTEASY, il fallait remplir six fichiers Excel avec des colonnes exactes, une par type de donnée. Ça prenait plus de deux heures. Pour un logiciel censé faire gagner du temps à un artisan, c'était l'inverse.

Dans cette vidéo, je montre ce qu'on a construit à la place : on dépose n'importe quel fichier — PDF, photo, Excel, peu importe le format — et l'IA fait le tri elle-même."

---

## Le problème (0:45–2:00)

"Le système précédent demandait à l'utilisateur de se transformer en opérateur de saisie. Six modèles Excel différents, colonnes figées, aucune tolérance sur le format. Résultat : soit l'artisan renonçait à migrer ses données existantes, soit il y passait sa soirée.

Le vrai problème n'était pas technique, c'était humain : on demandait à quelqu'un qui a déjà ses données quelque part — dans ses factures, ses mails, son ancien tableur — de tout retaper dans un format imposé. Ce n'est pas comme ça qu'un outil doit se comporter."

---

## La solution (2:00–6:00)

"L'idée : un seul geste, déposer les fichiers, et laisser l'IA comprendre ce qu'il y a dedans.

**Le tri intelligent d'abord.** Si un fichier Excel correspond déjà à un ancien modèle connu, il est importé directement, sans passer par l'IA — zéro coût, zéro risque, pour les utilisateurs qui ont déjà un fichier propre.

**Le scan IA ensuite, pour tout le reste.** PDF, photo, Excel en vrac, même un classeur avec plusieurs onglets différents — un client sur un onglet, des fournisseurs sur un autre. Un seul appel à l'IA par fichier catégorise et extrait tout ce qu'il trouve : des clients, des fournisseurs, des articles, des produits, parfois plusieurs types dans le même document.

**Le dédoublonnage, jamais laissé à l'IA.** C'est une logique déterministe qui compare chaque donnée extraite à ce qui existe déjà, et au reste du lot déposé. Elle ne se trompe jamais deux fois de la même façon : elle a d'ailleurs rattrapé une vraie erreur qu'on avait nous-mêmes écrite dans la première version de cette logique, avant même qu'un utilisateur ne la voie.

**La validation humaine, réduite au strict nécessaire.** Sur un lot typique, environ 90% des données extraites arrivent avec une confiance haute et s'importent sans qu'on ait besoin de cliquer sur quoi que ce soit. Les 10% restants — un nom ambigu, une donnée floue — sont mis en évidence, et c'est là, seulement là, qu'un humain tranche."

---

## Ce qui a vraiment été testé (6:00–8:30)

"Ce n'est pas resté sur le papier. Une fois le code écrit, vingt fichiers de test ont été générés — factures, bons de commande, classeurs Excel piégés avec des dates et des prix mal formatés — pour un chocolatier fictif. Et le tout premier essai en conditions réelles a immédiatement trouvé un bug qu'aucune relecture de code n'avait vu : recliquer sur le bouton d'import après un échec partiel recréait les données déjà importées.

C'est exactement pour ça qu'on teste en vrai, pas seulement en lisant le code. Le bug a été corrigé le jour même.

Une revue dédiée du prompt qui pilote l'IA a aussi été faite à part — pas pour vérifier que le code tourne, mais pour vérifier que l'IA comprend bien la différence entre un client et un fournisseur, qu'elle sait qu'une ligne de tableur peut être une entité à elle seule, et qu'elle ne perd jamais silencieusement une donnée qu'elle ne sait pas catégoriser."

---

## Ce que ça change concrètement (8:30–10:00)

"Avant : six fichiers Excel, un format imposé, deux heures de saisie.

Après : glisser-déposer ce qu'on a déjà — même en vrac, même mélangé — et laisser l'IA faire le tri, avec une validation qui ne demande un clic que quand c'est vraiment nécessaire.

L'architecture de l'administration elle-même n'a pas changé — les mêmes fiches client, fournisseur, article, produit. Ce qui a changé, c'est uniquement la façon d'y faire entrer les données. Et un outil de nettoyage des doublons a été ajouté, pour les cas où un import répété créerait des doublons visibles — avec un écran de revue, jamais une suppression automatique en un clic, parce que supprimer la mauvaise fiche client pourrait emporter des commandes déjà liées."

---

## Ce qui reste à faire (10:00–11:00)

"Le code est complet et testé en conditions réelles, mais il n'est pas encore fusionné dans la version principale — il attend encore quelques tours de test supplémentaires sur l'environnement de prévisualisation avant de partir en production.

Et un point mérite d'être suivi dans le temps : le tout premier scan d'un nouveau client est offert, hors quota, pour ne pas le pénaliser dès son arrivée — la limite actuelle de 30 fichiers par lot suffira-t-elle dans tous les cas, ou faudra-t-il l'ajuster une fois que de vrais clients avec de gros volumes de données l'utiliseront."

---

## Action (11:00–12:00)

"Le principe à retenir, au-delà de cet outil précis : quand un logiciel demande à son utilisateur de s'adapter à un format plutôt que l'inverse, c'est le logiciel qui doit changer, pas l'utilisateur. L'IA rend ça possible aujourd'hui d'une façon qui n'existait pas il y a deux ans.

Si votre propre outil a, quelque part, un import de données qui ressemble à ce qu'était celui-ci avant — colonnes figées, modèle imposé — c'est exactement le genre de chantier qui vaut la peine d'être repensé."

---

**[Fin du script]**
