/* -------------------------------------------------------
   AppMee — modules/recettes.js
   Nomenclatures : affichage, coût revient, faisabilité.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import { getProduits, getArticles, getRecettesByProduit } from '../db.js';
import { fmt, fmtQ, esc, showToast, openModal } from '../ui.js';

/* Cache local */
let _produits    = [];
let _articles    = [];
let _recetteData = {}; /* { produitId: [lignes recette] } */
let _toggleState = {}; /* { produitId: bool } */

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

  /* Charger toutes les recettes en parallèle */
  const recettesRaw = await Promise.all(_produits.map(p => getRecettesByProduit(p.id)));
  _produits.forEach((p, i) => { _recetteData[p.id] = recettesRaw[i]; });

  _renderListe();
}

function _renderListe() {
  const el = document.getElementById('recettesList');
  el.innerHTML = '';

  _produits.forEach(p => {
    const lignes   = _recetteData[p.id] || [];
    const cout     = _calcCout(lignes);
    const prix     = p.prix_vente || p.prix || 0;
    const marge    = prix - cout;
    const txM      = cout > 0 ? (marge / cout * 100).toFixed(1) : '—';
    const maxFab   = _calcMaxFab(lignes);

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    /* Header */
    const hdr = document.createElement('div');
    hdr.className = 'card-hdr';
    hdr.style.cursor = 'pointer';
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap;">
        <span class="card-hdr-title">${esc(p.nom)}</span>
        <span class="td-ref">${esc(p.ref)}</span>
        <span class="badge badge-neutral">Coût : <strong>${fmt(cout)} €</strong></span>
        <span class="badge badge-ok">Vente : <strong>${fmt(prix)} €</strong></span>
        <span class="badge badge-blue">Marge : <strong>${fmt(marge)} € (${txM}%)</strong></span>
        <span class="badge badge-warn">Fabricable : <strong>${maxFab} u.</strong></span>
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
      document.dispatchEvent(new CustomEvent('appmee:editProduit', { detail: { produitId: p.id } }));
      openModal('modalNewProduit');
    });

    hdr.querySelector('[data-action="produire"]').addEventListener('click', (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: p.ref } }));
      openModal('modalPlanifier');
    });

    /* Body (table recette) */
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
      <th>Qté / u.</th><th>Unité</th><th>Prix achat HT</th>
      <th>Coût / produit</th><th>Stock dispo</th><th>Fabricable</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    if (!lignes.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:12px;color:var(--ink-muted)">Aucun article dans la recette.</td></tr>';
    } else {
      lignes.forEach(l => {
        const a      = l.articles || _articles.find(x => x.id === l.article_id) || {};
        const coutL  = (a.prix || 0) * l.quantite;
        const sd     = a.stock || 0;
        const fd     = l.quantite > 0 ? Math.floor(sd / l.quantite) : 0;
        const tr     = document.createElement('tr');
        tr.innerHTML = `
          <td class="td-ref">${esc(a.ref || l.article_id)}</td>
          <td class="td-bold">${esc(a.nom || '—')}</td>
          <td><span class="tag">${esc(a.categorie || '—')}</span></td>
          <td style="font-weight:700;color:var(--accent);">${fmtQ(l.quantite)}</td>
          <td>${esc(a.unite || '—')}</td>
          <td>${fmt(a.prix || 0)} €</td>
          <td style="font-weight:600;">${fmt(coutL)} €</td>
          <td>${fmtQ(sd)} ${esc(a.unite || '')}</td>
          <td>${fd > 0
            ? `<span class="badge badge-ok">${fd} u.</span>`
            : '<span class="badge badge-alert">0</span>'}
          </td>`;
        tbody.appendChild(tr);
      });
    }

    tbl.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    tfoot.innerHTML = `<tr style="background:var(--ui-bg2);">
      <td colspan="6" style="text-align:right;font-weight:600;padding:8px 12px;">Coût de revient par unité :</td>
      <td style="font-weight:700;color:var(--accent);padding:8px 12px;">${fmt(cout)} €</td>
      <td colspan="2"></td>
    </tr>`;
    tbl.appendChild(tfoot);
    body.appendChild(tbl);

    /* Footer résumé */
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:9px 16px;background:var(--ui-bg2);border-top:1px solid var(--rule);display:flex;gap:16px;flex-wrap:wrap;font-size:12px;';
    footer.innerHTML = `
      <span>📦 Stock : <strong>${p.stock}</strong> / seuil ${p.seuil}</span>
      <span>💰 Prix vente : <strong>${fmt(prix)} €</strong></span>
      <span style="color:var(--ui-green);font-weight:600;">✓ Marge : ${fmt(marge)} € (${txM}%)</span>
      <span>🏭 Fabricable : <strong>${maxFab} u.</strong></span>`;
    body.appendChild(footer);

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
