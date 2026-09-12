## À retenir
- Verdict : lancer sous condition (voir reconnaissance.md).
- Ce qui bloque : rien ici — ce dossier est volontairement court, la quasi-totalité des choix structurants (offre, prix, persona, doctrine, visuel) a déjà été tranchée le 29/08 et n'est pas rouverte.
- Ce que je te demande : trancher les 4 points ci-dessous, ou ne rien faire — dans ce cas mes recommandations s'appliquent telles quelles et deviennent des hypothèses du brief.
- Risque n°1 : voir reconnaissance.md — dépendance à deux comptes tiers (Stripe, Cal.com) hors de mon contrôle.

---

## Trajectoire

Automatisation/pipeline en priorité (câblage Stripe/Cal.com/tracking, extraction de données Agence Bio), avec une composante interface très mineure en second plan : déployer une landing déjà conçue, pas en concevoir une nouvelle. Aucune direction visuelle à trancher ici.

---

### 1. Périmètre de ce rattrapage
Ce que j'ai trouvé : le plan du 29/08 définit J1 à J4 comme un seul bloc "Semaine 0", mais seuls J1 à J3 sont réellement bloquants pour démarrer l'outreach (J4 est de la préparation verbale — scripts à personnaliser, appel blanc — qui ne dépend d'aucun outil externe et peut se faire à la volée).

A. Périmètre strict J1+J2+J3 (encaissement, distribution, prospection) — je m'arrête là, tu géreras J4 toi-même (impression des scripts, appel blanc avec un proche — ce sont des actions humaines, pas des livrables que je peux produire).
B. Périmètre J1+J2+J3+J4 — je prépare aussi les documents J4 (templates d'outreach personnalisés, doc "copier-coller du jour", gabarit carrousel avant/après) en plus, mais l'appel blanc reste à faire par toi.
C. Périmètre réduit à J1+J2 seulement — je repousse la prospection J3 à une mission séparée.

Recommandation : B, parce que les livrables J4 sont du texte à produire (mon travail), pas des comptes à créer (ton travail) — autant tout préparer en une fois plutôt que de te redemander une session plus tard pour 6 documents.

### 2. Outil de mesure de trafic
Ce que j'ai trouvé : voir reconnaissance.md — Plausible coche fiabilité (hébergé, zéro maintenance) + conformité (pas de bandeau cookie) + le besoin explicite de suivi UTM du plan ; Umami demande un serveur à maintenir et n'a pas de vue UTM ; GA4 demande un bandeau cookie et un registre de traitement.

A. Plausible — essai gratuit 30 jours, script à ajouter dans le head, suivi UTM natif.
B. Umami — auto-hébergé, gratuit au-delà de la mise en place, mais maintenance en plus et pas de vue UTM dédiée.
C. GA4 — gratuit, mais bandeau cookie + registre RGPD à mettre en place avant de pouvoir l'activer légalement.

Recommandation : A, parce que c'est la seule option qui ne demande ni maintenance ni chantier de conformité supplémentaire — le budget de 2h/jour ne permet pas d'absorber ça.

### 3. Ordre d'exécution
Ce que j'ai trouvé : J1 (encaissement) et J2 (landing) sont strictement séquentiels — J2 a besoin du lien Cal.com de J1 pour le CTA. J3 (prospection Agence Bio) ne dépend techniquement ni de J1 ni de J2 — je peux la lancer en parallèle.

A. Séquentiel strict J1 → J2 → J3, comme écrit dans le plan.
B. J1 → J2 en séquence, J3 en parallèle dès maintenant (l'extraction Agence Bio ne dépend de rien d'autre).

Recommandation : B — ça ne change rien à la qualité, ça fait gagner un jour complet sur le retard déjà pris.

### 4. Isolation du code
Ce que j'ai trouvé : la landing arteasy.fr est un bundle index.html (JSON embarqué, risque de casse si mal édité — voir contrainte projet). Les sessions précédentes du projet isolent systématiquement tout changement risqué dans une branche dédiée avant de merger sur main.

A. Branche dédiée `feature/sprint-landing-live`, testée en preview Netlify avant merge sur main.
B. Commit direct sur main — plus rapide, mais toute casse du bundle est immédiatement en prod.

Recommandation : A — cohérent avec la pratique déjà établie sur ce projet (Session 2, Session 3 du log), et le coût d'une branche est nul comparé au risque d'une landing cassée pendant un sprint commercial actif.

---

## Points irréversibles (rappel, pas un choix — déjà couverts par la constitution MAESTRO)
- Connexion d'un compte Stripe et activation de paiements réels — toi uniquement.
- Création/connexion du compte Cal.com si authentification tierce requise — toi, sauf si formulaire simple sans OAuth.
- Merge de la branche landing sur main (mise en production) — je prépare, tu valides avant le merge final.
