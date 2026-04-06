/* -------------------------------------------------------
   AppMee — modules/stock.js
   Stock articles : affichage, inventaire, alertes.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getArticles, createArticle, updateArticle,
  deleteArticle, updateArticleStock, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, showToast,
  openModal, closeModal, sortTable, filterTable,
  today, nextRef, confirmDialog, isPositiveNumber,
} from '../ui.js';

/* Cache local */
let _articles = [];
let _fournisseurs = []; /* injecté par admin.init() */

/* -------------------------------------------------------
   INIT — appelé une fois au démarrage
------------------------------------------------------- */
export async function init() {
  _articles = await getArticles();
  _bindSearchInput();
  _bindSortHeaders();
  _bindNewArticleForm();
  _bindInventaireForm();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _articles = await getArticles();
  _renderTable();
}

function _renderTable() {
  document.getElementById('stockTbody').innerHTML = _articles.map(a => {
    const pct = a.seuil > 0 ? Math.min(100, Math.round(a.stock / a.seuil * 100)) : 100;
    const col = a.stock <= 0 ? 'var(--ui-red)'
      : a.stock <= a.seuil ? 'var(--ui-orange)'
      : a.stock <= a.seuil * 1.5 ? '#c8830a'
      : 'var(--ui-green)';
    return `<tr>
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td><span class="tag">${esc(a.categorie || '—')}</span></td>
      <td>${esc(a.unite)}</td>
      <td>
        <strong>${fmtQ(a.stock)}</strong>
        <div class="prog-wrap" style="margin-top:3px;width:60px;">
          <div class="prog-bar" style="width:${pct}%;background:${col};"></div>
        </div>
      </td>
      <td>${fmtQ(a.seuil)}</td>
      <td>${stockStatus(a.stock, a.seuil)}</td>
      <td>${fmt(a.prix)} €</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(a.fournisseur || '—')}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button>
      </td>
    </tr>`;
  }).join('');

  /* Délégation d'événements sur le tbody */
  const tbody = document.getElementById('stockTbody');
  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'commander') {
      document.dispatchEvent(new CustomEvent('appmee:openAchatFor', { detail: { ref: btn.dataset.ref } }));
      openModal('modalAchat');
    }
    if (btn.dataset.action === 'inventaire') {
      _openInventaire(btn.dataset.id);
    }
  };
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEL ARTICLE
------------------------------------------------------- */
function _bindNewArticleForm() {
  /* Suggestions de noms par catégorie */
  const CAT_NOMS = {
    matiere:    ['Fraises kg', 'Framboises kg', 'Myrtilles kg', 'Abricots kg', 'Lait L', 'Farine kg'],
    emballage:  ['Pot verre 50 ml', 'Pot verre 100 ml', 'Pot verre 200 ml', 'Couvercle', 'Étiquette'],
    ingredient: ['Sucre kg', 'Sel kg', 'Pectine kg', 'Levure kg'],
    fourniture: ['Gants', 'Tablier', 'Sac kraft'],
    autre:      ['Autre'],
  };

  document.getElementById('naCategorie')?.addEventListener('change', (e) => {
    const noms = CAT_NOMS[e.target.value] || ['Autre'];
    document.getElementById('naNomSel').innerHTML =
      noms.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
      '<option value="">— Saisie libre —</option>';
  });

  document.getElementById('naNomSel')?.addEventListener('change', (e) => {
    if (e.target.value) document.getElementById('naNom').value = e.target.value;
  });

  document.getElementById('naFournisseurSel')?.addEventListener('change', (e) => {
    if (e.target.value) document.getElementById('naFournisseur').value = e.target.value;
  });

  document.getElementById('btnSaveNewArticle')?.addEventListener('click', _saveNewArticle);
}

export function initNewArticleModal(fournisseurs) {
  _fournisseurs = fournisseurs;
  const ref = nextRef('A', _articles);
  document.getElementById('naRef').value = ref;
  document.getElementById('naNom').value = '';
  document.getElementById('naPrix').value = '';
  document.getElementById('naStock').value = '0';
  document.getElementById('naSeuil').value = '';

  const fs = document.getElementById('naFournisseurSel');
  fs.innerHTML = '<option value="">— Choisir —</option>' +
    fournisseurs.map(f => `<option value="${esc(f.nom)}">${esc(f.nom)}</option>`).join('');
  document.getElementById('naFournisseur').value = '';

  /* Déclencher le remplissage des suggestions */
  document.getElementById('naCategorie').dispatchEvent(new Event('change'));
}

