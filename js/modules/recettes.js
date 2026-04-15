/* -------------------------------------------------------
   AppMee — modules/recettes.js
   Nomenclatures : affichage, coût revient, faisabilité.
   Dépend de : db.js, ui.js

   Fix R1 — Suppression badges header (Coût, Vente, Marge, Fabricable)
            Suppression footer résumé
            Suppression colonne Stock dispo du tableau
------------------------------------------------------- */

import {
  getProduits, getArticles,
  getRecettesByProduit, saveRecette,
} from '../db.js';
import { fmt, fmtQ, esc, showToast, openModal, closeModal } from '../ui.js';

/* Cache local */
let _produits    = [];
let _articles    = [];
let _recetteData = {};
let _toggleState = {};

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_produits, _articles] = await Promise.all([getProduits(), getArticles()]);
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  [_produits, _articles] = await Promise.all([getProduits(), getArticles()]);
  const recettesRaw = await Promise.all(_produits.map(p => getRecettesByProduit(p.id)));
  _produits.forEach((p, i) => { _recetteData[p.id] = recettesRaw[i]; });
  _renderListe();
}

/* -------------------------------------------------------
   LISTE DES RECETTES
   Fix R1 — Header simplifié : nom + ref + boutons seulement
            Pas de footer résumé
            Tableau sans colonne Stock dispo
------------------------------------------------------- */
function _renderListe() {
  const el = document.getElementById('recettesList');
  el.innerHTML = '';

  _produits.forEach(p => {
    const lignes = _recetteData[p.id] || [];
    const cout   = _calcCout(lignes);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    /* Header — nom + ref + boutons uniquement */
    const hdr = document.createElement('div');
    hdr.className = 'card-hdr';
    hdr.style.cursor = 'pointer';
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap;">
        <span class="card-hdr-title">${esc(p.nom)}</span>
        <span class="td-ref">${esc(p.ref)}</span>
      </div>
      <div style="display:flex;gap:7px;">
        <button class="btn btn-outline btn-sm" data-produit-id="${p.id}" data-action="modifier">✏ Modifier</button>
        <button class="btn btn-primary btn-sm" data-produit-ref="${esc(p.ref)}" data-action="produire">▶ Produire</button>
        <span id="rec-toggle-${p.id}" style="color:var(--ink-muted);font-size:13px;align-self:center;">▼</span>
      </div>`;

    hdr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      _toggleRecette(p.id);
    });

    hdr.querySelector('[data-action="modifier"]').addEventListener('click', (e) => {
      e.stopPropagation();
      _openEditRecette(p.id);
    });

    hdr.querySelector('[data-action="produire"]').addEventListener('click', (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: p.ref } }));
      openModal('modalPlanifier');
    });

    /* Body — tableau sans colonne Stock dispo */
    const body = document.createElement('div');
    body.id = 'rec-body-' + p.id;

    const subHdr = document.createElement('div');
    subHdr.style.cssText = 'padding:7px 16px 4px;font-size:9.5px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.6px;';
    subHdr.textContent = 'Articles nécessaires par unité produite';
    body.appendChild(subHdr);

    const tbl = document.createElement('table');
    tbl.style.margin = '0';
    tbl.innerHTML = `<thead><tr>
      <th>Réf</th><th>Désignation</th><th>Catégorie</th>
      <th>Qté / u.</th><th>Unité</th><th>Prix achat HT</th><th>Coût / produit</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    if (!lignes.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:var(--ink-muted)">Aucun article dans la recette.</td></tr>';
    } else {
      lignes.forEach(l => {
        const a     = l.articles || _articles.find(x => x.id === l.article_id) || {};
        const coutL = (a.prix || 0) * l.quantite;
        const tr    = document.createElement('tr');
        tr.innerHTML = `
          <td class="td-ref">${esc(a.ref || l.article_id)}</td>
          <td class="td-bold">${esc(a.nom || '—')}</td>
          <td><span class="tag">${esc(a.categorie || '—')}</span></td>
          <td style="font-weight:700;color:var(--accent);">${fmtQ(l.quantite)}</td>
          <td>${esc(a.unite || '—')}</td>
          <td>${fmt(a.prix || 0)} €</td>
          <td style="font-weight:600;">${fmt(coutL)} €</td>`;
        tbody.appendChild(tr);
      });
    }

    tbl.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    tfoot.innerHTML = `<tr style="background:var(--ui-bg2);">
      <td colspan="5" style="text-align:right;font-weight:600;padding:8px 12px;">Coût de revient par unité :</td>
      <td colspan="2" style="font-weight:700;color:var(--accent);padding:8px 12px;">${fmt(cout)} €</td>
    </tr>`;
    tbl.appendChild(tfoot);
    body.appendChild(tbl);

    /* Pas de footer résumé (supprimé Fix R1) */

    card.appendChild(hdr);
    card.appendChild(body);
    el.appendChild(card);
  });
}

