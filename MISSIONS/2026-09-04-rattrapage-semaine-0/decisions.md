# DÉCISIONS — Rattrapage Semaine 0, sprint 10 ventes ArtEasy

## Correctif — 2026-09-05, ciblage prospection
Trouvé : la liste v1 (200 lignes, filtre NAF + bio seulement) incluait des groupes industriels (Bonduelle, Florette, D'Aucy, Gelagri) — le filtre métier ne suffit pas à isoler le persona "artisan seul ou 1-3 personnes" du plan.
Corrigé : filtre additionnel sur l'effectif salarié (donnée INSEE officielle), tranches NN/00/01/02 (0-5 salariés). Nouvelle extraction : 476 prospects, zéro grand groupe vérifié. Canal retenu par l'utilisateur : emailing à froid — enrichissement email en cours par lots (pas d'API publique pour les emails, recherche par entreprise).

## Re-cadrage partiel — 2026-09-04
Invalidé : rien sur le fond. Fait nouveau : 3 jours de retard sur la deadline J4 du plan du 29/08, zéro exécution confirmée.
Sections rejouées : reconnaissance (courte), dossier de choix (réduit à 4 points techniques).
Sections non rejouées : offre, prix, personas, doctrine de vente, scripts, contenu, direction visuelle des 6 landings — toutes reprises telles quelles depuis `PLAN_SPRINT_10_VENTES_2026-08-29.md`.

## Re-cadrage partiel #2 — 2026-09-04, réponse utilisateur au gate
Invalidé : l'hypothèse implicite "processeur = Stripe" du plan du 29/08 (jamais tranchée explicitement). Fait nouveau : l'utilisateur n'a ni compte Stripe ni compte Cal.com, mais un compte PayPal actif.
Position : Stripe sait limiter nativement le nombre de paiements d'un lien puis le désactiver (mécanisme qui porte les paliers 6/6/8 places) ; PayPal n'a aucun équivalent, obligerait à un suivi manuel du compteur avec risque réel de survente.
Preuve : recherche live du 04/09, voir `brief.md` section 0 quater pour le détail et les sources.
Décision : Stripe retenu (option A du dossier), création de compte à faire par l'utilisateur — réversible vers un hybride Stripe+PayPal si le délai de vérification traîne. Cal.com confirmé à créer (signup gratuit, non bloquant, pas de délai de vérification connu).
Sections rejouées : `brief.md` section 0/0bis/0 quater uniquement. Rien d'autre n'est affecté — TOOLING.md peut maintenant s'écrire sur cette base.

## Choix validés au cadrage
Recopiés depuis `dossier-de-choix.md` — recommandations appliquées par défaut (l'utilisateur n'a pas contesté) :
1. Périmètre : option B — J1+J2+J3 + documents J4 (hors appel blanc, geste humain)
2. Outil de mesure de trafic : option A — Plausible, essai gratuit 30 jours
3. Ordre d'exécution : option B — J3 (prospection) en parallèle de J1→J2
4. Isolation du code : option A — branche dédiée `feature/sprint-landing-live`, preview avant merge

Ces 4 choix deviennent des hypothèses du brief tant que l'utilisateur ne les corrige pas au gate.

## Fiches agents
Recopiées depuis `equipe.md`.

### Orchestrateur (socle)
- Sortie attendue : plan.md et decisions.md à jour, compte rendu quotidien
- Droit de veto : aucun
- Exigence portée : simplicité
- Sortie de scène : fin de mission uniquement

### Constructeur (socle)
- Sortie attendue : un livrable nommé par lot dans livrables/
- Droit de veto : aucun
- Exigence portée : aucune (exécution)
- Sortie de scène : fin de mission uniquement

### Vérificateur (socle)
- Sortie attendue : contrôle des livrables contre les stories Gherkin S1-S5
- Droit de veto : conformité aux critères d'acceptation du brief
- Exigence portée : aucune (contrôle)
- Sortie de scène : fin de mission uniquement

### Gardien de fiabilité (spécialiste)
- Sortie attendue : 3 checklists signées par lot (exactitude financière, intégrité du bundle, conformité prospection)
- Droit de veto : bloque la livraison de tout lot où une checklist n'est pas signée
- Exigence portée : fiabilité
- Sortie de scène : après signature des 3 checklists du dernier lot touché, rappelé si un lot ultérieur retouche l'un des 3 risques

## Débats structurants
Aucun débat contradictoire nécessaire à ce stade — les 4 points du dossier de choix sont des choix techniques à faible friction (recommandation unique et argumentée sur chacun, pas de position adverse crédible identifiée). À rouvrir si l'utilisateur conteste une recommandation au gate.

## Re-cadrage partiel #3 — 2026-09-04, numéro WhatsApp support
Invalidé : rien sur le fond de l'offre. Fait nouveau : l'utilisateur ne veut pas exposer son numéro personnel comme canal de support (page /merci, D8.3), demande un numéro dédié gratuit.
Position technique (vérifiée en direct, pas supposée) : WhatsApp bloque l'enregistrement de numéros VoIP/virtuels depuis 2024, toujours vrai en 2026 — un "numéro gratuit virtuel" tel que vendu par de nombreux prestataires échouera très probablement à la vérification WhatsApp. Les sources qui affirment le contraire sont presque toutes des vendeurs de ces numéros (conflit d'intérêt), écartées au profit de sources indépendantes qui confirment le blocage.
Preuve : recherche live du 04/09, WhatsApp exige un numéro mobile ou fixe réel pour l'enregistrement (Business app comme API), voir sources dans le message à l'utilisateur.
Décision : carte SIM prépayée réelle et dédiée (ex. Orange Mobicarte dès 2,99€, sans engagement), insérée en second numéro (dual-SIM ou eSIM) ou dans un téléphone de secours — pas gratuit mais le seul chemin fiable qui garde le numéro personnel privé sans casser la promesse "Support WhatsApp direct" de l'offre. Recharge occasionnelle nécessaire pour garder la ligne active.
Réversible : oui — si ce canal pose problème en usage, bascule possible vers un autre canal de support (email, formulaire) sans toucher au reste de l'offre.

Revirement — 2026-09-04, même jour : l'utilisateur revient sur sa position initiale ("vas-y, mets mon numéro [personnel]") après avoir vu le coût/délai de l'option SIM dédiée. Signalé une fois à l'utilisateur (contradiction avec sa demande de deux messages plus tôt), confirmé explicitement ("vas-y"). Appliqué tel quel — numéro personnel utilisé comme canal WhatsApp public. Réversible plus tard (remplaçable par un numéro dédié à tout moment sans casser l'offre).

## Décisions d'exécution (non structurantes)
- 2026-09-04 — Dossier de mission créé dans /home/radoraj/ERP ARTISAN/MISSIONS/2026-09-04-rattrapage-semaine-0/ (MAESTRO)
- 2026-09-04 — brief.md verrouillé sous condition (2 variables décisives Stripe/Cal.com en attente de réponse utilisateur) (cadrage-projet)
- 2026-09-04 — equipe.md composée : 4 agents (socle 3 + 1 spécialiste), sous le plafond de 5 (cadrage-projet)
