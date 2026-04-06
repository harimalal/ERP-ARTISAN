/* -------------------------------------------------------
   AppMee — db.js
   Point unique d'accès aux données Supabase.
   AUCUN module ne doit accéder à supabase directement.
   Toutes les lectures et écritures passent ici.

   Dépend de : config.js (supabase, constantes)
               auth.js   (getTenantId)
------------------------------------------------------- */

import { supabase, STATUTS_COMMANDE } from './config.js';
import { getTenantId } from './auth.js';

/* -------------------------------------------------------
   HELPERS INTERNES
------------------------------------------------------- */

/* Gestion centralisée des erreurs Supabase */
function handleError(context, error) {
  console.error(`[AppMee][${context}]`, error.message || error);
  throw new Error(`Erreur ${context} : ${error.message || 'inconnue'}`);
}

/* Raccourci : retourne le tenant_id courant */
function tid() {
  return getTenantId();
}

/* -------------------------------------------------------
   ARTICLES
------------------------------------------------------- */

export async function getArticles() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('tenant_id', tid())
    .order('ref');
  if (error) handleError('getArticles', error);
  return data;
}

export async function getArticle(id) {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tid())
    .single();
  if (error) handleError('getArticle', error);
  return data;
}

export async function getArticleByRef(ref) {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('ref', ref)
    .eq('tenant_id', tid())
    .single();
  if (error) return null;
  return data;
}

export async function createArticle(article) {
  const { data, error } = await supabase
    .from('articles')
    .insert({ ...article, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createArticle', error);
  return data;
}

export async function updateArticle(id, changes) {
  const { data, error } = await supabase
    .from('articles')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateArticle', error);
  return data;
}

export async function deleteArticle(id) {
  const { error } = await supabase
    .from('articles')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid());
  if (error) handleError('deleteArticle', error);
}

/* Mise à jour du stock uniquement (utilisé par réceptions et livraisons) */
export async function updateArticleStock(id, newStock) {
  return updateArticle(id, { stock: newStock });
}

/* -------------------------------------------------------
   PRODUITS FINIS
------------------------------------------------------- */

export async function getProduits() {
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .eq('tenant_id', tid())
    .order('ref');
  if (error) handleError('getProduits', error);
  return data;
}

export async function getProduitByRef(ref) {
  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .eq('ref', ref)
    .eq('tenant_id', tid())
    .single();
  if (error) return null;
  return data;
}

export async function createProduit(produit) {
  const { data, error } = await supabase
    .from('produits')
    .insert({ ...produit, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createProduit', error);
  return data;
}

export async function updateProduit(id, changes) {
  const { data, error } = await supabase
    .from('produits')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateProduit', error);
  return data;
}

export async function deleteProduit(id) {
  const { error } = await supabase
    .from('produits')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid());
  if (error) handleError('deleteProduit', error);
}

export async function updateProduitStock(id, newStock) {
  return updateProduit(id, { stock: newStock });
}

/* -------------------------------------------------------
   RECETTES (nomenclatures)
------------------------------------------------------- */

export async function getRecettesByProduit(produitId) {
  const { data, error } = await supabase
    .from('recettes')
    .select('*, articles(ref, nom, unite, prix, stock)')
    .eq('produit_id', produitId)
    .eq('tenant_id', tid());
  if (error) handleError('getRecettesByProduit', error);
  return data;
}

export async function saveRecette(produitId, lignes) {
  /* lignes = [{ article_id, quantite, unite }]
     Remplace toute la recette du produit (delete + insert) */
  const { error: delError } = await supabase
    .from('recettes')
    .delete()
    .eq('produit_id', produitId)
    .eq('tenant_id', tid());
  if (delError) handleError('saveRecette(delete)', delError);

  if (!lignes.length) return [];

  const rows = lignes.map(l => ({
    tenant_id: tid(),
    produit_id: produitId,
    article_id: l.article_id,
    quantite: l.quantite,
    unite: l.unite || null,
  }));

  const { data, error } = await supabase
    .from('recettes')
    .insert(rows)
    .select();
  if (error) handleError('saveRecette(insert)', error);
  return data;
}

/* -------------------------------------------------------
   CLIENTS
------------------------------------------------------- */

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('tenant_id', tid())
    .order('nom');
  if (error) handleError('getClients', error);
  return data;
}

export async function getClientByNom(nom) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('nom', nom)
    .eq('tenant_id', tid())
    .maybeSingle();
  if (error) handleError('getClientByNom', error);
  return data;
}

export async function createClient(client) {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...client, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createClient', error);
  return data;
}

export async function upsertClient(nom, extraFields = {}) {
  /* Crée le client s'il n'existe pas encore */
  const existing = await getClientByNom(nom);
  if (existing) return existing;
  return createClient({ nom, ...extraFields });
}

export async function updateClient(id, changes) {
  const { data, error } = await supabase
    .from('clients')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateClient', error);
  return data;
}

export async function deleteClient(id) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid());
  if (error) handleError('deleteClient', error);
}