/* -------------------------------------------------------
   TOGGLE AFFICHAGE RECETTE
------------------------------------------------------- */
function _toggleRecette(produitId) {
  const body = document.getElementById('rec-body-' + produitId);
  const icon = document.getElementById('rec-toggle-' + produitId);
  if (!body) return;
  _toggleState[produitId] = !_toggleState[produitId];
  body.style.display = _toggleState[produitId] ? 'none' : '';
  if (icon) icon.textContent = _toggleState[produitId] ? '▶' : '▼';
}

/* -------------------------------------------------------
   MODAL MODIFICATION RECETTE
------------------------------------------------------- */
function _openEditRecette(produitId) {
  const p      = _produits.find(x => x.id === produitId);
  const lignes = (_recetteData[produitId] || []).map(l => {
    const a = l.articles || _articles.find(x => x.id === l.article_id) || {};
    return { article_id: l.article_id, ref: a.ref || '', nom: a.nom || '', quantite: l.quantite, unite: a.unite || '' };
  });
  if (!p) return;

  const existing = document.getElementById('modalEditRecette');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id        = 'modalEditRecette';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <span class="modal-hdr-title">✏ Modifier la recette — ${esc(p.nom)}</span>
        <button class="modal-close" data-close="modalEditRecette">×</button>
      </div>
      <div style="padding:12px 16px 6px;">
        <div style="font-size:10px;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
          Articles nécessaires par unité produite
        </div>
        <div id="recLignesEdit" style="display:grid;gap:6px;"></div>
        <button class="btn btn-ghost btn-sm" id="btnAddRecLigne" style="margin-top:8px;">+ Ajouter un article</button>
      </div>
      <div id="recCoutPreview" style="margin:0 16px 10px;padding:8px 12px;background:var(--ui-bg2);border-radius:6px;font-size:12px;display:none;">
        Coût de revient estimé : <strong id="recCoutVal">—</strong>
      </div>
      <div class="form-actions between">
        <div style="font-size:11px;color:var(--ink-muted);">La recette existante sera entièrement remplacée.</div>
        <div style="display:flex;gap:7px;">
          <button class="btn btn-ghost" data-close="modalEditRecette">Annuler</button>
          <button class="btn btn-primary" id="btnSaveRecette">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => modal.remove()));

  const lignesActives = lignes.length ? lignes : [];
  lignesActives.forEach(l => _addRecLigne(produitId, l));
  if (!lignesActives.length) _addRecLigne(produitId);

  document.getElementById('btnAddRecLigne').addEventListener('click', () => _addRecLigne(produitId));
  document.getElementById('btnSaveRecette').addEventListener('click', () => _saveEditRecette(produitId, modal));

  openModal('modalEditRecette');
}

