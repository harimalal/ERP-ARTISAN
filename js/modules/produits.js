/* -------------------------------------------------------
   AppMee — modules/produits.js
   Produits finis : affichage, création, recettes.
   Fix S11 — Colonnes : Référence | Produit | Stock | Seuil |
   Statut | Prix vente HT | Coût revient | Marge | Action
   Fix S11 — Boutons Éditer + Supprimer + Règle 17
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getProduits, createProduit, updateProduit,
  deleteProduit, updateProduitStock,
  getRecettesByProduit, saveRecette, getArticles,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, showToast,
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

let _produits  = [];
let _articles  = [];
let _recN      = 0;
let _editProduitId = null;

/* Guard Règle 17 */
let _delegationBound = false;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_produits, _articles] = await Promise.all([getProduits(), getArticles()]);
  _bindNewProduitForm();

  /* Règle 17 — délégation document, posée une seule fois */
  if (!_delegationBound) {
    _delegationBound = true;
    document.addEventListener('click', async (e) => {
      const tbody = document.getElementById('produitsTbody');
      if (!tbody) return;

      /* Bouton Éditer */
      const btnEdit = e.target.closest('#produitsTbody [data-action="editer"]');
      if (btnEdit) {
        e.stopPropagation();
        const ref = btnEdit.dataset.ref;
        const p = _produits.find(x => x.ref === ref);
        if (p) {
          document.dispatchEvent(new CustomEvent('appmee:editProduit', { detail: { produitId: p.id } }));
        }
        return;
      }

      /* Bouton Supprimer */
      const btnDel = e.target.closest('#produitsTbody [data-action="supprimer"]');
      if (btnDel) {
        e.stopPropagation();
        await _supprimerProduit(btnDel.dataset.id);
        return;
      }

      /* Bouton Produire */
      const btnProd = e.target.closest('#produitsTbody [data-action="produire"]');
      if (btnProd) {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: btnProd.dataset.ref } }));
        openModal('modalPlanifier');
        return;
      }
    }, true);
  }
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _produits = await getProduits();
  _renderTable();
}

