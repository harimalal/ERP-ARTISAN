## À retenir
- Verdict : lancer sous condition — pas un cadrage produit (offre/prix/persona déjà tranchés le 29/08), un re-cadrage partiel d'exécution. Rien n'est invalidé sur le fond, seul le calendrier a dérapé.
- Ce qui bloque : deux inconnues côté comptes tiers (Stripe, Cal.com) que je ne peux pas lever moi-même — voir Variables décisives.
- Ce que je te demande : répondre aux 4 variables décisives ci-dessous avant que j'écrive TOOLING.md. Le reste du dossier de choix est déjà tranché, tu n'as presque rien à choisir.
- Risque n°1 : aucun MCP Stripe ni Cal.com n'est connecté dans cette session — ces deux comptes s'ouvrent/se configurent à la main, MAESTRO prépare le contenu exact mais ne peut pas cliquer à ta place (ligne rouge constitution).

---

## Re-cadrage partiel — procédure appliquée

1. **Ce qui est invalidé** : rien sur le fond. Le plan du 29/08 (offre, prix, personas, doctrine, scripts, contenu, 6 landings) reste intégralement valide. Seul fait nouveau : 3 jours de retard sur la deadline J4 (01/09), zéro exécution confirmée (0 commit git depuis le 22/08, CTA du site en ligne encore vide).
2. **Sections rejouées** : B (reconnaissance, ci-dessous, version courte car la plupart des choix sont déjà faits) et D (dossier de choix, réduit aux seuls points réellement ouverts — pas de nouvelle offre, pas de nouveau persona, pas de nouvelle direction visuelle).
3. **Sections non rejouées, reprises telles quelles** : offre et paliers de prix, personas et doctrine de vente, scripts et contenu 30 jours, les 6 designs de landing (aucune nouvelle création visuelle).
4. **Journalisé** : voir `decisions.md` — entrée "re-cadrage partiel 04/09".

---

## Ce qui existe déjà (repris du plan du 29/08, non réinstruit)

Offre : ArtEasy Fondateur, palier 1 à 97€ (6 places), palier 2 à 147€ (6 places), palier 3 à 197€ (8 places), paiement unique, garantie 30 jours, parrainage sans cash. Persona : transformateurs bio alimentaire (confiture, jus, confiserie, conserve, miel, biscuiterie), source annuaire Agence Bio. Doctrine : un appel de 20 min vend, jamais de libre-service ce mois-ci, aucun auto-onboarding. 6 variantes de landing déjà construites et évaluées (`ERP ARTISAN/designs_landing/deploy/`), recommandation du plan : variante A par défaut.

## Ce qui fonctionne ailleurs (benchmark ciblé sur les 3 blocages)

