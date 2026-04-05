/* -------------------------------------------------------
   AppMee — netlify/functions/ai-analyse-bc.js
   Analyse un bon de commande (PDF ou image) par Claude.
   Extrait : client, date, lignes (produit + quantité).

   SÉCURITÉ :
   - Clé Anthropic injectée automatiquement par Netlify AI Gateway
   - Clé Supabase SERVICE_KEY côté serveur uniquement
   - Vérification session + quota avant chaque appel IA
   - Aucune clé n'est exposée au navigateur

   Entrée  (POST JSON) :
     { fichier: string (base64), extension: string,
       contexte: string, produits: [], clients: [],
       tenantId: string, token: string }

   Sortie (JSON) :
     { ok: true, data: { client, date, dateLivraison,
       remarques, lignes: [{ nomOriginal, refDetectee, qte }] } }
     { ok: false, error: string }
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------
   CONSTANTES
------------------------------------------------------- */
const PLANS_QUOTA = { starter: 20, pro: 100, business: Infinity };
const MOIS_COURANT = () => new Date().toISOString().slice(0, 7); /* 'YYYY-MM' */

/* -------------------------------------------------------
   CLIENT SUPABASE ADMIN (service key — côté serveur uniquement)
------------------------------------------------------- */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Variables Supabase manquantes');
  return createClient(url, key, { auth: { persistSession: false } });
}

/* -------------------------------------------------------
   VÉRIFICATION SESSION SUPABASE
   Valide le JWT du frontend et retourne le user
------------------------------------------------------- */
async function verifierSession(token, supabase) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Session invalide ou expirée');
  return user;
}

/* -------------------------------------------------------
   VÉRIFICATION ET INCRÉMENT QUOTA IA
------------------------------------------------------- */
async function verifierQuota(tenantId, supabase) {
  const mois = MOIS_COURANT();

  /* Récupérer le plan du tenant */
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw new Error('Tenant introuvable');

  const limite = PLANS_QUOTA[tenant.plan] ?? PLANS_QUOTA.starter;

  /* Récupérer l'usage du mois */
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('appels')
    .eq('tenant_id', tenantId)
    .eq('mois', mois)
    .maybeSingle();

  const appels = usage?.appels || 0;

  if (appels >= limite) {
    throw new Error(`Quota IA atteint (${appels}/${limite} appels ce mois). Passez au plan supérieur.`);
  }

  return { mois, appels, limite, plan: tenant.plan };
}

async function incrementerQuota(tenantId, mois, appelsActuels, tokensUsed, supabase) {
  await supabase
    .from('ai_usage')
    .upsert({
      tenant_id:  tenantId,
      mois,
      appels:     appelsActuels + 1,
      tokens:     tokensUsed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,mois' });
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
  /* Tente d'extraire le JSON même si Claude ajoute du texte autour */
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
  /* Méthode */
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

  /* Validation des champs obligatoires */
  if (!fichier || !extension || !tenantId || !token) {
    return new Response(JSON.stringify({ ok: false, error: 'Champs manquants : fichier, extension, tenantId, token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* Validation extension */
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

    /* 2. Vérifier le quota */
    const { mois, appels } = await verifierQuota(tenantId, supabase);

    /* 3. Appel Claude via Netlify AI Gateway */
    const anthropic = new Anthropic();
    const prompt    = buildPrompt(produits, clients, contexte);
    const content   = buildContent(fichier, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages:   [{ role: 'user', content }],
    });

    const rawText    = response.content.map(c => c.text || '').join('');
    const tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens || 0;

    /* 4. Parser la réponse */
    const data = parseReponseIA(rawText);

    /* 5. Incrémenter le quota après succès */
    await incrementerQuota(tenantId, mois, appels, tokensUsed, supabase);

    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const isQuota = err.message?.includes('Quota IA');
    return new Response(JSON.stringify({
      ok:    false,
      error: err.message || 'Erreur serveur',
      code:  isQuota ? 'QUOTA_EXCEEDED' : 'SERVER_ERROR',
    }), {
      status: isQuota ? 429 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = { path: '/api/ai-analyse-bc' };
