/* -------------------------------------------------------
   AppMee — modules/stock.js
   Stock articles : affichage, inventaire, alertes.
   Fix STOCK-BTN — délégation sur document en phase capture
   Fix S12 — Redesign : couleurs catégories, statuts colorés,
              indicateurs En stock / Faible / Bas
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getArticles, createArticle,
  deleteArticle, updateArticleStock, addMouvement,
  getFournisseurs,
} from '../db.js';
import {
  fmt, fmtQ, esc, stockStatus, showToast,
  openModal, closeModal, sortTable,
  today, nextRef, confirmDialog, isPositiveNumber,
  optionsCategories, bindCategorieNouvelle, lireCategorie, couleurCategorie,
  sousSeuil,
} from '../ui.js';

/* Cache local */
let _articles    = [];
let _fournisseurs = [];

/* -------------------------------------------------------
   COULEURS PAR CATÉGORIE — vives, distinctes
------------------------------------------------------- */
const CAT_COLORS = {
  matiere:    { bg: 'rgba(34,197,94,0.12)',   txt: '#15803d', brd: 'rgba(34,197,94,0.3)'   },
  emballage:  { bg: 'rgba(59,130,246,0.12)',  txt: '#1d4ed8', brd: 'rgba(59,130,246,0.3)'  },
  ingredient: { bg: 'rgba(168,85,247,0.12)',  txt: '#7e22ce', brd: 'rgba(168,85,247,0.3)'  },
  fourniture: { bg: 'rgba(249,115,22,0.12)',  txt: '#c2410c', brd: 'rgba(249,115,22,0.3)'  },
  autre:      { bg: 'rgba(156,163,175,0.15)', txt: '#4b5563', brd: 'rgba(156,163,175,0.3)' },
  /* Taxonomie alternative (ex: Les Confitures de Pascal) — coexiste avec celle
     du dessus, ne la remplace pas, pour ne rien casser chez les autres tenants. */
  Fruit:      { bg: 'rgba(34,197,94,0.12)',   txt: '#15803d', brd: 'rgba(34,197,94,0.3)'   },
  'Ingrédient': { bg: 'rgba(168,85,247,0.12)', txt: '#7e22ce', brd: 'rgba(168,85,247,0.3)'  },
  Verre:      { bg: 'rgba(59,130,246,0.12)',  txt: '#1d4ed8', brd: 'rgba(59,130,246,0.3)'  },
  Capsule:    { bg: 'rgba(14,165,233,0.12)',  txt: '#0369a1', brd: 'rgba(14,165,233,0.3)'  },
  'Étiquette': { bg: 'rgba(249,115,22,0.12)', txt: '#c2410c', brd: 'rgba(249,115,22,0.3)'  },
  Logistique: { bg: 'rgba(156,163,175,0.15)', txt: '#4b5563', brd: 'rgba(156,163,175,0.3)' },
};

const CAT_LABELS = {
  matiere:    'Matière',
  emballage:  'Emballage',
  ingredient: 'Ingrédient',
  fourniture: 'Fourniture',
  autre:      'Autre',
};

function _catLabel(categorie) {
  return CAT_LABELS[categorie] || categorie || '—';
}

/* Couleurs connues d'abord — pour ne rien changer visuellement aux tenants
   existants — sinon couleur déduite du nom, pour que toute catégorie créée
   par n'importe quel métier ait la sienne sans toucher au code. */
function _catColor(categorie) {
  return CAT_COLORS[categorie] || couleurCategorie(categorie);
}

function _tagCat(categorie) {
  const c = _catColor(categorie);
  return `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;
    background:${c.bg};color:${c.txt};border:1px solid ${c.brd};">${esc(_catLabel(categorie))}</span>`;
}

/* Comparaison insensible à la casse ET aux accents : « clementine »
   doit trouver « Clémentine », « ETIQUETTE » doit trouver « Étiquette ». */
function _norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* -------------------------------------------------------
   BADGE STATUT STOCK — couleur sans coloration de ligne
------------------------------------------------------- */
function _badgeStatut(stock, seuil) {
  if (stock <= 0)            return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(148,163,184,0.15);color:#475569;border:1px solid rgba(148,163,184,0.3);">Hors stock</span>`;
  if (stock <= seuil * 0.5)  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(239,68,68,0.12);color:#dc2626;border:1px solid rgba(239,68,68,0.25);">Bas</span>`;
  if (stock <= seuil)        return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(245,158,11,0.12);color:#b45309;border:1px solid rgba(245,158,11,0.25);">Faible</span>`;
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(34,197,94,0.12);color:#15803d;border:1px solid rgba(34,197,94,0.25);">OK</span>`;
}

