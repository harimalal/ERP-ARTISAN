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
  createImportScanItem, getImportScanItems, updateImportScanItem, deleteImportScanItems,
  getOnboardingIAUtilise, markOnboardingIAUtilise,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, badgeCmd, showToast,
  openModal, closeModal, filterTable, today, confirmDialog,
} from '../ui.js';
import { getSession, getTenantId } from '../auth.js';
import { API } from '../config.js';

/* Cache local */
let _tenant       = {};
let _articles     = [];
let _produits     = [];
let _clients      = [];
let _fournisseurs = [];

let _editType = null;
let _editId   = null;
let _ficheClientId      = null;
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
  _bindImportIA();
  _bindImportAvance();
  _bindSearchInputs();
  document.getElementById('btnSupprimerDoublons')?.addEventListener('click', _ouvrirSuppressionDoublons);
  document.getElementById('doublonsBtnSupprimer')?.addEventListener('click', _supprimerDoublonsSelection);
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
   Fix I — recharger _tenant dans le cache après save
------------------------------------------------------- */
const FORME_LABELS = { EI: 'Entreprise Individuelle', EIRL: 'EIRL', SASU: 'SASU', SARL: 'SARL', SAS: 'SAS', autre: 'Autre' };

function _renderEntreprise() {
  const me = _tenant || {};
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = me[key] || '—'; };
  set('me_raison', 'nom'); set('me_siret', 'siret'); set('me_tva', 'tva');
  set('me_adresse', 'adresse'); set('me_tel', 'tel'); set('me_email', 'email');
  set('me_web', 'site'); set('me_iban', 'iban'); set('me_cpt', 'cpt_paiement');
  const forme = document.getElementById('me_forme');
  if (forme) forme.textContent = FORME_LABELS[me.forme] || '—';
  const tauxTva = document.getElementById('me_taux_tva');
  if (tauxTva) tauxTva.textContent = (me.taux_tva != null ? me.taux_tva : 20) + ' %';
}

