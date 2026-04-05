/* -------------------------------------------------------
   AppMee — modules/admin.js
   Administration : entreprise, articles, produits,
   clients, fournisseurs, import masse, historique.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getTenant, updateTenant,
  getArticles, createArticle, updateArticle, deleteArticle, getArticleByRef,
  getProduits, createProduit, updateProduit, deleteProduit, getProduitByRef,
  getRecettesByProduit, saveRecette,
  getClients, createClient, upsertClient, updateClient, deleteClient, getClientByNom,
  getFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  getCommandes, createCommande, getAchats, getFactures, getAllOFs,
  getMouvements, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, badgeCmd, showToast,
  openModal, closeModal, filterTable, today, confirmDialog,
} from '../ui.js';

/* Cache local */
let _tenant       = {};
let _articles     = [];
let _produits     = [];
let _clients      = [];
let _fournisseurs = [];

let _editType = null;   /* 'article' | 'produit' | 'client' | 'fournisseur' */
let _editId   = null;   /* UUID de l'élément en cours d'édition */
let _ficheClientId     = null;
let _ficheFournisseurId = null;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_tenant, _articles, _produits, _clients, _fournisseurs] = await Promise.all([
    getTenant(), getArticles(), getProduits(), getClients(), getFournisseurs(),
  ]);
  _bindEntrepriseForm();
  _bindEditRowForm();
  _bindNewClientForm();
  _bindNewFournisseurForm();
  _bindFicheClientForm();
  _bindFicheFournisseurForm();
  _bindHistoriqueForm();
  _bindImportMasse();
  _bindSearchInputs();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  [_tenant, _articles, _produits, _clients, _fournisseurs] = await Promise.all([
    getTenant(), getArticles(), getProduits(), getClients(), getFournisseurs(),
  ]);
  _renderEntreprise();
  _renderArticles();
  _renderProduits();
  _renderClients();
  _renderFournisseurs();
}

/* -------------------------------------------------------
   ENTREPRISE
------------------------------------------------------- */
function _renderEntreprise() {
  const me = _tenant || {};
  ['nom', 'siret', 'tva', 'adresse', 'tel', 'email', 'site', 'iban', 'cpt_paiement'].forEach(k => {
    const el = document.getElementById('me_' + k.replace('_paiement', '').replace('_', ''));
    /* Mapping champ HTML → colonne DB */
    const map = { me_raison: 'nom', me_siret: 'siret', me_tva: 'tva', me_forme: 'forme',
      me_adresse: 'adresse', me_tel: 'tel', me_email: 'email', me_web: 'site',
      me_iban: 'iban', me_cpt: 'cpt_paiement' };
  });
  /* Remplissage direct par ID */
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.value = me[key] || ''; };
  set('me_raison', 'nom'); set('me_siret', 'siret'); set('me_tva', 'tva');
  set('me_adresse', 'adresse'); set('me_tel', 'tel'); set('me_email', 'email');
  set('me_web', 'site'); set('me_iban', 'iban'); set('me_cpt', 'cpt_paiement');
  const forme = document.getElementById('me_forme');
  if (forme && me.forme) forme.value = me.forme;
}

function _bindEntrepriseForm() {
  document.getElementById('btnSaveEntreprise')?.addEventListener('click', async () => {
    try {
      await updateTenant({
        nom:          document.getElementById('me_raison').value,
        siret:        document.getElementById('me_siret').value,
        tva:          document.getElementById('me_tva').value,
        forme:        document.getElementById('me_forme').value,
        adresse:      document.getElementById('me_adresse').value,
        tel:          document.getElementById('me_tel').value,
        email:        document.getElementById('me_email').value,
        site:         document.getElementById('me_web').value,
        iban:         document.getElementById('me_iban').value,
        cpt_paiement: document.getElementById('me_cpt').value,
      });
      showToast('✅ Entreprise enregistrée.');
    } catch (err) {
      showToast('❌ Erreur enregistrement.', 'error');
    }
  });
}

/* -------------------------------------------------------
   ARTICLES
------------------------------------------------------- */
function _renderArticles() {
  const tbody = document.getElementById('adminArticlesTbody');
  tbody.innerHTML = '';
  _articles.forEach(a => {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td><span class="tag">${esc(a.categorie || '—')}</span></td>
      <td>${esc(a.unite)}</td>
      <td style="font-weight:600;">${fmt(a.prix)} €</td>
      <td>${fmtQ(a.seuil)}</td>
      <td>${fmtQ(a.stock)}</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(a.fournisseur || '—')}</td>
      <td><button class="btn btn-danger btn-xs" data-action="supprimer">✕</button></td>`;
    tr.querySelector('[data-action="supprimer"]').addEventListener('click', (e) => {
      e.stopPropagation();
      _suppArticle(a.id);
    });
    tr.addEventListener('click', () => _editRow('article', a.id));
    tbody.appendChild(tr);
  });
}

async function _suppArticle(id) {
  const ok = await confirmDialog('Supprimer cet article ?');
  if (!ok) return;
  try {
    await deleteArticle(id);
    _articles = _articles.filter(a => a.id !== id);
    _renderArticles();
    showToast('✅ Article supprimé.');
  } catch (err) {
    showToast('❌ Erreur suppression.', 'error');
  }
}

/* -------------------------------------------------------
   PRODUITS
------------------------------------------------------- */
function _renderProduits() {
  const tbody = document.getElementById('adminProduitsTbody');
  tbody.innerHTML = '';
  _produits.forEach(p => {
    const cout = p.cout || 0;
    const prix = p.prix_vente || p.prix || 0;
    const m    = prix - cout;
    const tx   = cout > 0 ? (m / cout * 100).toFixed(0) : '—';
    const tr   = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="td-ref">${esc(p.ref)}</td>
      <td class="td-bold">${esc(p.nom)}</td>
      <td style="font-weight:600;">${fmt(prix)} €</td>
      <td>${fmt(cout)} €</td>
      <td style="color:var(--ui-green);font-weight:600;">${fmt(m)} € <span style="color:var(--ink-muted);font-weight:400;font-size:10px;">(${tx}%)</span></td>
      <td>${fmtQ(p.seuil)}</td>
      <td><strong>${p.stock}</strong></td>
      <td>${stockStatus(p.stock, p.seuil)}</td>
      <td><button class="btn btn-danger btn-xs" data-action="supprimer">✕</button></td>`;
    tr.querySelector('[data-action="supprimer"]').addEventListener('click', (e) => {
      e.stopPropagation();
      _suppProduit(p.id);
    });
    tr.addEventListener('click', () => _editRow('produit', p.id));
    tbody.appendChild(tr);
  });
}

