/* -------------------------------------------------------
   AppMee — netlify/functions/ai_extract_doc.js
   Scan universel pour l'onboarding Admin : un fichier
   (PDF/image) peut contenir plusieurs entités de types
   différents (client, fournisseur, article, produit).
   Aucun mode fixe — la catégorisation est automatique.

   SÉCURITÉ :
   - Clé Anthropic injectée par Netlify AI Gateway
   - Clé Supabase SERVICE_KEY côté serveur uniquement
   - Vérification session avant chaque appel IA
   - Quota mensuel ignoré uniquement pour le tout premier
     onboarding d'un tenant (tenants.onboarding_ia_utilise = false)
   - Aucune clé exposée au navigateur

   Entrée  (POST JSON) :
     { fichier: string (base64), extension: string,
       tenantId: string, token: string }

   Sortie (JSON) :
     { ok: true, entites: [...], document_type_detecte, avertissements }
     { ok: false, error: string, code?: string }
------------------------------------------------------- */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const PLANS_QUOTA = { starter: 20, pro: 100, business: Infinity };
const MOIS_COURANT = () => new Date().toISOString().slice(0, 7);

const TYPES_VALIDES = ['client', 'fournisseur', 'article', 'produit'];

// Contrat exact des champs par type d'entité — source unique de vérité,
// réutilisée à la fois pour le texte du prompt IA (schemaLigne) et pour
// le whitelist de nettoyerEntites() qui force ce contrat côté serveur.
const CHAMPS_PAR_TYPE = {
  client:      ['nom', 'siret', 'email', 'tel', 'adresse', 'contact', 'cpt', 'notes'],
  fournisseur: ['nom', 'siret', 'contact', 'email', 'tel', 'adresse', 'iban', 'delai', 'categorie'],
  article:     ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'],
  produit:     ['ref', 'nom', 'prix', 'seuil', 'stock'],
};

function schemaLigne(type) {
  const champs = CHAMPS_PAR_TYPE[type].map(c => `"${c}":""`).join(',');
  return `${type.padEnd(11)} : {${champs}}`;
}

const SCHEMA_PROMPT = `{
  "document_type_detecte": "bon de commande | facture | bon de livraison | carte de visite | catalogue fournisseur | export tableur | illisible | autre",
  "entites": [
    {
      "type": "client | fournisseur | article | produit",
      "champs": { /* voir schemas ci-dessous selon le type */ },
      "confiance": "haute | moyenne | basse",
      "page_source": nombre entier ou null,
      "extrait_source": "courte citation du document justifiant l'extraction"
    }
  ],
  "avertissements": ["chaîne libre si quelque chose mérite l'attention de l'utilisateur"]
}

Schémas de champs par type :
${TYPES_VALIDES.map(schemaLigne).join('\n')}`;

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

async function resoudreTenantDepuisUser(userId, supabase) {
  const { data, error } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
  if (error || !data) throw new Error('Utilisateur introuvable');
  return data.tenant_id;
}