Stripe Payment Links supporte nativement la limite de nombre de paiements par lien — le lien se désactive automatiquement une fois le quota atteint. C'est exactement le mécanisme qu'exigent les paliers 6/6/8 du plan, pas de contournement à construire. [Stripe Docs](https://docs.stripe.com/payment-links/customize)

Cal.com (plan gratuit) permet un nombre illimité de types d'événements et des questions de réservation personnalisables (texte court, texte long, email, téléphone) — suffisant pour les 4 questions de pré-qualification prévues à l'annexe D10 du plan. [Cal.com — booking questions](https://cal.com/blog/customize-your-scheduling-environment-a-guide-to-cal-com-s-booking-questions)

L'API Professionnels BIO de data.gouv.fr (Agence Bio) existe et est publique : recherche par SIRET, numéro bio ou raison sociale, retourne établissement, activités certifiées, produits certifiés, organisme certificateur. Elle ne contient pas d'email ni de compte Instagram — confirme que l'étape d'enrichissement manuel déjà prévue au plan (J3, tâche 2) est nécessaire, ce n'est pas un oubli. [API Professionnels BIO](https://www.data.gouv.fr/dataservices/api-professionnels-bio)

## Ce qui échoue habituellement (benchmark outils de mesure)

Comparatif Plausible / Umami / GA4 pour ce cas précis : GA4 exige un bandeau cookies et un registre de traitement pour être conforme RGPD — friction et temps de dev que le budget de 2h/jour ne permet pas. Umami s'auto-héberge (VPS à maintenir) et n'a pas de suivi UTM par campagne dans son tableau de bord — or le plan a un besoin explicite de suivi UTM source/medium. Plausible est hébergé (zéro maintenance), européen, sans bandeau cookie nécessaire, avec suivi UTM natif — c'est le seul des trois qui coche les trois contraintes du projet (fiable, pas de charge d'entretien, RGPD sans friction). [Comparatif Plausible vs Umami vs GA4](https://emporionsoft.com/privacy-friendly-analytics-comparison/)

## Risques (piste obligatoire)

**Plateforme.** Sur Instagram, l'envoi de messages froids automatisés à des comptes qui n'ont jamais interagi n'a aucun chemin API autorisé en 2026 et déclenche une restriction de 7 jours à la première vague détectée, 30 jours à la deuxième. Le plan prévoit un envoi manuel (15 DM/jour, un par un, pré-personnalisés) et non un outil d'automatisation — le risque documenté vise l'automatisation, pas l'envoi manuel à faible volume. À surveiller si le rythme accélère ou si un outil d'automatisation est introduit plus tard : ne jamais automatiser l'envoi de DM Instagram. [Instagram DM Compliance 2026](https://creatorflow.so/blog/instagram-dm-compliance-meta-rules/)

Sur Facebook, il n'existe pas de règle globale : chaque groupe fixe la sienne, et l'auto-promotion non sollicitée est le motif de suppression le plus fréquent. Le plan prévoit déjà de répondre avec de la valeur avant de vendre (Bloc 4 du rythme quotidien) — cohérent avec la règle des 24h évoquée dans le benchmark (apporter de la valeur avant l'offre commerciale). [Facebook Outreach Compliance](https://www.brandjet.ai/blog/facebook-outreach-compliance-rules/)

**Réglementation.** La prospection B2B par email/DM sur la base de l'intérêt légitime (art. 6.1.f RGPD) est légale sans consentement préalable, à condition que : le message porte sur l'activité professionnelle du destinataire, la donnée vienne d'une source publique ou d'un enrichissement professionnel (le cas ici : Agence Bio + recherche manuelle Instagram/site), l'identité de l'expéditeur soit claire, une désinscription simple soit proposée. Le scraping massif automatisé serait plus fragile juridiquement — non prévu ici (enrichissement manuel/semi-manuel de 150 lignes, pas un scraper automatisé). Rien à corriger dans le plan, mais à inscrire dans le brief comme contrainte de forme pour les messages. [CNIL et prospection B2B 2026](https://fichierb2b.fr/articles/cnil-prospection-b2b-legal-2026/)

**Réputation.** La promesse "10 ventes, un appel obligatoire, garantie 30 jours" est défendable — pas de promesse de résultat client non maîtrisable, pas d'automatisation cachée. Cohérent avec la doctrine déjà écrite au plan.

**Dépendance.** Trois nouveaux tiers entrent dans la chaîne : Stripe (paiement), Cal.com (agenda), Plausible (mesure). Aucun MCP connecté pour Stripe ni Cal.com dans cette session Claude Code — la connexion des comptes et la création des liens/événements sont des actions manuelles côté Hari, que MAESTRO prépare mais n'exécute pas (ligne rouge constitution : Stripe live). Plausible propose un essai gratuit de 30 jours — utilisable pour ce sprint sans décision d'abonnement immédiate.

## Variables décisives

Obtenables par moi (déjà faites ci-dessus) :
- Faisabilité technique Stripe/Cal.com/tracking — confirmée.
- Structure exacte des 3 liens Stripe et de l'agenda Cal.com — dérivable du plan, pas besoin de redemander.

Attendues de l'utilisateur, immédiatement :
1. **Stripe** : as-tu déjà un compte Stripe actif et vérifié (capable d'encaisser aujourd'hui), ou faut-il en créer un — auquel cas la vérification d'identité (KYC) peut prendre 1 à 3 jours ouvrés en France et repousserait d'autant le vrai démarrage de l'encaissement ?
2. **Cal.com** : compte déjà créé, ou à créer (5 minutes, gratuit) ?
3. **Prospection** : as-tu déjà commencé l'extraction Agence Bio ou l'adhésion aux groupes Facebook de ton côté depuis le 29/08, pour que je ne duplique pas ce travail ?
4. **Le retard** : au-delà du manque de temps, y a-t-il un blocage précis qui a empêché la Semaine 0 (hésitation sur la variante de landing, souci technique, autre) ? Si non, je pars du principe qu'il s'agit uniquement d'un manque de créneau et j'exécute directement.

## Verdict

**Lancer sous condition** — condition = réponse aux variables décisives 1 et 2 avant que je puisse écrire un TOOLING.md complet et un plan d'exécution daté. Le reste (3 et 4) n'est pas bloquant : je pars sur des hypothèses par défaut (rien de dupliqué, pas de blocage caché) que tu corriges si elles sont fausses.