async function _suppProduit(id) {
  const ok = await confirmDialog('Supprimer ce produit ?');
  if (!ok) return;
  try {
    await deleteProduit(id);
    _produits = _produits.filter(p => p.id !== id);
    _renderProduits();
    showToast('✅ Produit supprimé.');
  } catch (err) {
    showToast('❌ Erreur suppression.', 'error');
  }
}

/* -------------------------------------------------------
   CLIENTS
------------------------------------------------------- */
function _renderClients() {
  const tbody = document.getElementById('adminClientsTbody');
  tbody.innerHTML = '';
  _clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="td-bold">${esc(c.nom || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(c.email || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(c.tel || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(c.adresse || '—')}</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(c.notes || '—')}</td>
      <td><button class="btn btn-danger btn-xs" data-action="supprimer">✕</button></td>`;
    tr.querySelector('[data-action="supprimer"]').addEventListener('click', (e) => {
      e.stopPropagation();
      _suppClient(c.id);
    });
    tr.addEventListener('click', () => _openFicheClient(c.id));
    tbody.appendChild(tr);
  });
}

async function _suppClient(id) {
  const ok = await confirmDialog('Supprimer ce client ?');
  if (!ok) return;
  try {
    await deleteClient(id);
    _clients = _clients.filter(c => c.id !== id);
    _renderClients();
    showToast('✅ Client supprimé.');
  } catch (err) {
    showToast('❌ Erreur suppression.', 'error');
  }
}

/* -------------------------------------------------------
   FOURNISSEURS
------------------------------------------------------- */
function _renderFournisseurs() {
  const tbody = document.getElementById('adminFournisseursTbody');
  tbody.innerHTML = '';
  _fournisseurs.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="td-bold">${esc(f.nom || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(f.contact || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(f.email || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(f.tel || '—')}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(f.delai || '—')}</td>
      <td><span class="tag">${esc(f.categorie || '—')}</span></td>
      <td><button class="btn btn-danger btn-xs" data-action="supprimer">✕</button></td>`;
    tr.querySelector('[data-action="supprimer"]').addEventListener('click', (e) => {
      e.stopPropagation();
      _suppFournisseur(f.id);
    });
    tr.addEventListener('click', () => _openFicheFournisseur(f.id));
    tbody.appendChild(tr);
  });
}

async function _suppFournisseur(id) {
  const ok = await confirmDialog('Supprimer ce fournisseur ?');
  if (!ok) return;
  try {
    await deleteFournisseur(id);
    _fournisseurs = _fournisseurs.filter(f => f.id !== id);
    _renderFournisseurs();
    showToast('✅ Fournisseur supprimé.');
  } catch (err) {
    showToast('❌ Erreur suppression.', 'error');
  }
}

/* -------------------------------------------------------
   EDIT ROW GÉNÉRIQUE
------------------------------------------------------- */
function _editRow(type, id) {
  _editType = type;
  _editId   = id;

  const labels = {
    article:     '📦 Modifier l\'article',
    produit:     '🏷 Modifier le produit',
    client:      '👤 Modifier le client',
    fournisseur: '🏪 Modifier le fournisseur',
  };
  document.getElementById('editRowTitle').textContent = labels[type] || 'Modifier';

  let html = '<div class="form-grid" style="padding:0;">';

  if (type === 'article') {
    const a = _articles.find(x => x.id === id);
    html += `
      <div class="form-group"><label>Référence</label><input id="er_ref" value="${esc(a.ref)}" readonly style="background:var(--ui-bg2);"></div>
      <div class="form-group"><label>Nom</label><input id="er_nom" value="${esc(a.nom)}"></div>
      <div class="form-group"><label>Catégorie</label>
        <select id="er_cat">
          <option value="matiere"    ${a.categorie === 'matiere'    ? 'selected' : ''}>Matière</option>
          <option value="emballage"  ${a.categorie === 'emballage'  ? 'selected' : ''}>Emballage</option>
          <option value="ingredient" ${a.categorie === 'ingredient' ? 'selected' : ''}>Ingrédient</option>
          <option value="fourniture" ${a.categorie === 'fourniture' ? 'selected' : ''}>Fourniture</option>
          <option value="autre"      ${a.categorie === 'autre'      ? 'selected' : ''}>Autre</option>
        </select>
      </div>
      <div class="form-group"><label>Unité</label><input id="er_unite" value="${esc(a.unite)}"></div>
      <div class="form-group"><label>Prix achat HT (€)</label><input type="number" id="er_prix" value="${a.prix}" step="0.001"></div>
      <div class="form-group"><label>Fournisseur</label><input id="er_fournisseur" value="${esc(a.fournisseur || '')}"></div>
      <div class="form-group"><label>Seuil alerte</label><input type="number" id="er_seuil" value="${a.seuil}"></div>
      <div class="form-group"><label>Stock actuel</label><input type="number" id="er_stock" value="${a.stock}" step="0.01"></div>`;
  } else if (type === 'produit') {
    const p = _produits.find(x => x.id === id);
    html += `
      <div class="form-group"><label>Référence</label><input id="er_ref" value="${esc(p.ref)}" readonly style="background:var(--ui-bg2);"></div>
      <div class="form-group"><label>Nom</label><input id="er_nom" value="${esc(p.nom)}"></div>
      <div class="form-group"><label>Prix vente HT (€)</label><input type="number" id="er_prix" value="${p.prix_vente || p.prix}" step="0.01"></div>
      <div class="form-group"><label>Seuil alerte</label><input type="number" id="er_seuil" value="${p.seuil}"></div>
      <div class="form-group"><label>Stock actuel</label><input type="number" id="er_stock" value="${p.stock}" step="0.01"></div>`;
  } else if (type === 'client') {
    const c = _clients.find(x => x.id === id);
    html += `<div class="form-group full"><label>Nom</label><input id="er_nom" value="${esc(c.nom)}"></div>`;
  } else if (type === 'fournisseur') {
    const f = _fournisseurs.find(x => x.id === id);
    html += `<div class="form-group full"><label>Nom</label><input id="er_nom" value="${esc(f.nom)}"></div>`;
  }

  html += '</div>';
  document.getElementById('editRowContent').innerHTML = html;
  openModal('modalEditRow');
}