async function resoudreQuota(tenantId, supabase) {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('plan, onboarding_ia_utilise')
    .eq('id', tenantId)
    .single();
  if (tErr || !tenant) throw new Error('Tenant introuvable');

  if (!tenant.onboarding_ia_utilise) {
    return { hors_quota: true, mois: null, appels: 0, limite: null };
  }

  const mois = MOIS_COURANT();
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
  return { hors_quota: false, mois, appels, limite };
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

function buildPrompt() {
  return `Tu es un assistant d'extraction de données pour une application ERP artisanale française.

Analyse ce contenu et identifie TOUTES les entités qu'il contient parmi : client, fournisseur, article, produit.

Définitions à respecter strictement :
- client = une personne ou entreprise à qui l'artisan vend (facture, livre).
- fournisseur = une personne ou entreprise à qui l'artisan achète (matière première, service) — un IBAN, un délai de livraison, ou une mention "commande vers"/"achat auprès de" signalent un fournisseur, pas un client.
- article = une matière première ou un composant acheté à un fournisseur, entrant dans la fabrication.
- produit = un article fini fabriqué par l'artisan, destiné à la vente.
En cas de doute entre client et fournisseur sur un document sans contexte d'achat/vente explicite (ex : simple carte de visite), choisis confiance "basse" plutôt que de deviner le type.

Un document peut contenir plusieurs entités de types différents (ex : un bon de livraison = 1 client + plusieurs articles).
Un document peut contenir plusieurs documents logiques distincts (ex : plusieurs factures dans un seul PDF) — dans ce cas, indique la page_source de chaque entité pour les distinguer, ne fusionne jamais des informations venant de documents différents dans une seule entité.

Si le contenu fourni est un export tableur (une ligne = une suite de paires colonne: valeur, éventuellement regroupées par onglet marqué "--- Onglet \\"nom\\" ---"), traite CHAQUE LIGNE comme une entité potentiellement distincte : un tableau de 50 lignes clients doit produire jusqu'à 50 entités séparées dans entites, jamais une seule entité agrégée. Chaque onglet peut contenir un type d'entité différent (ex : onglet "Clients" → entités client, onglet "Fournisseurs" → entités fournisseur) — déduis le type à partir des colonnes et du nom de l'onglet, pas seulement de sa position dans le fichier. Si plusieurs lignes semblent décrire la même entité (doublon apparent), signale-le dans avertissements plutôt que de les fusionner silencieusement. Dans ce cas (tableur), laisse page_source à null — la notion de page ne s'applique pas.

Les noms de colonnes du fichier tableur peuvent différer des noms de champs attendus (ex : "Raison sociale" → nom, "Tél" → tel, "N° SIRET" → siret, une colonne "Fournisseur" en en-tête ne signifie pas forcément que la ligne EST un fournisseur). Fais la correspondance sémantique toi-même, sans jamais inventer une valeur si la correspondance est trop incertaine.

Pour le champ categorie (article et fournisseur), utilise uniquement l'une de ces 5 valeurs exactes : emballage, matiere, ingredient, fourniture, autre — jamais une autre formulation, même si le document utilise un mot différent (ex : "verrerie" → "emballage", "matières premières" → "matiere", "consommables" → "fourniture"). Si aucune de ces 5 valeurs ne correspond clairement, utilise "autre".

Exemples concrets :
1) Onglet tableur "Clients" avec 3 lignes (nom: Boulangerie Martin | email: contact@martin.fr ; nom: Épicerie Dupuis | tel: 0611223344 ; nom: Café des Arts | adresse: 5 rue de la Paix) → 3 entités type "client" séparées, une par ligne, confiance haute si les champs sont clairs.
2) Un bon de livraison scanné mentionnant "Livré à : Boulangerie Martin" puis un tableau de 4 articles avec quantités → 1 entité "client" (Boulangerie Martin) + 4 entités "article", toutes avec la même page_source.
3) Une carte de visite "Jean Dupont — Fournitures Boulangerie SARL — IBAN FR76..." sans contexte d'achat/vente → 1 entité "fournisseur" (l'IBAN et le nom d'entreprise orientent vers fournisseur plutôt que client), confiance moyenne si aucun autre signal ne confirme.

Retourne UNIQUEMENT un objet JSON valide (sans backticks ni texte autour) au format suivant :
${SCHEMA_PROMPT}

Règles strictes :
- Ne jamais inventer de donnée absente du document. Champ absent → chaîne vide "".
- N'utilise jamais un type en dehors de client | fournisseur | article | produit. Si une entité ne correspond clairement à aucun des 4 types, ne l'ajoute pas dans entites avec un type approximatif : décris-la brièvement dans avertissements à la place, pour que rien ne disparaisse silencieusement.
- Si le texte est flou, partiellement illisible, ou l'extraction incertaine → confiance "basse", jamais "haute" par défaut. Pour un contenu tableur, applique la même prudence si une valeur est incomplète, ambiguë entre deux champs possibles (ex : un nombre qui pourrait être un prix ou une quantité), ou si une ligne semble être un doublon ou une correction d'une autre ligne.
- Si le document est totalement illisible ou vide → document_type_detecte: "illisible", entites: [].
- SIRET : chiffres uniquement, sans espaces. IBAN : format standard (FR76...).
- Si le document contient un grand nombre d'entités (tableur de plusieurs dizaines de lignes, PDF regroupant plusieurs dizaines de factures), garde extrait_source très court (moins de 12 mots) pour chaque entité, afin de ne jamais risquer de tronquer la réponse JSON.
- Réponse en français.`;
}

const EXT_TABULAIRE = ['xlsx', 'xls', 'csv'];

function buildContent({ fichier, texte }, extension, prompt) {
  if (EXT_TABULAIRE.includes(extension)) {
    return [
      { type: 'text', text: `Voici le contenu brut d'un fichier tableur (${extension}), une ligne par ligne (colonne: valeur) :\n\n${texte}` },
      { type: 'text', text: prompt },
    ];
  }
  const isImage   = ['png', 'jpg', 'jpeg', 'webp'].includes(extension);
  const mediaType = isImage
    ? `image/${extension === 'jpg' ? 'jpeg' : extension}`
    : 'application/pdf';
  const mediaBlock = isImage
    ? { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fichier } }
    : { type: 'document', source: { type: 'base64', media_type: mediaType, data: fichier } };
  return [mediaBlock, { type: 'text', text: prompt }];
}

