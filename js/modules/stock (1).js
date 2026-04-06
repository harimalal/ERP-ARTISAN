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
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button>
        <button class="btn btn-ghost btn-sm" data-id="${esc(a.id)}" data-action="modifier" style="margin-left:4px;">✏ Modifier</button>
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
    if (btn.dataset.action === 'modifier') {
      _openEditArticle(btn.dataset.id);
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
   ÉDITION ARTICLE — pop-up via bouton Modifier
   Modal recréé à chaque ouverture — non persistant.
------------------------------------------------------- */
function _openEditArticle(articleId) {
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;

  /* Supprimer toute instance précédente */
  const existing = document.getElementById('modalEditArticle');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modalEditArticle';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal modal-lg">
    <div class="modal-hdr">
      <span class="modal-hdr-title">✏ Modifier l'article — ${esc(a.ref)}</span>
      <button class="modal-close" id="btnCloseEditArticle">×</button>
    </div>
    <div class="form-grid" style="padding:16px;">
      <div class="form-group"><label>Référence</label><input id="eaRef" class="inp" readonly style="opacity:.6;"></div>
      <div class="form-group"><label>Unité</label>
        <select id="eaUnite" class="inp">
          <option value="kg">kg</option><option value="g">g</option>
          <option value="L">L</option><option value="ml">ml</option>
          <option value="unité">unité</option><option value="pièce">pièce</option>
          <option value="boîte">boîte</option><option value="rouleau">rouleau</option>
          <option value="sac">sac</option><option value="m">m</option>
        </select>
      </div>
      <div class="form-group full"><label>Nom</label><input id="eaNom" class="inp"></div>
      <div class="form-group"><label>Catégorie</label>
        <select id="eaCategorie" class="inp">
          <option value="matiere">Matière première</option>
          <option value="emballage">Emballage</option>
          <option value="ingredient">Ingrédient</option>
          <option value="fourniture">Fourniture</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      <div class="form-group"><label>Fournisseur</label><input id="eaFournisseur" class="inp"></div>
      <div class="form-group"><label>Prix unitaire (€)</label><input id="eaPrix" type="number" step="0.001" class="inp"></div>
      <div class="form-group"><label>Seuil alerte</label><input id="eaSeuil" type="number" class="inp"></div>
      <div class="form-group"><label>Stock actuel</label><input id="eaStock" type="number" step="0.001" class="inp"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btnSaveEditArticle">💾 Enregistrer</button>
      <button class="btn btn-ghost" id="btnCancelEditArticle">Annuler</button>
    </div>
  </div>`;

  document.body.appendChild(modal);

  /* Remplir les champs */
  document.getElementById('eaRef').value         = a.ref;
  document.getElementById('eaNom').value         = a.nom;
  document.getElementById('eaCategorie').value   = a.categorie || 'autre';
  document.getElementById('eaUnite').value       = a.unite || 'kg';
  document.getElementById('eaPrix').value        = a.prix || '';
  document.getElementById('eaSeuil').value       = a.seuil || '';
  document.getElementById('eaStock').value       = a.stock || 0;
  document.getElementById('eaFournisseur').value = a.fournisseur || '';

  const closeModal = () => modal.remove();
  document.getElementById('btnCloseEditArticle').addEventListener('click', closeModal);
  document.getElementById('btnCancelEditArticle').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('btnSaveEditArticle').addEventListener('click', () => _saveEditArticle(articleId, closeModal));
}

async function _saveEditArticle(articleId, closeModalFn) {
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;
  const changes = {
    nom:         document.getElementById('eaNom').value.trim(),
    categorie:   document.getElementById('eaCategorie').value,
    unite:       document.getElementById('eaUnite').value,
    prix:        parseFloat(document.getElementById('eaPrix').value) || 0,
    seuil:       parseFloat(document.getElementById('eaSeuil').value) || 0,
    stock:       parseFloat(document.getElementById('eaStock').value) || 0,
    fournisseur: document.getElementById('eaFournisseur').value.trim(),
  };
  if (!changes.nom) { showToast('⚠ Le nom est requis.', 'error'); return; }
  try {
    await updateArticle(articleId, changes);
    Object.assign(a, changes);
    closeModalFn();
    _renderTable();
    showToast('✅ Article ' + a.ref + ' mis à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
  } catch (err) {
    showToast('❌ Erreur mise à jour article.', 'error');
  }
}

/* -------------------------------------------------------
   INVENTAIRE GLOBAL — tableau pleine largeur, tous articles
   Modal non persistant, recréé à chaque ouverture.
------------------------------------------------------- */
export function openInventaireGlobal() {
  /* Supprimer toute instance précédente */
  const existing = document.getElementById('modalInventaireGlobal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modalInventaireGlobal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `<div class="modal modal-xl" style="max-height:90vh;display:flex;flex-direction:column;width:95vw;max-width:1100px;">
    <div class="modal-hdr">
      <span class="modal-hdr-title">📦 Inventaire global — ${_articles.length} articles</span>
      <button class="modal-close" id="btnCloseInvGlobal">×</button>
    </div>
    <div style="padding:10px 16px 6px;font-size:11.5px;color:var(--ink-muted);">
      Saisissez la quantité réelle pour les articles à ajuster. Les lignes sans quantité saisie seront ignorées.
    </div>
    <div style="flex:1;overflow-y:auto;padding:0 16px 12px;">
      <table id="invGlobalTable" style="width:100%;">
        <thead><tr>
          <th>Réf</th><th>Article</th><th>Catégorie</th><th>Unité</th>
          <th>Stock système</th><th>Qté réelle</th><th>Écart</th>
        </tr></thead>
        <tbody id="invGlobalTbody"></tbody>
      </table>
    </div>
    <div class="form-actions between" style="border-top:1px solid var(--ui-brd);padding-top:12px;">
      <div style="font-size:11.5px;color:var(--ink-muted);" id="invGlobalCount">—</div>
      <div style="display:flex;gap:7px;">
        <button class="btn btn-ghost" id="btnCancelInvGlobal">Annuler</button>
        <button class="btn btn-primary" id="btnSaveInvGlobal">💾 Enregistrer les ajustements</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  /* Remplir le tableau avec tous les articles */
  _renderInvGlobalTable();

  const closeInv = () => modal.remove();
  document.getElementById('btnCloseInvGlobal').addEventListener('click', closeInv);
  document.getElementById('btnCancelInvGlobal').addEventListener('click', closeInv);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeInv(); });
  document.getElementById('btnSaveInvGlobal').addEventListener('click', _saveInvGlobal);
}

