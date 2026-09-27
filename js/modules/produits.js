/* -------------------------------------------------------
   AppMee — modules/produits.js
   Produits finis : affichage, création, recettes.
   Fix S11 — Colonnes + Boutons + Règle 17
   Fix S12 — Recherche branchée dans init()
              Tri en-têtes colonnes
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getProduits, createProduit, updateProduit,
  updateProduitStock,
  getRecettesByProduit, saveRecette, getArticles,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, showToast,
  openModal, closeModal, nextRef, sortTable,
  estSurveille, sousSeuil,
} from '../ui.js';

let _produits  = [];
let _articles  = [];
let _recN      = 0;
let _editProduitId = null;
let _editCoutRevient = 0;

/* Guard Règle 17 */
let _delegationBound = false;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_produits, _articles] = await Promise.all([getProduits(), getArticles()]);
  _bindNewProduitForm();
  _bindSearchInput();   /* Fix S12 — branché ici, pas juste exporté */
  _bindSortHeaders();   /* Fix S12 — tri en-têtes */

  /* Règle 17 — délégation document, posée une seule fois */
  if (!_delegationBound) {
    _delegationBound = true;
    document.addEventListener('click', async (e) => {
      const tbody = document.getElementById('produitsTbody');
      if (!tbody) return;

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

      const btnProd = e.target.closest('#produitsTbody [data-action="produire"]');
      if (btnProd) {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: btnProd.dataset.ref } }));
        openModal('modalPlanifier');
        return;
      }
    }, true);

    /* Case Hors stock : on ecoute change (et pas click) pour suivre aussi
       la validation au clavier. Le stock reste affiche tel quel : seule
       la surveillance (alertes, plan de fabrication) est desactivee. */
    document.addEventListener('change', async (e) => {
      const chk = e.target.closest('#produitsTbody .hs-chk');
      if (!chk) return;
      const p = _produits.find(x => x.id === chk.dataset.id);
      if (!p) return;
      const valeur = chk.checked;
      chk.disabled = true;
      try {
        await updateProduit(p.id, { hors_stock: valeur });
        p.hors_stock = valeur;
        _renderIndicateurs();
        _renderTable();
        showToast(valeur ? `${p.nom} : hors stock, exclu des alertes.` : `${p.nom} : de nouveau suivi.`);
        document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
      } catch (err) {
        console.error('[produits] hors_stock ERREUR:', err.message, err);
        chk.checked = !valeur;
        chk.disabled = false;
        showToast('❌ Impossible de modifier ce réglage.', 'error');
      }
    });
  }
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _produits = await getProduits();
  _renderIndicateurs();
  _renderTable();
}

/* -------------------------------------------------------
   INDICATEURS — etat du stock produits finis.
   Les produits marques hors stock sont sortis des trois
   premiers compteurs : ils ne declenchent plus d'alerte.
------------------------------------------------------- */
function _pillEtat(dot, label, n, col) {
  return `<div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
    <span style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block;"></span>
    <span style="font-weight:600;">${label}</span>
    <span style="font-weight:800;color:${col};">${n}</span>
  </div>`;
}

function _renderIndicateurs() {
  const el = document.getElementById('produitsIndicateurs');
  if (!el) return;

  const suivis    = _produits.filter(estSurveille);
  const enStock   = suivis.filter(p => p.stock > p.seuil).length;
  const faible    = suivis.filter(p => p.stock <= p.seuil && p.stock > p.seuil * 0.5).length;
  const bas       = suivis.filter(p => p.stock <= p.seuil * 0.5).length;
  const horsStock = _produits.length - suivis.length;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:9px;">
      ${_pillEtat('#22c55e', 'En stock', enStock, '#16a34a')}
      ${_pillEtat('#f59f00', 'Faibles', faible, '#b45309')}
      ${_pillEtat('#ef4444', 'Sous seuil', bas, '#dc2626')}
      ${horsStock ? _pillEtat('#94a3b8', 'Hors stock', horsStock, '#475569') : ''}
    </div>`;
}

/* -------------------------------------------------------
   TABLE
------------------------------------------------------- */
/* Comparaison insensible à la casse ET aux accents : « clementine »
   doit trouver « Clémentine », « PECHE » doit trouver « Pêche ». */
function _norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function _renderTable() {
  const filtre = _norm(document.getElementById('produitsSearchInput')?.value || '');
  const liste  = filtre
    ? _produits.filter(p => _norm(p.nom).includes(filtre) || _norm(p.ref).includes(filtre))
    : _produits;

  document.getElementById('produitsTbody').innerHTML = liste.map(p => {
    const cout    = p.cout_revient ?? p.cout ?? 0;
    const prix    = p.prix_vente || p.prix || 0;
    const marge   = prix - cout;
    const margeTd = cout > 0
      ? `<span style="color:var(--ui-green);font-weight:600">${fmt(marge)} € <span style="color:var(--ink-muted);font-weight:400;font-size:10px;">(${(marge / cout * 100).toFixed(0)}%)</span></span>`
      : `<span style="color:var(--ink-muted);font-style:italic;font-size:11px;">à définir</span>`;
    const suivi = estSurveille(p);
    return `<tr data-id="${esc(p.id)}"${suivi ? '' : ' style="opacity:.55;"'}>
      <td class="td-ref">${esc(p.ref)}</td>
      <td class="td-bold">${esc(p.nom)}</td>
      <td><strong>${p.stock}</strong></td>
      <td>${p.seuil}</td>
      <td>${suivi ? stockStatus(p.stock, p.seuil) : '<span class="badge badge-neutral">Hors stock</span>'}</td>
      <td style="font-weight:600">${fmt(prix)} €</td>
      <td>${fmt(cout)} €</td>
      <td>${margeTd}</td>
      <td style="text-align:center;">
        <input type="checkbox" class="hs-chk" data-id="${esc(p.id)}"${p.hors_stock ? ' checked' : ''}
          title="Hors stock : exclut ce produit de toutes les alertes" style="cursor:pointer;">
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="btn-icon" data-ref="${esc(p.ref)}" data-action="editer" title="Éditer"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="btn-icon" data-ref="${esc(p.ref)}" data-action="produire" title="Planifier un ordre de fabrication"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4V2M16 4V2M3 10h18"/></svg></button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun produit.</td></tr>';
}