/* -------------------------------------------------------
   FOURNISSEURS
------------------------------------------------------- */

export async function getFournisseurs() {
  const { data, error } = await supabase
    .from('fournisseurs')
    .select('*')
    .eq('tenant_id', tid())
    .order('nom');
  if (error) handleError('getFournisseurs', error);
  return data;
}

export async function createFournisseur(fournisseur) {
  const { data, error } = await supabase
    .from('fournisseurs')
    .insert({ ...fournisseur, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createFournisseur', error);
  return data;
}

export async function updateFournisseur(id, changes) {
  const { data, error } = await supabase
    .from('fournisseurs')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateFournisseur', error);
  return data;
}

export async function deleteFournisseur(id) {
  const { error } = await supabase
    .from('fournisseurs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid());
  if (error) handleError('deleteFournisseur', error);
}

/* -------------------------------------------------------
   COMMANDES
------------------------------------------------------- */

export async function getCommandes({ statuts = null, limit = null } = {}) {
  let query = supabase
    .from('commandes')
    .select('*, commande_lignes(*)')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });

  if (statuts && statuts.length) {
    query = query.in('statut', statuts);
  }
  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) handleError('getCommandes', error);
  return data;
}

export async function getCommande(id) {
  const { data, error } = await supabase
    .from('commandes')
    .select('*, commande_lignes(*)')
    .eq('id', id)
    .eq('tenant_id', tid())
    .single();
  if (error) handleError('getCommande', error);
  return data;
}

export async function createCommande(commande, lignes) {
  /* commande = { ref, client_id, client_nom, date_cmd, date_livraison, statut, notes }
     lignes   = [{ produit_id, produit_nom, quantite, prix_unitaire }]
     BUG CORRIGÉ : on utilise l'UUID de la commande retourné par Supabase
     au lieu d'un index de tableau — plus de désynchronisation. */
  const { data: cmd, error: cmdError } = await supabase
    .from('commandes')
    .insert({ ...commande, tenant_id: tid() })
    .select()
    .single();
  if (cmdError) handleError('createCommande', cmdError);

  if (lignes && lignes.length) {
    const rows = lignes.map(l => ({
      tenant_id: tid(),
      commande_id: cmd.id,
      produit_id: l.produit_id || null,
      produit_nom: l.produit_nom || null,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
    }));
    const { error: lignesError } = await supabase
      .from('commande_lignes')
      .insert(rows);
    if (lignesError) handleError('createCommande(lignes)', lignesError);
  }

  return cmd;
}

export async function updateCommandeStatut(id, statut) {
  /* BUG CORRIGÉ : on identifie la commande par son UUID,
     jamais par son index dans un tableau. */
  const { data, error } = await supabase
    .from('commandes')
    .update({ statut })
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateCommandeStatut', error);
  return data;
}

export async function avancerStatutCommande(id) {
  const cmd = await getCommande(id);
  if (!cmd) return null;
  const idx = STATUTS_COMMANDE.indexOf(cmd.statut);
  const next = STATUTS_COMMANDE[Math.min(idx + 1, STATUTS_COMMANDE.length - 1)];
  return updateCommandeStatut(id, next);
}

export async function deleteCommande(id) {
  /* Supprime d'abord les lignes (FK), puis la commande */
  const { error: lignesError } = await supabase
    .from('commande_lignes')
    .delete()
    .eq('commande_id', id)
    .eq('tenant_id', tid());
  if (lignesError) handleError('deleteCommande(lignes)', lignesError);

  const { error } = await supabase
    .from('commandes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tid());
  if (error) handleError('deleteCommande', error);
}

/* -------------------------------------------------------
   PRODUCTION — ORDRES DE FABRICATION
------------------------------------------------------- */

export async function getOFs({ excludeStatuts = ['clos', 'annule'] } = {}) {
  let query = supabase
    .from('production_of')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });

  if (excludeStatuts && excludeStatuts.length) {
    query = query.not('statut', 'in', `(${excludeStatuts.join(',')})`);
  }

  const { data, error } = await query;
  if (error) handleError('getOFs', error);
  return data;
}

export async function getAllOFs() {
  const { data, error } = await supabase
    .from('production_of')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });
  if (error) handleError('getAllOFs', error);
  return data;
}

export async function createOF(of) {
  const { data, error } = await supabase
    .from('production_of')
    .insert({ ...of, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createOF', error);
  return data;
}

export async function updateOFStatut(id, statut) {
  const { data, error } = await supabase
    .from('production_of')
    .update({ statut })
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateOFStatut', error);
  return data;
}

export async function updateOFDate(id, datePrevue) {
  const { data, error } = await supabase
    .from('production_of')
    .update({ date_prevue: datePrevue })
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateOFDate', error);
  return data;
}

/* -------------------------------------------------------
   ACHATS — BONS DE COMMANDE FOURNISSEURS
------------------------------------------------------- */

export async function getAchats() {
  const { data, error } = await supabase
    .from('achats')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });
  if (error) handleError('getAchats', error);
  return data;
}

