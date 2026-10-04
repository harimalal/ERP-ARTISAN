#!/usr/bin/env node
/* =========================================================
   Validation Import IA — automatisée, tenant de test
   Pas de toucher aux comptes clients
   ========================================================= */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'test-cases');

console.log(`
╔══════════════════════════════════════════════════════════════╗
║      VALIDATION Import IA — Désambiguïsation universelle    ║
║           Tenant de test DÉDIÉ (pas de clients réels)       ║
╚══════════════════════════════════════════════════════════════╝
`);

// =========================================================
// Cas de test attendus
// =========================================================
const testCases = [
  {
    id: '01-tabular-ambig-confiture',
    type: 'Tableau ambigü',
    description: 'Stock vs Réassort — doit prioriser Réassort',
    expected: {
      client: null,
      lignes: [
        { nomOriginal: /Confiture.*Fraise/i, qte: 45 },
        { nomOriginal: /Miel.*Châtaignier/i, qte: 20 },
        { nomOriginal: /Sucre.*blanc/i, qte: 75 },
      ]
    },
    critère: 'qte doit être Réassort (45, 20, 75), pas Stock (120, 60, 200)'
  },
  {
    id: '02-bc-libre-simple',
    type: 'BC libre simple',
    description: 'Texte libre sans structure table',
    expected: {
      lignes: [
        { nomOriginal: /Confiture.*Fraise/i, qte: 6 },
        { nomOriginal: /Miel/i, qte: 3 },
        { nomOriginal: /Sucre/i, qte: 2 },
        { nomOriginal: /Pots/i, qte: 10 }
      ]
    },
    critère: 'extraction simple : 6, 3, 2, 10 (pas régression)'
  },
  {
    id: '03-tableau-clair',
    type: 'Tableau clair',
    description: 'Une seule colonne quantité (baseline)',
    expected: {
      lignes: [
        { nomOriginal: /Confiture/i, qte: 12 },
        { nomOriginal: /Miel/i, qte: 5 },
        { nomOriginal: /Sucre/i, qte: 20 },
        { nomOriginal: /Pots/i, qte: 50 }
      ]
    },
    critère: 'baseline : 12, 5, 20, 50 (doit marcher)'
  },
  {
    id: '04-tableau-action-words',
    type: 'Action-words',
    description: 'Colonne "À commander" prioritaire',
    expected: {
      lignes: [
        { nomOriginal: /Confiture/i, qte: 8 },
        { nomOriginal: /Miel/i, qte: 3 },
        { nomOriginal: /Sucre/i, qte: 15 },
        { nomOriginal: /Pots/i, qte: 40 }
      ]
    },
    critère: 'priorise "À commander" : 8, 3, 15, 40 (pas 120, 60, 200)'
  },
  {
    id: '05-catalogue-sans-qte',
    type: 'Catalogue sans quantité',
    description: 'Pas de colonne quantité → qte: null',
    expected: {
      lignes: [
        { nomOriginal: /Confiture/i, qte: null },
        { nomOriginal: /Miel/i, qte: null },
        { nomOriginal: /Sucre/i, qte: null },
        { nomOriginal: /Pots/i, qte: null }
      ]
    },
    critère: 'toutes les qte = null, remarques contient "colonne"'
  },
  {
    id: '06-faux-tableau',
    type: 'Faux tableau',
    description: 'Texte libre formaté — pas piégé',
    expected: {
      lignes: [
        { nomOriginal: /Confiture/i, qte: 6 },
        { nomOriginal: /Miel/i, qte: 3 },
        { nomOriginal: /Sucre/i, qte: 10 }
      ]
    },
    critère: 'extraction simple : 6, 3, 10 (fallback texte libre)'
  }
];

// =========================================================
// Validation locale (sans appel API)
// =========================================================
console.log('\n📋 Cas de test à valider (chacun en CSV, PDF, DOCX si possible):\n');

testCases.forEach((tc, idx) => {
  console.log(`${idx + 1}. ${tc.type}`);
  console.log(`   Description: ${tc.description}`);
  console.log(`   Critère: ${tc.critère}`);
  console.log(`   Fichiers: tests/test-cases/${tc.id}.*\n`);
});

// =========================================================
// Instructions de test manuel
// =========================================================
console.log(`╔══════════════════════════════════════════════════════════════╗
║              PROCÉDURE TEST MANUEL (tenant de test)         ║
╚══════════════════════════════════════════════════════════════╝

PRÉPARATION :
1. Créer un tenant de test séparé (ex. "TEST-IMPORT-IA")
   → Pas sur le compte productif
   → Email de test dédié
   → Produits/clients de test pré-chargés

2. Convertir les fichiers de test en PDF/DOCX/XLSX réels :
   • CSV → Excel → PDF
   • HTML → Chrome → Imprimer en PDF
   • TXT → Word → DOCX

VALIDATION (pour chaque cas) :
   a) Admin → Import données → Importer bon de commande
   b) Upload fichier (PDF, XLSX ou DOCX)
   c) Cliquer "Analyser avec IA"
   d) Vérifier le résultat
   e) Cocher ci-dessous

CHECKLIST DE VALIDATION :

${testCases.map((tc, i) => `
┌─ Cas ${i + 1}: ${tc.type}
│  [ ] CSV testé
│  [ ] PDF testé
│  [ ] DOCX testé (si applicable)
│  Résultat: qte = ${tc.expected.lignes.map(l => l.qte).join(', ')}
│  Signé le: ________
└─ Statut: ____________________
`).join('')}

RÉSULTAT FINAL :
[ ] Tous les cas passent
[ ] Aucune régression sur PDFs simples
[ ] Console F12 : zéro erreur rouge
[ ] Supabase : données correctes

Approuvé par: ________________
Date: ________
`);

console.log('\n📁 Fichiers générés:\n');
const files = fs.readdirSync(testDir).filter(f => f.startsWith('0'));
files.forEach(f => {
  const stat = fs.statSync(path.join(testDir, f));
  console.log(`   ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
});

console.log(`
═══════════════════════════════════════════════════════════════

ÉTAPES SUIVANTES :

1. Convertir les fichiers en vrais PDF/DOCX (voir procédure ci-dessus)
2. Créer tenant de test "TEST-IMPORT-IA" isolé
3. Charger les fichiers de test via Import IA
4. Valider chaque cas vs critères attendus
5. Signer la checklist
6. Si tout passe → OK pour merge en main
7. Si régression → ajuster prompt, redéployer, revalider

═══════════════════════════════════════════════════════════════
`);
