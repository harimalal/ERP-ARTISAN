/* -------------------------------------------------------
   AppMee — modules/production.js
   Ordres de fabrication, calendrier, besoins, manques.
   Dépend de : db.js, ui.js

   Fix B2 — _terminerFab() : p.recette n'existe pas en BDD.
   Les recettes sont chargées depuis getRecettesByProduit()
   au render() et stockées dans _recettes[produitId].
   Format réel : [{ article_id, quantite, articles: { ref, prix, ... } }]

   Fix B6 — _savePlanifier() : même problème sur p.recette.
   Les BCs automatiques lisent maintenant _recettes[p.id].

   Fix commun — _calcManquesRecette(), _renderBesoins() :
   lisent _recettes[produitId] au lieu de p.recette.
------------------------------------------------------- */

import {
  getAllOFs, createOF, updateOFStatut, updateOFDate,
  getCommandes, getProduits, getArticles, getRecettesByProduit,
  updateArticleStock, updateProduitStock,
  createAchat, achatDoublonExiste, getAchats,
  addMouvement, factureExistePourCommande, createFacture,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgePlan, showToast, today,
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

/* Cache local */
let _ofs       = [];
let _commandes = [];
let _produits  = [];
let _articles  = [];
let _recettes  = {}; /* Fix B2/B6 — { produitId: [lignes recette] } */
let _calOffset = 0;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_ofs, _commandes, _produits, _articles] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(),
  ]);
  /* Charger les recettes de tous les produits en parallèle */
  await _chargerRecettes();
  _bindCalNav();
  _bindPlanifierForm();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  [_ofs, _commandes, _produits, _articles] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(),
  ]);
  /* Recharger les recettes à chaque render pour avoir les prix à jour */
  await _chargerRecettes();
  _renderCalendrier();
  _renderOFs();
  _renderFabPlan();
  _renderBesoins();
}

/* -------------------------------------------------------
   Fix B2/B6 — Charger toutes les recettes en parallèle
   et les stocker dans _recettes[produitId]
   Format : [{ article_id, quantite, articles: { ref, nom, unite, prix, stock } }]
------------------------------------------------------- */
async function _chargerRecettes() {
  const recettesRaw = await Promise.all(_produits.map(p => getRecettesByProduit(p.id)));
  _recettes = {};
  _produits.forEach((p, i) => {
    _recettes[p.id] = recettesRaw[i] || [];
  });
}

/* -------------------------------------------------------
   CALENDRIER
------------------------------------------------------- */
function _bindCalNav() {
  document.getElementById('calPrev')?.addEventListener('click', () => { _calOffset--; _renderCalendrier(); });
  document.getElementById('calNext')?.addEventListener('click', () => { _calOffset++; _renderCalendrier(); });
}

function _renderCalendrier() {
  const todayStr = today();
  const base     = new Date();
  const monday   = new Date(base);
  monday.setDate(base.getDate() - base.getDay() + 1 + _calOffset * 7);
  const jours    = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  let html = '';
  for (let d = 0; d < 7; d++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + d);
    const ds      = day.toISOString().split('T')[0];
    const isToday = ds === todayStr;

    const ofDay  = _ofs.filter(o => o.date_prevue === ds && !['clos', 'annule'].includes(o.statut));
    const cmdDay = _commandes.filter(c => c.date_livraison === ds && c.statut !== 'cloture');

    html += `<div class="cal-day">
      <div class="cal-day-hdr ${isToday ? 'today' : ''}">${jours[d]} ${day.getDate()}/${day.getMonth() + 1}</div>
      <div class="cal-day-body">
        ${ofDay.map(o => `<div class="cal-item off" title="${esc(o.produit_nom)} ×${o.quantite}">🍳 ${esc((o.produit_nom || '').split(' ').slice(0, 2).join(' '))} ×${o.quantite}</div>`).join('')}
        ${cmdDay.map(c => `<div class="cal-item cmd" title="Livraison ${esc(c.client_nom)}">📦 ${esc((c.client_nom || '').split(' ')[0])}</div>`).join('')}
      </div>
    </div>`;
  }

  document.getElementById('calWeek').innerHTML = html;
}

