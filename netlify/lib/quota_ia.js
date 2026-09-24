/* -------------------------------------------------------
   AppMee — netlify/lib/quota_ia.js
   Plafond de protection IA partagé par ai_analyse_bc et
   ai_extract_doc : 350 appels par semaine et par tenant,
   remis à zéro chaque lundi 00:00 (heure de Paris).

   Le compteur vit en base (table ai_usage_semaine, RPC
   reserver_appel_ia exécutable par service_role seulement).
   L'appel est réservé AVANT d'interroger Anthropic : des
   clics simultanés ne peuvent pas dépasser la limite.
------------------------------------------------------- */

export const QUOTA_IA_HEBDO = 350;

export class QuotaIAError extends Error {}

/* Le tenant vient toujours de la session vérifiée, jamais du corps
   de la requête : sinon un compte pourrait consommer le quota d'un autre. */
export async function tenantDuUser(supabase, userId) {
  const { data, error } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
  if (error || !data) throw new Error('Utilisateur introuvable');
  return data.tenant_id;
}

export async function reserverAppelIA(supabase, tenantId) {
  const { data, error } = await supabase.rpc('reserver_appel_ia', {
    p_tenant: tenantId,
    p_limite: QUOTA_IA_HEBDO,
  });
  if (error) throw new Error(`Vérification du quota IA impossible : ${error.message}`);
  if (!data?.autorise) {
    throw new QuotaIAError(
      `Vous avez atteint votre quota d'analyses IA pour cette semaine. ` +
      `Réessayez à partir de lundi — en attendant, vous pouvez toujours saisir vos commandes à la main.`
    );
  }
  return data.semaine;
}

/* Suivi de consommation uniquement : un échec ici ne doit jamais
   faire perdre à l'artisan un résultat déjà obtenu. */
export async function enregistrerTokensIA(supabase, tenantId, semaine, usage) {
  const tokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
  const { error } = await supabase.rpc('enregistrer_tokens_ia', {
    p_tenant:  tenantId,
    p_semaine: semaine,
    p_tokens:  tokens,
  });
  if (error) console.error('[quota_ia] enregistrement tokens ERREUR:', error.message);
}