/* -------------------------------------------------------
   BARRE DE PROGRESSION
------------------------------------------------------- */
function _progBar(stock, seuil) {
  const pct = seuil > 0 ? Math.min(100, Math.round(stock / seuil * 100)) : 100;
  const col = stock <= 0          ? 'rgba(239,68,68,0.5)'
    : stock <= seuil * 0.5 ? 'rgba(239,68,68,0.5)'
    : stock <= seuil        ? 'rgba(245,158,11,0.5)'
    : stock <= seuil * 1.5  ? 'rgba(34,197,94,0.5)'
    : 'rgba(34,197,94,0.5)';
  const stockCol = stock <= 0 ? '#ef4444' : stock <= seuil ? '#dc2626' : stock <= seuil * 1.5 ? '#b45309' : '#15803d';
  return `
    <div>
      <strong style="font-size:13px;font-weight:800;color:${stockCol};">${fmtQ(stock)}</strong>
      <div style="margin-top:3px;height:5px;background:var(--ui-bg2);border-radius:3px;overflow:hidden;width:70px;">
        <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;"></div>
      </div>
    </div>`;
}

/* -------------------------------------------------------
   INDICATEURS — état de stock, puis répartition par catégorie.
   Les catégories affichées sont déduites des articles du tenant
   connecté : chaque client voit les siennes, rien n'est figé
   dans le code.
------------------------------------------------------- */
function _pillEtat(dot, label, n, col) {
  return `<div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
    <span style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block;"></span>
    <span style="font-weight:600;">${label}</span>
    <span style="font-weight:800;color:${col};">${n}</span>
  </div>`;
}

function _pillCat(categorie, n) {
  const c = _catColor(categorie);
  return `<div style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;font-size:12px;
    background:${c.bg};border:1px solid ${c.brd};color:${c.txt};">
    <span style="font-weight:600;">${esc(_catLabel(categorie))}</span>
    <span style="font-weight:800;">${n}</span>
  </div>`;
}

function _renderIndicateurs() {
  const el = document.getElementById('stockIndicateurs');
  if (!el) return;

  /* Hors stock = stock reel a zero, deduit automatiquement — plus de case
     manuelle. Les 3 autres compteurs portent sur le stock reellement
     disponible (> 0), pour ne pas melanger rupture et stock bas. */
  const enStockArticles = _articles.filter(a => Number(a.stock) > 0);
  const enStock   = enStockArticles.filter(a => a.stock > a.seuil).length;
  const faible    = enStockArticles.filter(a => a.stock <= a.seuil && a.stock > a.seuil * 0.5).length;
  const bas       = enStockArticles.filter(a => a.stock <= a.seuil * 0.5).length;
  const horsStock = _articles.length - enStockArticles.length;

  const parCat = {};
  _articles.forEach(a => {
    const k = a.categorie || '';
    parCat[k] = (parCat[k] || 0) + 1;
  });
  const cats = Object.entries(parCat)
    .sort((x, y) => y[1] - x[1] || _catLabel(x[0]).localeCompare(_catLabel(y[0]), 'fr'));

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:9px;">
      ${_pillEtat('#22c55e', 'En stock', enStock, '#16a34a')}
      ${_pillEtat('#f59f00', 'Faibles', faible, '#b45309')}
      ${_pillEtat('#ef4444', 'Sous seuil', bas, '#dc2626')}
      ${horsStock ? _pillEtat('#94a3b8', 'Hors stock', horsStock, '#475569') : ''}
    </div>
    ${cats.length ? `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
      ${cats.map(([cat, n]) => _pillCat(cat, n)).join('')}
    </div>` : ''}`;
}

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  _articles = await getArticles();
  _bindSearchInput();
  _bindSortHeaders();
  _bindNewArticleForm();
  _bindInventaireForm();
  _bindTableActions();
  _bindColumnFilters();
  _bindClearFilters();
  _renderColumnFilters();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _articles = await getArticles();
  _renderIndicateurs();
  _renderTable();
  _renderColumnFilters();
}

/* -------------------------------------------------------
   DÉLÉGATION — Règle 17
------------------------------------------------------- */
let _tableActionsbound = false;
function _bindTableActions() {
  if (_tableActionsbound) return;
  _tableActionsbound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#stockTbody [data-action]');
    if (!btn) return;
    e.stopPropagation();

    if (btn.dataset.action === 'commander') {
      const ref     = btn.dataset.ref;
      const article = _articles.find(a => a.ref === ref);
      document.dispatchEvent(new CustomEvent('appmee:openAchatFor', {
        detail: {
          ref,
          nom:         article?.nom        || '',
          fournisseur: article?.fournisseur || '',
          prix:        article?.prix        || 0,
          unite:       article?.unite       || '',
        }
      }));
      openModal('modalAchat');
    }

    if (btn.dataset.action === 'inventaire') _openInventaire(btn.dataset.id);
  }, true);
}

/* -------------------------------------------------------
   TABLEAU — Fix S12 redesign
------------------------------------------------------- */
function _renderTable() {
  document.getElementById('stockTbody').innerHTML = _articles.map(a => {
    return `<tr data-id="${esc(a.id)}">
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td>${_tagCat(a.categorie)}</td>
      <td style="font-size:11.5px;color:var(--ink-muted)">${esc(a.unite)}</td>
      <td>${_progBar(a.stock, a.seuil)}</td>
      <td style="font-size:12px;">${fmtQ(a.seuil)}</td>
      <td>${_badgeStatut(a.stock, a.seuil)}</td>
      <td style="font-weight:600;">${fmt(a.prix)} €</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(a.fournisseur || '—')}</td>
      <td>
        <div style="display:flex;gap:5px;align-items:center;">
          <button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button>
          <button class="btn btn-ghost btn-sm" data-id="${esc(a.id)}" data-action="inventaire">Inventaire</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEL ARTICLE
