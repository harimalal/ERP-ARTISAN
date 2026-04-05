/* -------------------------------------------------------
   AppMee — config.js
   Client Supabase, constantes globales de l'application.
   Importé en premier par app.html via <script type="module">
------------------------------------------------------- */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* SUPABASE
   Les valeurs sont lues depuis des meta tags injectés
   par Netlify au build — jamais hardcodées ici.
   Dans app.html :
   <meta name="supa-url" content="VOTRE_URL">
   <meta name="supa-key" content="VOTRE_ANON_KEY">
*/
const SUPABASE_URL = document.querySelector('meta[name="supa-url"]')?.content;
const SUPABASE_KEY = document.querySelector('meta[name="supa-key"]')?.content;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[AppMee] Variables Supabase manquantes dans les meta tags.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* CONSTANTES METIER */
export const STATUTS_COMMANDE = [
  'a_produire',
  'planifie',
  'en_production',
  'pret',
  'cloture',
];

export const STATUTS_COMMANDE_LABELS = {
  a_produire:    'À produire',
  planifie:      'Planifié',
  en_production: 'En production',
  pret:          'Prêt',
  cloture:       'Clôturée',
};

export const STATUTS_OF = ['planifie', 'en_cours', 'clos', 'annule'];

export const STATUTS_ACHAT = ['brouillon', 'envoye', 'en_cours', 'recu', 'annule'];

export const STATUTS_FACTURE = ['a_lancer', 'facture', 'a_relancer', 'paye'];

export const STATUTS_FACTURE_LABELS = {
  a_lancer:   'À lancer',
  facture:    'Facturée',
  a_relancer: 'À relancer',
  paye:       'Payée ✓',
};

export const PLANS_QUOTA_IA = {
  starter:  20,
  pro:      100,
  business: Infinity,
};

/* ENDPOINTS NETLIFY FUNCTIONS */
export const API = {
  aiAnalyseBC:     '/.netlify/functions/ai-analyse-bc',
  aiExtractDoc:    '/.netlify/functions/ai-extract-doc',
};

/* CATEGORIES ARTICLES */
export const CAT_ARTICLES = ['emballage', 'matiere', 'ingredient', 'fourniture', 'autre'];

export const CAT_NOMS = {
  matiere:    ['Fraises kg', 'Framboises kg', 'Myrtilles kg', 'Oranges kg', 'Abricots kg', 'Lait L', 'Farine kg', 'Miel kg'],
  emballage:  ['Pot verre 50 ml', 'Pot verre 100 ml', 'Pot verre 200 ml', 'Boîte carton', 'Couvercle', 'Étiquette'],
  ingredient: ['Sucre kg', 'Sel kg', 'Pectine kg', 'Levure kg', 'Eau L', 'Huile L'],
  fourniture: ['Gants', 'Tablier', 'Sac kraft'],
  autre:      ['Autre'],
};

export const TVA_DEFAUT = 20;
