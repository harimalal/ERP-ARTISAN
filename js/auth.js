/* -------------------------------------------------------
   AppMee — auth.js
   Gestion de la session Supabase Auth.
   - Vérifie si l'utilisateur est connecté
   - Redirige vers /login si non connecté
   - Expose le tenant_id de la session
   - Gère la déconnexion
   Dépend de : config.js (supabase)
------------------------------------------------------- */

import { supabase } from './config.js';

/* État de session courant — mis à jour par initAuth() */
let _session = null;
let _tenantId = null;
let _userProfile = null;

/* ---------------------------------------------------
   initAuth()
   À appeler au démarrage de app.html.
   Vérifie la session, charge le profil utilisateur.
   Redirige vers /login si non connecté.
--------------------------------------------------- */
export async function initAuth() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    window.location.href = '/login';
    return null;
  }

  _session = session;

  /* Charger le profil utilisateur (tenant_id, prénom, rôle) */
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('tenant_id, prenom, nom, role')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    console.error('[AppMee] Profil utilisateur introuvable :', profileError);
    await supabase.auth.signOut();
    window.location.href = '/login';
    return null;
  }

  _tenantId    = profile.tenant_id;
  _userProfile = profile;

  /* Mettre à jour l'affichage du nom dans le header */
  const userEl = document.getElementById('hdrUserName');
  if (userEl) {
    userEl.textContent = profile.prenom || session.user.email;
  }

  /* Écouter les changements de session (expiration, déconnexion) */
  supabase.auth.onAuthStateChange((event, newSession) => {
    if (event === 'SIGNED_OUT' || !newSession) {
      window.location.href = '/login';
    }
    if (event === 'TOKEN_REFRESHED') {
      _session = newSession;
    }
  });

  return { session, profile };
}

/* ---------------------------------------------------
   Getters de session — utilisés par db.js et modules
--------------------------------------------------- */
export function getTenantId() {
  return _tenantId;
}

export function getUserProfile() {
  return _userProfile;
}

export function getSession() {
  return _session;
}

/* ---------------------------------------------------
   signOut()
   Déconnecte l'utilisateur et redirige vers /login
--------------------------------------------------- */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/login';
}

/* ---------------------------------------------------
   requireAuth()
   Guard à appeler en haut de chaque module si besoin
   d'une vérification supplémentaire.
--------------------------------------------------- */
export function requireAuth() {
  if (!_session || !_tenantId) {
    window.location.href = '/login';
    return false;
  }
  return true;
}
