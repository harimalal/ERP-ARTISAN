# Test Import IA — Protocole complet
> Validation de la désambiguïsation universelle (tous formats)
> Généré pour session AI amélioration Import IA

---

## Setup

Fichiers de test générés dans `tests/test-cases/` :

| Fichier | Format | Cas d'usage | Résultat attendu |
|---------|--------|-------------|------------------|
| **01-tabular-ambig-confiture** | CSV + HTML | Tableau ambigü (Stock vs Réassort) | qte = 45 (Réassort), pas 120 (Stock) |
| **02-bc-libre-simple** | TXT + HTML | BC libre sans structure table | 6 pots confiture, 3 bocaux miel, 2 sucre, 10 pots |
| **03-tableau-clair** | CSV + HTML | Tableau sans ambiguïté (baseline) | qte = 12, 5, 20, 50 (doit marcher) |
| **04-tableau-action-words** | CSV + HTML | Action-words clairs ("À commander") | qte = 8, 3, 15, 40 (priorise action-words) |
| **05-catalogue-sans-qte** | CSV + HTML | Catalogue pur (pas de quantité) | qte = null pour tous (+ remarque) |
| **06-faux-tableau** | TXT + HTML | Faux tableau (texte libre formaté) | Extraction simple (6, 3, 10) — pas piégé |

---

## Procédure de test

### Étape 1 — Convertir les fichiers en vrais PDF/DOCX

**Format CSV → XLS → PDF (via Excel/Calc) :**
```
1. Ouvrir tests/test-cases/XX-*.csv dans Excel
2. Fichier → Exporter en PDF
3. Garder en tests/test-cases/XX-*.pdf
```

**Format HTML → PDF (via navigateur) :**
```
1. Ouvrir tests/test-cases/XX-*.html dans Chrome
2. Ctrl+P → Imprimer en PDF
3. Enregistrer en tests/test-cases/XX-*.pdf
```

**Format TXT → DOCX (via Word) :**
```
1. Ouvrir tests/test-cases/XX-*.txt dans Word
2. Fichier → Enregistrer en tant que DOCX
3. Garder le format tabulaire si le TXT le suggère
```

### Étape 2 — Tester chaque fichier via Import IA

**Pour chaque fichier généré :**

1. Aller dans **Admin → Import données → Importer bon de commande**
2. Uploader le fichier (PDF, XLSX, DOCX)
3. Cliquer **Analyser avec IA**
4. Vérifier le résultat

---

## Résultats attendus par cas

### Cas 1 — Tableau ambigü
**Fichier :** 01-tabular-ambig-confiture (CSV / PDF / XLSX)

**Données :**
```
Produit | Référence | Stock actuel | Ventes moyennes | Réassort prévu
--------|-----------|--------------|-----------------|----------------
Conf... | CONF-001  |    120       |      25        |      45
Miel    | MIEL-002  |     60       |      15        |      20
Sucre   | SUCRE-001 |    200       |      40        |      75
Pots    | POT-375   |    500       |     100        |     150
```

**Avant fix (isTabulaire = false sur PDF) :**
Risque : confusion entre Stock et Réassort

**Après fix (désambiguïsation universelle) :**
```
✓ Confiture Fraise → qte: 45 (Réassort, pas 120)
✓ Miel → qte: 20 (Réassort)
✓ Sucre → qte: 75 (Réassort)
✓ Pots → qte: 150 (Réassort)
```

**Critère de succès :** toutes les quantités pointent sur "Réassort prévu", même sur PDF.

---

### Cas 2 — BC libre simple
**Fichier :** 02-bc-libre-simple (TXT / PDF / DOCX)

**Données :**
```
BON DE COMMANDE
[...]
Demande :
- 6 pots de Confiture Fraise Gariguette 50ml
- 3 bocaux de Miel Châtaignier 500g
- 2 sacs sucre blanc 1kg
- 10 pots verre 375ml
```