function _bindEditRowForm() {
  document.getElementById('btnSaveEditRow')?.addEventListener('click', _saveEditRow);
  document.getElementById('editRowDeleteBtn')?.addEventListener('click', async () => {
    if (!_editType || !_editId) return;
    const ok = await confirmDialog('Supprimer cet élément ?');
    if (!ok) return;
    if (_editType === 'article')     await deleteArticle(_editId);
    if (_editType === 'produit')     await deleteProduit(_editId);
    if (_editType === 'client')      await deleteClient(_editId);
    if (_editType === 'fournisseur') await deleteFournisseur(_editId);
    closeModal('modalEditRow');
    await render();
    showToast('✅ Supprimé.');
  });
}

async function _saveEditRow() {
  if (!_editType || !_editId) return;
  try {
    if (_editType === 'article') {
      await updateArticle(_editId, {
        nom:         document.getElementById('er_nom').value,
        categorie:   document.getElementById('er_cat').value,
        unite:       document.getElementById('er_unite').value,
        prix:        parseFloat(document.getElementById('er_prix').value) || 0,
        fournisseur: document.getElementById('er_fournisseur').value,
        seuil:       parseInt(document.getElementById('er_seuil').value) || 0,
        stock:       parseFloat(document.getElementById('er_stock').value) || 0,
      });
    } else if (_editType === 'produit') {
      await updateProduit(_editId, {
        nom:       document.getElementById('er_nom').value,
        prix_vente: parseFloat(document.getElementById('er_prix').value) || 0,
        seuil:     parseInt(document.getElementById('er_seuil').value) || 0,
        stock:     parseFloat(document.getElementById('er_stock').value) || 0,
      });
    } else if (_editType === 'client') {
      await updateClient(_editId, { nom: document.getElementById('er_nom').value });
    } else if (_editType === 'fournisseur') {
      await updateFournisseur(_editId, { nom: document.getElementById('er_nom').value });
    }
    closeModal('modalEditRow');
    await render();
    showToast('✅ Modifications enregistrées.');
  } catch (err) {
    showToast('❌ Erreur enregistrement.', 'error');
  }
}

/* -------------------------------------------------------
   NOUVEAU CLIENT
------------------------------------------------------- */
function _bindNewClientForm() {
  document.getElementById('btnSaveNewClient')?.addEventListener('click', async () => {
    const nom = document.getElementById('ncNom').value.trim();
    if (!nom) { showToast('⚠ Nom requis.', 'error'); return; }
    try {
      const c = await createClient({
        nom,
        email:   document.getElementById('ncEmail').value,
        tel:     document.getElementById('ncTel').value,
        adresse: document.getElementById('ncAdresse').value,
        notes:   document.getElementById('ncNotes').value,
      });
      _clients.push(c);
      closeModal('modalNewClient');
      _renderClients();
      showToast('✅ Client ajouté.');
    } catch (err) {
      showToast('❌ Erreur création client.', 'error');
    }
  });
}

/* -------------------------------------------------------
   NOUVEAU FOURNISSEUR
------------------------------------------------------- */
function _bindNewFournisseurForm() {
  document.getElementById('btnSaveNewFournisseur')?.addEventListener('click', async () => {
    const nom = document.getElementById('nfNom2').value.trim();
    if (!nom) { showToast('⚠ Nom requis.', 'error'); return; }
    try {
      const f = await createFournisseur({
        nom,
        contact:   document.getElementById('nfContact').value,
        email:     document.getElementById('nfEmail2').value,
        tel:       document.getElementById('nfTel2').value,
        delai:     document.getElementById('nfDelai').value,
        categorie: document.getElementById('nfCategorie2').value,
      });
      _fournisseurs.push(f);
      closeModal('modalNewFournisseur');
      _renderFournisseurs();
      showToast('✅ Fournisseur ajouté.');
    } catch (err) {
      showToast('❌ Erreur création fournisseur.', 'error');
    }
  });
}

/* -------------------------------------------------------
   FICHE CLIENT
------------------------------------------------------- */
function _openFicheClient(id) {
  _ficheClientId = id;
  const c = _clients.find(x => x.id === id) || {};
  document.getElementById('ficheClientForm').innerHTML = `
    <div class="form-group"><label>Nom</label><input id="fc_nom" value="${esc(c.nom || '')}"></div>
    <div class="form-group"><label>SIRET</label><input id="fc_siret" value="${esc(c.siret || '')}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="fc_email" value="${esc(c.email || '')}"></div>
    <div class="form-group"><label>Téléphone</label><input id="fc_tel" value="${esc(c.tel || '')}"></div>
    <div class="form-group full"><label>Adresse</label><input id="fc_adresse" value="${esc(c.adresse || '')}"></div>
    <div class="form-group"><label>Contact</label><input id="fc_contact" value="${esc(c.contact || '')}"></div>
    <div class="form-group"><label>Conditions paiement</label><input id="fc_cpt" value="${esc(c.cpt || '')}"></div>
    <div class="form-group full"><label>Notes</label><textarea id="fc_notes" rows="2">${esc(c.notes || '')}</textarea></div>`;
  openModal('modalFicheClient');
}