------------------------------------------------------- */
function _bindNewArticleForm() {
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

  bindCategorieNouvelle('naCategorie', 'naCategorieNew');
  document.getElementById('btnSaveNewArticle')?.addEventListener('click', _saveNewArticle);
}

/* Catégories réellement utilisées par le tenant, triées. */
function _categoriesArticles() {
  return [...new Set(_articles.map(a => a.categorie).filter(c => c != null && c !== ''))]
    .sort((a, b) => String(a).localeCompare(String(b), 'fr'));
}

export async function initNewArticleModal() {
  try {
    [_articles, _fournisseurs] = await Promise.all([getArticles(), getFournisseurs()]);
  } catch (err) {
    console.error('[stock] initNewArticleModal ERREUR:', err.message);
  }

  const ref = nextRef('A', _articles);
  document.getElementById('naRef').value    = ref;
  document.getElementById('naNom').value    = '';
  document.getElementById('naPrix').value   = '';
  document.getElementById('naStock').value  = '0';
  document.getElementById('naSeuil').value  = '';

  const fs = document.getElementById('naFournisseurSel');
  fs.innerHTML = '<option value="">— Choisir —</option>' +
    _fournisseurs.map(f => `<option value="${esc(f.nom)}">${esc(f.nom)}</option>`).join('');
  document.getElementById('naFournisseur').value = '';

  /* Liste reconstruite à chaque ouverture : une catégorie créée juste
     avant depuis Admin apparaît sans recharger la page. */
  const cs = document.getElementById('naCategorie');
  if (cs) cs.innerHTML = optionsCategories(_categoriesArticles(), '');
  const cn = document.getElementById('naCategorieNew');
  if (cn) { cn.value = ''; cn.style.display = 'none'; }

  document.getElementById('naCategorie').dispatchEvent(new Event('change'));
}

