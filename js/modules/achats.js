/* -------------------------------------------------------
   AppMee — modules/achats.js
   Bons de commande fournisseurs : liste, création,
   détail/édition, réception (mise à jour stock).
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getAchats, createAchat, updateAchat,
  getArticles, getFournisseurs, getTenant,
  updateArticleStock, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeAchat, showToast, today,
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

/* Cache local */
let _achats       = [];
let _articles     = [];
let _fournisseurs = [];
let _tenant       = {};   /* Coordonnées Mon Entreprise pour les PDFs */
let _currentBCId  = null; /* UUID du BC en cours d'édition */
let _bcLignes     = [];   /* Lignes du formulaire BC courant */

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_achats, _articles, _fournisseurs, _tenant] = await Promise.all([
    getAchats(), getArticles(), getFournisseurs(), getTenant(),
  ]);
  _bindAchatForm();
  _bindDetailBCForm();

  // listener appmee:openAchatFor géré dans app.html
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _achats = await getAchats();
  _renderTable();
}

function _renderTable() {
  document.getElementById('achatsTbody').innerHTML = _achats.map(a => `
    <tr class="clickable" data-id="${a.id}" data-action="detail">
      <td class="td-ref">${esc(a.ref)}</td>
      <td>${esc(a.date_cmd)}</td>
      <td>${esc(a.article_nom || a.ref)}</td>
      <td>${fmtQ(a.quantite)} ${esc(a.unite || '')}</td>
      <td style="font-weight:600">${fmt(a.montant_ht || 0)} €</td>
      <td style="font-size:11px">${esc(a.fournisseur || '—')}</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(a.ref_commande || '—')}</td>
      <td onclick="event.stopPropagation()">
        ${badgeAchat(a.statut || 'brouillon')}
        <select style="font-size:10.5px;padding:2px 6px;border:1px solid var(--ui-brd);border-radius:5px;margin-left:5px;"
             data-id="${a.id}" data-action="changer-statut">
           <option value="">Changer…</option>
           <option value="brouillon">Brouillon</option>
           <option value="envoye">Envoyé</option>
           <option value="en_cours">En cours</option>
           <option value="recu">Reçu ✓</option>
         </select>
      </td>
      <td onclick="event.stopPropagation()">
        <button class="btn-icon" data-id="${a.id}" data-action="pdf" title="Aperçu PDF">👁</button>
      </td>
    </tr>`).join('') ||
    '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun bon de commande.</td></tr>';

  const tbody = document.getElementById('achatsTbody');

  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'detail') _openDetailBC(id);
    if (action === 'pdf')    _aperçuPdfBC(id);
  };

  tbody.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-action="changer-statut"]');
    if (sel && sel.value) await _changerStatutBC(sel.dataset.id, sel.value);
  });
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEAU BC
------------------------------------------------------- */
export function initAchatModal(preselectArticleRef = null) {
  document.getElementById('achatDate').value     = today();
  document.getElementById('achatRemarque').value = '';
  document.getElementById('achatRefCmd').value   = '';
  document.getElementById('achatMontant').style.display = 'none';

  const fSel = document.getElementById('achatFournisseur');
  fSel.innerHTML = '<option value="">— Tous fournisseurs —</option>' +
    _fournisseurs.map(f => `<option value="${esc(f.nom)}">${esc(f.nom)}</option>`).join('');

  /* Réinitialiser les lignes */
  _bcLignes = [];
  _renderBCLignes();

  /* Ajouter une ligne initiale, pré-sélectionnée si ref fournie */
  _addBCLigne(preselectArticleRef);

  /* Forcer le fournisseur dans le select APRÈS _addBCLigne
     (_addBCLigne tente de le setter mais peut échouer selon le timing —
     on force ici sans condition pour garantir la sélection) */
  if (preselectArticleRef) {
    const art = _articles.find(a => a.ref === preselectArticleRef);
    if (art && art.fournisseur) {
      if (fSel) fSel.value = art.fournisseur;
    }
  }
}

