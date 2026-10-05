#!/usr/bin/env node
/* =========================================================
   Test Import IA — Lance les 6 cas de test contre Netlify Function
   Lit les credentials depuis .env.local OU env vars
   ========================================================= */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Charger .env.local s'il existe
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✓ .env.local chargé\n');
} else {
  console.log('→ Pas de .env.local trouvé, utilisation des variables d\'environnement\n');
}

// Vérifier les credentials
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TENANT_ID, ANTHROPIC_API_KEY } = process.env;
const required = { SUPABASE_URL, SUPABASE_SERVICE_KEY, TENANT_ID, ANTHROPIC_API_KEY };

const missing = Object.entries(required)
  .filter(([_, val]) => !val)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error('❌ Credentials manquants:', missing.join(', '));
  console.error('\nDéfinis via:');
  console.error('  1. .env.local dans tests/');
  console.error('  2. OU variables d\'environnement: export VAR=value');
  process.exit(1);
}

console.log(`✓ Credentials OK`);
console.log(`  Tenant: ${TENANT_ID.slice(0, 8)}...`);
console.log(`  Supabase: ${SUPABASE_URL.split('//')[1]}`);
console.log('\n');

// =========================================================
// Cas de test
// =========================================================
const testCases = [
  {
    id: '01-tabular-ambig-confiture',
    name: 'Tableau ambigü (Stock vs Réassort)',
    file: '01-tabular-ambig-confiture.csv',
    expected: {
      client: null,
      minLignes: 1,
      qtes: [45, 20, 75] // Réassort, pas Stock
    }
  },
  {
    id: '02-bc-libre-simple',
    name: 'BC libre simple',
    file: '02-bc-libre-simple.txt',
    expected: {
      minLignes: 4,
      qtes: [6, 3, 2, 10]
    }
  },
  {
    id: '03-tableau-clair',
    name: 'Tableau clair (baseline)',
    file: '03-tableau-clair.csv',
    expected: {
      minLignes: 4,
      qtes: [12, 5, 20, 50]
    }
  },
  {
    id: '04-tableau-action-words',
    name: 'Action-words prioritaires',
    file: '04-tableau-action-words.csv',
    expected: {
      minLignes: 4,
      qtes: [8, 3, 15, 40]
    }
  },
  {
    id: '05-catalogue-sans-qte',
    name: 'Catalogue (qte = null)',
    file: '05-catalogue-sans-qte.csv',
    expected: {
      minLignes: 4,
      allNull: true
    }
  },
  {
    id: '06-faux-tableau',
    name: 'Faux tableau (fallback texte)',
    file: '06-faux-tableau.txt',
    expected: {
      minLignes: 3,
      qtes: [6, 3, 10]
    }
  }
];

// =========================================================
// Lire fichiers de test
// =========================================================
console.log('📁 Chargement des fichiers de test...\n');

const testDir = path.join(__dirname, 'test-cases');
const testData = {};

for (const tc of testCases) {
  let filePath;

  // Chercher le fichier (CSV ou TXT)
  const csvPath = path.join(testDir, tc.file);
  const txtPath = path.join(testDir, tc.file.replace('.csv', '.txt'));

  if (fs.existsSync(csvPath)) {
    filePath = csvPath;
  } else if (fs.existsSync(txtPath)) {
    filePath = txtPath;
  } else {
    console.error(`❌ Fichier manquant: ${tc.file}`);
    process.exit(1);
  }

  testData[tc.id] = {
    ...tc,
    content: fs.readFileSync(filePath, 'utf-8'),
    filePath
  };

  console.log(`✓ ${tc.name} (${path.basename(filePath)})`);
}

console.log('\n');

// =========================================================
// Fonction de test
// =========================================================
async function runTest(testCase) {
  const { id, name, content, expected } = testCase;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Test: ${name}`);
  console.log(`${'═'.repeat(60)}`);

  try {
    // Appel à la Netlify Function locale
    // Attention: remplacer par l'URL réelle en prod
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ai_analyse_bc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        texte: content,
        extension: 'txt', // Tous en texte pour ce test
        tenantId: TENANT_ID,
        token: null, // Pas de token en test direct
        produits: [],
        clients: []
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`❌ Erreur API: ${result.error || response.statusText}`);
      return false;
    }

    const { data } = result;

    // Vérifications
    let passed = true;

    if (expected.client !== undefined && data.client !== expected.client) {
      console.error(`❌ Client: attendu ${expected.client}, got ${data.client}`);
      passed = false;
    }

    if (expected.minLignes && data.lignes.length < expected.minLignes) {
      console.error(`❌ Lignes: attendu >= ${expected.minLignes}, got ${data.lignes.length}`);
      passed = false;
    }

    if (expected.allNull) {
      const allNull = data.lignes.every(l => l.qte === null);
      if (!allNull) {
        console.error(`❌ Qte: attendu tous null, got ${data.lignes.map(l => l.qte).join(', ')}`);
        passed = false;
      } else {
        console.log(`✓ Toutes les qte = null`);
      }
    } else if (expected.qtes) {
      const qtes = data.lignes.map(l => l.qte);
      const match = JSON.stringify(qtes) === JSON.stringify(expected.qtes);
      if (!match) {
        console.error(`❌ Qte: attendu [${expected.qtes.join(', ')}], got [${qtes.join(', ')}]`);
        passed = false;
      } else {
        console.log(`✓ Qte OK: [${qtes.join(', ')}]`);
      }
    }

    if (passed) console.log(`✓ ${name} — PASS`);
    return passed;

  } catch (err) {
    console.error(`❌ Erreur: ${err.message}`);
    return false;
  }
}

// =========================================================
// Lancer tous les tests
// =========================================================
console.log(`🚀 Lancement de ${testCases.length} tests...\n`);

const results = [];
for (const tc of testCases) {
  const passed = await runTest(testData[tc.id]);
  results.push({ name: tc.name, passed });
}

// =========================================================
// Résumé
// =========================================================
console.log(`\n${'═'.repeat(60)}`);
console.log('RÉSUMÉ');
console.log(`${'═'.repeat(60)}\n`);

const passCount = results.filter(r => r.passed).length;
const totalCount = results.length;

results.forEach(r => {
  const icon = r.passed ? '✓' : '❌';
  console.log(`${icon} ${r.name}`);
});

console.log(`\n${passCount}/${totalCount} tests passés`);

if (passCount === totalCount) {
  console.log('\n🎉 Tous les tests sont passés! Prêt pour merge en main.');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${totalCount - passCount} test(s) en échec — voir détails ci-dessus.`);
  process.exit(1);
}