async function _saveNewArticle() {
  const ref         = document.getElementById('naRef').value.trim();
  const nom         = document.getElementById('naNom').value.trim() || document.getElementById('naNomSel').value;
  const categorie   = lireCategorie('naCategorie', 'naCategorieNew');
  const unite       = document.getElementById('naUnite').value;
  const prix        = parseFloat(document.getElementById('naPrix').value) || 0;
  const fournisseur = document.getElementById('naFournisseur').value || document.getElementById('naFournisseurSel').value;
  const seuil       = parseInt(document.getElementById('naSeuil').value) || 50;
  const stock       = parseFloat(document.getElementById('naStock').value) || 0;

  if (!ref || !nom) { showToast('⚠ Référence et nom requis.', 'error'); return; }

  try { _articles = await getArticles(); } catch (_) {}
  if (_articles.find(a => a.ref === ref)) {
    showToast('⚠ Référence déjà existante — rouvrir le modal.', 'error');
    return;
  }

  try {
    const created = await createArticle({ ref, nom, categorie, unite, prix, fournisseur, seuil, stock });
    _articles.push(created);
    closeModal('modalNewArticle');
    _renderIndicateurs();
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
      type:    'inventaire',
      ref:     a.ref,
      nom:     a.nom,
      qte:     Math.abs(ecart),
      motif:   'Inventaire — ' + motif,
      ref_doc: 'INV-' + Date.now(),
    });
    a.stock = qReal;
    closeModal('modalInventaire');
    _renderIndicateurs();
    _renderTable();
    showToast(`✅ ${a.nom} ajusté : ${fmtQ(qReal)} ${a.unite} (écart : ${ecart >= 0 ? '+' : ''}${fmtQ(ecart)})`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
  } catch (err) {
    showToast('❌ Erreur inventaire.', 'error');
  }
}

/* -------------------------------------------------------
   INVENTAIRE GLOBAL
------------------------------------------------------- */
export function openInventaireGlobal() {
  let modal = document.getElementById('modalInventaireGlobal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalInventaireGlobal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:680px;max-height:85vh;display:flex;flex-direction:column;">
        <div class="modal-hdr">
          <h3>📦 Inventaire global</h3>
          <button class="btn-close" data-close="modalInventaireGlobal">✕</button>
        </div>
        <div class="modal-body" style="flex:1;overflow-y:auto;">
          <p style="font-size:11.5px;color:var(--ink-muted);margin-bottom:10px;">
            Saisissez les quantités réelles pour chaque article à ajuster.
          </p>
          <div id="invGlobalLignes" style="display:grid;gap:6px;"></div>
          <button class="btn btn-ghost btn-sm" id="btnAddInvLigne" style="margin-top:8px;">+ Ajouter une ligne</button>
        </div>
        <div class="modal-ftr">
          <button class="btn btn-ghost" data-close="modalInventaireGlobal">Annuler</button>
          <button class="btn btn-primary" id="btnSaveInvGlobal">Enregistrer tout</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(btn =>
      btn.addEventListener('click', () => closeModal('modalInventaireGlobal')));
  }

  _renderInvGlobalLignes();
  document.getElementById('btnAddInvLigne').onclick = _addInvGlobalLigne;
  const btnSave = document.getElementById('btnSaveInvGlobal');
  const newBtn  = btnSave.cloneNode(true);
  btnSave.parentNode.replaceChild(newBtn, btnSave);
  newBtn.addEventListener('click', _saveInvGlobal);
  openModal('modalInventaireGlobal');
}

function _renderInvGlobalLignes() {
  const container = document.getElementById('invGlobalLignes');
  container.innerHTML = '';
  const alertes = _articles.filter(sousSeuil);
  if (alertes.length) { alertes.forEach(a => _addInvGlobalLigne(a)); }
  else { _addInvGlobalLigne(); }
}