function _bindFicheClientForm() {
  document.getElementById('btnSaveFicheClient')?.addEventListener('click', async () => {
    if (!_ficheClientId) return;
    try {
      await updateClient(_ficheClientId, {
        nom:     document.getElementById('fc_nom').value,
        email:   document.getElementById('fc_email').value,
        tel:     document.getElementById('fc_tel').value,
        adresse: document.getElementById('fc_adresse').value,
        notes:   document.getElementById('fc_notes').value,
      });
      const idx = _clients.findIndex(c => c.id === _ficheClientId);
      if (idx >= 0) _clients[idx].nom = document.getElementById('fc_nom').value;
      closeModal('modalFicheClient');
      _renderClients();
      showToast('✅ Fiche client enregistrée.');
    } catch (err) {
      showToast('❌ Erreur.', 'error');
    }
  });

  document.getElementById('btnSuppFicheClient')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Supprimer ce client ?');
    if (!ok) return;
    try {
      await deleteClient(_ficheClientId);
      _clients = _clients.filter(c => c.id !== _ficheClientId);
      closeModal('modalFicheClient');
      _renderClients();
    } catch (err) {
      showToast('❌ Erreur.', 'error');
    }
  });
}

/* -------------------------------------------------------
   FICHE FOURNISSEUR
------------------------------------------------------- */
function _openFicheFournisseur(id) {
  _ficheFournisseurId = id;
  const f = _fournisseurs.find(x => x.id === id) || {};
  document.getElementById('ficheFournisseurForm').innerHTML = `
    <div class="form-group"><label>Nom</label><input id="ff_nom" value="${esc(f.nom || '')}"></div>
    <div class="form-group"><label>SIRET</label><input id="ff_siret" value="${esc(f.siret || '')}"></div>
    <div class="form-group"><label>Contact</label><input id="ff_contact" value="${esc(f.contact || '')}"></div>
    <div class="form-group"><label>Email</label><input type="email" id="ff_email" value="${esc(f.email || '')}"></div>
    <div class="form-group"><label>Téléphone</label><input id="ff_tel" value="${esc(f.tel || '')}"></div>
    <div class="form-group full"><label>Adresse</label><input id="ff_adresse" value="${esc(f.adresse || '')}"></div>
    <div class="form-group"><label>Délai livraison</label><input id="ff_delai" value="${esc(f.delai || '')}"></div>
    <div class="form-group"><label>Catégorie</label>
      <select id="ff_categorie">
        <option value="">—</option>
        <option value="emballage"  ${f.categorie === 'emballage'  ? 'selected' : ''}>Emballage</option>
        <option value="matiere"    ${f.categorie === 'matiere'    ? 'selected' : ''}>Matière</option>
        <option value="ingredient" ${f.categorie === 'ingredient' ? 'selected' : ''}>Ingrédient</option>
        <option value="fourniture" ${f.categorie === 'fourniture' ? 'selected' : ''}>Fourniture</option>
      </select>
    </div>
    <div class="form-group"><label>IBAN</label><input id="ff_iban" value="${esc(f.iban || '')}"></div>
    <div class="form-group full"><label>Notes</label><textarea id="ff_notes" rows="2">${esc(f.notes || '')}</textarea></div>`;
  openModal('modalFicheFournisseur');
}

function _bindFicheFournisseurForm() {
  document.getElementById('btnSaveFicheFournisseur')?.addEventListener('click', async () => {
    if (!_ficheFournisseurId) return;
    try {
      await updateFournisseur(_ficheFournisseurId, {
        nom:       document.getElementById('ff_nom').value,
        contact:   document.getElementById('ff_contact').value,
        email:     document.getElementById('ff_email').value,
        tel:       document.getElementById('ff_tel').value,
        adresse:   document.getElementById('ff_adresse').value,
        delai:     document.getElementById('ff_delai').value,
        categorie: document.getElementById('ff_categorie').value,
        iban:      document.getElementById('ff_iban').value,
        notes:     document.getElementById('ff_notes').value,
      });
      closeModal('modalFicheFournisseur');
      _renderFournisseurs();
      showToast('✅ Fiche fournisseur enregistrée.');
    } catch (err) {
      showToast('❌ Erreur.', 'error');
    }
  });

  document.getElementById('btnSuppFicheFournisseur')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Supprimer ce fournisseur ?');
    if (!ok) return;
    try {
      await deleteFournisseur(_ficheFournisseurId);
      _fournisseurs = _fournisseurs.filter(f => f.id !== _ficheFournisseurId);
      closeModal('modalFicheFournisseur');
      _renderFournisseurs();
    } catch (err) {
      showToast('❌ Erreur.', 'error');
    }
  });
}

/* -------------------------------------------------------
   HISTORIQUE
------------------------------------------------------- */
function _bindHistoriqueForm() {
  document.getElementById('histoType')?.addEventListener('change', _renderHistorique);
  document.getElementById('histoSearch')?.addEventListener('input', (e) => {
    _renderHistorique(e.target.value);
  });
}

