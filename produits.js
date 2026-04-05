/* -------------------------------------------------------
   AppMee — modules/produits.js
   Produits finis : affichage, création, recettes.
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

/* Cache local */
let _produits  = [];
let _articles  = [];
let _recN      = 0; /* compteur lignes recette */

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_produits, _articles] = await Promise.all([getProduits(), getArticles()]);
  _bindNewProduitForm();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _produits = await getProduits();
  _renderTable();
}

function _renderTable() {
  document.getElementById('produitsTbody').innerHTML = _produits.map(p => {
    const cout = p.cout || 0;
    const prix = p.prix_vente || p.prix || 0;
    const marge = prix - cout;
    const tx = cout > 0 ? (marge / cout * 100).toFixed(0) : '—';
    return `<tr>
      <td class="td-ref">${esc(p.ref)}</td>
      <td class="td-bold">${esc(p.nom)}</td>
      <td><strong>${p.stock}</strong></td>
      <td>${p.seuil}</td>
      <td>${stockStatus(p.stock, p.seuil)}</td>
      <td>${fmt(prix)} €</td>
      <td>${fmt(cout)} €</td>
      <td style="color:var(--ui-green);font-weight:600">
        ${fmt(marge)} € <span style="color:var(--ink-muted);font-weight:400;font-size:10px;">(${tx}%)</span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" data-ref="${esc(p.ref)}" data-action="produire">▶ Produire</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('produitsTbody').onclick = (e) => {
    const btn = e.target.closest('[data-action="produire"]');
    if (btn) {
      document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: btn.dataset.ref } }));
      openModal('modalPlanifier');
    }
  };
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEAU PRODUIT + RECETTE
------------------------------------------------------- */
function _bindNewProduitForm() {
  document.getElementById('btnAddRecetteLigne')?.addEventListener('click', _addRecetteLigne);
  document.getElementById('btnSaveNewProduit')?.addEventListener('click', _saveNewProduit);
}

export function initNewProduitModal(editProduit = null) {
  _recN = 0;
  document.getElementById('modalNewProduitTitle').textContent =
    editProduit ? '✏ Modifier — ' + editProduit.nom : '🏷 Nouveau produit fini & recette';
  document.getElementById('npRef').value   = editProduit ? editProduit.ref : nextRef('P', _produits);
  document.getElementById('npNom').value   = editProduit ? editProduit.nom : '';
  document.getElementById('npPrix').value  = editProduit ? (editProduit.prix_vente || editProduit.prix || '') : '';
  document.getElementById('npSeuil').value = editProduit ? editProduit.seuil : '';
  document.getElementById('recetteLignes').innerHTML = '';
  document.getElementById('npCoutPreview').style.display = 'none';

  /* Si édition, recharger les lignes de recette */
  if (editProduit) {
    getRecettesByProduit(editProduit.id).then(lignes => {
      lignes.forEach(l => {
        _addRecetteLigne();
        const divs = document.querySelectorAll('#recetteLignes > div');
        const div = divs[divs.length - 1];
        if (div) {
          div.querySelector('.rr').value = l.article_id;
          div.querySelector('.rn').value = l.article_id;
          div.querySelector('.rq').value = l.quantite;
        }
      });
      _calcCout();
    });
  } else {
    _addRecetteLigne();
  }
}

function _addRecetteLigne() {
  _recN++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 80px auto;gap:7px;margin-bottom:7px;align-items:center;';

  const byId   = _articles.map(a => `<option value="${esc(a.id)}">${esc(a.ref)}</option>`).join('');
  const byName = _articles.map(a => `<option value="${esc(a.id)}">${esc(a.nom)}</option>`).join('');

  div.innerHTML = `
    <select class="rr" style="font-size:11.5px;font-weight:600;color:var(--accent);">${byId}</select>
    <select class="rn">${byName}</select>
    <input type="number" step="0.001" placeholder="Qté/u" class="rq">
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;" type="button">×</button>`;

  div.querySelector('.rr').addEventListener('change', (e) => {
    div.querySelector('.rn').value = e.target.value;
    _calcCout();
  });
  div.querySelector('.rn').addEventListener('change', (e) => {
    div.querySelector('.rr').value = e.target.value;
    _calcCout();
  });
  div.querySelector('.rq').addEventListener('input', _calcCout);
  div.querySelector('button').addEventListener('click', () => { div.remove(); _calcCout(); });

  document.getElementById('recetteLignes').appendChild(div);
}

function _calcCout() {
  let cout = 0;
  let ok = false;
  document.querySelectorAll('#recetteLignes > div').forEach(div => {
    const articleId = div.querySelector('.rr')?.value;
    const q         = parseFloat(div.querySelector('.rq')?.value);
    if (articleId && q > 0) {
      const a = _articles.find(x => x.id === articleId);
      if (a) { cout += a.prix * q; ok = true; }
    }
  });
  const el = document.getElementById('npCoutPreview');
  if (ok) {
    el.style.display = 'block';
    document.getElementById('npCoutVal').textContent = fmt(cout) + ' €';
  } else {
    el.style.display = 'none';
  }
}

async function _saveNewProduit() {
  const ref   = document.getElementById('npRef').value.trim();
  const nom   = document.getElementById('npNom').value.trim();
  const prix  = parseFloat(document.getElementById('npPrix').value) || 0;
  const seuil = parseInt(document.getElementById('npSeuil').value) || 100;

  if (!ref || !nom) { showToast('⚠ Référence et nom requis.', 'error'); return; }
  if (_produits.find(p => p.ref === ref)) { showToast('⚠ Référence déjà existante.', 'error'); return; }

  /* Collecter les lignes de recette */
  const lignes = [];
  let cout = 0;
  document.querySelectorAll('#recetteLignes > div').forEach(div => {
    const articleId = div.querySelector('.rr')?.value;
    const q         = parseFloat(div.querySelector('.rq')?.value);
    if (articleId && q > 0) {
      const a = _articles.find(x => x.id === articleId);
      if (a) { cout += a.prix * q; }
      lignes.push({ article_id: articleId, quantite: q, unite: null });
    }
  });

  try {
    const produit = await createProduit({ ref, nom, prix_vente: prix, seuil, stock: 0, cout });
    await saveRecette(produit.id, lignes);
    _produits.push({ ...produit, cout });
    closeModal('modalNewProduit');
    _renderTable();
    showToast('✅ Produit ' + ref + ' créé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    showToast('❌ Erreur création produit.', 'error');
  }
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getProduitsCache() { return _produits; }

export function getProduitByRef(ref) {
  return _produits.find(p => p.ref === ref) || null;
}
