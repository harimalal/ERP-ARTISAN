/* -------------------------------------------------------
   AppMee — netlify/functions/ai-extract-doc.js
   Extrait les informations d'un document (facture, BC,
   carte de visite…) pour remplir une fiche :
   - Mon entreprise
   - Client
   - Fournisseur

   SÉCURITÉ :
   - Clé Anthropic injectée par Netlify AI Gateway
   - Clé Supabase SERVICE_KEY côté serveur uniquement
   - Vérification session + quota avant chaque appel IA
   - Aucune clé exposée au navigateur

   Entrée  (POST JSON) :
     { fichier: string (base64), extension: string,
       mode: 'entreprise'|'client'|'fournisseur',
       tenantId: string, token: string }

   Sortie (JSON) :
     { ok: true, data: { ...champs extraits } }
     { ok: false, error: string, code?: string }
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/* -------------------------------------------------------
   CONSTANTES
------------------------------------------------------- */
const PLANS_QUOTA = { starter: 20, pro: 100, business: Infinity };
const MOIS_COURANT = () => new Date().toISOString().slice(0, 7);

const MODES_VALIDES = ['entreprise', 'client', 'fournisseur'];

/* Schémas JSON attendus selon le mode */
const SCHEMAS = {
  entreprise: {
    description: 'informations de MON ENTREPRISE (émetteur du document)',
    schema: '{"nom":"","siret":"","tva":"","forme":"","adresse":"","tel":"","email":"","site":"","iban":"","cpt_paiement":""}',
  },
  client: {
    description: 'informations du CLIENT (destinataire/acheteur)',
    schema: '{"nom":"","siret":"","email":"","tel":"","adresse":"","contact":"","cpt":"","notes":""}',
  },
  fournisseur: {
    description: 'informations du FOURNISSEUR (vendeur/expéditeur)',
    schema: '{"nom":"","siret":"","contact":"","email":"","tel":"","adresse":"","iban":"","delai":"","notes":""}',
  },
};

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
   VÉRIFICATION SESSION
------------------------------------------------------- */
async function verifierSession(token, supabase) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Session invalide ou expirée');
  return user;
}

/* -------------------------------------------------------
   VÉRIFICATION QUOTA
------------------------------------------------------- */
async function verifierQuota(tenantId, supabase) {
  const mois = MOIS_COURANT();

  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw new Error('Tenant introuvable');

  const limite = PLANS_QUOTA[tenant.plan] ?? PLANS_QUOTA.starter;

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
function buildPrompt(mode) {
  const { description, schema } = SCHEMAS[mode];
  return `Tu es un assistant d'extraction de données pour une application de gestion d'entreprise française.
Analyse ce document et extrais les ${description}.
Retourne UNIQUEMENT un objet JSON valide avec exactement ces champs (sans backticks ni texte autour) :
${schema}

Règles :
- Retourne une chaîne vide "" pour les champs absents du document.
- Ne jamais inventer de données.
- Pour les dates de paiement (cpt/cpt_paiement), retourne le texte exact (ex: "30 jours fin de mois").
- Pour le SIRET, retourne uniquement les chiffres sans espaces.
- Pour l'IBAN, retourne le format standard (FR76...).
- Réponse en français.`;
}

/* -------------------------------------------------------
   CONSTRUCTION DU CONTENU
------------------------------------------------------- */
function buildContent(fichierBase64, extension, prompt) {
  const isImage  = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  const mediaType = isImage
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : 'application/pdf';

  const mediaBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fichierBase64 } }
    : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fichierBase64 } };

  return [mediaBlock, { type: 'text', text: prompt }];
}

/* -------------------------------------------------------
   PARSING DE LA RÉPONSE
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
   NETTOYAGE DE LA RÉPONSE
   Supprime les champs vides pour ne retourner que
   les données réellement extraites.
------------------------------------------------------- */
function nettoyerData(data) {
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined && value !== '') {
      cleaned[key] = String(value).trim();
    }
  }
  return cleaned;
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

  const { fichier, extension, mode, tenantId, token } = body;

  /* Validation */
  if (!fichier || !extension || !mode || !tenantId || !token) {
    return new Response(JSON.stringify({
      ok:    false,
      error: 'Champs manquants : fichier, extension, mode, tenantId, token',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!MODES_VALIDES.includes(mode)) {
    return new Response(JSON.stringify({
      ok:    false,
      error: `Mode invalide : ${mode}. Valeurs acceptées : ${MODES_VALIDES.join(', ')}`,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const extOk = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension.toLowerCase());
  if (!extOk) {
    return new Response(JSON.stringify({
      ok:    false,
      error: `Extension non supportée : ${extension}`,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const supabase = getSupabaseAdmin();

    /* 1. Vérifier la session */
    await verifierSession(token, supabase);

    /* 2. Vérifier le quota */
    const { mois, appels } = await verifierQuota(tenantId, supabase);

    /* 3. Appel Claude via Netlify AI Gateway */
    const anthropic = new Anthropic();
    const prompt    = buildPrompt(mode);
    const content   = buildContent(fichier, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages:   [{ role: 'user', content }],
    });

    const rawText    = response.content.map(c => c.text || '').join('');
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    /* 4. Parser et nettoyer */
    const rawData = parseReponseIA(rawText);
    const data    = nettoyerData(rawData);

    /* 5. Incrémenter le quota */
    await incrementerQuota(tenantId, mois, appels, tokensUsed, supabase);

    return new Response(JSON.stringify({ ok: true, data, mode }), {
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

export const config = { path: '/api/ai-extract-doc' };