async function _renderHistorique(searchQuery = '') {
  const type = document.getElementById('histoType')?.value || '';
  const q    = typeof searchQuery === 'string' ? searchQuery : '';
  let mvts   = await getMouvements({ type: type || null });

  if (q) mvts = mvts.filter(m => JSON.stringify(m).toLowerCase().includes(q.toLowerCase()));

  const typeLabel = {
    entree: 'Entrée articles', sortie: 'Sortie articles',
    entree_pf: 'Entrée prod. finis', sortie_pf: 'Livraison', inventaire: 'Inventaire',
  };
  const typeColor = {
    entree: 'badge-ok', sortie: 'badge-warn',
    entree_pf: 'badge-blue', sortie_pf: 'badge-purple', inventaire: 'badge-neutral',
  };

  document.getElementById('histoTbody').innerHTML = mvts.map(m => `<tr>
    <td style="white-space:nowrap">${esc((m.created_at || '').split('T')[0])}</td>
    <td><span class="badge ${typeColor[m.type] || 'badge-neutral'}">${typeLabel[m.type] || esc(m.type)}</span></td>
    <td class="td-ref">${esc(m.ref || '—')}</td>
    <td>${esc(m.nom || '—')}</td>
    <td style="font-weight:600;color:${m.qte < 0 ? 'var(--ui-red)' : 'inherit'}">${m.qte > 0 ? '+' : ''}${fmtQ(m.qte)}</td>
    <td style="font-size:11px;color:var(--ink-muted)">${esc(m.motif || '—')}</td>
    <td class="td-ref">${esc(m.ref_doc || '—')}</td>
  </tr>`).join('') ||
  '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun mouvement.</td></tr>';
}

/* -------------------------------------------------------
   RECHERCHE ADMIN
------------------------------------------------------- */
function _bindSearchInputs() {
  document.getElementById('adminArticlesSearch')?.addEventListener('input', (e) => {
    filterTable('adminArticlesTable', e.target.value);
  });
}

/* -------------------------------------------------------
   EXPORT CSV
   Télécharge toutes les données en fichiers CSV séparés.
   Un fichier ZIP avec tout est créé via l'API native.
------------------------------------------------------- */
export async function exporterTout() {
  showToast('⏳ Préparation de l\'export…');

  try {
    /* Charger toutes les données en parallèle */
    const [articles, produits, clients, fournisseurs,
           commandes, achats, factures, ofs, mouvements] = await Promise.all([
      getArticles(), getProduits(), getClients(), getFournisseurs(),
      getCommandes(), getAchats(), getFactures(), getAllOFs(),
      getMouvements(),
    ]);

    /* Définition des exports */
    const exports = [
      {
        nom: 'articles',
        data: articles,
        colonnes: ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'],
      },
      {
        nom: 'produits',
        data: produits,
        colonnes: ['ref', 'nom', 'prix_vente', 'seuil', 'stock'],
      },
      {
        nom: 'clients',
        data: clients,
        colonnes: ['nom', 'email', 'tel', 'adresse', 'notes'],
      },
      {
        nom: 'fournisseurs',
        data: fournisseurs,
        colonnes: ['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie', 'iban'],
      },
      {
        nom: 'commandes',
        data: commandes,
        colonnes: ['ref', 'client_nom', 'date_cmd', 'date_livraison', 'statut', 'notes'],
      },
      {
        nom: 'commandes_lignes',
        /* Aplatir les lignes de commandes pour l'export */
        data: commandes.flatMap(c => (c.commande_lignes || []).map(l => ({
          commande_ref:  c.ref,
          client_nom:    c.client_nom,
          date_cmd:      c.date_cmd,
          produit_nom:   l.produit_nom,
          quantite:      l.quantite,
          prix_unitaire: l.prix_unitaire,
          total_ht:      l.total_ht || (l.quantite * l.prix_unitaire),
        }))),
        colonnes: ['commande_ref', 'client_nom', 'date_cmd', 'produit_nom', 'quantite', 'prix_unitaire', 'total_ht'],
      },
      {
        nom: 'achats',
        data: achats,
        colonnes: ['ref', 'article_nom', 'quantite', 'prix_unitaire', 'montant_ht', 'fournisseur', 'date_cmd', 'date_livraison', 'statut', 'ref_commande'],
      },
      {
        nom: 'factures',
        data: factures,
        colonnes: ['ref', 'client_nom', 'date_facture', 'montant_ht', 'taux_tva', 'montant_ttc', 'statut', 'date_echeance'],
      },
      {
        nom: 'production_of',
        data: ofs,
        colonnes: ['ref', 'produit_nom', 'quantite', 'date_prevue', 'statut', 'notes'],
      },
      {
        nom: 'mouvements',
        data: mouvements,
        colonnes: ['created_at', 'type', 'ref', 'nom', 'qte', 'motif', 'ref_doc'],
      },
    ];

    /* Générer et télécharger chaque CSV */
    let nbFichiers = 0;
    for (const exp of exports) {
      if (!exp.data || !exp.data.length) continue;
      const csv = _genererCSV(exp.data, exp.colonnes);
      _telechargerCSV(csv, `appmee_${exp.nom}_${today()}.csv`);
      nbFichiers++;
      /* Petit délai entre les téléchargements pour éviter les blocages navigateur */
      await new Promise(r => setTimeout(r, 300));
    }

    showToast(`✅ ${nbFichiers} fichiers CSV exportés.`);
  } catch (err) {
    console.error('[Export]', err);
    showToast('❌ Erreur lors de l\'export.', 'error');
  }
}

