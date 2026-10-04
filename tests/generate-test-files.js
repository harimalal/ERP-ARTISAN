#!/usr/bin/env node
/* =========================================================
   Génération fichiers de test Import IA
   Couvre : tableau ambigü, BC libre, tableau clair,
   action-words, catalogue, faux tableau
   ========================================================= */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'test-cases');

// Créer répertoire s'il n'existe pas
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

/* =========================================================
   CAS 1 — Tableau ambigü (confiture)
   Problème : Stock vs Réassort, besoin de désambiguïser
   ========================================================= */
const case1_data = `Produit	Référence	Stock actuel	Ventes moyennes	Réassort prévu
Confiture Fraise Gariguette 50ml	CONF-001	120	25	45
Miel Châtaignier 500g	MIEL-002	60	15	20
Sucre blanc cristallisé 1kg	SUCRE-001	200	40	75
Pots verre 375ml	POT-375	500	100	150
Étiquettes produits	ETQ-100	1000	200	300`;

/* =========================================================
   CAS 2 — BC libre simple (pas de tableau)
   ========================================================= */
const case2_data = `BON DE COMMANDE
Date : 15 octobre 2026
Client : La Ruche Bio

Demande :
- 6 pots de Confiture Fraise Gariguette 50ml
- 3 bocaux de Miel Châtaignier 500g
- 2 sacs sucre blanc 1kg
- 10 pots verre 375ml

Livraison prévue : 22 octobre 2026
Signature : Paul Artisan`;

/* =========================================================
   CAS 3 — Tableau clair (une seule colonne quantité)
   ========================================================= */
const case3_data = `Produit	Référence	Quantité à commander
Confiture Fraise Gariguette 50ml	CONF-001	12
Miel Châtaignier 500g	MIEL-002	5
Sucre blanc cristallisé 1kg	SUCRE-001	20
Pots verre 375ml	POT-375	50`;

/* =========================================================
   CAS 4 — Tableau avec action-words (priorité claire)
   ========================================================= */
const case4_data = `Produit	Ref	À commander	Stock actuel	Ventes semaine
Confiture Fraise Gariguette 50ml	CONF-001	8	120	25
Miel Châtaignier 500g	MIEL-002	3	60	15
Sucre blanc cristallisé 1kg	SUCRE-001	15	200	40
Pots verre 375ml	POT-375	40	500	100`;

/* =========================================================
   CAS 5 — Catalogue sans quantité (qte doit être null)
   ========================================================= */
const case5_data = `Produit	Référence	Prix unitaire	Catégorie
Confiture Fraise Gariguette 50ml	CONF-001	4.50 €	Confitures
Miel Châtaignier 500g	MIEL-002	12.00 €	Miels
Sucre blanc cristallisé 1kg	SUCRE-001	0.89 €	Sucres
Pots verre 375ml	POT-375	0.35 €	Emballages`;

/* =========================================================
   CAS 6 — Faux tableau (texte libre qui ressemble à tableau)
   ========================================================= */
const case6_data = `DEMANDE SPÉCIALE

Produit: Confiture Fraise Gariguette 50ml | Quantité: 6
Produit: Miel Châtaignier 500g | Quantité: 3
Produit: Sucre blanc 1kg | Quantité: 10

Note: ce format n'est pas une vraie table, juste du texte libre formaté`;

// =========================================================
// Fichiers CSV (peut être ouvert en Excel et en PDF)
// =========================================================
console.log('Génération fichiers de test...\n');

fs.writeFileSync(
  path.join(testDir, '01-tabular-ambig-confiture.csv'),
  case1_data,
  'utf-8'
);
console.log('✓ 01-tabular-ambig-confiture.csv');

fs.writeFileSync(
  path.join(testDir, '03-tableau-clair.csv'),
  case3_data,
  'utf-8'
);
console.log('✓ 03-tableau-clair.csv');

fs.writeFileSync(
  path.join(testDir, '04-tableau-action-words.csv'),
  case4_data,
  'utf-8'
);
console.log('✓ 04-tableau-action-words.csv');

fs.writeFileSync(
  path.join(testDir, '05-catalogue-sans-qte.csv'),
  case5_data,
  'utf-8'
);
console.log('✓ 05-catalogue-sans-qte.csv');

// =========================================================
// Fichiers texte (simule PDF/DOCX)
// =========================================================
fs.writeFileSync(
  path.join(testDir, '02-bc-libre-simple.txt'),
  case2_data,
  'utf-8'
);
console.log('✓ 02-bc-libre-simple.txt');

fs.writeFileSync(
  path.join(testDir, '06-faux-tableau.txt'),
  case6_data,
  'utf-8'
);
console.log('✓ 06-faux-tableau.txt');