/* -------------------------------------------------------
   RECHERCHE — Fix S12 : appelée dans init()
------------------------------------------------------- */
function _bindSearchInput() {
  document.getElementById('produitsSearchInput')?.addEventListener('input', () => _renderTable());
}

/* -------------------------------------------------------
   TRI EN-TÊTES — Fix S12
   Col 2 (Stock) et Col 3 (Seuil) : tri numérique
   Autres colonnes : tri alphanumérique via sortTable()
------------------------------------------------------- */
function _bindSortHeaders() {
  document.querySelectorAll('#produitsTable th[data-sort-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.sortCol);
      /* Colonnes numériques : Stock (2), Seuil (3), Prix (5), Coût (6) */
      const isNumeric = [2, 3, 5, 6].includes(col);
      if (isNumeric) {
        _sortNumeric(col, th);
      } else {
        sortTable('produitsTable', col);
      }
      /* Indicateur visuel */
      document.querySelectorAll('#produitsTable th .sort-ico').forEach(ico => ico.textContent = '');
      const ico = th.querySelector('.sort-ico');
      if (ico) ico.textContent = ' ↕';
    });
  });
}

let _sortDir = {};
function _sortNumeric(col, th) {
  _sortDir[col] = !_sortDir[col];
  const asc = _sortDir[col];
  const tbody = document.getElementById('produitsTbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const va = parseFloat(a.cells[col]?.textContent?.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    const vb = parseFloat(b.cells[col]?.textContent?.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    return asc ? va - vb : vb - va;
  });
  rows.forEach(r => tbody.appendChild(r));
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEAU / ÉDITION PRODUIT
   Un produit n'est supprimable que depuis Admin.
------------------------------------------------------- */
function _bindNewProduitForm() {
  document.getElementById('btnAddRecetteLigne')?.addEventListener('click', _addRecetteLigne);
  document.getElementById('btnSaveNewProduit')?.addEventListener('click', _handleSave);
  document.getElementById('npPrix')?.addEventListener('input', () => {
    _showCoutEtMarge(_editProduitId ? _editCoutRevient : _collectLignesRecette().reduce((s, l) => {
      const a = _articles.find(x => x.id === l.article_id);
      return s + (a ? a.prix * l.quantite : 0);
    }, 0));
  });
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

  document.getElementById('recetteLignes').innerHTML = '';
  document.getElementById('npCoutPreview').style.display = 'none';
  _editCoutRevient = 0;

  const recetteSection = document.getElementById('npRecetteSection');

  if (editProduit) {
    /* La recette ne se modifie plus ici (Admin uniquement, à terme) —
       on la lit seulement pour calculer le coût de revient et la marge. */
    if (recetteSection) recetteSection.style.display = 'none';
    try {
      const lignes = await getRecettesByProduit(editProduit.id);
      _editCoutRevient = lignes.reduce((s, l) => s + ((l.articles?.prix || 0) * (l.quantite || 0)), 0);
    } catch (_) {}
    _showCoutEtMarge(_editCoutRevient);
  } else {
    if (recetteSection) recetteSection.style.display = '';
    _addRecetteLigne();
  }
}

function _handleSave() {
  if (_editProduitId) { _saveEditProduit(); } else { _saveNewProduit(); }
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
  _showCoutEtMarge(cout);
}

function _showCoutEtMarge(cout) {
  const el    = document.getElementById('npCoutPreview');
  const valEl = document.getElementById('npCoutVal');
  const mgEl  = document.getElementById('npMargeVal');
  if (!el || !valEl) return;
  el.style.display = cout > 0 ? 'block' : 'none';
  valEl.textContent = fmt(cout) + ' €';
  if (mgEl) {
    const prix = parseFloat(document.getElementById('npPrix')?.value) || 0;
    const marge = prix - cout;
    mgEl.textContent = cout > 0 ? `${fmt(marge)} € (${(marge / cout * 100).toFixed(0)}%)` : '—';
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
    const produit = await createProduit({ ref, nom, prix_vente: prix, seuil, stock: 0, cout_revient: cout });
    if (lignes.length) await saveRecette(produit.id, lignes);
    _produits.push({ ...produit, cout_revient: cout });
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

  /* La recette ne se modifie plus depuis ce modal — le coût de revient
     déjà calculé à l'ouverture (depuis la recette existante) est repris tel quel. */
  const cout = _editCoutRevient;

  const btn = document.getElementById('btnSaveNewProduit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    await updateProduit(_editProduitId, { nom, prix_vente: prix, seuil, cout_revient: cout });
    const idx = _produits.findIndex(p => p.id === _editProduitId);
    if (idx >= 0) Object.assign(_produits[idx], { nom, prix_vente: prix, seuil, cout_revient: cout });
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
   GETTERS publics
------------------------------------------------------- */
export function getProduitsCache() { return _produits; }
export function getProduitByRef(ref) { return _produits.find(p => p.ref === ref) || null; }