export async function createAchat(achat) {
  const { data, error } = await supabase
    .from('achats')
    .insert({ ...achat, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createAchat', error);
  return data;
}

export async function updateAchat(id, changes) {
  const { data, error } = await supabase
    .from('achats')
    .update(changes)
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateAchat', error);
  return data;
}

/* Vérifie qu'il n'existe pas déjà un BC brouillon pour cet article/commande
   BUG CORRIGÉ : évite les doublons de BCs automatiques */
export async function achatDoublonExiste(articleRef, refCommande) {
  const { data, error } = await supabase
    .from('achats')
    .select('id')
    .eq('tenant_id', tid())
    .eq('ref', articleRef)
    .eq('ref_commande', refCommande)
    .eq('statut', 'brouillon')
    .maybeSingle();
  if (error) return false;
  return data !== null;
}

/* -------------------------------------------------------
   LIVRAISONS
------------------------------------------------------- */

export async function getLivraisons() {
  const { data, error } = await supabase
    .from('livraisons')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });
  if (error) handleError('getLivraisons', error);
  return data;
}

export async function createLivraison(livraison) {
  const { data, error } = await supabase
    .from('livraisons')
    .insert({ ...livraison, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createLivraison', error);
  return data;
}

/* -------------------------------------------------------
   FACTURES
------------------------------------------------------- */

export async function getFactures() {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false });
  if (error) handleError('getFactures', error);
  return data;
}

export async function factureExistePourCommande(commandeId) {
  const { data, error } = await supabase
    .from('factures')
    .select('id')
    .eq('commande_id', commandeId)
    .eq('tenant_id', tid())
    .maybeSingle();
  if (error) return false;
  return data !== null;
}

export async function createFacture(facture) {
  const { data, error } = await supabase
    .from('factures')
    .insert({ ...facture, tenant_id: tid() })
    .select()
    .single();
  if (error) handleError('createFacture', error);
  return data;
}

export async function updateFactureStatut(id, statut) {
  const { data, error } = await supabase
    .from('factures')
    .update({ statut })
    .eq('id', id)
    .eq('tenant_id', tid())
    .select()
    .single();
  if (error) handleError('updateFactureStatut', error);
  return data;
}

/* -------------------------------------------------------
   TENANT (Mon entreprise)
------------------------------------------------------- */

export async function getTenant() {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tid())
    .single();
  if (error) handleError('getTenant', error);
  return data;
}

export async function updateTenant(changes) {
  const { data, error } = await supabase
    .from('tenants')
    .update(changes)
    .eq('id', tid())
    .select()
    .single();
  if (error) handleError('updateTenant', error);
  return data;
}

/* -------------------------------------------------------
   QUOTA IA
------------------------------------------------------- */

export async function getAiUsage(mois) {
  const { data, error } = await supabase
    .from('ai_usage')
    .select('appels, tokens')
    .eq('tenant_id', tid())
    .eq('mois', mois)
    .maybeSingle();
  if (error) handleError('getAiUsage', error);
  return data || { appels: 0, tokens: 0 };
}

export async function incrementAiUsage(mois, tokensUsed = 0) {
  const current = await getAiUsage(mois);
  const { error } = await supabase
    .from('ai_usage')
    .upsert({
      tenant_id: tid(),
      mois,
      appels: (current.appels || 0) + 1,
      tokens: (current.tokens || 0) + tokensUsed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,mois' });
  if (error) handleError('incrementAiUsage', error);
}

/* -------------------------------------------------------
   MOUVEMENTS DE STOCK
   Enregistrés dans une table dédiée pour l'historique.
   (La table n'est pas dans le schéma initial — on la
    crée dynamiquement ou on stocke en JSON dans Supabase.)
   Pour l'instant : table simple avec les champs essentiels.
------------------------------------------------------- */

export async function getMouvements({ type = null } = {}) {
  let query = supabase
    .from('mouvements')
    .select('*')
    .eq('tenant_id', tid())
    .order('created_at', { ascending: false })
    .limit(500);

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) handleError('getMouvements', error);
  return data || [];
}

export async function addMouvement({ type, ref, nom, qte, motif, ref_doc }) {
  const { error } = await supabase
    .from('mouvements')
    .insert({
      tenant_id: tid(),
      type,
      ref,
      nom,
      qte,
      motif,
      ref_doc,
    });
  if (error) handleError('addMouvement', error);
}

/* -------------------------------------------------------
   DASHBOARD — Requêtes agrégées
   dashboard.js appelle ces fonctions directement.
   Elles regroupent plusieurs lectures en parallèle
   pour minimiser les aller-retours réseau.
------------------------------------------------------- */

export async function getDashboardData() {
  /* Toutes les requêtes en parallèle via Promise.all */
  const [articles, produits, commandes, achats, ofs, factures] = await Promise.all([
    getArticles(),
    getProduits(),
    getCommandes(),
    getAchats(),
    getAllOFs(),
    getFactures(),
  ]);

  return { articles, produits, commandes, achats, ofs, factures };
}