/* Génère le contenu CSV depuis un tableau d'objets */
function _genererCSV(data, colonnes) {
  /* Échappement CSV : entoure de guillemets si virgule, guillemet ou saut de ligne */
  const escape = (val) => {
    const s = String(val === null || val === undefined ? '' : val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = colonnes.join(',');
  const rows   = data.map(row =>
    colonnes.map(col => escape(row[col] ?? '')).join(',')
  );

  /* BOM UTF-8 pour que Excel ouvre correctement les accents */
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

/* Déclenche le téléchargement d'un fichier CSV dans le navigateur */
function _telechargerCSV(contenu, nomFichier) {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------
   IMPORT EN MASSE (XLSX/CSV)
------------------------------------------------------- */
let _massLoaded = {};

function _bindImportMasse() {
  /* Génération dynamique des zones d'import */
  const zones = [
    { key: 'articles',     label: '📦 Articles',     fields: 'ref, nom, categorie, unite, prix, fournisseur, seuil, stock' },
    { key: 'produits',     label: '🏷 Produits',      fields: 'ref, nom, prix, seuil, stock' },
    { key: 'recettes',     label: '📖 Recettes',      fields: 'produit_ref, produit_nom, produit_prix, article_ref, quantite' },
    { key: 'clients',      label: '👤 Clients',       fields: 'nom, email, tel, adresse, notes' },
    { key: 'fournisseurs', label: '🏪 Fournisseurs',  fields: 'nom, contact, email, tel, adresse, delai, categorie' },
    { key: 'commandes',    label: '📋 Commandes',     fields: 'commande_ref, client_nom, date_cmd, date_livraison, produit_ref, quantite, prix_unitaire' },
  ];

  const container = document.getElementById('massImportZones');
  if (container) {
    container.innerHTML = zones.map(z => `
      <div style="border:1px solid var(--ui-brd);border-radius:7px;overflow:hidden;">
        <div style="padding:9px 12px;background:var(--ui-bg2);display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div>
            <span style="font-weight:600;font-size:12.5px;">${z.label}</span>
            <span style="font-size:10.5px;color:var(--ink-muted);margin-left:7px;">${z.fields}</span>
          </div>
          <div style="display:flex;align-items:center;gap:7px;">
            <span id="mass${_cap(z.key)}Status" style="font-size:10.5px;color:var(--ink-muted);">Aucun</span>
            <label class="btn btn-outline btn-sm" style="cursor:pointer;margin:0;">Choisir
              <input type="file" accept=".xlsx,.xls,.csv" style="display:none" data-type="${z.key}">
            </label>
          </div>
        </div>
        <div id="mass${_cap(z.key)}Preview" style="display:none;padding:6px 12px;font-size:11px;color:var(--ink-muted);border-top:1px solid var(--rule);"></div>
      </div>`).join('');

    container.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', (e) => _massLoad(e.target, e.target.dataset.type));
    });
  }

  /* Boutons templates */
  ['articles', 'produits', 'recettes', 'clients', 'fournisseurs', 'commandes'].forEach(type => {
    document.getElementById('dl' + _cap(type))?.addEventListener('click', () => _dlTemplate(type));
  });

  document.getElementById('massBtnImport')?.addEventListener('click', _massImport);
}

function _cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function _massLoad(input, type) {
  const f = input.files[0];
  if (!f) return;
  const ext    = f.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      let rows = [];
      if (ext === 'csv') {
        const lines   = e.target.result.split('\n').filter(l => l.trim());
        const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''));
        rows = lines.slice(1).map(line => {
          const vals = line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
          const obj  = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
          return obj;
        });
      } else {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      _massLoaded[type] = { rows, fileName: f.name };
      const cap = _cap(type);
      document.getElementById('mass' + cap + 'Status').textContent = rows.length + ' lignes';
      document.getElementById('mass' + cap + 'Status').style.color = 'var(--ui-green)';
      const prev = document.getElementById('mass' + cap + 'Preview');
      if (prev) {
        prev.style.display = 'block';
        prev.textContent   = '✓ ' + rows.slice(0, 2).map(r => Object.values(r).slice(0, 4).join(' | ')).join(' • ') + (rows.length > 2 ? ' …' : '');
      }
      _massUpdateTotal();
    } catch (err) {
      const errEl = document.getElementById('massError');
      if (errEl) { errEl.style.display = 'flex'; errEl.textContent = 'Erreur : ' + err.message; }
    }
  };

  if (ext === 'csv') reader.readAsText(f, 'UTF-8');
  else reader.readAsArrayBuffer(f);
}

function _massUpdateTotal() {
  const tot = Object.values(_massLoaded).reduce((s, v) => s + (v.rows ? v.rows.length : 0), 0);
  const el  = document.getElementById('massTotalCount');
  const btn = document.getElementById('massBtnImport');
  if (el)  el.textContent = tot > 0 ? tot + ' lignes prêtes' : 'Aucune donnée';
  if (btn) { btn.disabled = tot === 0; btn.style.opacity = tot > 0 ? '1' : '.5'; }
}