function _bindAchatForm() {
  document.getElementById('achatFournisseur')?.addEventListener('change', (e) => {
    /* Filtrer les articles par fournisseur pour toutes les lignes existantes */
    _bcLignes.forEach((_, i) => _syncLigneFournisseur(i, e.target.value));
    _renderBCTotal();
  });
  document.getElementById('btnAddBCLigne')?.addEventListener('click', () => _addBCLigne());
  document.getElementById('btnSaveAchat')?.addEventListener('click', _saveAchat);
  document.getElementById('btnAperçuBC')?.addEventListener('click', _aperçuBCFormulaire);
}

/* Rendu des lignes du BC dans le container */
function _renderBCLignes() {
  const container = document.getElementById('bcLignesContainer');
  if (!container) return;
  container.innerHTML = '';
  _bcLignes.forEach((ligne, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 90px 90px auto;gap:7px;margin-bottom:7px;align-items:center;';
    const fournisseur = document.getElementById('achatFournisseur')?.value || '';
    const list = fournisseur ? _articles.filter(a => a.fournisseur === fournisseur) : _articles;
    const opts = list.map(a => `<option value="${esc(a.id)}" ${a.id === ligne.articleId ? 'selected' : ''}>${esc(a.ref)} — ${esc(a.nom)}</option>`).join('');
    div.innerHTML = `
      <select class="bc-art" data-idx="${i}">${opts}</select>
      <input type="number" class="bc-qte" data-idx="${i}" value="${ligne.qte || ''}" placeholder="Qté" min="0.001" step="0.001">
      <input type="number" class="bc-px" data-idx="${i}" value="${ligne.prix || ''}" placeholder="Prix HT" step="0.001">
      <button class="bc-del" data-idx="${i}" style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;">×</button>`;
    div.querySelector('.bc-art').addEventListener('change', (e) => {
      const a = _articles.find(x => x.id === e.target.value);
      _bcLignes[i].articleId = e.target.value;
      _bcLignes[i].nom       = a ? a.nom : '';
      _bcLignes[i].unite     = a ? a.unite : '';
      if (a && !_bcLignes[i].prix) {
        _bcLignes[i].prix = a.prix;
        div.querySelector('.bc-px').value = a.prix;
      }
      /* Auto-sélectionner le fournisseur */
      if (a && a.fournisseur) {
        const fSel = document.getElementById('achatFournisseur');
        if (fSel && !fSel.value) fSel.value = a.fournisseur;
      }
      _renderBCTotal();
    });
    div.querySelector('.bc-qte').addEventListener('input', (e) => {
      _bcLignes[i].qte = parseFloat(e.target.value) || 0;
      _renderBCTotal();
    });
    div.querySelector('.bc-px').addEventListener('input', (e) => {
      _bcLignes[i].prix = parseFloat(e.target.value) || 0;
      _renderBCTotal();
    });
    div.querySelector('.bc-del').addEventListener('click', () => {
      _bcLignes.splice(i, 1);
      _renderBCLignes();
      _renderBCTotal();
    });
    container.appendChild(div);
  });
}

function _addBCLigne(preselectRef = null) {
  const fournisseur = document.getElementById('achatFournisseur')?.value || '';
  const list = fournisseur ? _articles.filter(a => a.fournisseur === fournisseur) : _articles;
  const defArt = preselectRef
    ? _articles.find(a => a.ref === preselectRef)
    : (list[0] || null);
  _bcLignes.push({
    articleId: defArt ? defArt.id   : (list[0]?.id || ''),
    nom:       defArt ? defArt.nom  : '',
    unite:     defArt ? defArt.unite: '',
    qte:       0,
    prix:      defArt ? defArt.prix : 0,
  });
  /* Rendu des lignes d'abord — DOM prêt avant de setter le fournisseur */
  _renderBCLignes();
  _renderBCTotal();
  /* Auto-sélectionner le fournisseur APRÈS render */
  if (defArt && defArt.fournisseur) {
    const fSel = document.getElementById('achatFournisseur');
    if (fSel && !fSel.value) fSel.value = defArt.fournisseur;
  }
}