/* -------------------------------------------------------
   TABLE DES OFs
------------------------------------------------------- */
function _renderOFs() {
  const tbody = document.getElementById('planningTbody');

  if (!_ofs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun ordre de fabrication.</td></tr>';
    return;
  }

  const STATUT_STYLE = {
    'a_planifier': { bg: 'rgba(108,117,125,0.06)', acc: '#868e96', txt: '#495057', sel: 'rgba(108,117,125,0.10)' },
    'planifie':    { bg: 'rgba(76,110,245,0.06)',  acc: '#4c6ef5', txt: '#364fc7', sel: 'rgba(76,110,245,0.10)'  },
    'en_cours':    { bg: 'rgba(255,146,43,0.07)',  acc: '#f59f00', txt: '#7c5200', sel: 'rgba(255,146,43,0.12)'  },
    'fabrique':    { bg: 'rgba(32,201,151,0.07)',  acc: '#20c997', txt: '#087f5b', sel: 'rgba(32,201,151,0.12)'  },
    'clos':        { bg: 'rgba(32,201,151,0.05)',  acc: '#20c997', txt: '#0b7a5a', sel: 'rgba(32,201,151,0.08)'  },
    'annule':      { bg: 'rgba(250,82,82,0.06)',   acc: '#fa5252', txt: '#c92a2a', sel: 'rgba(250,82,82,0.10)'   },
  };

  const STATUT_LABELS = {
    'a_planifier':  'À planifier',
    'planifie':     'Planifié',
    'en_cours':     'En cours de fabrication',
    'fabrique':     'Fabriqué',
    'clos':         'Clos',
    'annule':       'Annulé',
  };

  const fmtDateFR = (d) => {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  tbody.innerHTML = _ofs.map(of => {
    const st = STATUT_STYLE[of.statut] || STATUT_STYLE['a_planifier'];
    return `<tr style="background:${st.bg};border-left:3px solid ${st.acc};">
      <td class="td-ref">${esc(of.ref)}</td>
      <td class="td-bold">${esc(of.produit_nom)}</td>
      <td><strong>${of.quantite}</strong></td>
      <td style="font-size:10.5px;color:var(--ink-muted)">${esc(of.notes || '')}</td>
      <td style="font-size:11.5px;color:var(--ink);">
        <span
          style="cursor:pointer;text-decoration:underline dotted;color:var(--ink);"
          title="Cliquer pour modifier la date"
          onclick="document.getElementById('dp-${of.id}').showPicker?.()">
          ${fmtDateFR(of.date_prevue)}
        </span>
        <input type="date" value="${esc(of.date_prevue || '')}"
          style="width:0;height:0;opacity:0;position:absolute;"
          data-id="${of.id}" data-action="update-date" id="dp-${of.id}">
        <button onclick="document.getElementById('dp-${of.id}').showPicker?.()"
          style="background:none;border:none;cursor:pointer;font-size:10px;padding:2px 4px;color:var(--ink-muted);" title="Modifier la date">✏</button>
      </td>
      <td>
        <select data-id="${of.id}" data-action="changer-statut"
          style="font-size:11px;padding:4px 9px;border:1.5px solid ${st.acc};border-radius:20px;
                 background:${st.sel};color:${st.txt};font-weight:600;cursor:pointer;">
          ${Object.entries(STATUT_LABELS).map(([val, label]) =>
            `<option value="${val}" ${of.statut === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  tbody.onchange = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;

    if (el.dataset.action === 'update-date') {
      await updateOFDate(id, el.value);
      const of = _ofs.find(o => o.id === id);
      if (of) of.date_prevue = el.value;
      _renderCalendrier();
      _renderOFs();
    }

    if (el.dataset.action === 'changer-statut') {
      const newStatut = el.value;
      if (newStatut === 'clos') {
        await _terminerFab(id);
      } else if (newStatut === 'annule') {
        await _annulerOF(id);
      } else {
        await _setOFStatut(id, newStatut);
        _renderOFs();
        _renderCalendrier();
      }
    }
  };
}

/* -------------------------------------------------------
   PLAN DE FABRICATION
------------------------------------------------------- */
function _renderFabPlan() {
  const fab = {};
  _ofs.filter(o => !['clos', 'annule'].includes(o.statut)).forEach(of => {
    if (!fab[of.produit_id]) fab[of.produit_id] = { nom: of.produit_nom, qte: 0, ofs: [] };
    fab[of.produit_id].qte += of.quantite;
    fab[of.produit_id].ofs.push(of.ref);
  });

  document.getElementById('fabPlanTbody').innerHTML =
    Object.entries(fab).map(([produitId, f]) => {
      const p = _produits.find(x => x.id === produitId);
      if (!p) return '';
      const manques = _calcManquesRecette(produitId, f.qte);
      const ok = !manques.length;
      return `<tr class="${ok ? 'prod-ok' : 'prod-fail'}">
        <td class="td-bold">${esc(f.nom)}</td>
        <td><strong>${f.qte}</strong> unités</td>
        <td style="font-size:11px;color:var(--ink-muted)">${f.ofs.join(', ')}</td>
        <td>${ok ? '<span class="badge badge-ok">✓ Faisable</span>' : `<span class="badge badge-alert">${manques.length} manque(s)</span>`}</td>
        <td style="font-size:10.5px;color:var(--ui-red)">${manques.join('<br>') || '—'}</td>
      </tr>`;
    }).join('') ||
    '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucun OF actif.</td></tr>';
}

/* -------------------------------------------------------
   BESOINS DEPUIS COMMANDES
------------------------------------------------------- */
function _renderBesoins() {
  const besoins = {};
  _commandes.filter(c => c.statut !== 'cloture').forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      besoins[l.produit_id] = (besoins[l.produit_id] || 0) + l.quantite;
    });
  });

  let bHtml = '';
  Object.entries(besoins).forEach(([produitId, qteCmd]) => {
    const p = _produits.find(x => x.id === produitId);
    if (!p) return;
    const manques = _calcManquesRecette(produitId, qteCmd);
    const ok = !manques.length;
    bHtml += `<tr class="${ok ? 'prod-ok' : 'prod-fail'}">
      <td class="td-bold">${esc(p.nom)}</td>
      <td><strong>${qteCmd}</strong></td>
      <td>${ok ? '<span class="badge badge-ok">✓ Faisable</span>' : `<span class="badge badge-alert">${manques.length} manque(s)</span>`}</td>
      <td style="font-size:10.5px;color:var(--ui-red)">${manques.join('<br>') || '—'}</td>
      <td>${ok
        ? `<button class="btn btn-primary btn-xs" data-produit-id="${produitId}" data-qte="${qteCmd}" data-action="creer-of">+ OF</button>`
        : '<span style="font-size:10.5px;color:var(--ink-muted)">Acheter d\'abord</span>'}
      </td>
    </tr>`;
  });

  document.getElementById('besoinsTbody').innerHTML = bHtml ||
    '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ui-green)">✅ Aucune commande en attente.</td></tr>';

  /* Fix B2/B6 — Manques globaux articles depuis _recettes (plus p.recette) */
  const mg = {};
  Object.entries(besoins).forEach(([produitId, q]) => {
    const lignes = _recettes[produitId] || [];
    lignes.forEach(l => {
      const aref = l.articles?.ref;
      if (!aref) return;
      mg[aref] = (mg[aref] || 0) + l.quantite * q;
    });
  });

  let mHtml = '';
  Object.entries(mg).forEach(([aref, besoin]) => {
    const a = _articles.find(x => x.ref === aref);
    if (!a) return;
    const manque = besoin - a.stock;
    if (manque <= 0) return;
    mHtml += `<tr>
      <td class="td-ref">${esc(aref)}</td>
      <td>${esc(a.nom)}</td>
      <td>${fmtQ(a.stock)} ${esc(a.unite)}</td>
      <td>${fmtQ(besoin)} ${esc(a.unite)}</td>
      <td style="color:var(--ui-red);font-weight:700">⚠ ${fmtQ(manque)} ${esc(a.unite)}</td>
      <td>${fmt(manque * a.prix)} €</td>
      <td style="font-size:11px">${esc(a.fournisseur || '—')}</td>
      <td><button class="btn btn-primary btn-xs" data-ref="${esc(aref)}" data-manque="${manque}" data-action="bc">BC</button></td>
    </tr>`;
  });

  document.getElementById('manquesTbody').innerHTML = mHtml ||
    '<tr><td colspan="8" style="text-align:center;padding:12px;color:var(--ui-green)">✅ Tous les articles disponibles.</td></tr>';

  document.getElementById('besoinsTbody').onclick = async (e) => {
    const btn = e.target.closest('[data-action="creer-of"]');
    if (btn) await _creerOF(btn.dataset.produitId, parseInt(btn.dataset.qte));
  };

  document.getElementById('manquesTbody').onclick = (e) => {
    const btn = e.target.closest('[data-action="bc"]');
    if (btn) {
      document.dispatchEvent(new CustomEvent('appmee:openAchatFor', {
        detail: { ref: btn.dataset.ref, qte: parseFloat(btn.dataset.manque) },
      }));
      openModal('modalAchat');
    }
  };
}

