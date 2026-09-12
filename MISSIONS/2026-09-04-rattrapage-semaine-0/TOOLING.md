Constat général : aucune Netlify Function nouvelle n'est nécessaire pour ce périmètre — les liens Stripe redirigent nativement vers une URL de confirmation statique (/merci), pas besoin de webhook serveur. Ça évite toute la classe de risque "nom de variable d'environnement à deviner" (learnings_continu.md, Règle 3).

## Bloc 1 — Liens de paiement (3x, paliers 97/147/197€)
Candidats : Stripe Dashboard manuel / Zapier action Stripe / MCP Stripe
Scores : Dashboard manuel = 90 (natif, aucun MCP connecté, ligne rouge constitution sur toute activation live) / Zapier = 30 (créer un lien de paiement réel via automatisation contourne la ligne rouge "Stripe live", écarté par principe) / MCP Stripe = indisponible, aucun serveur MCP Stripe connecté à cette session
Retenu : Dashboard manuel — MAESTRO rédige les 3 textes exacts (nom, montant, limite, champs à collecter, URL de confirmation) prêts à copier-coller, Hari clique.
MCP requis : aucun
Plan B si indispo : sans objet, c'est déjà le plan retenu

## Bloc 2 — Agenda Cal.com (1 événement, 4 questions de pré-qualification)
Candidats : Cal.com Dashboard manuel / MCP Cal.com
Scores : Dashboard manuel = 90 (signup gratuit, pas de KYC, 5 minutes) / MCP Cal.com = indisponible, aucun serveur connecté
Retenu : Dashboard manuel — MAESTRO rédige la config exacte (nom, durée 20 min, buffer 10 min, disponibilités, 4 questions) prête à copier-coller.
MCP requis : aucun
Plan B si indispo : sans objet

## Bloc 3 — Déploiement landing A + CTA + compteur + page /merci
Candidats : édition directe du bundle `index.html` (pattern Python déjà validé sur ce projet) + git + Netlify auto-deploy / Netlify MCP
Scores : Pattern existant = 95 (outil natif, déjà éprouvé sur ce repo en Session 1-4, Netlify auto-deploy déjà vérifié fonctionnel — curl sur arteasy.fr après merge) / Netlify MCP = non nécessaire, le déploiement se fait par push git comme sur tout le reste du projet
Retenu : édition Python + branche dédiée `feature/sprint-landing-live` + preview Netlify + merge sur validation utilisateur (dossier de choix, point 4)
MCP requis : aucun (Netlify déjà connecté au repo, auto-deploy sur push)
Plan B si indispo : sans objet

## Bloc 4 — Tracking UTM + mesure de trafic
Candidats : script Plausible dans le `<head>` du bundle / Umami self-hosted / GA4
Scores : Plausible = 88 (hébergé, pas de maintenance, UTM natif, pas de bandeau cookie) / Umami = 55 (self-hosted, pas de vue UTM dédiée) / GA4 = 40 (bandeau cookie + registre RGPD à construire avant activation légale)
Retenu : Plausible, essai gratuit 30 jours — même mécanisme d'édition que le bloc 3 (script ajouté au bundle)
MCP requis : aucun. Compte Plausible à créer par Hari (gratuit, sans KYC) avant l'ajout du script — sinon le script pointe vers un domaine non enregistré et ne remonte rien.
Plan B si indispo : GA4 en repli si Plausible ne convient pas à l'usage, avec le chantier bandeau cookie en plus (non recommandé dans les délais du sprint)

## Bloc 5 — Extraction + enrichissement Agence Bio (150 lignes)
Candidats : appel direct à l'API Professionnels BIO (data.gouv.fr) + script de filtrage / scraping tiers
Scores : API directe = 95 (source primaire, publique, pas de compte requis, pas de risque juridique) / scraping tiers = 20 (fragile juridiquement pour du B2B massif, écarté par la piste risque de reconnaissance.md)
Retenu : API directe (WebFetch/Bash), filtrage sur les 6 activités de transformation bio listées au plan, export CSV. L'API ne contient ni email ni Instagram (confirmé en reconnaissance) — l'enrichissement de ces deux champs reste semi-manuel, recherche web ciblée ligne par ligne, priorité aux lignes à signal de croissance (Insta actif +500 abonnés, plusieurs points de vente) si le temps presse.
MCP requis : aucun
Plan B si indispo : si l'API est indisponible ponctuellement, utiliser le jeu de données statique "Professionnels engagés en BIO" du même organisme (même source, moins à jour)

## Bloc 6 — Feuille de suivi (annexe E2 du plan)
Candidats : Google Sheets (MCP Google Drive déjà connecté à cette session) / gabarit texte à recréer par Hari
Scores : Google Drive MCP = 85 (déjà connecté, création directe possible) / gabarit texte = 60 (Hari doit le recréer lui-même dans son propre Drive)
Retenu : à confirmer avec Hari au moment du lot — création directe via MCP si autorisée, sinon gabarit de colonnes fourni en texte
MCP requis : `mcp__claude_ai_Google_Drive` — déjà connecté, à vérifier au moment de l'exécution (peut être déconnecté)
Plan B si indispo : fournir le gabarit de colonnes en texte, Hari crée le fichier lui-même
