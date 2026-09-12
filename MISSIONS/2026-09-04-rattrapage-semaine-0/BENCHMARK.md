# BENCHMARK — Rattrapage Semaine 0, sprint 10 ventes ArtEasy

Base benchmarkée de cette mission = reconnaissance.md (cadrage-projet, recherche live du 04/09/2026), complétée par le benchmark déjà fait le 29/08/2026 pour l'offre/les scripts/le contenu (non refait ici, toujours valide).

## Paiement — Stripe Payment Links
Cas 1 : documentation Stripe — [Customize Payment Links](https://docs.stripe.com/payment-links/customize)
  Pattern extrait : limite native du nombre de paiements par lien, désactivation automatique une fois le quota atteint — pas de code à écrire, un réglage du dashboard.

Adaptation retenue : un lien par palier (97/147/197€), limites 6/6/8, URL de confirmation = page /merci.

## Prise de rendez-vous — Cal.com
Cas 1 : documentation Cal.com — [booking questions guide](https://cal.com/blog/customize-your-scheduling-environment-a-guide-to-cal-com-s-booking-questions)
  Pattern extrait : questions de réservation personnalisables (texte court/long, email, téléphone) dans l'onglet Advanced d'un event type, plan gratuit sans limite d'event types.

Adaptation retenue : event "Installation ArtEasy — 20 min", 4 questions de l'annexe D10 du plan du 29/08.

## Mesure de trafic — Plausible vs Umami vs GA4
Cas 1 : comparatif 2026 — [privacy-friendly analytics comparison](https://emporionsoft.com/privacy-friendly-analytics-comparison/)
  Pattern extrait : Plausible = hébergé, UTM natif, cookieless (pas de bandeau RGPD nécessaire) — seul des trois sans coût d'ingénierie ni de maintenance supplémentaire.

Adaptation retenue : script standard dans le head du bundle, essai gratuit 30 jours.

## Prospection — API Agence Bio
Cas 1 : data.gouv.fr — [API Professionnels BIO](https://www.data.gouv.fr/dataservices/api-professionnels-bio)
  Pattern extrait : API publique, recherche par SIRET/numéro bio/raison sociale, pas de champ email ni Instagram natif — confirme que l'enrichissement externe déjà prévu au plan est nécessaire, pas un oubli.

Adaptation retenue : filtrage sur les 6 activités de transformation bio alimentaire listées au plan (J3), export CSV, enrichissement manuel priorisé sur les lignes à fort signal.

## Conformité prospection — RGPD B2B
Cas 1 : guide CNIL/prospection B2B 2026 — [fichierb2b.fr](https://fichierb2b.fr/articles/cnil-prospection-b2b-legal-2026/)
  Pattern extrait : prospection B2B par intérêt légitime (art. 6.1.f RGPD) légale sans consentement si la donnée vient d'une source publique/professionnelle, l'identité de l'expéditeur est claire et une désinscription simple est proposée ; le scraping massif automatisé est juridiquement plus fragile.

Adaptation retenue : enrichissement manuel/semi-manuel uniquement sur les 150 lignes, jamais de scraper automatisé.

## Risque plateforme — Instagram DM
Cas 1 : guide conformité Instagram DM 2026 — [creatorflow.so](https://creatorflow.so/blog/instagram-dm-compliance-meta-rules/)
  Pattern extrait : le cold DM automatisé à des comptes non-engagés déclenche des restrictions progressives (7j puis 30j) — l'envoi manuel à faible volume (15/jour, personnalisé) n'est pas le comportement visé par ces restrictions.

Adaptation retenue : rester strictement sur l'envoi manuel déjà prévu au plan, ne jamais introduire d'outil d'automatisation d'envoi.

## Offre, scripts, contenu, personas, direction visuelle des 6 landings
Déjà benchmarkés le 29/08/2026 (experts Hormozi, Voss, Sandler, Blount, Gardner, Laja, Dry, Wiebe, Aagaard — voir `PLAYBOOK_IA/ARTEASY/SESSION_LOG.md`, Session 5). Non refait ici, toujours valide.