async function _saveNewArticle() {
  const ref        = document.getElementById('naRef').value.trim();
  const nom        = document.getElementById('naNom').value.trim() || document.getElementById('naNomSel').value;
  const categorie  = document.getElementById('naCategorie').value;
  const unite      = document.getElementById('naUnite').value;
  const prix       = parseFloat(document.getElementById('naPrix').value) || 0;
  const fournisseur= document.getElementById('naFournisseur').value || document.getElementById('naFournisseurSel').value;
  const seuil      = parseInt(document.getElementById('naSeuil').value) || 50;
  const stock      = parseFloat(document.getElementById('naStock').value) || 0;

  if (!ref || !nom) { showToast('⚠ Référence et nom requis.', 'error'); return; }
  if (_articles.find(a => a.ref === ref)) { showToast('⚠ Référence déjà existante.', 'error'); return; }

  try {
    const created = await createArticle({ ref, nom, categorie, unite, prix, fournisseur, seuil, stock });
    _articles.push(created);
    closeModal('modalNewArticle');
    _renderTable();
    showToast('✅ Article ' + ref + ' créé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
  } catch (err) {
    showToast('❌ Erreur création article.', 'error');
  }
}

/* -------------------------------------------------------
   INVENTAIRE
------------------------------------------------------- */
let _inventaireArticleId = null;

function _openInventaire(articleId) {
  _inventaireArticleId = articleId;
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;

  const sel = document.getElementById('invRef');
  sel.innerHTML = _articles.map(x =>
    `<option value="${esc(x.id)}" ${x.id === articleId ? 'selected' : ''}>${esc(x.ref)} — ${esc(x.nom)}</option>`
  ).join('');

  _syncInvArticle(articleId);
  openModal('modalInventaire');
}

function _syncInvArticle(articleId) {
  const a = _articles.find(x => x.id === (articleId || document.getElementById('invRef').value));
  if (!a) return;
  document.getElementById('invStockActuel').textContent = fmtQ(a.stock) + ' ' + a.unite;
  document.getElementById('invUnite').textContent = a.unite;
}

function _bindInventaireForm() {
  document.getElementById('invRef')?.addEventListener('change', (e) => {
    _inventaireArticleId = e.target.value;
    _syncInvArticle(e.target.value);
  });

  document.getElementById('btnSaveInventaire')?.addEventListener('click', _saveInventaire);
}

export function initInventaireModal() {
  const sel = document.getElementById('invRef');
  sel.innerHTML = _articles.map(a =>
    `<option value="${esc(a.id)}">${esc(a.ref)} — ${esc(a.nom)}</option>`
  ).join('');
  if (_articles.length) _syncInvArticle(_articles[0].id);
}

export function openInventaireFor(articleId) {
  _openInventaire(articleId);
}

async function _saveInventaire() {
  const articleId = _inventaireArticleId || document.getElementById('invRef').value;
  const qReal     = parseFloat(document.getElementById('invQteReel').value);
  const motif     = document.getElementById('invMotif').value || 'Manuel';

  if (!articleId || isNaN(qReal) || qReal < 0) {
    showToast('⚠ Remplissez tous les champs.', 'error');
    return;
  }

  const a = _articles.find(x => x.id === articleId);
  if (!a) return;

  const ecart = qReal - a.stock;

  try {
    await updateArticleStock(articleId, qReal);
    await addMouvement({
      type: 'inventaire',
      ref: a.ref,
      nom: a.nom,
      qte: Math.abs(ecart),
      motif: 'Inventaire — ' + motif,
      ref_doc: 'INV-' + Date.now(),
    });

    a.stock = qReal;
    closeModal('modalInventaire');
    _renderTable();
    showToast(`✅ ${a.nom} ajusté : ${fmtQ(qReal)} ${a.unite} (écart : ${ecart >= 0 ? '+' : ''}${fmtQ(ecart)})`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
  } catch (err) {
    showToast('❌ Erreur inventaire.', 'error');
  }
}

/* -------------------------------------------------------
   RECHERCHE ET TRI
------------------------------------------------------- */
function _bindSearchInput() {
  document.getElementById('stockSearchInput')?.addEventListener('input', (e) => {
    filterTable('stockTable', e.target.value);
  });
}

function _bindSortHeaders() {
  document.querySelectorAll('#stockTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      sortTable('stockTable', parseInt(th.dataset.sortCol));
    });
  });
}

/* -------------------------------------------------------
   GETTERS publics (utilisés par d'autres modules via events)
------------------------------------------------------- */
export function getArticlesCache() { return _articles; }

export function getArticleByRef(ref) {
  return _articles.find(a => a.ref === ref) || null;
}
