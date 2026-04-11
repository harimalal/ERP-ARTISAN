/* -------------------------------------------------------
   AppMee — modules/produits.js
   Produits finis : affichage, création, recettes.
   Dépend de : db.js, ui.js

   Fix B5 — Séparation claire création / édition :
   - _saveNewProduit()  → createProduit + saveRecette (nouvelle ref)
   - _saveEditProduit() → updateProduit + saveRecette (ref existante)
   - initNewProduitModal() recharge toujours _articles depuis BDD
     pour éviter le cache vide ou désynchronisé.
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
let _recN      = 0;

/* UUID du produit en cours d'édition (null = création) */
let _editProduitId = null;

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
  document.getElementById('btnSaveNewProduit')?.addEventListener('click', _handleSave);
}

/* -------------------------------------------------------
   INIT MODAL — création ou édition
   Fix B5 : recharge toujours _articles depuis BDD pour éviter
   le cache vide. Distingue création (editProduit=null) vs édition.
------------------------------------------------------- */
export async function initNewProduitModal(editProduit = null) {
  _recN = 0;
  _editProduitId = editProduit ? editProduit.id : null;

  /* Recharger les articles depuis BDD — garantit un cache à jour */
  try {
    _articles = await getArticles();
  } catch (err) {
    console.error('[produits] initNewProduitModal — getArticles ERREUR:', err.message);
    /* Continuer avec le cache existant si le rechargement échoue */
  }

  /* Recharger les produits pour avoir nextRef fiable */
  try {
    _produits = await getProduits();
  } catch (err) {
    console.error('[produits] initNewProduitModal — getProduits ERREUR:', err.message);
  }

  document.getElementById('modalNewProduitTitle').textContent =
    editProduit ? '✏ Modifier — ' + editProduit.nom : '🏷 Nouveau produit fini & recette';

  /* En création : générer une ref auto. En édition : afficher la ref existante (readonly) */
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

  /* Charger les lignes de recette existantes (mode édition) */
  if (editProduit) {
    try {
      const lignes = await getRecettesByProduit(editProduit.id);
      if (lignes.length) {
        lignes.forEach(l => {
          _addRecetteLigne(l.article_id, l.quantite);
        });
      } else {
        _addRecetteLigne();
      }
    } catch (err) {
      _addRecetteLigne();
    }
  } else {
    _addRecetteLigne();
  }

  _calcCout();
}

function _addRecetteLigne(preselectArticleId = null, preselectQte = null) {
  _recN++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 80px auto;gap:7px;margin-bottom:7px;align-items:center;';

  const byId   = _articles.map(a =>
    `<option value="${esc(a.id)}" ${a.id === preselectArticleId ? 'selected' : ''}>${esc(a.ref)}</option>`
  ).join('');
  const byName = _articles.map(a =>
    `<option value="${esc(a.id)}" ${a.id === preselectArticleId ? 'selected' : ''}>${esc(a.nom)}</option>`
  ).join('');

  div.innerHTML = `
    <select class="rr" style="font-size:11.5px;font-weight:600;color:var(--accent);">${byId}</select>
    <select class="rn">${byName}</select>
    <input type="number" step="0.001" placeholder="Qté/u" class="rq inp" value="${preselectQte !== null ? preselectQte : ''}">
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
  let ok   = false;
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

/* -------------------------------------------------------
   HANDLER SAVE — route vers création ou édition
------------------------------------------------------- */
async function _handleSave() {
  if (_editProduitId) {
    await _saveEditProduit();
  } else {
    await _saveNewProduit();
  }
}

/* -------------------------------------------------------
   CRÉATION — nouveau produit
   Fix B5 : vérifie la ref uniquement en mode création.
   Recharge _produits depuis BDD avant de vérifier le doublon
   pour éviter les faux positifs dus au cache.
------------------------------------------------------- */
async function _saveNewProduit() {
  const ref   = document.getElementById('npRef').value.trim();
  const nom   = document.getElementById('npNom').value.trim();
  const prix  = parseFloat(document.getElementById('npPrix').value) || 0;
  const seuil = parseInt(document.getElementById('npSeuil').value) || 100;

  if (!ref || !nom) { showToast('⚠ Référence et nom requis.', 'error'); return; }

  /* Fix B5 — Recharger depuis BDD pour avoir les refs réelles, pas le cache */
  try {
    _produits = await getProduits();
  } catch (err) {
    console.error('[produits] _saveNewProduit — getProduits ERREUR:', err.message);
  }

  if (_produits.find(p => p.ref === ref)) {
    showToast('⚠ Référence déjà existante — utilisez une autre ref.', 'error');
    return;
  }

  const lignes = _collectLignesRecette();
  let cout = lignes.reduce((s, l) => {
    const a = _articles.find(x => x.id === l.article_id);
    return s + (a ? a.prix * l.quantite : 0);
  }, 0);

  const btn = document.getElementById('btnSaveNewProduit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    const produit = await createProduit({ ref, nom, prix_vente: prix, seuil, stock: 0 });
    if (lignes.length) {
      await saveRecette(produit.id, lignes);
    }
    _produits.push({ ...produit, cout });
    closeModal('modalNewProduit');
    _renderTable();
    showToast('✅ Produit ' + ref + ' créé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    console.error('[produits] _saveNewProduit ERREUR:', err.message, err);
    showToast('❌ Erreur création produit : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
}

/* -------------------------------------------------------
   ÉDITION — modifier un produit existant
   Fix B5 : utilise updateProduit au lieu de createProduit.
   Ne vérifie PAS le doublon de ref (la ref ne change pas).
------------------------------------------------------- */
async function _saveEditProduit() {
  if (!_editProduitId) return;

  const nom   = document.getElementById('npNom').value.trim();
  const prix  = parseFloat(document.getElementById('npPrix').value) || 0;
  const seuil = parseInt(document.getElementById('npSeuil').value) || 100;

  if (!nom) { showToast('⚠ Le nom est requis.', 'error'); return; }

  const lignes = _collectLignesRecette();
  let cout = lignes.reduce((s, l) => {
    const a = _articles.find(x => x.id === l.article_id);
    return s + (a ? a.prix * l.quantite : 0);
  }, 0);

  const btn = document.getElementById('btnSaveNewProduit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    const updated = await updateProduit(_editProduitId, { nom, prix_vente: prix, seuil });
    await saveRecette(_editProduitId, lignes);

    /* Mettre à jour le cache local */
    const idx = _produits.findIndex(p => p.id === _editProduitId);
    if (idx >= 0) Object.assign(_produits[idx], { nom, prix_vente: prix, seuil, cout });

    closeModal('modalNewProduit');
    _renderTable();
    showToast('✅ Produit mis à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'produits' } }));
  } catch (err) {
    console.error('[produits] _saveEditProduit ERREUR:', err.message, err);
    showToast('❌ Erreur mise à jour produit : ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
}

/* -------------------------------------------------------
   HELPER — collecter les lignes recette du formulaire
------------------------------------------------------- */
function _collectLignesRecette() {
  const lignes = [];
  document.querySelectorAll('#recetteLignes > div').forEach(div => {
    const articleId = div.querySelector('.rr')?.value;
    const q         = parseFloat(div.querySelector('.rq')?.value);
    if (articleId && q > 0) {
      lignes.push({ article_id: articleId, quantite: q, unite: null });
    }
  });
  return lignes;
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getProduitsCache() { return _produits; }

export function getProduitByRef(ref) {
  return _produits.find(p => p.ref === ref) || null;
}