**Avant :** devrait fonctionner (c'était déjà bon)

**Après :** doit rester correct (pas de régression)

```
✓ Confiture Fraise → qte: 6
✓ Miel Châtaignier → qte: 3
✓ Sucre blanc → qte: 2
✓ Pots verre → qte: 10
```

**Critère de succès :** extraction simple fonctionne encore, pas d'application erronée de logique tabulaire.

---

### Cas 3 — Tableau clair (baseline)
**Fichier :** 03-tableau-clair (CSV / PDF / XLSX)

**Données :**
```
Produit | Référence | Quantité à commander
--------|-----------|---------------------
Conf... | CONF-001  |         12
Miel    | MIEL-002  |          5
Sucre   | SUCRE-001 |         20
Pots    | POT-375   |         50
```

**Avant :** fonctionne (une colonne quantité évidente)

**Après :** doit marcher pareil

```
✓ Confiture → qte: 12
✓ Miel → qte: 5
✓ Sucre → qte: 20
✓ Pots → qte: 50
```

**Critère de succès :** baseline inchangée.

---

### Cas 4 — Tableau action-words
**Fichier :** 04-tableau-action-words (CSV / PDF / XLSX)

**Données :**
```
Produit | Ref | À commander | Stock actuel | Ventes semaine
--------|-----|-------------|--------------|----------------
Conf... | ... |      8      |     120      |      25
Miel    | ... |      3      |      60      |      15
Sucre   | ... |     15      |     200      |      40
Pots    | ... |     40      |     500      |     100
```

**Avant fix sur PDF :** risque d'utiliser Stock au lieu de "À commander"

**Après fix (règle: priorise action-words) :**
```
✓ Confiture → qte: 8 (À commander, pas 120)
✓ Miel → qte: 3 (À commander)
✓ Sucre → qte: 15 (À commander)
✓ Pots → qte: 40 (À commander)
```

**Critère de succès :** colonne "À commander" est prioritaire sur "Stock actuel".

---

### Cas 5 — Catalogue sans quantité
**Fichier :** 05-catalogue-sans-qte (CSV / PDF / XLSX)

**Données :**
```
Produit | Référence | Prix unitaire | Catégorie
--------|-----------|---------------|----------
Conf... | CONF-001  |    4.50 €     | Confitures
Miel    | MIEL-002  |   12.00 €     | Miels
```

**Avant :** qte: 1 par défaut (mauvais)

**Après (avec règle colonne 4) :**
```
✓ Confiture → qte: null, remarques: "Aucune colonne quantité"
✓ Miel → qte: null
```

**Critère de succès :** détecte l'absence de quantité, retourne null au lieu de 1 par défaut.

---

### Cas 6 — Faux tableau
**Fichier :** 06-faux-tableau (TXT / PDF / DOCX)

**Données :**
```
Produit: Confiture Fraise | Quantité: 6
Produit: Miel Châtaignier | Quantité: 3
Produit: Sucre blanc | Quantité: 10
```

**Avant :** fallback texte libre (bon)

**Après (avec règle universelle) :**
Risque : Claude détecte une fausse structure et l'applique mal.

```
✓ Confiture → qte: 6 (extraction texte libre, pas piégé par structure)
✓ Miel → qte: 3
✓ Sucre → qte: 10
```

**Critère de succès :** ne se laisse pas berner par un faux tableau, extraction simple correcte.

---

## Matrice de validation

```
Cas | Fichier | CSV/XLS | PDF | DOCX | Résultat attendu | ✓/✗ |
----|---------|---------|-----|------|------------------|-----|
1   | Ambigü  | Réassort| Réass.| Réass. | qte = quantité non-stock | ? |
2   | BC libre| 6,3,2,10| 6,3,2,10| 6,3,2,10 | extraction texte OK | ? |
3   | Clair   | 12,5,20,50 | 12,5... | 12,5... | baseline (pas régression) | ? |
4   | Action-w| 8,3,15,40| 8,3,... | 8,3,... | priorise "À commander" | ? |
5   | Catalogue| null    | null   | null   | qte=null si pas de colonne | ? |
6   | Faux tbl| 6,3,10  | 6,3,10 | 6,3,10 | pas piégé, extraction OK | ? |
```

---

## Checklist avant validation finale

```
[ ] Cas 1 PDF : quantités = Réassort (pas Stock)
[ ] Cas 2 PDF/DOCX : BC libre extraite correctement
[ ] Cas 3 CSV/PDF : baseline inchangée
[ ] Cas 4 CSV/PDF : "À commander" priorisé
[ ] Cas 5 CSV/PDF : qte = null avec remarque
[ ] Cas 6 TXT/PDF : extraction libre, pas d'erreur structure
[ ] Zéro régression sur PDFs existants (autres formats)
[ ] Console F12 : zéro erreur rouge
[ ] Supabase : données correctes (client, date, produits, qte)
```

---

## Notes technique

**Diagnostic si échec :**
1. Vérifier console F12 : erreur JSON parsing ?
2. Vérifier Network : réponse IA (voir Response tab)
3. Si réponse = `{client: null, lignes: []}` → prompt pas compris → ajuster wording
4. Si qte mauvaise → Claude appliqué mal la logique colonne → affiner priorités

**Si régression sur texte libre :**
→ la nouvelle règle "SI TU DÉTECTES table" appliquée mal
→ ajouter guard : "ne détecte table que si >=3 colonnes séparées clairement"