function parseReponseIA(rawText) {
  const cleaned = rawText.replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}

  const patterns = [/```json\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/, /(\{[\s\S]*\})/];
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  }

  console.error('[ai_extract_doc] parseReponseIA — reponse brute non parseable:', rawText.slice(0, 500));
  return { document_type_detecte: 'illisible', entites: [], avertissements: ['Réponse IA non exploitable — vérifiez manuellement'] };
}

// Force les champs bruts renvoyés par le modèle sur le contrat exact
// CHAMPS_PAR_TYPE[type] : clé absente du modèle → '', clé hors contrat → supprimée.
const CATEGORIES_VALIDES = ['emballage', 'matiere', 'ingredient', 'fourniture', 'autre'];

function whitelisterChamps(type, champsRaw) {
  const cles = CHAMPS_PAR_TYPE[type];
  const out  = {};
  for (const cle of cles) {
    const v = champsRaw[cle];
    out[cle] = v == null ? '' : String(v).trim();
  }
  if ((type === 'article' || type === 'fournisseur') && out.categorie) {
    const normalisee = out.categorie.toLowerCase();
    out.categorie = CATEGORIES_VALIDES.includes(normalisee) ? normalisee : (type === 'article' ? 'autre' : '');
  }
  return out;
}

function nettoyerEntites(rawEntites) {
  const avertissements = [];
  if (!Array.isArray(rawEntites)) return { entites: [], avertissements };

  const entites = [];
  for (const e of rawEntites) {
    if (!e || !e.champs || typeof e.champs !== 'object') {
      avertissements.push('Une entité mal formée a été ignorée (structure invalide).');
      continue;
    }
    if (!TYPES_VALIDES.includes(e.type)) {
      avertissements.push(`Une entité de type "${e.type}" non reconnu a été ignorée — vérifiez le document manuellement.`);
      continue;
    }
    entites.push({
      type:           e.type,
      champs:         whitelisterChamps(e.type, e.champs),
      confiance:       ['haute', 'moyenne', 'basse'].includes(e.confiance) ? e.confiance : 'basse',
      page_source:     Number.isInteger(e.page_source) ? e.page_source : null,
      extrait_source:  typeof e.extrait_source === 'string' ? e.extrait_source.slice(0, 300) : '',
    });
  }
  return { entites, avertissements };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Méthode non autorisée' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ ok: false, error: 'Corps de requête invalide' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { fichier, texte, extension, tenantId, token } = body;

  if (!extension || !tenantId || !token) {
    return new Response(JSON.stringify({ ok: false, error: 'Champs manquants : extension, tenantId, token' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const extOk = ['pdf', 'png', 'jpg', 'jpeg', 'webp', ...EXT_TABULAIRE].includes(extension.toLowerCase());
  if (!extOk) {
    return new Response(JSON.stringify({ ok: false, error: `Extension non supportée : ${extension}` }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const isTabulaire = EXT_TABULAIRE.includes(extension.toLowerCase());
  if (isTabulaire && !texte) {
    return new Response(JSON.stringify({ ok: false, error: 'Champ manquant : texte requis pour ce type de fichier' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isTabulaire && !fichier) {
    return new Response(JSON.stringify({ ok: false, error: 'Champ manquant : fichier requis pour ce type de fichier' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await verifierSession(token, supabase);
    const tenantIdReel = await resoudreTenantDepuisUser(user.id, supabase);
    const quota = await resoudreQuota(tenantIdReel, supabase);

    const anthropic = new Anthropic();
    const prompt    = buildPrompt();
    const content   = buildContent({ fichier, texte }, extension.toLowerCase(), prompt);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-5',
      max_tokens: 8000,
      messages:   [{ role: 'user', content }],
    });

    const rawText    = response.content.map(c => c.text || '').join('');
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    const parsed = parseReponseIA(rawText);
    const { entites, avertissements: avertissementsDrop } = nettoyerEntites(parsed.entites);

    if (!quota.hors_quota) {
      await incrementerQuota(tenantIdReel, quota.mois, quota.appels, tokensUsed, supabase);
    }

    return new Response(JSON.stringify({
      ok: true,
      entites,
      document_type_detecte: parsed.document_type_detecte || 'autre',
      avertissements: [...(Array.isArray(parsed.avertissements) ? parsed.avertissements : []), ...avertissementsDrop],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[ai_extract_doc] ERREUR:', err.message, err.stack);
    const isQuota = err.message?.includes('Quota IA');
    return new Response(JSON.stringify({
      ok: false, error: err.message || 'Erreur serveur', code: isQuota ? 'QUOTA_EXCEEDED' : 'SERVER_ERROR',
    }), { status: isQuota ? 429 : 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const config = { path: '/api/ai-extract-batch' };