// =========================================================
// Génération HTML pour conversion en PDF (via browser/CLI tool)
// =========================================================
const generateHTML = (title, content, tableHeaders = null) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #999; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .text { white-space: pre-wrap; font-family: monospace; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${tableHeaders ? `
    <table>
      <thead><tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${content.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  ` : `<div class="text">${content}</div>`}
</body>
</html>`;

// CAS 1 : Tableau ambigü
const case1_html = generateHTML(
  'Cas 1 — Tableau ambigü (Stock vs Réassort)',
  [
    ['Confiture Fraise Gariguette 50ml', 'CONF-001', '120', '25', '45'],
    ['Miel Châtaignier 500g', 'MIEL-002', '60', '15', '20'],
    ['Sucre blanc cristallisé 1kg', 'SUCRE-001', '200', '40', '75'],
    ['Pots verre 375ml', 'POT-375', '500', '100', '150'],
    ['Étiquettes produits', 'ETQ-100', '1000', '200', '300']
  ],
  ['Produit', 'Référence', 'Stock actuel', 'Ventes moyennes', 'Réassort prévu']
);
fs.writeFileSync(path.join(testDir, '01-tabular-ambig-confiture.html'), case1_html, 'utf-8');
console.log('✓ 01-tabular-ambig-confiture.html (pour PDF)');

// CAS 2 : BC libre
fs.writeFileSync(path.join(testDir, '02-bc-libre-simple.html'),
  generateHTML('Cas 2 — BC libre simple', case2_data), 'utf-8');
console.log('✓ 02-bc-libre-simple.html (pour PDF)');

// CAS 3 : Tableau clair
const case3_html = generateHTML(
  'Cas 3 — Tableau clair (une colonne quantité)',
  [
    ['Confiture Fraise Gariguette 50ml', 'CONF-001', '12'],
    ['Miel Châtaignier 500g', 'MIEL-002', '5'],
    ['Sucre blanc cristallisé 1kg', 'SUCRE-001', '20'],
    ['Pots verre 375ml', 'POT-375', '50']
  ],
  ['Produit', 'Référence', 'Quantité à commander']
);
fs.writeFileSync(path.join(testDir, '03-tableau-clair.html'), case3_html, 'utf-8');
console.log('✓ 03-tableau-clair.html (pour PDF)');

// CAS 4 : Tableau action-words
const case4_html = generateHTML(
  'Cas 4 — Tableau avec action-words (priorité claire)',
  [
    ['Confiture Fraise Gariguette 50ml', 'CONF-001', '8', '120', '25'],
    ['Miel Châtaignier 500g', 'MIEL-002', '3', '60', '15'],
    ['Sucre blanc cristallisé 1kg', 'SUCRE-001', '15', '200', '40'],
    ['Pots verre 375ml', 'POT-375', '40', '500', '100']
  ],
  ['Produit', 'Ref', 'À commander', 'Stock actuel', 'Ventes semaine']
);
fs.writeFileSync(path.join(testDir, '04-tableau-action-words.html'), case4_html, 'utf-8');
console.log('✓ 04-tableau-action-words.html (pour PDF)');

// CAS 5 : Catalogue sans quantité
const case5_html = generateHTML(
  'Cas 5 — Catalogue sans quantité (qte = null)',
  [
    ['Confiture Fraise Gariguette 50ml', 'CONF-001', '4.50 €', 'Confitures'],
    ['Miel Châtaignier 500g', 'MIEL-002', '12.00 €', 'Miels'],
    ['Sucre blanc cristallisé 1kg', 'SUCRE-001', '0.89 €', 'Sucres'],
    ['Pots verre 375ml', 'POT-375', '0.35 €', 'Emballages']
  ],
  ['Produit', 'Référence', 'Prix unitaire', 'Catégorie']
);
fs.writeFileSync(path.join(testDir, '05-catalogue-sans-qte.html'), case5_html, 'utf-8');
console.log('✓ 05-catalogue-sans-qte.html (pour PDF)');

// CAS 6 : Faux tableau
fs.writeFileSync(path.join(testDir, '06-faux-tableau.html'),
  generateHTML('Cas 6 — Faux tableau (texte libre)', case6_data), 'utf-8');
console.log('✓ 06-faux-tableau.html (pour PDF)');

console.log('\n═══════════════════════════════════════════════════════');
console.log('Fichiers générés dans tests/test-cases/\n');
console.log('Format CSV : ouvrir en Excel → exporter en PDF');
console.log('Format HTML : ouvrir en navigateur → imprimer en PDF\n');
console.log('Cas couverts :');
console.log('1. Tableau ambigü (Stock vs Réassort) → doit reconnaître Réassort');
console.log('2. BC libre simple → doit extraire quantités du texte');
console.log('3. Tableau clair → doit marcher (baseline)');
console.log('4. Tableau action-words → doit prioriser "À commander"');
console.log('5. Catalogue sans qte → doit retourner qte: null');
console.log('6. Faux tableau → ne doit pas se tromper sur structure');
console.log('═══════════════════════════════════════════════════════');
