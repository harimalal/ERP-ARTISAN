# BRIEF — Rattrapage Semaine 0, sprint 10 ventes ArtEasy

Statut : VERROUILLÉ le 2026-09-04, mis à jour le 2026-09-04 (re-cadrage partiel #2 — choix du processeur de paiement).
Toute modification passe par une entrée datée dans `decisions.md`.

Les designs de landing cités ici sont des livrables déjà produits, pas des références externes — ils se réutilisent tels quels, pas de nouvelle création visuelle dans cette mission.

---

## 0. À retenir

- Verdict : lancer sous condition — offre/prix/personas déjà validés le 29/08, seule l'exécution a pris 3 jours de retard.
- Risque n°1 : ni Stripe ni Cal.com n'existent côté utilisateur (réponse du 04/09) ; un compte PayPal existe mais ne peut pas porter le mécanisme "places limitées" tel que promis dans l'offre déjà verrouillée — voir décision ci-dessous.
- Test décisif minimal : déjà intégré au plan d'origine, pas à refaire ici — le plan prévoit son propre point de bascule au J7 ("le canal gagnant se décide au J7 sur les chiffres réels, on coupe le perdant"). Cette mission ne fait que rendre ce test possible en rendant l'infra opérationnelle.

## 0 bis. Variables décisives

| Variable | Dont dépend | Source | Statut |
|---|---|---|---|
| Compte Stripe déjà vérifié ou à créer | Date réelle à laquelle l'encaissement devient possible | Utilisateur | **Répondu 04/09 : aucun compte Stripe. Compte PayPal existant.** |
| Processeur de paiement retenu (Stripe à créer vs PayPal existant vs hybride) | Le mécanisme des paliers limités et tout le bloc J1 | Reconnaissance + utilisateur | Tranché ci-dessous (décision D1) — recommandation appliquée sauf avis contraire |
| Compte Cal.com déjà créé | Séquencement de J1 | Utilisateur | **Répondu 04/09 : aucun compte. Signup gratuit, sans vérification d'identité — non bloquant, se crée en 5 minutes au moment de l'exécution.** |
| Extraction Agence Bio / adhésion groupes Facebook déjà commencée depuis le 29/08 | Non-duplication du travail de prospection | Utilisateur | Manquante — non bloquante, hypothèse par défaut : non commencée |
| Blocage caché derrière le retard (au-delà du manque de temps) | Si un obstacle doit être levé avant d'exécuter | Utilisateur | Manquante — non bloquante, hypothèse par défaut : aucun |
| Faisabilité technique des 3 blocs (Stripe, Cal.com, Agence Bio, tracking) | Le plan d'exécution lui-même | Obtenue — voir reconnaissance.md | Connue |

## 0 quater. Décision D1 — Processeur de paiement (re-cadrage partiel, 04/09)

Invalidé : l'hypothèse implicite "Stripe" du plan du 29/08 n'était pas un choix tranché, juste une évidence de rédaction — elle ne tient plus telle quelle puisque l'utilisateur n'a pas de compte Stripe mais un compte PayPal actif.

Position technique (vérifiée en reconnaissance, pas une préférence) : Stripe Payment Links sait nativement limiter le nombre de paiements d'un lien puis le désactiver automatiquement — c'est le mécanisme exact qui porte les paliers 6/6/8 places de l'offre déjà verrouillée. PayPal (PayPal.me ou lien de paiement standard) n'a aucun équivalent : pas de plafond de paiements intégré, pas de désactivation automatique — seul un lien de demande d'argent non réclamé expire après 10 jours, ce qui ne couvre pas ce besoin. Utiliser PayPal tel quel obligerait à surveiller manuellement le compteur de ventes et retirer le bouton à la main après chaque palier atteint — un risque réel de survente sur une promesse "places limitées" qui est un argument de vente central de l'offre.

Sur la vitesse : PayPal n'est pas forcément plus rapide que Stripe malgré le compte déjà existant — un compte PayPal peu utilisé peut déclencher une revue de conformité de 3 à 10 jours ouvrés dès qu'il reçoit plusieurs paiements de 97 à 197€ d'un coup, un délai comparable à la vérification d'identité Stripe pour un nouveau compte.

Options :
A. Créer un compte Stripe maintenant (le seul qui tient la promesse "places limitées" sans surveillance manuelle) — délai de vérification généralement 1 à 3 jours ouvrés en France, rarement plus.
B. Démarrer sur PayPal dès aujourd'hui avec suivi manuel serré du compteur de ventes par palier, en acceptant le risque de survente si un pic de conversion arrive un jour où la disponibilité de 2h ne permet pas de surveiller en temps réel.
C. Hybride — créer le compte Stripe maintenant en tâche de fond, démarrer l'outreach en parallèle avec le lien PayPal en repli temporaire (suivi manuel), basculer sur les liens Stripe dès qu'ils sont vérifiés.

Décision : **A**, sauf réponse contraire de l'utilisateur au gate — c'est la seule option qui respecte la doctrine du brief (fiable avant évident avant beau) sans introduire une tâche de surveillance manuelle quotidienne supplémentaire sur un agenda déjà à 2h/jour. Réversible : oui, à coût nul — si le délai de vérification Stripe s'annonce anormalement long une fois le compte créé, bascule vers C sans rien perdre de ce qui a déjà été préparé.

Une variable manquante et décisive bloque le lancement de TOOLING.md et de la Phase 1 MAESTRO, pas ce cadrage.

## 0 ter. Seuil de rentabilité

Repris du plan du 29/08, non recalculé :
```
Coût de construction : déjà amorti (plan + scripts + landings produits le 29/08)
Coût récurrent futur  : Stripe (frais par transaction, pas d'abonnement) + Cal.com (gratuit) + Plausible (gratuit 30j, ~9€/mois ensuite si conservé)
Seuil                 : 1re vente (97€) couvre largement le seul coût récurrent net nouveau (Plausible)
```

## 1. Intention

- **Job To Be Done** : quand le sprint d'acquisition ArtEasy est prêt sur le papier mais bloqué à l'exécution, je veux que l'infra (paiement, prise de RDV, landing, tracking, liste de prospects) devienne opérationnelle sans reprendre les décisions déjà tranchées, afin de pouvoir reprendre l'outreach dès demain.
- **Action clé** : qu'un prospect qui clique sur la landing puisse réserver un appel d'installation et, à l'issue de cet appel, payer — sans lien mort ni étape manquante. Sa disparition (lien cassé, palier introuvable) tue toute la mission commerciale.
- **Utilisateur** : Hari, fondateur, ~2h/jour disponibles, exécute lui-même chaque appel de vente et chaque setup client (doctrine "aucun auto-onboarding ce mois-ci").

## 2. Périmètre

**Dans cette mission**
- 3 liens de paiement Stripe (structure, textes, montants, limites — préparés, pas activés)
- 1 événement Cal.com "Installation ArtEasy — 20 min" avec 4 questions de pré-qualification (préparé, compte à créer/confirmer par l'utilisateur)
- Déploiement d'UNE variante de landing (recommandation : A) sur arteasy.fr, CTA câblé vers Cal.com, compteur de places, page /merci
- Tracking UTM + Plausible (script, essai gratuit 30 jours)
- Extraction et enrichissement de 150 lignes Agence Bio + liste des 12-15 groupes Facebook cibles
- Documents J4 : templates d'outreach personnalisés, doc "copier-coller du jour", gabarit carrousel avant/après (périmètre B du dossier de choix)

**Explicitement hors périmètre**
- Toute nouvelle direction visuelle ou nouveau texte de vente — les 6 designs et tous les scripts existent déjà, on ne les réécrit pas
- Activation réelle des paiements Stripe et connexion du compte — utilisateur uniquement
- Automatisation de l'onboarding client — exclu par la doctrine du plan, pas un oubli
- Envoi effectif des messages d'outreach — cette mission prépare, l'envoi reste un geste quotidien de l'utilisateur (Bloc 2 du rythme, rythme jamais délégué)
- Salon en personne / kit salon — hors sprint, prévu pour l'après (plan, Partie H)

## 3. Références produit
Non applicable — aucune nouvelle direction produit, tout est repris du plan du 29/08 (`PLAN_SPRINT_10_VENTES_2026-08-29.md`).

## 4. Direction artistique exécutable
Non applicable — direction déjà figée dans les 6 fichiers `ERP ARTISAN/designs_landing/deploy/`. Variante retenue : A (`landing_A_demo.html`), recommandation du plan du 29/08 confirmée en dossier de choix, point 1.

## 5. Stories et critères d'acceptation

```
Story S1 — Paiement d'un palier
  Étant donné un prospect qui a réservé et payé son installation
  Quand il clique sur le lien du palier en cours
  Alors il atteint une page de paiement Stripe fonctionnelle, collecte nom+email+case garantie,
        et une fois payé atterrit sur la page /merci

Story S2 — Réservation d'un appel
  Étant donné un prospect convaincu par la landing
  Quand il clique sur le CTA "Réserver mon appel d'installation"
  Alors il atteint l'agenda Cal.com, répond à 4 questions de pré-qualification,
        et reçoit une confirmation avec un créneau réel

Story S3 — Compteur de places
  Étant donné le palier 1 en cours à 97€ (6 places)
  Quand une vente est enregistrée
  Alors le compteur affiché sur la landing est mis à jour manuellement le jour même
        (mécanique manuelle assumée, pas un bug si non temps réel)

Story S4 — Traçabilité de la source
  Étant donné un lien diffusé sur un canal donné (Instagram, email, Facebook, LinkedIn)
  Quand un visiteur clique dessus
  Alors Plausible enregistre la source/medium exacts via les paramètres UTM du lien

Story S5 — Liste de prospection exploitable
  Étant donné la liste Agence Bio extraite et enrichie
  Quand l'utilisateur l'ouvre pour démarrer l'outreach
  Alors chaque ligne a au minimum nom+activité+région, et les lignes à fort signal
        (Instagram actif +500 abonnés, plusieurs points de vente) sont marquées en priorité
```

## 6. Technique et données

- Stack imposée : Netlify + Supabase + Vanilla JS (repo `harimalal/ERP-ARTISAN`, dossier `/home/radoraj/ERP ARTISAN`). Landing = bundle `index.html` avec JSON embarqué.
- Contrainte projet non négociable : toute édition Python du bundle suit le pattern json.loads → modifier → `json.dumps(ensure_ascii=False)` → remplacer `</script>` par `<\/script>` → réécrire. Jamais d'édition brute du JSON.
- Toute nouvelle Netlify Function (si nécessaire pour la page /merci ou un webhook Stripe) : nom exact de variable d'environnement confirmé par l'utilisateur avant d'écrire le code — jamais supposé.
- Hébergement et intégrations : Stripe (paiement, hors MCP — dashboard manuel), Cal.com (agenda, hors MCP — dashboard manuel), Plausible (tracking, script `<head>`), API data.gouv.fr Professionnels BIO (extraction prospects, appel HTTP direct, pas de MCP nécessaire).
- Entités et relations : aucune nouvelle table Supabase prévue — le suivi de vente reste la feuille Google Sheet déjà prévue au plan (annexe E2), pas un nouveau système.
- Données personnelles : la liste de prospection contient des données professionnelles publiques (nom d'établissement, activité, région, contacts pro visibles) — collecte fondée sur l'intérêt légitime (art. 6.1.f RGPD), jamais de scraping automatisé massif, enrichissement manuel/semi-manuel uniquement. Chaque message d'outreach doit porter une identité claire et une désinscription simple.
- Source de vérité en cas de conflit : `PLAN_SPRINT_10_VENTES_2026-08-29.md` fait foi sur tout ce qui est offre/scripts/contenu ; ce brief fait foi sur l'exécution de la Semaine 0 uniquement.
- Maintenance à six mois : Hari (fondateur unique).

## 7. Doctrine d'arbitrage

- Priorité générale : fiable (le lien de paiement marche, le rendez-vous se prend) > évident (le prospect ne se demande jamais où cliquer) > beau (les 6 designs sont déjà au niveau, pas de polish supplémentaire attendu).
- En cas d'ambiguïté sur le périmètre : trancher au plus petit — ne rien construire que le plan du 29/08 n'a pas déjà prévu.
- En cas d'ambiguïté sur le visuel : suivre la variante A telle quelle, aucune retouche non demandée.
- En cas de conflit performance / fonctionnalité : privilégier la fiabilité du paiement et de la prise de RDV sur toute optimisation de vitesse.
- En cas de doute sur une donnée personnelle : ne pas collecter, ne pas enrichir automatiquement — enrichissement manuel uniquement.
- Budget par lot : un lot = un des 3 blocs (encaissement / distribution / prospection). Arrêt automatique et remontée si un lot dépasse une session sans converger.

## 8. Succès et points d'arrêt

**Indicateurs de succès à la livraison**
- Les 3 textes/structures de liens Stripe sont prêts à copier-coller dans le dashboard, avec montants, limites et libellés exacts
- L'événement Cal.com est configuré (si compte existant) ou entièrement spécifié prêt à créer (si compte à ouvrir)
- La landing A est en ligne sur arteasy.fr avec CTA fonctionnel, compteur, tracking actif — vérifié par un test réel (clic CTA → atterrissage Cal.com), pas juste une lecture de code
- La feuille de 150 lignes Agence Bio existe, avec au moins nom+activité+région remplis sur 100% des lignes et le marquage prioritaire appliqué

**Actions exigeant un accord humain**
- Connexion du compte Stripe et activation de paiements réels
- Création/connexion du compte Cal.com si authentification tierce
- Merge de la branche landing sur `main` (mise en production)
- Tout envoi réel de message d'outreach

Tout le reste avance sans validation intermédiaire.

## 9. Trajectoire et équipe

- Trajectoire retenue : automatisation/pipeline en priorité, interface en second plan (déploiement, pas conception)
- Motif : les 3 blocs sont du câblage et de l'extraction de données sur une offre déjà figée, pas une nouvelle conception produit
- Socle : orchestrateur (MAESTRO), constructeur, vérificateur
- Agents créés pour ce projet : voir `equipe.md`
- Porteurs des trois exigences : fiabilité — vérificateur technique ; simplicité — orchestrateur (arbitrage périmètre) ; élégance — non porté activement, déjà garanti par les designs livrés le 29/08 (pas de nouvelle exigence visuelle à défendre ici)

## 10. Boucle d'apprentissage

- Données qui remontent une fois en service : taux de clic landing → Cal.com (Plausible), taux de réservation → paiement (feuille Google Sheet), première vente réelle (Stripe)
- Échéance de revue : J7 du sprint (déjà fixée par le plan du 29/08) — c'est là que le plan lui-même prévoit de couper le canal perdant
- Seuil de révision : zéro réservation après 3 jours d'outreach actif malgré un trafic landing confirmé (Plausible) → re-cadrage du message ou du canal, pas juste une correction technique

## 11. Rythme

Un compte rendu par jour tant que la mission est active : fait / en cours / bloqué, plus "à trancher" plafonné à 3 points.