function _bindEntrepriseForm() {
  document.getElementById('cardEntreprise')?.addEventListener('click', () => _editRow('entreprise', 'entreprise'));
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
   Fix B5 — client et fournisseur : formulaire complet
   (tous les champs, pas juste le nom)
------------------------------------------------------- */
function _editRow(type, id) {
  _editType = type;
  _editId   = id;

  const labels = {
    article:     '📦 Modifier l\'article',
    produit:     '🏷 Modifier le produit',
    client:      '👤 Modifier le client',
    fournisseur: '🏪 Modifier le fournisseur',
    entreprise:  '🏢 Modifier mon entreprise',
  };
  document.getElementById('editRowTitle').textContent = labels[type] || 'Modifier';

  const delBtn = document.getElementById('editRowDeleteBtn');
  if (delBtn) delBtn.style.display = (type === 'entreprise') ? 'none' : '';

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
      <div class="form-group"><label>Stock actuel</label><input type="number" id="er_stock" value="${a.stock}" step="0.01"></div>
      <div class="form-group"><label>Taux TVA (%)</label>
        <select id="er_tva">
          <option value="20" ${(a.taux_tva == null || a.taux_tva == 20) ? 'selected' : ''}>20% — standard</option>
          <option value="10" ${a.taux_tva == 10 ? 'selected' : ''}>10% — intermédiaire</option>
          <option value="5.5" ${a.taux_tva == 5.5 ? 'selected' : ''}>5,5% — réduit</option>
          <option value="2.1" ${a.taux_tva == 2.1 ? 'selected' : ''}>2,1% — presse/médicament</option>
          <option value="0" ${a.taux_tva == 0 ? 'selected' : ''}>0% — exonéré</option>
        </select>
      </div>`;
  } else if (type === 'produit') {
    const p = _produits.find(x => x.id === id);
    html += `
      <div class="form-group"><label>Référence</label><input id="er_ref" value="${esc(p.ref)}" readonly style="background:var(--ui-bg2);"></div>
      <div class="form-group"><label>Nom</label><input id="er_nom" value="${esc(p.nom)}"></div>
      <div class="form-group"><label>Prix vente HT (€)</label><input type="number" id="er_prix" value="${p.prix_vente || p.prix}" step="0.01"></div>
      <div class="form-group"><label>Seuil alerte</label><input type="number" id="er_seuil" value="${p.seuil}"></div>
      <div class="form-group"><label>Stock actuel</label><input type="number" id="er_stock" value="${p.stock}" step="0.01"></div>
      <div class="form-group"><label>Taux TVA (%)</label>
        <select id="er_tva">
          <option value="20" ${(p.taux_tva == null || p.taux_tva == 20) ? 'selected' : ''}>20% — standard</option>
          <option value="10" ${p.taux_tva == 10 ? 'selected' : ''}>10% — intermédiaire</option>
          <option value="5.5" ${p.taux_tva == 5.5 ? 'selected' : ''}>5,5% — réduit</option>
          <option value="2.1" ${p.taux_tva == 2.1 ? 'selected' : ''}>2,1% — presse/médicament</option>
          <option value="0" ${p.taux_tva == 0 ? 'selected' : ''}>0% — exonéré</option>
        </select>
      </div>`;
  } else if (type === 'client') {
    /* Fix B5 — formulaire complet client (tous les champs) */
    const c = _clients.find(x => x.id === id);
    html += `
      <div class="form-group full"><label>Nom</label><input id="er_nom" value="${esc(c.nom || '')}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="er_email" value="${esc(c.email || '')}"></div>
      <div class="form-group"><label>Téléphone</label><input id="er_tel" value="${esc(c.tel || '')}"></div>
      <div class="form-group full"><label>Adresse</label><input id="er_adresse" value="${esc(c.adresse || '')}"></div>
      <div class="form-group full"><label>Notes</label><input id="er_notes" value="${esc(c.notes || '')}"></div>`;
  } else if (type === 'fournisseur') {
    /* Fix B5 — formulaire complet fournisseur (tous les champs) */
    const f = _fournisseurs.find(x => x.id === id);
    html += `
      <div class="form-group full"><label>Nom</label><input id="er_nom" value="${esc(f.nom || '')}"></div>
      <div class="form-group"><label>Contact</label><input id="er_contact" value="${esc(f.contact || '')}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="er_email" value="${esc(f.email || '')}"></div>
      <div class="form-group"><label>Téléphone</label><input id="er_tel" value="${esc(f.tel || '')}"></div>
      <div class="form-group"><label>Délai livraison</label><input id="er_delai" value="${esc(f.delai || '')}"></div>
      <div class="form-group"><label>Catégorie</label>
        <select id="er_categorie">
          <option value="">—</option>
          <option value="emballage"  ${f.categorie === 'emballage'  ? 'selected' : ''}>Emballage</option>
          <option value="matiere"    ${f.categorie === 'matiere'    ? 'selected' : ''}>Matière</option>
          <option value="ingredient" ${f.categorie === 'ingredient' ? 'selected' : ''}>Ingrédient</option>
          <option value="fourniture" ${f.categorie === 'fourniture' ? 'selected' : ''}>Fourniture</option>
        </select>
      </div>`;
  } else if (type === 'entreprise') {
    const me = _tenant || {};
    html += `
      <div class="form-group"><label>Raison sociale</label><input id="er_raison" value="${esc(me.nom || '')}"></div>
      <div class="form-group"><label>SIRET</label><input id="er_siret" value="${esc(me.siret || '')}"></div>
      <div class="form-group"><label>N° TVA</label><input id="er_tva" value="${esc(me.tva || '')}"></div>
      <div class="form-group"><label>Forme juridique</label>
        <select id="er_forme">
          <option value="EI"    ${me.forme === 'EI'    ? 'selected' : ''}>Entreprise Individuelle</option>
          <option value="EIRL"  ${me.forme === 'EIRL'  ? 'selected' : ''}>EIRL</option>
          <option value="SASU"  ${me.forme === 'SASU'  ? 'selected' : ''}>SASU</option>
          <option value="SARL"  ${me.forme === 'SARL'  ? 'selected' : ''}>SARL</option>
          <option value="SAS"   ${me.forme === 'SAS'   ? 'selected' : ''}>SAS</option>
          <option value="autre" ${me.forme === 'autre' ? 'selected' : ''}>Autre</option>
        </select>
      </div>
      <div class="form-group full"><label>Adresse</label><input id="er_adresse" value="${esc(me.adresse || '')}"></div>
      <div class="form-group"><label>Téléphone</label><input id="er_tel" value="${esc(me.tel || '')}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="er_email" value="${esc(me.email || '')}"></div>
      <div class="form-group"><label>Site web</label><input id="er_web" value="${esc(me.site || '')}"></div>
      <div class="form-group full"><label>IBAN (factures)</label><input id="er_iban" value="${esc(me.iban || '')}"></div>
      <div class="form-group"><label>Conditions paiement</label><input id="er_cpt" value="${esc(me.cpt_paiement || '')}"></div>
      <div class="form-group"><label>Taux TVA par défaut (%)</label><input type="number" id="er_taux_tva" value="${me.taux_tva != null ? me.taux_tva : 20}" step="0.1" min="0" max="100"></div>`;
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
        taux_tva:    parseFloat(document.getElementById('er_tva')?.value) ?? 20,
      });
    } else if (_editType === 'produit') {
      await updateProduit(_editId, {
        nom:        document.getElementById('er_nom').value,
        prix_vente: parseFloat(document.getElementById('er_prix').value) || 0,
        seuil:      parseInt(document.getElementById('er_seuil').value) || 0,
        stock:      parseFloat(document.getElementById('er_stock').value) || 0,
        taux_tva:   parseFloat(document.getElementById('er_tva')?.value) ?? 20,
      });
    } else if (_editType === 'client') {
      /* Fix B5 — sauvegarder tous les champs client, pas uniquement le nom */
      await updateClient(_editId, {
        nom:     document.getElementById('er_nom').value.trim(),
        email:   document.getElementById('er_email')?.value.trim()   || '',
        tel:     document.getElementById('er_tel')?.value.trim()     || '',
        adresse: document.getElementById('er_adresse')?.value.trim() || '',
        notes:   document.getElementById('er_notes')?.value.trim()   || '',
      });
    } else if (_editType === 'fournisseur') {
      /* Fix B5 — sauvegarder tous les champs fournisseur, pas uniquement le nom */
      await updateFournisseur(_editId, {
        nom:       document.getElementById('er_nom').value.trim(),
        contact:   document.getElementById('er_contact')?.value.trim()   || '',
        email:     document.getElementById('er_email')?.value.trim()     || '',
        tel:       document.getElementById('er_tel')?.value.trim()       || '',
        delai:     document.getElementById('er_delai')?.value.trim()     || '',
        categorie: document.getElementById('er_categorie')?.value        || '',
      });
    } else if (_editType === 'entreprise') {
      const data = {
        nom:          document.getElementById('er_raison').value,
        siret:        document.getElementById('er_siret').value,
        tva:          document.getElementById('er_tva').value,
        forme:        document.getElementById('er_forme').value,
        adresse:      document.getElementById('er_adresse').value,
        tel:          document.getElementById('er_tel').value,
        email:        document.getElementById('er_email').value,
        site:         document.getElementById('er_web').value,
        iban:         document.getElementById('er_iban').value,
        cpt_paiement: document.getElementById('er_cpt').value,
        taux_tva:     parseFloat(document.getElementById('er_taux_tva')?.value) || 20,
      };
      await updateTenant(data);
      Object.assign(_tenant, data);
    }
    closeModal('modalEditRow');
    await render();
    showToast('✅ Modifications enregistrées.');
  } catch (err) {
    console.error('[admin] _saveEditRow ERREUR:', err.message, err);
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
   Fix J — mettre à jour TOUS les champs du cache après save
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
    const changes = {
      nom:     document.getElementById('fc_nom').value.trim(),
      siret:   document.getElementById('fc_siret')?.value.trim() || '',
      email:   document.getElementById('fc_email').value.trim(),
      tel:     document.getElementById('fc_tel').value.trim(),
      adresse: document.getElementById('fc_adresse').value.trim(),
      contact: document.getElementById('fc_contact')?.value.trim() || '',
      cpt:     document.getElementById('fc_cpt')?.value.trim()     || '',
      notes:   document.getElementById('fc_notes').value.trim(),
    };
    if (!changes.nom) { showToast('⚠ Le nom est requis.', 'error'); return; }
    try {
      await updateClient(_ficheClientId, changes);
      const idx = _clients.findIndex(c => c.id === _ficheClientId);
      if (idx >= 0) Object.assign(_clients[idx], changes);
      closeModal('modalFicheClient');
      _renderClients();
      showToast('✅ Fiche client enregistrée.');
    } catch (err) {
      console.error('[admin] saveFicheClient ERREUR:', err.message, err);
      showToast('❌ Erreur enregistrement client.', 'error');
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
      showToast('✅ Client supprimé.');
    } catch (err) {
      showToast('❌ Erreur suppression.', 'error');
    }
  });
}

/* -------------------------------------------------------
   FICHE FOURNISSEUR
   Fix K — mettre à jour TOUS les champs du cache après save
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
    const changes = {
      nom:       document.getElementById('ff_nom').value.trim(),
      contact:   document.getElementById('ff_contact').value.trim(),
      email:     document.getElementById('ff_email').value.trim(),
      tel:       document.getElementById('ff_tel').value.trim(),
      adresse:   document.getElementById('ff_adresse').value.trim(),
      delai:     document.getElementById('ff_delai').value.trim(),
      categorie: document.getElementById('ff_categorie').value,
      iban:      document.getElementById('ff_iban').value.trim(),
      notes:     document.getElementById('ff_notes').value.trim(),
    };
    if (!changes.nom) { showToast('⚠ Le nom est requis.', 'error'); return; }
    try {
      await updateFournisseur(_ficheFournisseurId, changes);
      const idx = _fournisseurs.findIndex(f => f.id === _ficheFournisseurId);
      if (idx >= 0) Object.assign(_fournisseurs[idx], changes);
      closeModal('modalFicheFournisseur');
      _renderFournisseurs();
      showToast('✅ Fiche fournisseur enregistrée.');
    } catch (err) {
      console.error('[admin] saveFicheFournisseur ERREUR:', err.message, err);
      showToast('❌ Erreur enregistrement fournisseur.', 'error');
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
      showToast('✅ Fournisseur supprimé.');
    } catch (err) {
      showToast('❌ Erreur suppression.', 'error');
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
------------------------------------------------------- */
export async function exporterTout() {
  showToast('⏳ Préparation de l\'export…');
  try {
    const [articles, produits, clients, fournisseurs,
           commandes, achats, factures, ofs, mouvements] = await Promise.all([
      getArticles(), getProduits(), getClients(), getFournisseurs(),
      getCommandes(), getAchats(), getFactures(), getAllOFs(),
      getMouvements(),
    ]);

    const exports = [
      { nom: 'articles',      data: articles,      colonnes: ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'] },
      { nom: 'produits',      data: produits,      colonnes: ['ref', 'nom', 'prix_vente', 'seuil', 'stock'] },
      { nom: 'clients',       data: clients,       colonnes: ['nom', 'email', 'tel', 'adresse', 'notes'] },
      { nom: 'fournisseurs',  data: fournisseurs,  colonnes: ['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie', 'iban'] },
      { nom: 'commandes',     data: commandes,     colonnes: ['ref', 'client_nom', 'date_cmd', 'date_livraison', 'statut', 'notes'] },
      {
        nom: 'commandes_lignes',
        data: commandes.flatMap(c => (c.commande_lignes || []).map(l => ({
          commande_ref: c.ref, client_nom: c.client_nom, date_cmd: c.date_cmd,
          produit_nom: l.produit_nom, quantite: l.quantite,
          prix_unitaire: l.prix_unitaire, total_ht: l.total_ht || (l.quantite * l.prix_unitaire),
        }))),
        colonnes: ['commande_ref', 'client_nom', 'date_cmd', 'produit_nom', 'quantite', 'prix_unitaire', 'total_ht'],
      },
      { nom: 'achats',        data: achats,        colonnes: ['ref', 'article_nom', 'quantite', 'prix_unitaire', 'montant_ht', 'fournisseur', 'date_cmd', 'statut', 'ref_commande'] },
      { nom: 'factures',      data: factures,      colonnes: ['ref', 'client_nom', 'date_facture', 'montant_ht', 'taux_tva', 'montant_ttc', 'statut'] },
      { nom: 'production_of', data: ofs,           colonnes: ['ref', 'produit_nom', 'quantite', 'date_prevue', 'statut', 'notes'] },
      { nom: 'mouvements',    data: mouvements,    colonnes: ['created_at', 'type', 'ref', 'nom', 'qte', 'motif', 'ref_doc'] },
    ];

    let nbFichiers = 0;
    for (const exp of exports) {
      if (!exp.data || !exp.data.length) continue;
      const csv = _genererCSV(exp.data, exp.colonnes);
      _telechargerCSV(csv, `arteasy_${exp.nom}_${today()}.csv`);
      nbFichiers++;
      await new Promise(r => setTimeout(r, 300));
    }
    showToast(`✅ ${nbFichiers} fichiers CSV exportés.`);
  } catch (err) {
    console.error('[Export]', err);
    showToast('❌ Erreur lors de l\'export.', 'error');
  }
}

function _genererCSV(data, colonnes) {
  const escape = (val) => {
    const s = String(val === null || val === undefined ? '' : val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = colonnes.join(',');
  const rows   = data.map(row => colonnes.map(col => escape(row[col] ?? '')).join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

function _telechargerCSV(contenu, nomFichier) {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------
   DÉTECTION DÉTERMINISTE DES ANCIENS MODÈLES
   Si un fichier Excel/CSV matche déjà un modèle connu,
   il saute l'IA — zéro risque, zéro coût.
------------------------------------------------------- */
const _MODELES_CONNUS = {
  articles:     ['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'],
  produits:     ['ref', 'nom', 'prix', 'seuil', 'stock'],
  clients:      ['nom', 'email', 'tel', 'adresse', 'notes'],
  fournisseurs: ['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie'],
};

function _normaliserHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function _detecterTypeModele(headers) {
  const normalises = (headers || []).map(_normaliserHeader).sort();
  for (const [type, colonnes] of Object.entries(_MODELES_CONNUS)) {
    const attendu = [...colonnes].sort();
    if (normalises.length === attendu.length && normalises.every((h, i) => h === attendu[i])) {
      return type;
    }
  }
  return null;
}

/* -------------------------------------------------------
   DÉDOUBLONNAGE DÉTERMINISTE
   Jamais laissé à l'IA — comparaison floue sur le nom,
   confirmation par un champ clé (email/tel/siret/ref).
------------------------------------------------------- */
function _normaliserNom(nom) {
  return String(nom || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

const _CLES_FORTES = {
  client:      ['siret'],
  fournisseur: ['siret', 'iban'],
  article:     [],
  produit:     [],
};
const _CLES_FAIBLES = {
  client:      ['email', 'tel'],
  fournisseur: ['email'],
  article:     [],
  produit:     [],
};

const _COLLECTIONS = { client: 'clients', fournisseur: 'fournisseurs', article: 'articles', produit: 'produits' };

function _matchEntiteExistante(entite, existants) {
  const collection = existants[_COLLECTIONS[entite.type]] || [];
  const nomCible    = _normaliserNom(entite.champs.nom);

  if (!nomCible && entite.type !== 'article' && entite.type !== 'produit') {
    return { statut: 'nouveau', correspondance: null };
  }

  const refCible = _normaliserNom(entite.champs.ref);

  for (const existant of collection) {
    const refExistant = _normaliserNom(existant.ref);
    if ((entite.type === 'article' || entite.type === 'produit') && refCible && refExistant && refCible === refExistant) {
      return { statut: 'existant', correspondance: existant };
    }

    const cleForteConfirmee = (_CLES_FORTES[entite.type] || []).some(champ => {
      const v1 = _normaliserNom(entite.champs[champ]);
      const v2 = _normaliserNom(existant[champ]);
      return v1 && v2 && v1 === v2;
    });

    if (cleForteConfirmee) {
      return { statut: 'existant', correspondance: existant };
    }

    const nomExistant = _normaliserNom(existant.nom);
    const nomProche    = nomCible && nomExistant && (nomCible === nomExistant || nomExistant.includes(nomCible) || nomCible.includes(nomExistant));
    if (!nomProche) continue;

    const cleFaibleConfirmee = (_CLES_FAIBLES[entite.type] || []).some(champ => {
      const v1 = _normaliserNom(entite.champs[champ]);
      const v2 = _normaliserNom(existant[champ]);
      return v1 && v2 && v1 === v2;
    });

    if (cleFaibleConfirmee) {
      return { statut: 'existant', correspondance: existant };
    }

    return { statut: 'ambigu', correspondance: existant };
  }

  return { statut: 'nouveau', correspondance: null };
}

/* -------------------------------------------------------
   SCAN IA — ORCHESTRATION (Étape 2)
   Concurrence limitée, écriture progressive en staging
   pour survivre à un incident pendant un lot long.
------------------------------------------------------- */
const _CONCURRENCE_MAX = 3;
let _scanEnCours = false;

async function _lireFichierBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Lecture fichier échouée : ' + file.name));
    reader.readAsDataURL(file);
  });
}

function _serialiserLignesTexte(onglets, maxLignesParOnglet = 300) {
  const noms = Object.keys(onglets);
  if (!noms.length) return '(fichier vide, aucune ligne détectée)';
  return noms.map(nom => {
    const rows = onglets[nom];
    const tronque = rows.length > maxLignesParOnglet;
    const lignes = rows.slice(0, maxLignesParOnglet).map(row =>
      Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ')
    );
    return `--- Onglet "${nom}" (${rows.length} ligne(s)) ---\n` + lignes.join('\n') +
      (tronque ? `\n… (${rows.length - maxLignesParOnglet} lignes supplémentaires non incluses dans cet onglet)` : '');
  }).join('\n\n');
}

const _EXT_TABULAIRE = ['xlsx', 'xls', 'csv'];

async function _scannerFichierIA(file, batchId, onProgress) {
  const extension = file.name.split('.').pop().toLowerCase();
  try {
    const session = await getSession();
    const isTabulaire = _EXT_TABULAIRE.includes(extension);
    const payload = { extension, tenantId: getTenantId(), token: session.access_token };

    if (isTabulaire) {
      const onglets = await _lireOngletsFichier(file, extension);
      payload.texte = _serialiserLignesTexte(onglets);
    } else {
      payload.fichier = await _lireFichierBase64(file);
    }

    const resp = await fetch(API.aiExtractDoc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (!data.ok) {
      onProgress({ fichier: file.name, statut: 'echec', message: data.error });
      return;
    }

    for (const entite of data.entites) {
      await createImportScanItem({
        batch_id:       batchId,
        fichier_nom:    file.name,
        page_source:    entite.page_source,
        type_entite:    entite.type,
        champs:         entite.champs,
        confiance:      entite.confiance,
        statut:         'a_creer',
        extrait_source: entite.extrait_source,
      });
    }

    onProgress({ fichier: file.name, statut: 'termine', nbEntites: data.entites.length, avertissements: data.avertissements });
  } catch (err) {
    console.error('[admin] _scannerFichierIA ERREUR:', err.message, err.stack);
    onProgress({ fichier: file.name, statut: 'echec', message: err.message });
  }
}

async function _lancerScanLot(fichiers, batchId, onProgress) {
  let index = 0;
  let traites = 0;
  const total = fichiers.length;

  async function _travailleur() {
    while (index < fichiers.length) {
      const i = index++;
      await _scannerFichierIA(fichiers[i], batchId, (etat) => {
        traites++;
        onProgress({ ...etat, traites, total, pourcentage: Math.round((traites / total) * 100) });
      });
    }
  }

  const travailleurs = Array.from({ length: Math.min(_CONCURRENCE_MAX, fichiers.length) }, () => _travailleur());
  await Promise.all(travailleurs);
}

async function _onFichiersDeposes(fileList) {
  if (_scanEnCours) return;
  _scanEnCours = true;

  try {
    const fichiers = Array.from(fileList);
    const TAILLE_MAX = 15 * 1024 * 1024;
    const EXT_OK = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'xlsx', 'xls', 'csv'];

    const rejetes = [];
    const accepted = fichiers.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!EXT_OK.includes(ext)) { rejetes.push({ nom: f.name, raison: 'format non supporté' }); return false; }
      if (f.size > TAILLE_MAX) { rejetes.push({ nom: f.name, raison: 'fichier trop volumineux (>15 Mo)' }); return false; }
      return true;
    });

    if (rejetes.length) _afficherFichiersRejetes(rejetes);
    if (!accepted.length) return;

    const excelDirects = [];
    const aScannerIA   = [];

    for (const f of accepted) {
      const ext = f.name.split('.').pop().toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') { aScannerIA.push(f); continue; }
      try {
        const headers = await _lireHeadersFichier(f, ext);
        const type = _detecterTypeModele(headers);
        if (type) excelDirects.push({ file: f, type });
        else aScannerIA.push(f);
      } catch { aScannerIA.push(f); }
    }

    if (excelDirects.length) await _importerModelesConnus(excelDirects);

    if (aScannerIA.length) {
      const batchId = crypto.randomUUID();
      const etaitOnboardingDejaUtilise = await getOnboardingIAUtilise();
      _afficherProgressionScan(0, aScannerIA.length);
      await _lancerScanLot(aScannerIA, batchId, (etat) => _afficherProgressionScan(etat.traites, etat.total, etat));
      if (!etaitOnboardingDejaUtilise) await markOnboardingIAUtilise();
      await _deduplicquerLot(batchId);
      await _renderEcranValidation(batchId);
    }
  } catch (err) {
    console.error('[admin] _onFichiersDeposes ERREUR:', err.message, err.stack);
    showToast('⚠ Une erreur est survenue pendant le scan. Réessayez ou rechargez la page si le problème persiste.', 'warn');
  } finally {
    _scanEnCours = false;
  }
}

function _normaliserDatesLigne(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
    return out;
  });
}

function _lireHeadersFichier(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (ext === 'csv') {
          const first = String(e.target.result).split('\n')[0] || '';
          resolve(first.split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, '')));
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const ongletsAvecDonnees = wb.SheetNames.filter(nom => {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1 });
            return rows.length > 0;
          });
          if (ongletsAvecDonnees.length > 1) { resolve([]); return; }
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          resolve(rows[0] || []);
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier échouée'));
    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}

function _lireOngletsFichier(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (ext === 'csv') {
          const lines   = String(e.target.result).split('\n').filter(l => l.trim());
          const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1).map(line => {
            const vals = line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
            const obj  = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
          });
          resolve({ 'Fichier CSV': rows });
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const onglets = {};
          for (const nom of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[nom], { defval: '' });
            if (rows.length) onglets[nom] = _normaliserDatesLigne(rows);
          }
          resolve(onglets);
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier échouée'));
    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}

/* -------------------------------------------------------
   APPLICATION DU DÉDOUBLONNAGE SUR UN LOT (Étape 3)
------------------------------------------------------- */
async function _deduplicquerLot(batchId) {
  const [clients, fournisseurs, articles, produits] = await Promise.all([
    _clients.length ? _clients : getClients(),
    _fournisseurs.length ? _fournisseurs : getFournisseurs(),
    _articles.length ? _articles : getArticles(),
    _produits.length ? _produits : getProduits(),
  ]);
  const existants = { clients, fournisseurs, articles, produits };

  const items = await getImportScanItems(batchId);
  const dejaTraites = { clients: [], fournisseurs: [], articles: [], produits: [] };

  for (const item of items) {
    const cible = { type: item.type_entite, champs: item.champs };
    const contreExistants = _matchEntiteExistante(cible, existants);
    const contreLot        = contreExistants.statut === 'nouveau'
      ? _matchEntiteExistante(cible, dejaTraites)
      : { statut: 'nouveau', correspondance: null };

    let statut = 'a_creer';
    let doublonDeId = null;

    if (contreExistants.statut === 'existant') { statut = 'deja_existant'; doublonDeId = contreExistants.correspondance.id; }
    else if (contreExistants.statut === 'ambigu') { statut = 'doublon_possible'; doublonDeId = contreExistants.correspondance.id; }
    else if (contreLot.statut !== 'nouveau') { statut = 'doublon_possible'; }

    await updateImportScanItem(item.id, { statut, doublon_de_id: doublonDeId });

    if (statut === 'a_creer') {
      dejaTraites[_COLLECTIONS[item.type_entite] || (item.type_entite + 's')].push({ id: item.id, nom: item.champs.nom, ref: item.champs.ref, email: item.champs.email, siret: item.champs.siret, iban: item.champs.iban });
    }
  }
}

/* -------------------------------------------------------
   UI PROGRESSION + VALIDATION + IMPORT FINAL (Étape 4)
------------------------------------------------------- */
function _afficherFichiersRejetes(rejetes) {
  const el = document.getElementById('importRejetes');
  if (!el) return;
  el.style.display = 'flex';
  el.textContent = rejetes.map(r => `${r.nom} : ${r.raison}`).join(' • ');
}

function _afficherProgressionScan(traites, total, etat) {
  const el = document.getElementById('importProgression');
  if (!el) return;
  el.style.display = 'block';
  const pourcentage = total ? Math.round((traites / total) * 100) : 0;
  el.innerHTML = `<div style="font-size:12px;margin-bottom:4px;">Scan en cours : ${traites}/${total} fichiers (${pourcentage}%)${etat?.fichier ? ' — ' + esc(etat.fichier) : ''}</div>
    <div style="background:var(--ui-bg2);border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--ui-green);height:100%;width:${pourcentage}%;transition:width .2s;"></div></div>`;
}

const _LABELS_TYPE = { client: 'Clients', fournisseur: 'Fournisseurs', article: 'Articles', produit: 'Produits' };

async function _renderEcranValidation(batchId) {
  const items = (await getImportScanItems(batchId)).filter(i => i.statut !== 'importe');
  const el = document.getElementById('importValidation');
  if (!el) return;
  el.style.display = 'block';
  el.dataset.batchId = batchId;

  const parType = { client: [], fournisseur: [], article: [], produit: [] };
  for (const item of items) parType[item.type_entite]?.push(item);
  for (const arr of Object.values(parType)) {
    arr.sort((a, b) => (a.champs.nom || a.champs.ref || '').localeCompare(b.champs.nom || b.champs.ref || '', 'fr', { sensitivity: 'base' }));
  }

  el.innerHTML = Object.entries(parType).filter(([, arr]) => arr.length).map(([type, arr]) => {
    const nbDoublons = arr.filter(i => i.statut === 'doublon_possible').length;
    return `
    <div style="margin-top:10px;">
      <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;">${_LABELS_TYPE[type]} détectés : ${arr.length}${nbDoublons ? ` — ${nbDoublons} doublon(s) possible(s)` : ''}</div>
      ${arr.map(item => _renderLigneValidation(item)).join('')}
    </div>`;
  }).join('') || '<p style="font-size:12.5px;color:var(--ink-muted);">Aucune entité détectée dans ce lot.</p>';

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => _traiterActionValidation(btn.dataset.itemId, btn.dataset.action, batchId));
  });

  _majBoutonConfirmer(items);
}

function _renderLigneValidation(item) {
  const enAttente  = item.statut === 'doublon_possible' || (item.confiance === 'basse');
  const dejaConnu  = item.statut === 'deja_existant';
  const couleur    = dejaConnu ? 'var(--ink-muted)' : enAttente ? 'var(--ui-orange, #c77)' : 'var(--ui-green)';
  const nomAffiche = item.champs.nom || item.champs.ref || '(sans nom)';

  return `<div data-item-row="${item.id}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-left:3px solid ${couleur};margin-bottom:4px;font-size:12px;">
    <div>
      <strong>${esc(nomAffiche)}</strong>
      <span style="color:var(--ink-muted);margin-left:6px;">confiance ${item.confiance}${dejaConnu ? ' — déjà existant' : ''}${item.statut === 'doublon_possible' ? ' — doublon possible' : ''}</span>
    </div>
    ${dejaConnu ? '' : `<div style="display:flex;gap:4px;">
      <button class="btn btn-outline btn-sm" data-item-id="${item.id}" data-action="confirmer">✓</button>
      <button class="btn btn-outline btn-sm" data-item-id="${item.id}" data-action="ignorer">✗</button>
    </div>`}
  </div>`;
}

async function _traiterActionValidation(itemId, action, batchId) {
  try {
    const statut = action === 'confirmer' ? 'confirme' : 'ignore';
    await updateImportScanItem(itemId, { statut });
    await _renderEcranValidation(batchId);
  } catch (err) {
    console.error('[admin] _traiterActionValidation ERREUR:', err.message, err.stack);
    showToast('⚠ Action impossible, réessayez.', 'warn');
  }
}

function _majBoutonConfirmer(items) {
  const btn = document.getElementById('importBtnConfirmer');
  if (!btn) return;
  const enAttente = items.some(i => i.statut === 'doublon_possible' || (i.statut === 'a_creer' && i.confiance === 'basse'));
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.textContent = enAttente ? 'Importer (les lignes en attente seront ignorées)' : 'Importer la sélection';
}

async function _confirmerImport(batchId) {
  const btn = document.getElementById('importBtnConfirmer');
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }

  try {
    const items = await getImportScanItems(batchId);
    const aImporter = items.filter(i => i.statut === 'confirme' || (i.statut === 'a_creer' && i.confiance !== 'basse'));

    const counts = { clients: 0, fournisseurs: 0, articles: 0, produits: 0 };
    const errors = [];

    for (const item of aImporter) {
      try {
        if (item.type_entite === 'client' && item.champs.nom) {
          await createClient({ nom: item.champs.nom, siret: item.champs.siret, email: item.champs.email, tel: item.champs.tel, adresse: item.champs.adresse, contact: item.champs.contact, cpt: item.champs.cpt, notes: item.champs.notes });
          counts.clients++;
        } else if (item.type_entite === 'fournisseur' && item.champs.nom) {
          await createFournisseur({ nom: item.champs.nom, siret: item.champs.siret, contact: item.champs.contact, email: item.champs.email, tel: item.champs.tel, adresse: item.champs.adresse, iban: item.champs.iban, delai: item.champs.delai, categorie: (item.champs.categorie || '').toLowerCase() });
          counts.fournisseurs++;
        } else if (item.type_entite === 'article' && item.champs.ref && item.champs.nom) {
          await createArticle({ ref: item.champs.ref, nom: item.champs.nom, categorie: (item.champs.categorie || 'autre').toLowerCase(), unite: item.champs.unite || 'unité', prix: parseFloat(String(item.champs.prix || '0').replace(',', '.')) || 0, fournisseur: item.champs.fournisseur || '', seuil: parseInt(item.champs.seuil || '0') || 0, stock: parseFloat(String(item.champs.stock || '0').replace(',', '.')) || 0 });
          counts.articles++;
        } else if (item.type_entite === 'produit' && item.champs.ref && item.champs.nom) {
          await createProduit({ ref: item.champs.ref, nom: item.champs.nom, prix_vente: parseFloat(String(item.champs.prix || '0').replace(',', '.')) || 0, seuil: parseInt(item.champs.seuil || '0') || 0, stock: parseFloat(String(item.champs.stock || '0').replace(',', '.')) || 0 });
          counts.produits++;
        } else {
          errors.push(`${item.type_entite} ignoré : champ obligatoire manquant`);
          continue;
        }
        await updateImportScanItem(item.id, { statut: 'importe' });
      } catch (err) {
        errors.push(`${item.type_entite} ${item.champs.nom || item.champs.ref} : ${err.message}`);
      }
    }

    if (!errors.length) {
      await deleteImportScanItems(batchId);
      closeModal('modalImportMasse');
    }

    _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();

    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (errors.length) {
      showToast(`⚠ ${total} importés, ${errors.length} erreur(s). Rien n'est perdu, corrigez et relancez l'import. Voir console.`, 'warn');
      errors.forEach(e => console.warn('[ImportIA]', e));
      await _renderEcranValidation(batchId);
    } else {
      showToast(`✅ Import : ${counts.clients} clients, ${counts.fournisseurs} fournisseurs, ${counts.articles} articles, ${counts.produits} produits.`);
    }

    const entities = Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => k);
    if (entities.length) {
      document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'import_ia', entities } }));
    }
  } catch (err) {
    console.error('[admin] _confirmerImport ERREUR:', err.message, err.stack);
    showToast('⚠ Une erreur est survenue pendant l\'import. Réessayez.', 'warn');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Importer la sélection'; }
  }
}

/* -------------------------------------------------------
   IMPORT EN MASSE (XLSX/CSV)
------------------------------------------------------- */
let _massLoaded = {};

function _bindImportIA() {
  const dropzone = document.getElementById('importDropzone');
  const input    = document.getElementById('importFileInput');
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => _onFichiersDeposes(e.target.files));

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--ui-green)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--ui-brd)'; });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--ui-brd)';
    if (e.dataTransfer.files.length) _onFichiersDeposes(e.dataTransfer.files);
  });

  document.getElementById('importBtnConfirmer')?.addEventListener('click', () => {
    const batchId = document.getElementById('importValidation')?.dataset.batchId;
    if (batchId) _confirmerImport(batchId);
  });
}

/* -------------------------------------------------------
   IMPORT AVANCÉ (recettes, commandes) — secours hors IA
   Ces 2 types n'ont pas de détection automatique fiable
   (lignes multiples par entité) ; on garde un accès direct
   par modèle Excel/CSV, en dehors du pipeline IA.
------------------------------------------------------- */
function _bindImportAvance() {
  const toggle = document.getElementById('importAvanceToggle');
  const zone   = document.getElementById('importAvanceZone');
  if (toggle && zone) {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      zone.style.display = zone.style.display === 'none' ? '' : 'none';
    });
  }

  _bindImportAvanceZone('recettes', 'importAvanceRecettesZone', 'importAvanceRecettesInput', 'importAvanceRecettesNom');
  _bindImportAvanceZone('commandes', 'importAvanceCommandesZone', 'importAvanceCommandesInput', 'importAvanceCommandesNom');

  document.getElementById('massBtnImport')?.addEventListener('click', () => {
    if (!_massLoaded.recettes && !_massLoaded.commandes) {
      showToast('⚠ Sélectionne un fichier recettes ou commandes avant d\'importer.', 'warn');
      return;
    }
    _massImport();
  });
}

function _bindImportAvanceZone(type, zoneId, inputId, nomId) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const nomEl = document.getElementById(nomId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) _chargerFichierAvance(type, file, nomEl);
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--ui-green)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--ui-brd)'; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--ui-brd)';
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) _chargerFichierAvance(type, file, nomEl);
  });
}

async function _chargerFichierAvance(type, file, nomEl) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showToast('⚠ Format non supporté — xlsx, xls ou csv attendu.', 'warn');
    return;
  }
  try {
    const rows = await _lireLignesFichier(file, ext);
    _massLoaded[type] = { rows };
    if (nomEl) nomEl.textContent = `${file.name} (${rows.length} lignes)`;
  } catch (err) {
    showToast(`⚠ Lecture du fichier ${type} échouée : ${err.message}`, 'warn');
  }
}

async function _importerModelesConnus(excelDirects) {
  const counts = { clients: 0, fournisseurs: 0, articles: 0, produits: 0 };
  const errors = [];

  for (const { file, type } of excelDirects) {
    const ext  = file.name.split('.').pop().toLowerCase();
    const rows = await _lireLignesFichier(file, ext);

    for (const r of rows) {
      try {
        if (type === 'clients') {
          const nom = String(r.nom || r.Nom || '').trim();
          if (!nom || _clients.find(c => c.nom === nom)) continue;
          const created = await createClient({ nom, email: String(r.email || '').trim(), tel: String(r.tel || '').trim(), adresse: String(r.adresse || '').trim(), notes: String(r.notes || '').trim() });
          _clients.push(created); counts.clients++;
        } else if (type === 'fournisseurs') {
          const nom = String(r.nom || r.Nom || '').trim();
          if (!nom || _fournisseurs.find(f => f.nom === nom)) continue;
          const created = await createFournisseur({ nom, contact: String(r.contact || '').trim(), email: String(r.email || '').trim(), tel: String(r.tel || '').trim(), adresse: String(r.adresse || '').trim(), delai: String(r.delai || '').trim(), categorie: String(r.categorie || '').trim().toLowerCase() });
          _fournisseurs.push(created); counts.fournisseurs++;
        } else if (type === 'articles') {
          const ref = String(r.ref || '').trim();
          const nom = String(r.nom || r.Nom || '').trim();
          if (!ref || !nom || _articles.find(a => a.ref === ref)) continue;
          const created = await createArticle({ ref, nom, categorie: String(r.categorie || 'autre').trim().toLowerCase(), unite: String(r.unite || 'unité').trim(), prix: parseFloat(String(r.prix || '0').replace(',', '.')) || 0, fournisseur: String(r.fournisseur || '').trim(), seuil: parseInt(r.seuil || '0') || 0, stock: parseFloat(String(r.stock || '0').replace(',', '.')) || 0 });
          _articles.push(created); counts.articles++;
        } else if (type === 'produits') {
          const ref = String(r.ref || '').trim();
          const nom = String(r.nom || r.Nom || '').trim();
          if (!ref || !nom || _produits.find(p => p.ref === ref)) continue;
          const created = await createProduit({ ref, nom, prix_vente: parseFloat(String(r.prix || '0').replace(',', '.')) || 0, seuil: parseInt(r.seuil || '0') || 0, stock: parseFloat(String(r.stock || '0').replace(',', '.')) || 0 });
          _produits.push(created); counts.produits++;
        }
      } catch (err) { errors.push(`${type} : ${err.message}`); }
    }
  }

  _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (total) showToast(`✅ ${total} lignes importées directement (format déjà reconnu).`);
  if (errors.length) errors.forEach(e => console.warn('[ImportModeleConnu]', e));
  if (total) document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'import_ia', entities: Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => k) } }));
}

function _lireLignesFichier(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (ext === 'csv') {
          const lines   = String(e.target.result).split('\n').filter(l => l.trim());
          const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/^"|"$/g, ''));
          resolve(lines.slice(1).map(line => {
            const vals = line.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
            const obj  = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
          }));
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(_normaliserDatesLigne(XLSX.utils.sheet_to_json(ws, { defval: '' })));
        }
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Lecture fichier échouée'));
    if (ext === 'csv') reader.readAsText(file, 'UTF-8');
    else reader.readAsArrayBuffer(file);
  });
}

async function _massImport() {
  const counts  = { articles: 0, produits: 0, recettes: 0, clients: 0, fournisseurs: 0, commandes: 0 };
  const errors  = [];
  const btn     = document.getElementById('massBtnImport');
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }

  if (_massLoaded.recettes) {
    const articlesDB = _articles.length ? _articles : await getArticles();
    const produitsDB = _produits.length ? _produits : await getProduits();
    const parProduit = {};
    for (const r of _massLoaded.recettes.rows) {
      const prodRef = String(r.produit_ref || '').trim();
      const artRef  = String(r.article_ref || '').trim();
      if (!prodRef || !artRef) continue;
      if (!parProduit[prodRef]) {
        parProduit[prodRef] = { nom: String(r.produit_nom || prodRef).trim(), prix: parseFloat(String(r.produit_prix || '0').replace(',', '.')) || 0, lignes: [] };
      }
      const art = articlesDB.find(a => a.ref === artRef);
      if (!art) { errors.push(`Recette ${prodRef} : article "${artRef}" introuvable`); continue; }
      const qte = parseFloat(String(r.quantite || r.qte || '0').replace(',', '.')) || 0;
      if (qte <= 0) continue;
      parProduit[prodRef].lignes.push({ article_id: art.id, quantite: qte, unite: art.unite });
    }
    for (const [prodRef, infos] of Object.entries(parProduit)) {
      if (!infos.lignes.length) continue;
      try {
        let produit = produitsDB.find(p => p.ref === prodRef);
        if (!produit) {
          produit = await createProduit({ ref: prodRef, nom: infos.nom, prix_vente: infos.prix, seuil: 0, stock: 0 });
          _produits.push(produit); counts.produits++;
        }
        await saveRecette(produit.id, infos.lignes);
        counts.recettes++;
      } catch (err) { errors.push(`Recette ${prodRef} : ${err.message}`); }
    }
  }

  if (_massLoaded.commandes) {
    const produitsDB  = _produits.length ? _produits : await getProduits();
    const clientsDB   = _clients.length  ? _clients  : await getClients();
    const commandesDB = await getCommandes();
    const parCommande = {};
    for (const r of _massLoaded.commandes.rows) {
      const cmdRef    = String(r.commande_ref || r.ref || '').trim();
      const prodRef   = String(r.produit_ref  || '').trim();
      const clientNom = String(r.client_nom   || r.client || '').trim();
      if (!cmdRef || !prodRef || !clientNom) continue;
      if (!parCommande[cmdRef]) {
        parCommande[cmdRef] = { client_nom: clientNom, date_cmd: String(r.date_cmd || today()).trim(), date_livraison: String(r.date_livraison || '').trim() || null, statut: 'a_produire', notes: String(r.notes || '').trim(), lignes: [] };
      }
      const produit = produitsDB.find(p => p.ref === prodRef);
      if (!produit) { errors.push(`Commande ${cmdRef} : produit "${prodRef}" introuvable`); continue; }
      const qte  = parseFloat(String(r.quantite || '1').replace(',', '.')) || 1;
      const prix = parseFloat(String(r.prix_unitaire || '0').replace(',', '.')) || produit.prix_vente || produit.prix || 0;
      parCommande[cmdRef].lignes.push({ produit_id: produit.id, produit_nom: produit.nom, quantite: qte, prix_unitaire: prix });
    }
    for (const [cmdRef, infos] of Object.entries(parCommande)) {
      if (!infos.lignes.length) continue;
      if (commandesDB.find(c => c.ref === cmdRef)) { errors.push(`Commande ${cmdRef} : déjà existante, ignorée`); continue; }
      try {
        let client = clientsDB.find(c => c.nom === infos.client_nom);
        if (!client) { client = await createClient({ nom: infos.client_nom }); _clients.push(client); }
        await createCommande({ ref: cmdRef, client_id: client.id, client_nom: infos.client_nom, date_cmd: infos.date_cmd, date_livraison: infos.date_livraison, statut: infos.statut, notes: infos.notes }, infos.lignes);
        counts.commandes++;
      } catch (err) { errors.push(`Commande ${cmdRef} : ${err.message}`); }
    }
  }

  _massLoaded = {};
  if (btn) { btn.disabled = false; btn.textContent = '📥 Importer'; }
  closeModal('modalImportMasse');
  _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  if (errors.length > 0) {
    showToast(`⚠ ${total} importés, ${errors.length} erreur(s). Voir console.`, 'warn');
    errors.forEach(e => console.warn('[Import]', e));
  } else {
    showToast(`✅ Import : ${counts.articles} articles, ${counts.produits} produits, ${counts.recettes} recettes, ${counts.clients} clients, ${counts.fournisseurs} fournisseurs, ${counts.commandes} commandes.`);
  }

  const entities = Object.entries(counts).filter(([, v]) => v > 0).map(([k]) => k);
  if (entities.length > 0) {
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'import_masse', entities } }));
  }
}

function _dlTemplate(type) {
  const tpl = {
    articles:     [['ref', 'nom', 'categorie', 'unite', 'prix', 'fournisseur', 'seuil', 'stock'], ['A0001', 'Pot verre 50ml', 'emballage', 'unité', '0.45', 'Fournisseur A', '500', '1000']],
    produits:     [['ref', 'nom', 'prix', 'seuil', 'stock'], ['P0001', 'Confiture fraise 250g', '5.20', '200', '0']],
    recettes:     [['produit_ref', 'produit_nom', 'produit_prix', 'article_ref', 'quantite'], ['P0001', 'Confiture fraise 250g', '5.20', 'A0001', '1'], ['P0001', 'Confiture fraise 250g', '5.20', 'A0002', '0.200']],
    clients:      [['nom', 'email', 'tel', 'adresse', 'notes'], ['Épicerie Martin', 'contact@epicerie.fr', '0556001234', '1 rue du Marché', '']],
    fournisseurs: [['nom', 'contact', 'email', 'tel', 'adresse', 'delai', 'categorie'], ['Fournisseur A', 'Jean Dupont', 'jean@fournisseur.fr', '0556005678', '10 route de Paris', '5 jours ouvrés', 'emballage']],
    commandes:    [['commande_ref', 'client_nom', 'date_cmd', 'date_livraison', 'produit_ref', 'quantite', 'prix_unitaire'], ['CMD0001', 'Épicerie Martin', '2026-04-01', '2026-04-15', 'P0001', '50', '5.20'], ['CMD0001', 'Épicerie Martin', '2026-04-01', '2026-04-15', 'P0002', '30', '4.80']],
  };
  const ws = XLSX.utils.aoa_to_sheet(tpl[type] || []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type);
  XLSX.writeFile(wb, 'arteasy_modele_' + type + '.xlsx');
}

export const _detecterTypeModeleTest = _detecterTypeModele;

/* -------------------------------------------------------
   SUPPRESSION DES DOUBLONS
------------------------------------------------------- */
const _LABELS_TYPE_DOUBLON = { client: 'Client', fournisseur: 'Fournisseur', article: 'Article', produit: 'Produit' };

function _grouperDoublons(collection) {
  const groupes = {};
  for (const item of collection) {
    const cle = _normaliserNom(item.nom);
    if (!cle) continue;
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(item);
  }
  return Object.values(groupes).filter(g => g.length > 1);
}

function _trierParAnciennete(groupe) {
  return [...groupe].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return da - db;
  });
}

async function _ouvrirSuppressionDoublons() {
  const [clients, fournisseurs, articles, produits] = await Promise.all([
    getClients(), getFournisseurs(), getArticles(), getProduits(),
  ]);

  const parType = {
    client:      _grouperDoublons(clients),
    fournisseur: _grouperDoublons(fournisseurs),
    article:     _grouperDoublons(articles),
    produit:     _grouperDoublons(produits),
  };

  const el = document.getElementById('doublonsListe');
  if (!el) return;

  const totalGroupes = Object.values(parType).reduce((s, g) => s + g.length, 0);
  if (!totalGroupes) {
    el.innerHTML = '<p style="font-size:12.5px;color:var(--ink-muted);">Aucun doublon détecté.</p>';
  } else {
    el.innerHTML = Object.entries(parType).filter(([, groupes]) => groupes.length).map(([type, groupes]) => `
      <div style="margin-bottom:14px;">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px;">${_LABELS_TYPE_DOUBLON[type]}s - ${groupes.length} groupe(s) de doublons</div>
        ${groupes.map(groupe => {
          const trie = _trierParAnciennete(groupe);
          return `<div style="border:1px solid var(--ui-brd);border-radius:6px;padding:8px;margin-bottom:6px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:4px;">${esc(trie[0].nom)}</div>
            ${trie.map((entite, i) => `
              <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;padding:2px 0;">
                <input type="checkbox" data-doublon-type="${type}" data-doublon-id="${entite.id}" ${i === 0 ? '' : 'checked'}>
                <span>${i === 0 ? '(a garder par defaut) ' : ''}${esc(entite.email || entite.tel || entite.ref || entite.contact || '')} - cree le ${entite.created_at ? new Date(entite.created_at).toLocaleDateString('fr-FR') : 'date inconnue'}</span>
              </label>`).join('')}
          </div>`;
        }).join('')}
      </div>`).join('');
  }

  const btnSupprimer = document.getElementById('doublonsBtnSupprimer');
  if (btnSupprimer) { btnSupprimer.disabled = !totalGroupes; btnSupprimer.style.opacity = totalGroupes ? '1' : '.5'; }
  openModal('modalDoublons');
}

async function _supprimerDoublonsSelection() {
  const btn = document.getElementById('doublonsBtnSupprimer');
  if (btn) { btn.disabled = true; btn.textContent = 'Suppression…'; }

  const cases = document.querySelectorAll('#doublonsListe input[type="checkbox"]:checked');
  const suppressions = { client: deleteClient, fournisseur: deleteFournisseur, article: deleteArticle, produit: deleteProduit };
  let reussies = 0;
  const echecs = [];

  for (const c of cases) {
    const type = c.dataset.doublonType;
    const id = c.dataset.doublonId;
    try {
      await suppressions[type](id);
      reussies++;
    } catch (err) {
      echecs.push(`${type} : ${err.message}`);
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Supprimer la sélection'; }

  if (echecs.length) {
    showToast(`⚠ ${reussies} supprimé(s), ${echecs.length} impossible(s) — probablement lié(s) à des commandes/achats existants. Voir console.`, 'warn');
    echecs.forEach(e => console.warn('[SuppressionDoublons]', e));
  } else {
    showToast(`✅ ${reussies} doublon(s) supprimé(s).`);
    closeModal('modalDoublons');
  }

  _renderArticles(); _renderProduits(); _renderClients(); _renderFournisseurs();
}
export const _matchEntiteExistanteTest = _matchEntiteExistante;
