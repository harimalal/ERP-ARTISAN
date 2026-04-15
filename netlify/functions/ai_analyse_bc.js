/* -------------------------------------------------------
   AppMee — netlify/functions/ai-analyse-bc.js
   Analyse un bon de commande (PDF ou image) par Claude.
   Fix Q1 — Suppression quota interne
   Fix P1 — Prompt strict JSON + fallback parser robuste
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Variables Supabase manquantes');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifierSession(token, supabase) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Session invalide ou expirée');
  return user;
}

/* -------------------------------------------------------
   PROMPT — Fix P1
   Instructions strictes : toujours répondre en JSON,
   même si le document est illisible ou incomplet.
------------------------------------------------------- */
function buildPrompt(produits, clients, contexte) {
  const prodList = produits.map(p => `${p.ref}:${p.nom}`).join(', ');
  const cliList  = clients.map(c => c.nom || c).join(', ');

  return `Tu es un assistant d'extraction de données pour une application ERP artisanale française.

INSTRUCTION CRITIQUE : Tu dois TOUJOURS répondre avec UNIQUEMENT un objet JSON valide.
Pas de texte avant, pas de texte après, pas de backticks, pas d'explication.
Si tu ne peux pas extraire une information, utilise null ou une liste vide.
Jamais de refus, jamais de prose — UNIQUEMENT le JSON.

Format de réponse obligatoire :
{
  "client": "nom exact ou meilleure correspondance parmi [${cliList}] ou null",
  "date": "YYYY-MM-DD ou null",
  "dateLivraison": "YYYY-MM-DD ou null",
  "remarques": "notes importantes ou chaîne vide",
  "lignes": [
    {
      "nomOriginal": "nom tel qu'écrit dans le document",
      "refDetectee": "référence parmi [${prodList}] ou null",
      "qte": nombre entier positif ou 1 par défaut
    }
  ]
}

Règles d'extraction :
- CLIENT : Compare avec la liste fournie en ignorant majuscules, accents et abréviations. "Épicerie La Ruche" peut correspondre à "Epicerie Cooperative La Ruche".
- PRODUITS : Associe chaque ligne du document au produit le plus proche par nom, description ou référence. Cherche les correspondances partielles ("confiture fraise" → "Confiture Fraise Gariguette 50ml").
- QUANTITÉS : Interprète "x6", "6 u.", "6 pots", "6" comme la quantité 6. Si absent, utilise 1.
- Si le document est illisible ou vide : retourne {"client":null,"date":null,"dateLivraison":null,"remarques":"Document illisible","lignes":[]}.
${contexte ? `\nContexte : ${contexte}` : ''}`;
}

function buildContent(fichierBase64, extension, prompt) {
  const isImage   = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  const mediaType = isImage
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : 'application/pdf';

  const mediaBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fichierBase64 } }
    : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fichierBase64 } };

  return [mediaBlock, { type: 'text', text: prompt }];
}

/* -------------------------------------------------------
   PARSER — Fix P1
   Robuste : essaie plusieurs patterns,
   retourne une structure vide si rien ne fonctionne
   (plus jamais de 500 sur un mauvais format)
------------------------------------------------------- */
function parseReponseIA(rawText) {
  /* Nettoyage préalable */
  const cleaned = rawText
    .replace(/^[^{[]*/, '')   /* Supprimer tout avant le premier { */
    .replace(/[^}\]]*$/, '')  /* Supprimer tout après le dernier } */
    .trim();

  /* Tentative 1 — texte nettoyé directement */
  try {
    return JSON.parse(cleaned);
  } catch {}

  /* Tentative 2 — extraire bloc JSON avec regex */
  const patterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch {}
    }
  }

  /* Tentative 3 — fallback structure vide
     Jamais de 500 — l'app affichera 0 ligne reconnue */
  console.error('[ai_analyse_bc] parseReponseIA — réponse brute non parseable:', rawText.slice(0, 500));
  return {
    client:        null,
    date:          null,
    dateLivraison: null,
    remarques:     'Extraction partielle — vérifiez manuellement',
    lignes:        [],
  };
}

/* -------------------------------------------------------
   HANDLER PRINCIPAL
------------------------------------------------------- */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Méthode non autorisée' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Corps de requête invalide' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { fichier, extension, contexte = '', produits = [], clients = [], tenantId, token } = body;

  if (!fichier || !extension || !tenantId || !token) {
    return new Response(JSON.stringify({ ok: false, error: 'Champs manquants' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const extOk = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension.toLowerCase());
  if (!extOk) {
    return new Response(JSON.stringify({ ok: false, error: `Extension non supportée : ${extension}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    await verifierSession(token, supabase);

    const anthropic = new Anthropic();
    const prompt    = buildPrompt(produits, clients, contexte);
    const content   = buildContent(fichier, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages:   [{ role: 'user', content }],
    });

    const rawText = response.content.map(c => c.text || '').join('');
    const data    = parseReponseIA(rawText);

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ai_analyse_bc] ERREUR:', err.message);
    console.error('[ai_analyse_bc] STACK:', err.stack);
    console.error('[ai_analyse_bc] ENV SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MANQUANT');
    console.error('[ai_analyse_bc] ENV SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'OK' : 'MANQUANT');
    console.error('[ai_analyse_bc] ENV ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'OK' : 'MANQUANT');

    return new Response(JSON.stringify({
      ok: false, error: err.message || 'Erreur serveur', code: 'SERVER_ERROR',
    }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { path: '/api/ai_analyse_bc' };