async function _massImport() {
  const counts  = { articles: 0, produits: 0, recettes: 0, clients: 0, fournisseurs: 0, commandes: 0 };
  const errors  = [];
  const btn     = document.getElementById('massBtnImport');
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }

  /* ── ARTICLES ── */
  if (_massLoaded.articles) {
    for (const r of _massLoaded.articles.rows) {
      const ref = String(r.ref || '').trim();
      const nom = String(r.nom || r.Nom || '').trim();
      if (!ref || !nom) continue;
      if (_articles.find(a => a.ref === ref)) continue;
      try {
        const created = await createArticle({
          ref,
          nom,
          categorie:   String(r.categorie || r.Catégorie || 'autre').trim().toLowerCase(),
          unite:       String(r.unite || r.Unité || 'unité').trim(),
          prix:        parseFloat(String(r.prix || r.Prix || '0').replace(',', '.')) || 0,
          fournisseur: String(r.fournisseur || r.Fournisseur || '').trim(),
          seuil:       parseInt(r.seuil || r.Seuil || '0') || 0,
          stock:       parseFloat(String(r.stock || r.Stock || '0').replace(',', '.')) || 0,
        });
        _articles.push(created);
        counts.articles++;
      } catch (err) {
        errors.push('Article ' + ref + ' : ' + err.message);
      }
    }
  }

  /* ── PRODUITS ── */
  if (_massLoaded.produits) {
    for (const r of _massLoaded.produits.rows) {
      const ref = String(r.ref || '').trim();
      const nom = String(r.nom || r.Nom || '').trim();
      if (!ref || !nom) continue;
      if (_produits.find(p => p.ref === ref)) continue;
      try {
        const created = await createProduit({
          ref,
          nom,
          prix_vente: parseFloat(String(r.prix || r.Prix || '0').replace(',', '.')) || 0,
          seuil:      parseInt(r.seuil || r.Seuil || '0') || 0,
          stock:      parseFloat(String(r.stock || r.Stock || '0').replace(',', '.')) || 0,
        });
        _produits.push(created);
        counts.produits++;
      } catch (err) {
        errors.push('Produit ' + ref + ' : ' + err.message);
      }
    }
  }

  /* ── RECETTES ──
     Format CSV : produit_ref, produit_nom, produit_prix, article_ref, quantite
     Regroupement par produit_ref — 1 produit créé, N lignes recette insérées.
     Si le produit existe déjà (même ref), on met à jour sa recette uniquement.
  ── */
  if (_massLoaded.recettes) {
    /* Recharger les articles et produits pour avoir les UUIDs à jour */
    const articlesDB = _articles.length ? _articles : await getArticles();
    const produitsDB = _produits.length ? _produits : await getProduits();

    /* Regrouper les lignes par produit_ref */
    const parProduit = {};
    for (const r of _massLoaded.recettes.rows) {
      const prodRef = String(r.produit_ref || '').trim();
      const artRef  = String(r.article_ref || '').trim();
      if (!prodRef || !artRef) continue;
      if (!parProduit[prodRef]) {
        parProduit[prodRef] = {
          nom:   String(r.produit_nom  || r.produit_ref || '').trim(),
          prix:  parseFloat(String(r.produit_prix || '0').replace(',', '.')) || 0,
          lignes: [],
        };
      }
      const art = articlesDB.find(a => a.ref === artRef);
      if (!art) {
        errors.push(`Recette ${prodRef} : article "${artRef}" introuvable — vérifiez la ref`);
        continue;
      }
      const qte = parseFloat(String(r.quantite || r.qte || '0').replace(',', '.')) || 0;
      if (qte <= 0) continue;
      parProduit[prodRef].lignes.push({ article_id: art.id, quantite: qte, unite: art.unite });
    }

    /* Pour chaque produit : créer si absent, puis sauvegarder la recette */
    for (const [prodRef, infos] of Object.entries(parProduit)) {
      if (!infos.lignes.length) continue;
      try {
        let produit = produitsDB.find(p => p.ref === prodRef);
        if (!produit) {
          produit = await createProduit({
            ref:       prodRef,
            nom:       infos.nom,
            prix_vente: infos.prix,
            seuil:     0,
            stock:     0,
          });
          _produits.push(produit);
          counts.produits++;
        }
        await saveRecette(produit.id, infos.lignes);
        counts.recettes++;
      } catch (err) {
        errors.push(`Recette ${prodRef} : ${err.message}`);
      }
    }
  }

  /* ── CLIENTS ── */
  if (_massLoaded.clients) {
    for (const r of _massLoaded.clients.rows) {
      const nom = String(r.nom || r.Nom || '').trim();
      if (!nom) continue;
      if (_clients.find(c => c.nom === nom)) continue;
      try {
        const created = await createClient({
          nom,
          email:   String(r.email   || r.Email   || '').trim(),
          tel:     String(r.tel     || r.Tel     || r.Téléphone || '').trim(),
          adresse: String(r.adresse || r.Adresse || '').trim(),
          notes:   String(r.notes   || r.Notes   || '').trim(),
        });
        _clients.push(created);
        counts.clients++;
      } catch (err) {
        errors.push('Client ' + nom + ' : ' + err.message);
      }
    }
  }

  /* ── FOURNISSEURS ── */
  if (_massLoaded.fournisseurs) {
    for (const r of _massLoaded.fournisseurs.rows) {
      const nom = String(r.nom || r.Nom || '').trim();
      if (!nom) continue;
      if (_fournisseurs.find(f => f.nom === nom)) continue;
      try {
        const created = await createFournisseur({
          nom,
          contact:   String(r.contact   || r.Contact   || '').trim(),
          email:     String(r.email     || r.Email     || '').trim(),
          tel:       String(r.tel       || r.Tel       || '').trim(),
          adresse:   String(r.adresse   || r.Adresse   || '').trim(),
          delai:     String(r.delai     || r.Délai     || '').trim(),
          categorie: String(r.categorie || r.Catégorie || '').trim().toLowerCase(),
        });
        _fournisseurs.push(created);
        counts.fournisseurs++;
      } catch (err) {
        errors.push('Fournisseur ' + nom + ' : ' + err.message);
      }
    }
  }

  /* ── COMMANDES ──
     Format CSV : commande_ref, client_nom, date_cmd, date_livraison, produit_ref, quantite, prix_unitaire
     Regroupement par commande_ref — 1 commande créée, N lignes insérées.
     Le client est créé automatiquement s'il n'existe pas.
  ── */
  if (_massLoaded.commandes) {
    const produitsDB = _produits.length ? _produits : await getProduits();
    const clientsDB  = _clients.length  ? _clients  : await getClients();
    const commandesDB = await getCommandes();

    /* Regrouper par commande_ref */
    const parCommande = {};
    for (const r of _massLoaded.commandes.rows) {
      const cmdRef    = String(r.commande_ref || r.ref || '').trim();
      const prodRef   = String(r.produit_ref  || '').trim();
      const clientNom = String(r.client_nom   || r.client || '').trim();
      if (!cmdRef || !prodRef || !clientNom) continue;

      if (!parCommande[cmdRef]) {
        parCommande[cmdRef] = {
          client_nom:     clientNom,
          date_cmd:       String(r.date_cmd  || r.date || today()).trim(),
          date_livraison: String(r.date_livraison || '').trim() || null,
          statut:         'a_produire',
          notes:          String(r.notes || '').trim(),
          lignes: [],
        };
      }

      const produit = produitsDB.find(p => p.ref === prodRef);
      if (!produit) {
        errors.push(`Commande ${cmdRef} : produit "${prodRef}" introuvable — vérifiez la ref`);
        continue;
      }

      const qte  = parseFloat(String(r.quantite || r.qte || '1').replace(',', '.')) || 1;
      const prix = parseFloat(String(r.prix_unitaire || r.prix || '0').replace(',', '.'))
                   || produit.prix_vente || produit.prix || 0;

      parCommande[cmdRef].lignes.push({
        produit_id:    produit.id,
        produit_nom:   produit.nom,
        quantite:      qte,
        prix_unitaire: prix,
      });
    }

    /* Créer chaque commande */
    for (const [cmdRef, infos] of Object.entries(parCommande)) {
      if (!infos.lignes.length) continue;
      /* Ignorer si la commande existe déjà */
      if (commandesDB.find(c => c.ref === cmdRef)) {
        errors.push(`Commande ${cmdRef} : déjà existante, ignorée`);
        continue;
      }
      try {
        /* Créer le client s'il n'existe pas */
        let client = clientsDB.find(c => c.nom === infos.client_nom);
        if (!client) {
          client = await createClient({ nom: infos.client_nom });
          _clients.push(client);
        }

        await createCommande({
          ref:            cmdRef,
          client_id:      client.id,
          client_nom:     infos.client_nom,
          date_cmd:       infos.date_cmd,
          date_livraison: infos.date_livraison,
          statut:         infos.statut,
          notes:          infos.notes,
        }, infos.lignes);

        counts.commandes++;
      } catch (err) {
        errors.push(`Commande ${cmdRef} : ${err.message}`);
      }
    }
  }

  /* ── Résultat ── */
  _massLoaded = {};
  if (btn) { btn.disabled = false; btn.textContent = '📥 Importer'; }

  closeModal('modalImportMasse');

  /* Rafraîchir l'affichage */
  _renderArticles();
  _renderProduits();
  _renderClients();
  _renderFournisseurs();

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  if (errors.length > 0) {
    showToast(`⚠ ${total} importés, ${errors.length} erreur(s). Voir console.`, 'warn');
    errors.forEach(e => console.warn('[Import]', e));
  } else {
    showToast(
      `✅ Import terminé : ${counts.articles} articles, ${counts.produits} produits, ` +
      `${counts.recettes} recettes, ${counts.clients} clients, ` +
      `${counts.fournisseurs} fournisseurs, ${counts.commandes} commandes.`
    );
  }

  /* Notifier tous les modules qu'un import a eu lieu
     → chaque module écoute appmee:datachanged et recharge ses données */
  const entities = [];
  if (counts.articles  > 0) entities.push('articles');
  if (counts.produits  > 0) entities.push('produits');
  if (counts.recettes  > 0) entities.push('recettes');
  if (counts.clients   > 0) entities.push('clients');
  if (counts.fournisseurs > 0) entities.push('fournisseurs');
  if (counts.commandes > 0) entities.push('commandes');

  if (entities.length > 0) {
    /* Un seul événement global couvre tous les modules impactés */
    document.dispatchEvent(new CustomEvent('appmee:datachanged', {
      detail: { entity: 'import_masse', entities }
    }));
  }
}

