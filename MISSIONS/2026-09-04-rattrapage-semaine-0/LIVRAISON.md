## À retenir
- Verdict : livré. La Semaine 0 du sprint 10 ventes ArtEasy (retard de 3 jours) est rattrapée — encaissement, distribution, prospection.
- Ce qui bloque : rien côté MAESTRO. Deux actions restent à l'utilisateur (voir Prochaines actions).
- Risque n°1 : la page Cal.com affiche encore "Reflex IA" et "30 min" au lieu de la marque et de la durée ArtEasy — fonctionnelle mais à corriger vite.

---

## Livrables

1. file:///home/radoraj/ERP%20ARTISAN/MISSIONS/2026-09-04-rattrapage-semaine-0/livrables/01_specs_stripe_calcom.md — textes exacts des 3 liens Stripe (paliers 97/147/197€, limites 6/6/8) et de l'événement Cal.com, prêts à copier-coller.
2. file:///home/radoraj/ERP%20ARTISAN/MISSIONS/2026-09-04-rattrapage-semaine-0/livrables/02_prospects_agence_bio.csv — 200 prospects bio-certifiés (croisement NAF + Agence Bio via API officielle), plus 02_methodologie_prospection.md pour la méthode et les mots-clés groupes Facebook.
3. file:///home/radoraj/ERP%20ARTISAN/MISSIONS/2026-09-04-rattrapage-semaine-0/livrables/03_copier_coller_du_jour.md — page /merci finalisée, templates Instagram/email/Facebook personnalisés et liés au vrai Cal.com, gabarit carrousel avant/après.
4. arteasy.fr — landing en ligne : structure et visuel de l'ancienne landing conservés (hero avec captures produit, parcours 5 étapes, slideshow, avant/après), offre corrigée aux vrais paliers 97/147/197€, CTA relié au vrai lien de réservation.

## Décisions structurantes prises et pourquoi

- Stripe retenu contre PayPal : seul à supporter nativement la limite de paiements par lien, mécanisme qui porte la promesse "places limitées" de l'offre.
- Landing reconstruite en synthèse plutôt qu'un remplacement pur : la structure/visuel existants (hero réel, slideshow) valaient d'être gardés, seule l'offre et le copywriting avaient besoin d'être corrigés — évite de jeter un travail de design qui fonctionnait.
- Numéro WhatsApp personnel utilisé sur demande explicite de l'utilisateur malgré le risque d'exposition signalé.

## Temps réel

Mission ouverte et livrée dans la même session, 2026-09-04. Commits : 5c295d7 → 1a7335d sur feature/sprint-landing-live, mergés dans main en 9474386.

## Prochaines actions (utilisateur, hors périmètre MAESTRO)

- Corriger la page Cal.com : nom "ArtEasy" au lieu de "Reflex IA", durée 20 min, ajouter les 4 questions de pré-qualification (livrable 01).
- Créer les 3 liens de paiement Stripe depuis les textes du livrable 1.
- Démarrer l'outreach avec les textes et la liste de prospects déjà prêts.