/* -------------------------------------------------------
   HELPERS
   Fix B2 — _calcManquesRecette reçoit produitId (string UUID)
   et lit depuis _recettes[produitId] au lieu de p.recette
------------------------------------------------------- */
function _calcManquesRecette(produitId, qte) {
  const lignes = _recettes[produitId] || [];
  if (!lignes.length) return [];
  const manques = [];
  lignes.forEach(l => {
    const a = _articles.find(x => x.ref === l.articles?.ref);
    if (a && a.stock < l.quantite * qte) {
      manques.push(`${a.nom} (manque ${fmtQ(l.quantite * qte - a.stock)} ${a.unite})`);
    }
  });
  return manques;
}

/* -------------------------------------------------------
   ACTIONS OFs
------------------------------------------------------- */
async function _setOFStatut(id, statut) {
  try {
    await updateOFStatut(id, statut);
    const of = _ofs.find(o => o.id === id);
    if (of) of.statut = statut;
    _renderOFs();
    _renderCalendrier();
  } catch (err) {
    showToast('❌ Erreur mise à jour OF.', 'error');
  }
}

async function _terminerFab(id) {
  const of = _ofs.find(o => o.id === id);
  if (!of) return;
  const p = _produits.find(x => x.id === of.produit_id);
  if (!p) return;

  const ok = await confirmDialog(`Terminer ${of.quantite}×${of.produit_nom} ?\nArticles déduits + produits finis ajoutés.`);
  if (!ok) return;

  try {
    /* Fix B2 — Lire les lignes de recette depuis _recettes[produit_id]
       Format réel BDD : [{ article_id, quantite, articles: { ref, nom, unite, prix } }]
       Plus de p.recette qui n'existe pas en base */
    const lignesRecette = _recettes[of.produit_id] || [];

    for (const l of lignesRecette) {
      const aref = l.articles?.ref;
      const qp   = l.quantite || 0;
      if (!aref || !qp) continue;
      const a = _articles.find(x => x.ref === aref);
      if (!a) continue;
      const newStock = Math.max(0, a.stock - qp * of.quantite);
      await updateArticleStock(a.id, newStock);
      await addMouvement({
        type:    'sortie',
        ref:     aref,
        nom:     a.nom,
        qte:     qp * of.quantite,
        motif:   'Production ' + of.ref,
        ref_doc: of.ref,
      });
      a.stock = newStock;
    }

    /* Ajouter au stock produits finis */
    const newPFStock = (p.stock || 0) + of.quantite;
    await updateProduitStock(p.id, newPFStock);
    await addMouvement({
      type:    'entree_pf',
      ref:     p.ref,
      nom:     p.nom,
      qte:     of.quantite,
      motif:   'Production ' + of.ref,
      ref_doc: of.ref,
    });
    p.stock = newPFStock;

    await updateOFStatut(id, 'clos');
    of.statut = 'clos';

    /* Passer les commandes liées à "prêt" si tout le stock est OK */
    for (const c of _commandes) {
      if (!['planifie', 'en_production'].includes(c.statut)) continue;
      const toutOK = (c.commande_lignes || []).every(l => {
        const pp = _produits.find(x => x.id === l.produit_id);
        return pp && pp.stock >= l.quantite;
      });
      if (toutOK) {
        c.statut = 'pret';
        const dejafac = await factureExistePourCommande(c.id);
        if (!dejafac) {
          const tot    = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
          const facRef = nextRef('FAC', []);
          await createFacture({ ref: facRef, commande_id: c.id, client_nom: c.client_nom, montant_ht: tot, statut: 'facture' });
        }
      }
    }

    _renderOFs();
    _renderCalendrier();
    _renderBesoins();
    showToast(`✅ ${of.quantite}×${of.produit_nom} produits.`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    console.error('[production] _terminerFab ERREUR:', err.message, err);
    showToast('❌ Erreur clôture OF.', 'error');
  }
}

async function _annulerOF(id) {
  const of = _ofs.find(o => o.id === id);
  if (!of) return;
  const ok = await confirmDialog('Annuler ' + of.ref + ' ?');
  if (!ok) return;
  try {
    await updateOFStatut(id, 'annule');
    of.statut = 'annule';
    _renderOFs();
    showToast('OF ' + of.ref + ' annulé.');
  } catch (err) {
    showToast('❌ Erreur annulation OF.', 'error');
  }
}

async function _creerOF(produitId, qte) {
  const p = _produits.find(x => x.id === produitId);
  if (!p) return;
  const ref = nextRef('OF', _ofs);
  try {
    const of = await createOF({
      ref,
      produit_id:  p.id,
      produit_nom: p.nom,
      quantite:    qte,
      date_prevue: today(),
      statut:      'planifie',
    });
    _ofs.push(of);
    _renderOFs();
    _renderCalendrier();
    showToast('✅ OF ' + ref + ' créé.');
  } catch (err) {
    showToast('❌ Erreur création OF.', 'error');
  }
}

/* -------------------------------------------------------
   FORMULAIRE PLANIFIER OF
------------------------------------------------------- */
function _bindPlanifierForm() {
  document.getElementById('btnSavePlanifier')?.addEventListener('click', _savePlanifier);
}

export function initPlanifierModal(preselectProduitRef = null) {
  const container = document.getElementById('ofLignes');
  if (container) {
    container.innerHTML = '';
    _ofLigneN = 0;
    _addOFLigne(preselectProduitRef);
  }
  const ofClients = document.getElementById('ofClients');
  if (ofClients) ofClients.value = '';
  const ofFaisabilite = document.getElementById('ofFaisabilite');
  if (ofFaisabilite) ofFaisabilite.style.display = 'none';
}

let _ofLigneN = 0;

function _addOFLigne(preselectProduitRef = null) {
  const container = document.getElementById('ofLignes');
  if (!container) return;
  _ofLigneN++;

  const div = document.createElement('div');
  div.className = 'of-ligne';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 80px 130px auto;gap:7px;margin-bottom:7px;align-items:center;';

  const byRef  = _produits.map(p =>
    `<option value="${esc(p.id)}" ${p.ref === preselectProduitRef ? 'selected' : ''}>${esc(p.ref)}</option>`).join('');
  const byName = _produits.map(p =>
    `<option value="${esc(p.id)}" ${p.ref === preselectProduitRef ? 'selected' : ''}>${esc(p.nom)}</option>`).join('');

  div.innerHTML = `
    <select class="of-ref inp" style="font-size:11.5px;font-weight:600;color:var(--accent);">${byRef}</select>
    <select class="of-nom inp">${byName}</select>
    <input type="number" placeholder="Qté" min="1" class="of-qte inp">
    <input type="date" class="of-date inp" value="${today()}">
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;line-height:1;" type="button">×</button>`;

  div.querySelector('.of-ref').addEventListener('change', (e) => {
    div.querySelector('.of-nom').value = e.target.value;
  });
  div.querySelector('.of-nom').addEventListener('change', (e) => {
    div.querySelector('.of-ref').value = e.target.value;
  });
  div.querySelector('button').addEventListener('click', () => div.remove());

  container.appendChild(div);
}

export function addOFLigne() { _addOFLigne(); }

async function _savePlanifier() {
  const container = document.getElementById('ofLignes');
  const lignes = [];

  if (container) {
    container.querySelectorAll('.of-ligne').forEach(div => {
      const produitId = div.querySelector('.of-ref')?.value;
      const qte       = parseInt(div.querySelector('.of-qte')?.value) || 0;
      const date      = div.querySelector('.of-date')?.value || today();
      if (produitId && qte > 0) lignes.push({ produitId, qte, date });
    });
  }

  if (!lignes.length) {
    showToast('⚠ Ajoutez au moins un OF avec produit et quantité.', 'error');
    return;
  }

  const notesClients = document.getElementById('ofClients')?.value || '';
  let createdCount = 0;

  try {
    for (const { produitId, qte, date } of lignes) {
      const p = _produits.find(x => x.id === produitId);
      if (!p) continue;

      const ref = nextRef('OF', _ofs);
      const of  = await createOF({
        ref,
        produit_id:  p.id,
        produit_nom: p.nom,
        quantite:    qte,
        notes:       notesClients,
        date_prevue: date,
        statut:      'planifie',
      });
      _ofs.push(of);
      createdCount++;

      /* Fix B6 — Créer BCs automatiques depuis _recettes[p.id]
         Plus de p.recette qui n'existe pas en base */
      const lignesRecette = _recettes[p.id] || [];
      for (const l of lignesRecette) {
        const aref = l.articles?.ref;
        const qp   = l.quantite || 0;
        if (!aref || !qp) continue;
        const a = _articles.find(x => x.ref === aref);
        if (!a) continue;
        const manque = qp * qte - a.stock;
        if (manque <= 0) continue;
        const doublon = await achatDoublonExiste(a.id, ref);
        if (doublon) continue;
        const bcRef = nextRef('BC', await getAchats());
        await createAchat({
          ref:           bcRef,
          article_id:    a.id,
          article_nom:   a.nom,
          quantite:      Math.ceil(manque),
          prix_unitaire: a.prix,
          fournisseur:   a.fournisseur || '',
          statut:        'brouillon',
          ref_commande:  ref,
          notes:         'Auto OF ' + ref,
        });
      }
    }

    closeModal('modalPlanifier');
    _renderOFs();
    _renderCalendrier();
    showToast(`✅ ${createdCount} OF planifié(s).`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    console.error('[production] _savePlanifier ERREUR:', err.message, err);
    showToast('❌ Erreur planification OF.', 'error');
  }
}