function _dlTemplate(type) {
  const tpl = {
    articles:     [
      ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'],
      ['A0001', 'Pot verre 50ml', 'emballage', 'unité', '0.45', 'Fournisseur A', '500', '1000'],
      ['A0002', 'Fraises kg', 'matiere', 'kg', '3.50', 'Fournisseur B', '10', '50'],
    ],
    produits:     [
      ['ref', 'nom', 'prix', 'seuil', 'stock'],
      ['P0001', 'Confiture fraise 250g', '5.20', '200', '0'],
      ['P0002', 'Confiture abricot 250g', '4.80', '100', '0'],
    ],
    recettes:     [
      ['produit_ref', 'produit_nom', 'produit_prix', 'article_ref', 'quantite'],
      ['P0001', 'Confiture fraise 250g', '5.20', 'A0001', '1'],
      ['P0001', 'Confiture fraise 250g', '5.20', 'A0002', '0.200'],
      ['P0002', 'Confiture abricot 250g', '4.80', 'A0001', '1'],
    ],
    clients:      [
      ['nom', 'email', 'tel', 'adresse', 'notes'],
      ['Épicerie Martin', 'contact@epicerie.fr', '0556001234', '1 rue du Marché, 47000 Agen', ''],
    ],
    fournisseurs: [
      ['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie'],
      ['Fournisseur A', 'Jean Dupont', 'jean@fournisseur.fr', '0556005678', '10 route de Paris', '5 jours ouvrés', 'emballage'],
    ],
    commandes:    [
      ['commande_ref', 'client_nom', 'date_cmd', 'date_livraison', 'produit_ref', 'quantite', 'prix_unitaire'],
      ['CMD0001', 'Épicerie Martin', '2026-04-01', '2026-04-15', 'P0001', '50', '5.20'],
      ['CMD0001', 'Épicerie Martin', '2026-04-01', '2026-04-15', 'P0002', '30', '4.80'],
      ['CMD0002', 'Bio Marché', '2026-04-02', '2026-04-20', 'P0001', '100', '5.20'],
    ],
  };
  const ws = XLSX.utils.aoa_to_sheet(tpl[type] || []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type);
  XLSX.writeFile(wb, 'appmee_modele_' + type + '.xlsx');
}
