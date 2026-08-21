import './setup.mjs';
import assert from 'node:assert';
import { _matchEntiteExistanteTest as match } from '../../js/modules/admin.js';

const existants = {
  clients: [{ id: 'c1', nom: 'Épicerie Martin', email: 'contact@epicerie.fr' }],
  fournisseurs: [{ id: 'f1', nom: 'Fournisseur A', siret: '12345678900012' }],
  articles: [{ id: 'a1', ref: 'A0001', nom: 'Pot verre 50ml' }],
  produits: [],
};

// Cas nouveau — aucune correspondance
let r = match({ type: 'client', champs: { nom: 'Client Totalement Nouveau' } }, existants);
assert.strictEqual(r.statut, 'nouveau');

// Cas existant fort — nom quasi-exact + champ clé identique (email)
r = match({ type: 'client', champs: { nom: 'Epicerie Martin', email: 'contact@epicerie.fr' } }, existants);
assert.strictEqual(r.statut, 'existant');
assert.strictEqual(r.correspondance.id, 'c1');

// Cas ambigu — nom proche mais aucun champ clé pour confirmer
r = match({ type: 'client', champs: { nom: 'Epicerie Martin', email: '' } }, existants);
assert.strictEqual(r.statut, 'ambigu');

// Cas fournisseur — match par siret même si nom différent (raison sociale changée)
r = match({ type: 'fournisseur', champs: { nom: 'Nouveau Nom SARL', siret: '12345678900012' } }, existants);
assert.strictEqual(r.statut, 'existant');
assert.strictEqual(r.correspondance.id, 'f1');

// Cas article — match par ref exacte
r = match({ type: 'article', champs: { ref: 'A0001', nom: 'Pot verre 50ml' } }, existants);
assert.strictEqual(r.statut, 'existant');

// Cas limite — nom vide, ne doit jamais planter
r = match({ type: 'client', champs: { nom: '' } }, existants);
assert.strictEqual(r.statut, 'nouveau');

console.log('dedup-entites.test.mjs — OK');