/* -------------------------------------------------------
   TABLE — colonnes :
   Référence | Produit | Stock | Seuil | Statut |
   Prix vente HT | Coût revient | Marge | Action
------------------------------------------------------- */
function _renderTable() {
  const filtre = document.getElementById('produitsSearchInput')?.value?.toLowerCase() || '';
  const liste  = filtre
    ? _produits.filter(p => p.nom.toLowerCase().includes(filtre) || p.ref.toLowerCase().includes(filtre))
    : _produits;

  document.getElementById('produitsTbody').innerHTML = liste.map(p => {
    const cout  = p.cout || 0;
    const prix  = p.prix_vente || p.prix || 0;
    const marge = prix - cout;
    const tx    = cout > 0 ? (marge / cout * 100).toFixed(0) : '—';
    return `<tr>
      <td class="td-ref">${esc(p.ref)}</td>
      <td class="td-bold">${esc(p.nom)}</td>
      <td><strong>${p.stock}</strong></td>
      <td>${p.seuil}</td>
      <td>${stockStatus(p.stock, p.seuil)}</td>
      <td style="font-weight:600">${fmt(prix)} €</td>
      <td>${fmt(cout)} €</td>
      <td style="color:var(--ui-green);font-weight:600">
        ${fmt(marge)} € <span style="color:var(--ink-muted);font-weight:400;font-size:10px;">(${tx}%)</span>
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" data-ref="${esc(p.ref)}" data-action="editer" title="Éditer">✏</button>
        <button class="btn btn-outline btn-sm" data-ref="${esc(p.ref)}" data-action="produire" title="Planifier OF">▶</button>
        <button class="btn btn-danger btn-xs" data-id="${esc(p.id)}" data-action="supprimer" title="Supprimer">✕</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun produit.</td></tr>';
}

/* -------------------------------------------------------
   SUPPRESSION
------------------------------------------------------- */
async function _supprimerProduit(id) {
  const ok = await confirmDialog('Supprimer ce produit définitivement ?');
  if (!ok) return;
  try {
    await deleteProduit(id);
    _produits = _produits.filter(p => p.id !== id);
    _renderTable();
    showToast('✅ Produit supprimé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    showToast('❌ Erreur suppression produit.', 'error');
    console.error('[produits] _supprimerProduit ERREUR:', err.message, err);
  }
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEAU PRODUIT + RECETTE
------------------------------------------------------- */
function _bindNewProduitForm() {
  document.getElementById('btnAddRecetteLigne')?.addEventListener('click', _addRecetteLigne);
  document.getElementById('btnSaveNewProduit')?.addEventListener('click', _handleSave);
}

export async function initNewProduitModal(editProduit = null) {
  _recN = 0;
  _editProduitId = editProduit ? editProduit.id : null;

  try { _articles = await getArticles(); } catch (_) {}
  try { _produits = await getProduits(); } catch (_) {}

  document.getElementById('modalNewProduitTitle').textContent =
    editProduit ? '✏ Modifier — ' + editProduit.nom : '🏷 Nouveau produit fini & recette';

  const refInput = document.getElementById('npRef');
  if (editProduit) {
    refInput.value    = editProduit.ref;
    refInput.readOnly = true;
    refInput.style.opacity = '0.6';
  } else {
    refInput.value    = nextRef('P', _produits);
    refInput.readOnly = false;
    refInput.style.opacity = '1';
  }

  document.getElementById('npNom').value   = editProduit ? editProduit.nom : '';
  document.getElementById('npPrix').value  = editProduit ? (editProduit.prix_vente || editProduit.prix || '') : '';
  document.getElementById('npSeuil').value = editProduit ? editProduit.seuil : '';

  /* Recette */
  document.getElementById('recetteLignes').innerHTML = '';
  document.getElementById('npCoutPreview').style.display = 'none';

  if (editProduit) {
    try {
      const lignes = await getRecettesByProduit(editProduit.id);
      for (const l of lignes) {
        _addRecetteLigne(l);
      }
    } catch (_) {}
  } else {
    _addRecetteLigne();
  }
}

function _handleSave() {
  if (_editProduitId) {
    _saveEditProduit();
  } else {
    _saveNewProduit();
  }
}

function _addRecetteLigne(prefill = null) {
  _recN++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 80px auto;gap:7px;margin-bottom:7px;align-items:center;';
  const opts = _articles.map(a =>
    `<option value="${esc(a.id)}" ${prefill && a.id === prefill.article_id ? 'selected' : ''}>${esc(a.ref)} — ${esc(a.nom)}</option>`
  ).join('');
  div.innerHTML = `
    <select class="rr">${opts}</select>
    <input type="number" class="rq" placeholder="Qté" min="0.001" step="0.001" value="${prefill ? prefill.quantite : ''}">
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;" type="button">×</button>`;
  div.querySelector('button').addEventListener('click', () => { div.remove(); _updateCoutPreview(); });
  div.querySelector('.rr').addEventListener('change', _updateCoutPreview);
  div.querySelector('.rq').addEventListener('input', _updateCoutPreview);
  document.getElementById('recetteLignes').appendChild(div);
  _updateCoutPreview();
}

function _updateCoutPreview() {
  const lignes = _collectLignesRecette();
  const cout = lignes.reduce((s, l) => {
    const a = _articles.find(x => x.id === l.article_id);
    return s + (a ? a.prix * l.quantite : 0);
  }, 0);
  const el = document.getElementById('npCoutPreview');
  const valEl = document.getElementById('npCoutVal');
  if (el && valEl) {
    el.style.display = cout > 0 ? 'block' : 'none';
    valEl.textContent = fmt(cout) + ' €';
  }
}

async function _saveNewProduit() {
  const ref   = document.getElementById('npRef').value.trim();
  const nom   = document.getElementById('npNom').value.trim();
  const prix  = parseFloat(document.getElementById('npPrix').value) || 0;
  const seuil = parseInt(document.getElementById('npSeuil').value) || 100;

  if (!ref || !nom) { showToast('⚠ Référence et nom requis.', 'error'); return; }

  try { _produits = await getProduits(); } catch (_) {}
  if (_produits.find(p => p.ref === ref)) {
    showToast('⚠ Référence déjà existante.', 'error');
    return;
  }

  const lignes = _collectLignesRecette();
  const cout = lignes.reduce((s, l) => {
    const a = _articles.find(x => x.id === l.article_id);
    return s + (a ? a.prix * l.quantite : 0);
  }, 0);

  const btn = document.getElementById('btnSaveNewProduit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    const produit = await createProduit({ ref, nom, prix_vente: prix, seuil, stock: 0 });
    if (lignes.length) await saveRecette(produit.id, lignes);
    _produits.push({ ...produit, cout });
    closeModal('modalNewProduit');
    _renderTable();
    showToast('✅ Produit ' + ref + ' créé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    showToast('❌ Erreur création produit : ' + err.message, 'error');
    console.error('[produits] _saveNewProduit ERREUR:', err.message, err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
}

async function _saveEditProduit() {
  if (!_editProduitId) return;
  const nom   = document.getElementById('npNom').value.trim();
  const prix  = parseFloat(document.getElementById('npPrix').value) || 0;
  const seuil = parseInt(document.getElementById('npSeuil').value) || 100;
  if (!nom) { showToast('⚠ Le nom est requis.', 'error'); return; }

  const lignes = _collectLignesRecette();
  const cout = lignes.reduce((s, l) => {
    const a = _articles.find(x => x.id === l.article_id);
    return s + (a ? a.prix * l.quantite : 0);
  }, 0);

  const btn = document.getElementById('btnSaveNewProduit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    await updateProduit(_editProduitId, { nom, prix_vente: prix, seuil });
    await saveRecette(_editProduitId, lignes);
    const idx = _produits.findIndex(p => p.id === _editProduitId);
    if (idx >= 0) Object.assign(_produits[idx], { nom, prix_vente: prix, seuil, cout });
    closeModal('modalNewProduit');
    _renderTable();
    showToast('✅ Produit mis à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    showToast('❌ Erreur mise à jour produit : ' + err.message, 'error');
    console.error('[produits] _saveEditProduit ERREUR:', err.message, err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
}

function _collectLignesRecette() {
  const lignes = [];
  document.querySelectorAll('#recetteLignes > div').forEach(div => {
    const articleId = div.querySelector('.rr')?.value;
    const q         = parseFloat(div.querySelector('.rq')?.value);
    if (articleId && q > 0) lignes.push({ article_id: articleId, quantite: q, unite: null });
  });
  return lignes;
}

/* -------------------------------------------------------
   RECHERCHE
------------------------------------------------------- */
export function bindSearchInput() {
  document.getElementById('produitsSearchInput')?.addEventListener('input', () => _renderTable());
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getProduitsCache() { return _produits; }
export function getProduitByRef(ref) { return _produits.find(p => p.ref === ref) || null; }
