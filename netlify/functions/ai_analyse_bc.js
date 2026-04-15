/* -------------------------------------------------------
   AppMee — netlify/functions/ai-analyse-bc.js
   Analyse un bon de commande (PDF ou image) par Claude.
   Extrait : client, date, lignes (produit + quantité).

   Fix Q1 — Suppression du système de quota interne.
   La limitation est gérée par Netlify AI Gateway
   et le spending limit Anthropic directement.
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------
   CLIENT SUPABASE ADMIN
------------------------------------------------------- */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Variables Supabase manquantes');
  return createClient(url, key, { auth: { persistSession: false } });
}

/* -------------------------------------------------------
   VÉRIFICATION SESSION SUPABASE
------------------------------------------------------- */
async function verifierSession(token, supabase) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Session invalide ou expirée');
  return user;
}

/* -------------------------------------------------------
   CONSTRUCTION DU PROMPT
------------------------------------------------------- */
function buildPrompt(produits, clients, contexte) {
  const prodList = produits.map(p => `${p.ref}:${p.nom}`).join(', ');
  const cliList  = clients.map(c => c.nom || c).join(', ');

  return `Tu es un assistant d'extraction pour une application de gestion artisanale française.
Analyse ce bon de commande et retourne UNIQUEMENT un objet JSON valide, sans backticks ni texte autour.

Format attendu :
{
  "client": "nom du client ou meilleure correspondance parmi : ${cliList}",
  "date": "YYYY-MM-DD ou null",
  "dateLivraison": "YYYY-MM-DD ou null",
  "remarques": "notes importantes ou chaîne vide",
  "lignes": [
    {
      "nomOriginal": "nom exact dans le document",
      "refDetectee": "référence parmi : ${prodList} — ou null si aucune correspondance",
      "qte": nombre entier positif
    }
  ]
}

Règles :
- Pour "client" : trouve la meilleure correspondance dans la liste fournie, sinon retourne le nom exact du document.
- Pour "refDetectee" : associe chaque ligne du document à la référence produit la plus proche (nom, description). Si aucune correspondance claire, retourne null.
- Les quantités doivent être des nombres entiers positifs.
- Ne jamais inventer de données absentes du document.
${contexte ? `\nContexte additionnel : ${contexte}` : ''}`;
}

/* -------------------------------------------------------
   CONSTRUCTION DU CONTENU ANTHROPIC (image ou PDF)
------------------------------------------------------- */
function buildContent(fichierBase64, extension, prompt) {
  const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  const mediaType = isImage
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : 'application/pdf';

  const mediaBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: fichierBase64 } }
    : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fichierBase64 } };

  return [mediaBlock, { type: 'text', text: prompt }];
}

/* -------------------------------------------------------
   PARSING DE LA RÉPONSE IA
------------------------------------------------------- */
function parseReponseIA(rawText) {
  const patterns = [
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
    /(\{[\s\S]*\})/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        continue;
      }
    }
  }

  throw new Error('Format de réponse IA inattendu — JSON non trouvé');
}

/* -------------------------------------------------------
   HANDLER PRINCIPAL
------------------------------------------------------- */
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Méthode non autorisée' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Corps de requête invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { fichier, extension, contexte = '', produits = [], clients = [], tenantId, token } = body;

  if (!fichier || !extension || !tenantId || !token) {
    return new Response(JSON.stringify({ ok: false, error: 'Champs manquants : fichier, extension, tenantId, token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const extOk = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension.toLowerCase());
  if (!extOk) {
    return new Response(JSON.stringify({ ok: false, error: `Extension non supportée : ${extension}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    /* 1. Vérifier la session */
    await verifierSession(token, supabase);

    /* 2. Appel Claude via Netlify AI Gateway */
    const anthropic = new Anthropic();
    const prompt    = buildPrompt(produits, clients, contexte);
    const content   = buildContent(fichier, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages:   [{ role: 'user', content }],
    });

    const rawText = response.content.map(c => c.text || '').join('');

    /* 3. Parser la réponse */
    const data = parseReponseIA(rawText);

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[ai_analyse_bc] ERREUR:', err.message);
    console.error('[ai_analyse_bc] STACK:', err.stack);
    console.error('[ai_analyse_bc] ENV SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MANQUANT');
    console.error('[ai_analyse_bc] ENV SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'OK' : 'MANQUANT');
    console.error('[ai_analyse_bc] ENV ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'OK' : 'MANQUANT');

    return new Response(JSON.stringify({
      ok:    false,
      error: err.message || 'Erreur serveur',
      code:  'SERVER_ERROR',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { path: '/api/ai-analyse-bc' };
