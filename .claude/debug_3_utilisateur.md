# AppMee — Ce qu'on demande à l'utilisateur
**Version :** Session #7 · 13 avril 2026

> Ces demandes sont faites à l'utilisateur quand le contexte est insuffisant.
> On ne demande que ce dont on a besoin. Jamais tout en même temps.
> Chaque demande doit être simple, concrète, faisable en moins de 2 minutes.

---

## PRINCIPE — Une demande à la fois

Chaque question doit être formulée de façon à ce que l'utilisateur puisse y répondre
sans être développeur. Si une demande nécessite d'expliquer comment faire,
l'explication est incluse directement dans la question.

---

## DEMANDE 1 — Le lien bleu dans la console

**Quand :** à la première erreur signalée, avant toute autre question.

**Ce qu'on dit à l'utilisateur :**
```
Dans Chrome, fais F12 → onglet Console.
Tu vois une ligne rouge avec une erreur.
À droite de cette ligne, il y a un lien bleu (ex : achats.js:340).
Clique dessus — une nouvelle vue s'ouvre.
Dis-moi quel fichier et quelle ligne est surlignée en rouge.
```

**Pourquoi :** c'est l'information la plus fiable. Le texte de l'erreur ment parfois,
le lien pointe toujours sur la vraie source du problème.

---

## DEMANDE 2 — Le fichier source

**Quand :** une fois le fichier exact identifié via le lien bleu.

**Ce qu'on dit à l'utilisateur :**
```
Ouvre [nom du fichier] sur GitHub.
Clique sur les trois points ··· en haut à droite → Download.
Uploade le fichier ici dans la conversation.
```

**Pourquoi :** `project_knowledge_search` donne des extraits, pas le fichier complet.
Sans le fichier exact, le fix peut ne pas matcher le code réel.

---

## DEMANDE 3 — Le message d'erreur complet

**Quand :** l'erreur vient d'une Netlify Function (statut 500 dans Network).

**Ce qu'on dit à l'utilisateur :**
```
Va sur Netlify → onglet Functions → clique sur le nom de la fonction.
Dans Function log, copie-colle le message d'erreur complet qui apparaît.
```

**Pourquoi :** les erreurs 500 sans log côté navigateur ne donnent aucune information.
Le vrai message est dans les logs Netlify.

---

## DEMANDE 4 — Le statut réseau

**Quand :** une action ne produit aucun effet visible et il n'y a pas d'erreur rouge en console.

**Ce qu'on dit à l'utilisateur :**
```
Fais F12 → onglet Network.
Refais l'action qui ne fonctionne pas.
Une ligne apparaît dans Network — dis-moi :
- Le nom de la requête (colonne Name)
- Le statut (colonne Status) : 200, 400, 500…
- Si tu cliques dessus → onglet Response → copie ce que tu vois
```

**Pourquoi :** les erreurs silencieuses (early return, condition non remplie, cache stale)
ne génèrent pas d'erreur JS. Seul le Network révèle si la requête est partie et ce qu'elle a retourné.

---

## DEMANDE 5 — La reproduction en navigation privée

**Quand :** le bug semble intermittent ou lié à un état de session.

**Ce qu'on dit à l'utilisateur :**
```
Ouvre une fenêtre de navigation privée (Ctrl+Shift+N sur Chrome).
Va sur l'URL de l'appli, connecte-toi.
Refais exactement la même action.
Est-ce que le bug se reproduit ?
```

**Pourquoi :** la navigation privée vide le cache navigateur et les cookies.
Si le bug disparaît → c'est un problème de cache ou de session persistante.
Si le bug persiste → c'est un bug de code ou de données.

---

## DEMANDE 6 — Le Ctrl+Shift+R

**Quand :** l'utilisateur teste après un déploiement et dit que rien n'a changé.

**Ce qu'on dit à l'utilisateur :**
```
Fais Ctrl+Shift+R sur la page de l'appli.
C'est un rechargement forcé qui vide le cache du navigateur.
Reteste après.
```

**Pourquoi :** Netlify déploie instantanément mais le navigateur peut garder
l'ancienne version en cache pendant plusieurs minutes. Ctrl+Shift+R force la mise à jour.

---

## CE QU'ON NE DEMANDE JAMAIS

Ces demandes sont à éviter — elles font perdre du temps sans apporter d'information utile :

| Demande inutile | Pourquoi |
|----------------|---------|
| "Peux-tu me décrire le bug ?" | On demande le lien bleu — pas une description |
| "Quelles étapes as-tu suivies ?" | On demande le fichier + ligne — pas la procédure |
| "Est-ce que ça marche ailleurs ?" | On isole d'abord la cause racine |
| "Peux-tu réessayer ?" | Ctrl+Shift+R d'abord, ensuite réessayer |
| Plusieurs demandes en même temps | Une demande à la fois — toujours |