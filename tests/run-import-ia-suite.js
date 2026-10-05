#!/usr/bin/env node
/* Suite Import IA : 20 échantillons bâtis sur les vraies données du tenant de test,
   envoyés à la vraie fonction /api/ai_analyse_bc, dans le format exact de l'application.

   node tests/run-import-ia-suite.js --dry          vérifie les échantillons, aucun appel réseau
   node tests/run-import-ia-suite.js                lance les 20 contre la production
   node tests/run-import-ia-suite.js --only S02,S05  seulement certains
   node tests/run-import-ia-suite.js --delay 1500     pause entre appels (ms)

   Variables (tests/.env.local ou environnement) :
   SUPABASE_URL, SUPABASE_SERVICE_KEY (la clé anon suffit pour la connexion),
   NETLIFY_FUNCTION_URL (défaut https://arteasy.fr/api/ai_analyse_bc), TENANT_ID (défaut : snapshot). */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { samples, snapshot, evaluer } from './import-ia/samples.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const arg = nom => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
const only = arg('--only') ? arg('--only').split(',').map(s => s.trim().toUpperCase()) : null;
const delay = Number(arg('--delay') || 1000);

const choisis = only ? samples.filter(s => only.includes(s.id)) : samples;
if (!choisis.length) { console.error('Aucun échantillon sélectionné.'); process.exit(1); }

if (dry) {
  const doublons = samples.map(s => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (doublons.length) { console.error('Identifiants en double :', doublons.join(', ')); process.exit(1); }
  for (const s of choisis) {
    console.log(`\n=== ${s.id} [${s.ext}] ${s.titre} ===`);
    console.log(s.texte);
    console.log(`--- attendu : ${JSON.stringify(s.expected)}`);
  }
  const parFormat = {};
  samples.forEach(s => { parFormat[s.ext] = (parFormat[s.ext] || 0) + 1; });
  console.log(`\n${samples.length} échantillons OK. Formats : ${Object.entries(parFormat).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`Tenant ${snapshot.tenantNom} (${snapshot.tenantId}) : ${snapshot.produits.length} produits, ${snapshot.clients.length} clients.`);
  process.exit(0);
}

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) (await import('dotenv')).default.config({ path: envPath });

const URL_FN = process.env.NETLIFY_FUNCTION_URL || 'https://arteasy.fr/api/ai_analyse_bc';
const TENANT_ID = process.env.TENANT_ID || snapshot.tenantId;
const manquants = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
if (manquants.length) { console.error('Variables manquantes :', manquants.join(', ')); process.exit(1); }

const { getTestToken } = await import('./auth-token.js');
let token;
try { token = await getTestToken(); } catch (err) { console.error('Connexion impossible :', err.message); process.exit(1); }
console.log(`Token OK. Fonction : ${URL_FN}. Tenant : ${TENANT_ID.slice(0, 8)}. ${choisis.length} échantillon(s).\n`);

const produits = snapshot.produits.map(p => ({ ref: p.ref, nom: p.nom }));
const clients = snapshot.clients.map(nom => ({ nom }));
const pause = ms => new Promise(r => setTimeout(r, ms));
const resultats = [];

for (const s of choisis) {
  let echecs;
  let data = null;
  try {
    const resp = await fetch(URL_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texte: s.texte, extension: s.ext, contexte: '', produits, clients, tenantId: TENANT_ID, token }),
    });
    const corps = await resp.json().catch(() => null);
    if (!resp.ok || !corps?.ok) {
      echecs = [`API ${resp.status} : ${corps?.error || 'réponse illisible'}${corps?.code ? ` (${corps.code})` : ''}`];
    } else {
      data = corps.data;
      echecs = evaluer(s, data);
    }
  } catch (err) {
    echecs = [`appel impossible : ${err.message}`];
  }
  const ok = echecs.length === 0;
  resultats.push({ s, ok, echecs, data });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.id} [${s.ext}] ${s.titre}`);
  if (!ok) {
    echecs.forEach(e => console.log(`      - ${e}`));
    if (data) console.log(`      reçu : client=${JSON.stringify(data.client)} lignes=${JSON.stringify((data.lignes || []).map(l => [l.refDetectee, l.qte]))} remarques=${JSON.stringify(data.remarques)}`);
  }
  if (echecs[0]?.startsWith('API 429')) { console.log('Quota IA atteint, arrêt.'); break; }
  await pause(delay);
}

console.log('\nRÉSUMÉ PAR FORMAT');
for (const ext of [...new Set(resultats.map(r => r.s.ext))]) {
  const rs = resultats.filter(r => r.s.ext === ext);
  console.log(`  ${ext.padEnd(5)} ${rs.filter(r => r.ok).length}/${rs.length}`);
}
const nbOk = resultats.filter(r => r.ok).length;
console.log(`\nTOTAL ${nbOk}/${resultats.length}`);
process.exit(nbOk === resultats.length ? 0 : 1);