function _renderInvGlobalTable() {
  const tbody = document.getElementById('invGlobalTbody');
  if (!tbody) return;

  tbody.innerHTML = _articles.map(a => `
    <tr data-art-id="${esc(a.id)}">
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td><span class="tag">${esc(a.categorie || '—')}</span></td>
      <td>${esc(a.unite)}</td>
      <td style="font-weight:600;">${fmtQ(a.stock)}</td>
      <td><input type="number" step="0.001" min="0" placeholder="—"
        class="ig-qte" data-art-id="${esc(a.id)}"
        style="width:90px;padding:4px 7px;border:1.5px solid var(--ui-brd);border-radius:5px;font-size:12px;"
        oninput="_invGlobalUpdateEcart(this, ${a.stock})"></td>
      <td class="ig-ecart" style="font-size:11.5px;color:var(--ink-muted);">—</td>
    </tr>`).join('');

  /* Mettre à jour le compteur */
  document.getElementById('invGlobalCount').textContent = `${_articles.length} articles`;

  /* Exposer la fonction d'écart globalement pour le oninput inline */
  window._invGlobalUpdateEcart = (input, stockActuel) => {
    const qte = parseFloat(input.value);
    const tr  = input.closest('tr');
    const ecartEl = tr?.querySelector('.ig-ecart');
    if (!ecartEl) return;
    if (isNaN(qte)) { ecartEl.textContent = '—'; ecartEl.style.color = 'var(--ink-muted)'; return; }
    const ecart = qte - stockActuel;
    ecartEl.textContent = (ecart >= 0 ? '+' : '') + fmtQ(ecart);
    ecartEl.style.color = ecart === 0 ? 'var(--ink-muted)' : ecart > 0 ? 'var(--ui-green)' : 'var(--ui-red)';
  };
}

async function _saveInvGlobal() {
  /* Lire toutes les lignes du tableau qui ont une qté saisie */
  const inputs = document.querySelectorAll('#invGlobalTbody .ig-qte');
  const toUpdate = [];

  inputs.forEach(input => {
    const artId = input.dataset.artId;
    const qte   = parseFloat(input.value);
    if (artId && !isNaN(qte) && qte >= 0) toUpdate.push({ artId, qte });
  });

  if (!toUpdate.length) {
    showToast('⚠ Aucune quantité saisie.', 'error');
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

  /* Fermer le modal dynamique */
  const modal = document.getElementById('modalInventaireGlobal');
  if (modal) modal.remove();

  _renderTable();
  showToast(`✅ ${ok} article(s) mis à jour.`);
  document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'articles' } }));
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