function _syncLigneFournisseur(idx, fournisseur) {
  /* Met à jour les options d'un select article selon le fournisseur */
  _renderBCLignes();
}

function _renderBCTotal() {
  const total = _bcLignes.reduce((s, l) => s + (l.qte * l.prix), 0);
  const el = document.getElementById('achatMontant');
  const valEl = document.getElementById('achatMontantVal');
  if (el && valEl) {
    el.style.display = total > 0 ? 'block' : 'none';
    valEl.textContent = fmt(total) + ' €';
  }
}

function _populateAchatArticles(fournisseur) {
  const list = fournisseur
    ? _articles.filter(a => a.fournisseur === fournisseur)
    : _articles;

  document.getElementById('achatRef').innerHTML =
    list.map(a => `<option value="${esc(a.id)}">${esc(a.ref)}</option>`).join('');
  document.getElementById('achatNom').innerHTML =
    list.map(a => `<option value="${esc(a.id)}">${esc(a.nom)}</option>`).join('');
  _syncAchatNom();
}

function _syncAchatNom() {
  const articleId = document.getElementById('achatRef').value;
  const a = _articles.find(x => x.id === articleId);
  if (!a) return;
  document.getElementById('achatNom').value             = articleId;
  document.getElementById('achatUnite').textContent     = a.unite;
  document.getElementById('achatPrix').placeholder      = fmt(a.prix) + ' € (catalogue)';

  /* Auto-sélectionner le fournisseur lié à l'article */
  if (a.fournisseur) {
    const fSel = document.getElementById('achatFournisseur');
    const opt  = Array.from(fSel.options).find(o => o.value === a.fournisseur);
    if (opt) {
      fSel.value = a.fournisseur;
    } else {
      /* Fournisseur non dans la liste — ajouter temporairement */
      const tmp = document.createElement('option');
      tmp.value = a.fournisseur;
      tmp.textContent = a.fournisseur;
      fSel.appendChild(tmp);
      fSel.value = a.fournisseur;
    }
  }

  _updateAchatMontant();
}

function _updateAchatMontant() {
  const articleId = document.getElementById('achatRef').value;
  const qte       = parseFloat(document.getElementById('achatQte').value);
  const a         = _articles.find(x => x.id === articleId);
  if (a && qte > 0) {
    const p = parseFloat(document.getElementById('achatPrix').value) || a.prix;
    document.getElementById('achatMontant').style.display = 'block';
    document.getElementById('achatMontantVal').textContent = fmt(p * qte) + ' €';
  } else {
    document.getElementById('achatMontant').style.display = 'none';
  }
}

