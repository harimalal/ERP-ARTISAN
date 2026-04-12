/* -------------------------------------------------------
   AppMee — modules/stock.js
   Stock articles : affichage, inventaire, alertes.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getArticles, createArticle, updateArticle,
  deleteArticle, updateArticleStock, addMouvement,
  getFournisseurs,
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
    return `<tr data-id="${esc(a.id)}">
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
      <td data-statut="${esc(stockStatus(a.stock, a.seuil))}">${stockStatus(a.stock, a.seuil)}</td>
      <td>${fmt(a.prix)} €</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(a.fournisseur || '—')}</td>
      <td onclick="event.stopPropagation()" style="display:flex;gap:5px;align-items:center;">
        <button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button>
        <button class="btn btn-ghost btn-sm" data-action="inventaire">Inventaire</button>
      </td>
    </tr>`;
  }).join('');

  /* S2 — Délégation Commander + Inventaire par ligne
     Commander : dispatch openAchatFor avec article complet → pré-remplit modal BC
     Inventaire : ouvre modal inventaire pré-sélectionné sur cet article */
  const tbody = document.getElementById('stockTbody');
  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'commander') {
      const ref = btn.dataset.ref;
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

    if (btn.dataset.action === 'modifier') {
      _openEditArticle(btn.closest('tr').dataset.id);
    }

    /* Fix B4 — Bouton Inventaire par ligne : handler existait, bouton manquait */
    if (btn.dataset.action === 'inventaire') {
      _openInventaire(btn.closest('tr').dataset.id);
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

export async function initNewArticleModal() {
  /* Fix B3 — Recharger articles ET fournisseurs depuis BDD
     pour avoir nextRef fiable et la liste fournisseurs à jour */
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

  /* Fix B3 — Recharger depuis BDD avant de vérifier le doublon
     pour éviter les faux positifs dus au cache désynchronisé */
  try { _articles = await getArticles(); } catch (_) {}
  if (_articles.find(a => a.ref === ref)) {
    showToast('⚠ Référence déjà existante — une référence a été regénérée, veuillez rouvrir le modal.', 'error');
    return;
  }

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
   ÉDITION ARTICLE — pop-up
------------------------------------------------------- */
function _openEditArticle(articleId) {
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;

  /* Détruire le modal précédent pour éviter persistance entre articles */
  const existing = document.getElementById('modalEditArticle');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modalEditArticle';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:520px;">
      <div class="modal-hdr">
        <h3>✏ Modifier l'article</h3>
        <button class="btn-close" data-close="modalEditArticle">✕</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label style="grid-column:1/2">Référence<input id="eaRef" class="inp" readonly style="opacity:.6;"></label>
        <label style="grid-column:2/3">Unité
          <select id="eaUnite" class="inp">
            <option value="kg">kg</option><option value="g">g</option>
            <option value="L">L</option><option value="ml">ml</option>
            <option value="pièce">pièce</option><option value="boîte">boîte</option>
            <option value="rouleau">rouleau</option><option value="m">m</option>
          </select>
        </label>
        <label style="grid-column:1/-1">Nom<input id="eaNom" class="inp"></label>
        <label>Catégorie
          <select id="eaCategorie" class="inp">
            <option value="matiere">Matière première</option>
            <option value="emballage">Emballage</option>
            <option value="ingredient">Ingrédient</option>
            <option value="fourniture">Fourniture</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label>Fournisseur<input id="eaFournisseur" class="inp"></label>
        <label>Prix unitaire (€)<input id="eaPrix" type="number" step="0.001" class="inp"></label>
        <label>Seuil alerte<input id="eaSeuil" type="number" class="inp"></label>
        <label>Stock actuel<input id="eaStock" type="number" step="0.001" class="inp"></label>
      </div>
      <div class="modal-ftr">
        <button class="btn btn-ghost" data-close="modalEditArticle">Annuler</button>
        <button class="btn btn-primary" id="btnSaveEditArticle">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach(btn =>
    btn.addEventListener('click', () => closeModal('modalEditArticle')));

  /* Remplir */
  document.getElementById('eaRef').value        = a.ref;
  document.getElementById('eaNom').value        = a.nom;
  document.getElementById('eaCategorie').value  = a.categorie || 'autre';
  document.getElementById('eaUnite').value      = a.unite || 'kg';
  document.getElementById('eaPrix').value       = a.prix || '';
  document.getElementById('eaSeuil').value      = a.seuil || '';
  document.getElementById('eaStock').value      = a.stock || 0;
  document.getElementById('eaFournisseur').value= a.fournisseur || '';

  document.getElementById('btnSaveEditArticle').addEventListener('click', () => _saveEditArticle(articleId));

  openModal('modalEditArticle');
}

async function _saveEditArticle(articleId) {
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;
  const changes = {
    nom:        document.getElementById('eaNom').value.trim(),
    categorie:  document.getElementById('eaCategorie').value,
    unite:      document.getElementById('eaUnite').value,
    prix:       parseFloat(document.getElementById('eaPrix').value) || 0,
    seuil:      parseFloat(document.getElementById('eaSeuil').value) || 0,
    stock:      parseFloat(document.getElementById('eaStock').value) || 0,
    fournisseur:document.getElementById('eaFournisseur').value.trim(),
  };
  if (!changes.nom) { showToast('⚠ Le nom est requis.', 'error'); return; }
  try {
    await updateArticle(articleId, changes);
    Object.assign(a, changes);
    closeModal('modalEditArticle');
    _renderTable();
    showToast('✅ Article ' + a.ref + ' mis à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
  } catch (err) {
    showToast('❌ Erreur mise à jour article.', 'error');
  }
}

/* -------------------------------------------------------
   INVENTAIRE GLOBAL MULTI-LIGNES
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
            Saisissez les quantités réelles pour chaque article à ajuster. Les autres lignes seront ignorées.
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
  const alertes = _articles.filter(a => a.stock <= a.seuil);
  if (alertes.length) {
    alertes.forEach(a => _addInvGlobalLigne(a));
  } else {
    _addInvGlobalLigne();
  }
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

  const artSel = row.querySelector('.ig-art');
  const uniteEl= row.querySelector('.ig-unite');

  const syncUnite = () => {
    const a = _articles.find(x => x.id === artSel.value);
    uniteEl.textContent = a ? a.unite : '';
  };
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

  if (!toUpdate.length) {
    showToast('⚠ Aucune ligne à enregistrer.', 'error');
    return;
  }

  let ok = 0;
  for (const { artId, qte } of toUpdate) {
    const a = _articles.find(x => x.id === artId);
    if (!a) continue;
    const ecart = qte - a.stock;
    try {
      await updateArticleStock(artId, qte);
      await addMouvement({
        type: 'inventaire',
        ref: a.ref, nom: a.nom,
        qte: Math.abs(ecart),
        motif: 'Inventaire global',
        ref_doc: 'INV-' + Date.now(),
      });
      a.stock = qte;
      ok++;
    } catch (err) {
      showToast(`❌ Erreur sur ${a.ref}.`, 'error');
    }
  }

  closeModal('modalInventaireGlobal');
  _renderTable();
  showToast(`✅ ${ok} article(s) mis à jour.`);
  document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
}

/* -------------------------------------------------------
   RECHERCHE ET TRI
   S1 — tri colonne Statut activé
------------------------------------------------------- */
function _bindSearchInput() {
  document.getElementById('stockSearchInput')?.addEventListener('input', (e) => {
    filterTable('stockTable', e.target.value);
  });
}

function _bindSortHeaders() {
  /* S1 — inclure toutes les colonnes sortables, y compris Statut */
  document.querySelectorAll('#stockTable th[data-sort-col], #stockTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.sortCol ?? th.cellIndex);
      sortTable('stockTable', col);
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