function _addRecLigne(produitId, preselect = null) {
  const container = document.getElementById('recLignesEdit');
  if (!container) return;

  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:2fr 90px 70px auto;gap:7px;align-items:center;';

  const opts = _articles.map(a =>
    `<option value="${esc(a.id)}" ${preselect && a.id === preselect.article_id ? 'selected' : ''}>${esc(a.ref)} — ${esc(a.nom)}</option>`
  ).join('');

  row.innerHTML = `
    <select class="rec-art inp" style="font-size:11.5px;">${opts}</select>
    <input type="number" class="rec-qte inp" placeholder="Qté" min="0.001" step="0.001"
      value="${preselect ? preselect.quantite : ''}">
    <span class="rec-unite" style="font-size:11px;color:var(--ink-muted);padding-left:4px;align-self:center;"></span>
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;" type="button">×</button>`;

  const artSel  = row.querySelector('.rec-art');
  const uniteEl = row.querySelector('.rec-unite');

  const syncUnite = () => {
    const a = _articles.find(x => x.id === artSel.value);
    uniteEl.textContent = a ? a.unite : '';
    _updateCoutPreview(produitId);
  };

  artSel.addEventListener('change', syncUnite);
  row.querySelector('.rec-qte').addEventListener('input', () => _updateCoutPreview(produitId));
  row.querySelector('button').addEventListener('click', () => { row.remove(); _updateCoutPreview(produitId); });

  container.appendChild(row);
  syncUnite();
}

function _updateCoutPreview(produitId) {
  const rows = document.querySelectorAll('#recLignesEdit > div');
  let cout = 0, nbOk = 0;
  rows.forEach(row => {
    const artId = row.querySelector('.rec-art')?.value;
    const qte   = parseFloat(row.querySelector('.rec-qte')?.value) || 0;
    const a     = _articles.find(x => x.id === artId);
    if (a && qte > 0) { cout += a.prix * qte; nbOk++; }
  });
  const preview = document.getElementById('recCoutPreview');
  const val     = document.getElementById('recCoutVal');
  if (preview && val) {
    preview.style.display = nbOk > 0 ? 'block' : 'none';
    val.textContent = fmt(cout) + ' €';
  }
}

async function _saveEditRecette(produitId, modal) {
  const rows = document.querySelectorAll('#recLignesEdit > div');
  const nouvelles = [];
  rows.forEach(row => {
    const artId = row.querySelector('.rec-art')?.value;
    const qte   = parseFloat(row.querySelector('.rec-qte')?.value) || 0;
    if (artId && qte > 0) nouvelles.push({ article_id: artId, quantite: qte });
  });

  if (!nouvelles.length) { showToast('⚠ Ajoutez au moins un article.', 'error'); return; }

  const btnSave = document.getElementById('btnSaveRecette');
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Enregistrement…'; }

  try {
    await saveRecette(produitId, nouvelles);
    _recetteData[produitId] = nouvelles.map(n => {
      const a = _articles.find(x => x.id === n.article_id) || {};
      return { article_id: n.article_id, quantite: n.quantite, articles: a };
    });
    modal.remove();
    _renderListe();
    showToast('✅ Recette mise à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'recettes' } }));
  } catch (err) {
    console.error('[recettes] _saveEditRecette ERREUR:', err.message, err);
    showToast('❌ Erreur enregistrement recette : ' + err.message, 'error');
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
  }
}

/* -------------------------------------------------------
   CALCULS
------------------------------------------------------- */
function _calcCout(lignes) {
  return lignes.reduce((s, l) => {
    const a = l.articles || _articles.find(x => x.id === l.article_id) || {};
    return s + (a.prix || 0) * l.quantite;
  }, 0);
}

function _calcMaxFab(lignes) {
  if (!lignes.length) return 0;
  let max = Infinity;
  lignes.forEach(l => {
    const a = l.articles || _articles.find(x => x.id === l.article_id) || {};
    if (l.quantite > 0) max = Math.min(max, Math.floor((a.stock || 0) / l.quantite));
  });
  return max === Infinity ? 0 : max;
}