async function _saveAchat() {
  const lignesValides = _bcLignes.filter(l => l.articleId && l.qte > 0);
  if (!lignesValides.length) {
    showToast('⚠ Ajoutez au moins une ligne avec article et quantité.', 'error');
    return;
  }

  const fournisseur  = document.getElementById('achatFournisseur')?.value || '';
  const refCommande  = document.getElementById('achatRefCmd')?.value || '';
  const notes        = document.getElementById('achatRemarque')?.value || '';
  const date         = document.getElementById('achatDate')?.value || today();

  try {
    /* Créer un BC par ligne (1 article = 1 BC, regroupés par même numéro de base) */
    const baseRef = nextRef('BC', _achats);
    let nbCrees = 0;

    for (const ligne of lignesValides) {
      const a    = _articles.find(x => x.id === ligne.articleId);
      const prix = ligne.prix > 0 ? ligne.prix : (a ? a.prix : 0);
      const ref  = lignesValides.length === 1 ? baseRef : baseRef + '-' + (nbCrees + 1);

      const bc = await createAchat({
        ref,
        article_id:    ligne.articleId,
        article_nom:   ligne.nom || (a ? a.nom : ''),
        quantite:      ligne.qte,
        prix_unitaire: prix,
        fournisseur:   fournisseur || (a ? a.fournisseur : ''),
        statut:        'brouillon',
        ref_commande:  refCommande,
        notes,
        date_cmd:      date,
      });

      _achats.unshift(bc);
      nbCrees++;
    }

    closeModal('modalAchat');
    _renderTable();
    showToast(`✅ ${nbCrees} BC créé(s) — brouillon.`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur création BC.', 'error');
  }
}

/* -------------------------------------------------------
   DÉTAIL / ÉDITION BC
------------------------------------------------------- */
function _openDetailBC(id) {
  _currentBCId = id;
  const a = _achats.find(x => x.id === id);
  if (!a) return;

  document.getElementById('detailBCTitle').textContent = 'BC ' + (a.ref || '—') + ' — Détail & édition';
  document.getElementById('detailBCContent').innerHTML = `
    <div class="form-grid" style="padding:0;">
      <div class="form-group"><label>N° BC</label>
        <input type="text" id="dbcRef" value="${esc(a.ref || '')}" readonly style="background:var(--ui-bg2);color:var(--ink-muted);"></div>
      <div class="form-group"><label>Date</label>
        <input type="date" id="dbcDate" value="${esc(a.date_cmd || '')}"></div>
      <div class="form-group"><label>Article</label>
        <input type="text" id="dbcNom" value="${esc(a.article_nom || '')}"></div>
      <div class="form-group"><label>Quantité</label>
        <input type="number" id="dbcQte" value="${a.quantite || 0}" step="0.01" oninput="document.getElementById('dbcMontantPreview').textContent=(parseFloat(this.value)||0)*(parseFloat(document.getElementById('dbcPrix').value)||0)+' €'"></div>
      <div class="form-group"><label>Prix unit. HT (€)</label>
        <input type="number" id="dbcPrix" value="${a.prix_unitaire || 0}" step="0.01"></div>
      <div class="form-group"><label>Montant HT</label>
        <div id="dbcMontantPreview" style="padding:7px 10px;background:var(--ui-bg2);border:1.5px solid var(--ui-brd);border-radius:6px;font-size:12.5px;font-weight:600;">${fmt(a.montant_ht || 0)} €</div></div>
      <div class="form-group"><label>Fournisseur</label>
        <input type="text" id="dbcFournisseur" value="${esc(a.fournisseur || '')}"></div>
      <div class="form-group"><label>Réf commande</label>
        <input type="text" id="dbcRefCmd" value="${esc(a.ref_commande || '')}"></div>
      <div class="form-group"><label>Statut</label>
        <select id="dbcStatut">
          <option value="brouillon" ${a.statut === 'brouillon' ? 'selected' : ''}>Brouillon</option>
          <option value="envoye"    ${a.statut === 'envoye'    ? 'selected' : ''}>Envoyé</option>
          <option value="en_cours"  ${a.statut === 'en_cours'  ? 'selected' : ''}>En cours</option>
          <option value="recu"      ${a.statut === 'recu'      ? 'selected' : ''}>Reçu</option>
        </select>
      </div>
      <div class="form-group full"><label>Remarque</label>
        <input type="text" id="dbcRemarque" value="${esc(a.notes || '')}"></div>
    </div>`;

  openModal('modalDetailBC');
}

function _bindDetailBCForm() {
  document.getElementById('btnSaveDetailBC')?.addEventListener('click', _saveDetailBC);
  document.getElementById('btnAperçuBCDetail')?.addEventListener('click', () => {
    if (_currentBCId) _aperçuPdfBC(_currentBCId);
  });
}

async function _saveDetailBC() {
  if (!_currentBCId) return;

  const oldStatut = _achats.find(x => x.id === _currentBCId)?.statut;
  const newStatut = document.getElementById('dbcStatut').value;
  const qte       = parseFloat(document.getElementById('dbcQte').value) || 0;
  const prix      = parseFloat(document.getElementById('dbcPrix').value) || 0;

  try {
    const updated = await updateAchat(_currentBCId, {
      date_cmd:     document.getElementById('dbcDate').value,
      article_nom:  document.getElementById('dbcNom').value,
      quantite:     qte,
      prix_unitaire: prix,
      fournisseur:  document.getElementById('dbcFournisseur').value,
      ref_commande: document.getElementById('dbcRefCmd').value,
      notes:        document.getElementById('dbcRemarque').value,
      statut:       newStatut,
    });

    /* Si nouveau statut = reçu → mettre à jour le stock */
    if (newStatut === 'recu' && oldStatut !== 'recu') {
      const bc = _achats.find(x => x.id === _currentBCId);
      if (bc) {
        const art = _articles.find(x => x.id === bc.article_id);
        if (art) {
          await updateArticleStock(art.id, art.stock + qte);
          await addMouvement({ type: 'entree', ref: art.ref, nom: art.nom, qte, motif: 'Réception ' + (bc.ref || ''), ref_doc: bc.ref });
          art.stock += qte;
          showToast('✅ Réception enregistrée — stock mis à jour.');
        }
      }
    }

    const idx = _achats.findIndex(x => x.id === _currentBCId);
    if (idx >= 0) _achats[idx] = { ..._achats[idx], ...updated };

    closeModal('modalDetailBC');
    _renderTable();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur enregistrement BC.', 'error');
  }
}

/* -------------------------------------------------------
   CHANGEMENT STATUT RAPIDE (depuis la liste)
------------------------------------------------------- */
async function _changerStatutBC(id, statut) {
  if (!statut) return;
  try {
    await updateAchat(id, { statut });

    if (statut === 'recu') {
      const bc  = _achats.find(x => x.id === id);
      const art = bc ? _articles.find(x => x.id === bc.article_id) : null;
      if (art && bc) {
        await updateArticleStock(art.id, art.stock + bc.quantite);
        await addMouvement({ type: 'entree', ref: art.ref, nom: art.nom, qte: bc.quantite, motif: 'Réception ' + (bc.ref || ''), ref_doc: bc.ref });
        art.stock += bc.quantite;
        showToast('✅ ' + (art.nom) + ' : +' + fmtQ(bc.quantite) + ' en stock.');
      }
    }

    const bc = _achats.find(x => x.id === id);
    if (bc) bc.statut = statut;
    _renderTable();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur changement statut.', 'error');
  }
}

/* -------------------------------------------------------
   APERÇU PDF
------------------------------------------------------- */
function _aperçuPdfBC(id) {
  const bc = _achats.find(x => x.id === id);
  if (!bc) return;
  document.dispatchEvent(new CustomEvent('appmee:showPdf', {
    detail: { title: 'BC ' + (bc.ref || ''), type: 'bc', data: bc },
  }));
}

function _aperçuBCFormulaire() {
  const lignesValides = _bcLignes.filter(l => l.articleId && l.qte > 0);
  if (!lignesValides.length) { showToast('⚠ Ajoutez au moins une ligne.', 'error'); return; }

  const fournisseur = document.getElementById('achatFournisseur')?.value || '';
  const montantTotal = lignesValides.reduce((s, l) => s + l.qte * l.prix, 0);

  const fake = {
    ref:          '[Aperçu]',
    date_cmd:     document.getElementById('achatDate')?.value || today(),
    fournisseur,
    montant_ht:   montantTotal,
    statut:       'brouillon',
    ref_commande: document.getElementById('achatRefCmd')?.value || '',
    notes:        document.getElementById('achatRemarque')?.value || '',
    lignes:       lignesValides.map(l => {
      const a = _articles.find(x => x.id === l.articleId);
      return {
        article_nom:   l.nom || (a ? a.nom : ''),
        ref_article:   a ? a.ref : '',
        unite:         l.unite || (a ? a.unite : ''),
        quantite:      l.qte,
        prix_unitaire: l.prix,
        montant_ht:    l.qte * l.prix,
      };
    }),
    tenant: _tenant,
  };
  document.dispatchEvent(new CustomEvent('appmee:showPdf', {
    detail: { title: 'Aperçu bon de commande', type: 'bc_multi', data: fake },
  }));
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getAchatsCache()       { return _achats; }
export function getArticlesCache()     { return _articles; }
export function getFournisseursCache() { return _fournisseurs; }