function _addInvGlobalLigne(preselectArticle = null) {
  const container = document.getElementById('invGlobalLignes');
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:2fr 80px 80px auto;gap:7px;align-items:center;';

  const opts = _articles.map(a =>
    `<option value="${esc(a.id)}" ${preselectArticle && a.id === preselectArticle.id ? 'selected' : ''}>${esc(a.ref)} — ${esc(a.nom)} (stock: ${fmtQ(a.stock)} ${esc(a.unite)})</option>`
  ).join('');

  row.innerHTML = `
    <select class="ig-art inp" style="font-size:11px;">${opts}</select>
    <input type="number" step="0.001" placeholder="Qté réelle" class="ig-qte inp">
    <span class="ig-unite" style="font-size:11px;color:var(--ink-muted);padding-left:4px;"></span>
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;" type="button">×</button>`;

  const artSel  = row.querySelector('.ig-art');
  const uniteEl = row.querySelector('.ig-unite');
  const syncUnite = () => { const a = _articles.find(x => x.id === artSel.value); uniteEl.textContent = a ? a.unite : ''; };
  artSel.addEventListener('change', syncUnite);
  syncUnite();
  row.querySelector('button').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

async function _saveInvGlobal() {
  const rows = document.querySelectorAll('#invGlobalLignes > div');
  const toUpdate = [];
  rows.forEach(row => {
    const artId = row.querySelector('.ig-art')?.value;
    const qte   = parseFloat(row.querySelector('.ig-qte')?.value);
    if (artId && !isNaN(qte) && qte >= 0) toUpdate.push({ artId, qte });
  });
  if (!toUpdate.length) { showToast('⚠ Aucune ligne à enregistrer.', 'error'); return; }

  let ok = 0;
  for (const { artId, qte } of toUpdate) {
    const a = _articles.find(x => x.id === artId);
    if (!a) continue;
    const ecart = qte - a.stock;
    try {
      await updateArticleStock(artId, qte);
      await addMouvement({ type: 'inventaire', ref: a.ref, nom: a.nom, qte: Math.abs(ecart), motif: 'Inventaire global', ref_doc: 'INV-' + Date.now() });
      a.stock = qte;
      ok++;
    } catch (err) { showToast(`❌ Erreur sur ${a.ref}.`, 'error'); }
  }
  closeModal('modalInventaireGlobal');
  _renderIndicateurs();
  _renderTable();
  showToast(`✅ ${ok} article(s) mis à jour.`);
  document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
}

/* -------------------------------------------------------
   RECHERCHE ET TRI
------------------------------------------------------- */
function _bindSearchInput() {
  document.getElementById('stockSearchInput')?.addEventListener('input', _applyFilters);
}

/* -------------------------------------------------------
   FILTRES PAR COLONNE — une liste déroulante par entête,
   sauf Actions. Se combinent en ET avec la recherche libre.
------------------------------------------------------- */
function _renderColumnFilters() {
  document.querySelectorAll('#stockFilterRow .stock-col-filter').forEach(sel => {
    const col = parseInt(sel.dataset.col);
    const getValue = {
      0: a => a.ref,
      1: a => a.nom,
      2: a => CAT_LABELS[a.categorie] || a.categorie || '—',
      3: a => a.unite,
      4: a => fmtQ(a.stock),
      5: a => fmtQ(a.seuil),
      6: a => _statutLabel(a.stock, a.seuil),
      7: a => fmt(a.prix) + ' €',
      8: a => a.fournisseur || '—',
    }[col];
    if (!getValue) return;
    const current = sel.value;
    const valeurs = [...new Set(_articles.map(getValue))].filter(v => v !== '' && v != null).sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }));
    sel.innerHTML = '<option value="">Tous</option>' + valeurs.map(v => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
  });
}

/* Doit renvoyer exactement le texte affiche par _badgeStatut :
   le filtre colonne compare le libelle au contenu de la cellule. */
function _statutLabel(stock, seuil) {
  if (stock <= 0) return 'Hors stock';
  if (stock <= seuil * 0.5) return 'Bas';
  if (stock <= seuil) return 'Faible';
  return 'OK';
}

function _bindColumnFilters() {
  document.querySelectorAll('#stockFilterRow .stock-col-filter').forEach(sel => {
    sel.addEventListener('change', _applyFilters);
  });
}

function _applyFilters() {
  const q = _norm(document.getElementById('stockSearchInput')?.value || '');
  const filtres = Array.from(document.querySelectorAll('#stockFilterRow .stock-col-filter'))
    .map(sel => ({ col: parseInt(sel.dataset.col), val: sel.value }))
    .filter(f => f.val !== '');

  document.querySelectorAll('#stockTbody tr').forEach(row => {
    const matchTexte  = !q || _norm(row.textContent).includes(q);
    const matchCols   = filtres.every(f => (row.cells[f.col]?.textContent.trim() || '') === f.val);
    row.style.display = (matchTexte && matchCols) ? '' : 'none';
  });
}

/* Remet la recherche libre et les 9 filtres de colonne à zéro d'un coup. */
function _bindClearFilters() {
  document.getElementById('btnClearStockFilters')?.addEventListener('click', () => {
    const s = document.getElementById('stockSearchInput');
    if (s) s.value = '';
    document.querySelectorAll('#stockFilterRow .stock-col-filter').forEach(sel => { sel.value = ''; });
    _applyFilters();
  });
}

function _bindSortHeaders() {
  document.querySelectorAll('#stockTable th[data-sort-col], #stockTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.sortCol ?? th.cellIndex);
      sortTable('stockTable', col);
    });
  });
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getArticlesCache() { return _articles; }
export function getArticleByRef(ref) { return _articles.find(a => a.ref === ref) || null; }
