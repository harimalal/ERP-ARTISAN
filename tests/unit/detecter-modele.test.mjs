import './setup.mjs';
import assert from 'node:assert';
import { _detecterTypeModeleTest as detecter } from '../../js/modules/admin.js';

// Cas nominal — match exact
assert.strictEqual(
  detecter(['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock']),
  'articles'
);

// Cas nominal — tolérance casse/accents/espaces
assert.strictEqual(
  detecter(['Réf', ' Nom ', 'Catégorie', 'Unité', 'Prix', 'Fournisseur', 'Seuil', 'Stock']),
  'articles'
);

// Cas clients
assert.strictEqual(
  detecter(['nom', 'email', 'tel', 'adresse', 'notes']),
  'clients'
);

// Cas vide — aucun header ne matche
assert.strictEqual(detecter(['colonne_inconnue', 'autre']), null);

// Cas limite — headers partiels (sous-ensemble), ne doit pas matcher un mauvais type
assert.strictEqual(detecter(['nom', 'prix']), null);

console.log('detecter-modele.test.mjs — OK');
