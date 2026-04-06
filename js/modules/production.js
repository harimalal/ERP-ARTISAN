/* -------------------------------------------------------
   AppMee — modules/production.js
   Ordres de fabrication, calendrier, besoins, manques.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getAllOFs, createOF, updateOFStatut, updateOFDate,
  getCommandes, getProduits, getArticles,
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
let _calOffset = 0;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_ofs, _commandes, _produits, _articles] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(),
  ]);
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
  _renderCalendrier();
  _renderOFs();
  _renderFabPlan();
  _renderBesoins();
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun ordre de fabrication.</td></tr>';
    return;
  }

  /* Code couleur par statut */
  const STATUT_COLOR = {
    'a_planifier':     '#6c757d',
    'planifie':        '#0d6efd',
    'en_cours':        '#fd7e14',
    'fabrique':        '#198754',
    'clos':            '#20c997',
    'annule':          '#dc3545',
  };

  const STATUT_LABELS = {
    'a_planifier':  'À planifier',
    'planifie':     'Planifié',
    'en_cours':     'En cours de fabrication',
    'fabrique':     'Fabriqué',
    'clos':         'Clos',
    'annule':       'Annulé',
  };

  const statutOpts = Object.entries(STATUT_LABELS).map(([val, label]) =>
    `<option value="${val}">${label}</option>`).join('');

  tbody.innerHTML = _ofs.map(of => {
    const color = STATUT_COLOR[of.statut] || '#6c757d';
    return `<tr style="border-left:3px solid ${color};">
      <td class="td-ref">${esc(of.ref)}</td>
      <td class="td-bold">${esc(of.produit_nom)}</td>
      <td><strong>${of.quantite}</strong></td>
      <td style="font-size:10.5px;color:var(--ink-muted)">${esc(of.notes || '')}</td>
      <td>
        <input type="date" value="${esc(of.date_prevue || '')}"
          style="font-size:11px;padding:3px 6px;border:1px solid var(--ui-brd);border-radius:5px;"
          data-id="${of.id}" data-action="update-date">
      </td>
      <td>
        <select data-id="${of.id}" data-action="changer-statut"
          style="font-size:11px;padding:4px 7px;border:2px solid ${color};border-radius:5px;
                 background:#fff;color:${color};font-weight:600;cursor:pointer;">
          ${Object.entries(STATUT_LABELS).map(([val, label]) =>
            `<option value="${val}" ${of.statut === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  /* Délégation d'événements */
  tbody.onchange = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;

    if (el.dataset.action === 'update-date') {
      await updateOFDate(id, el.value);
      const of = _ofs.find(o => o.id === id);
      if (of) of.date_prevue = el.value;
      _renderCalendrier();
    }

    if (el.dataset.action === 'changer-statut') {
      const newStatut = el.value;
      /* Si passage à "clos" → déclencher la logique de fin de fab */
      if (newStatut === 'clos') {
        await _terminerFab(id);
      } else if (newStatut === 'annule') {
        await _annulerOF(id);
      } else {
        await _setOFStatut(id, newStatut);
      }
      _renderOFs();
      _renderCalendrier();
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
      const manques = _calcManquesRecette(p, f.qte);
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
    const manques = _calcManquesRecette(p, qteCmd);
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

  /* Manques globaux articles */
  const mg = {};
  Object.entries(besoins).forEach(([produitId, q]) => {
    const p = _produits.find(x => x.id === produitId);
    if (!p || !p.recette) return;
    Object.entries(p.recette).forEach(([aref, qp]) => {
      mg[aref] = (mg[aref] || 0) + qp * q;
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

  /* Délégation */
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
------------------------------------------------------- */
function _calcManquesRecette(produit, qte) {
  if (!produit.recette) return [];
  const manques = [];
  Object.entries(produit.recette).forEach(([aref, qp]) => {
    const a = _articles.find(x => x.ref === aref);
    if (a && a.stock < qp * qte) {
      manques.push(`${a.nom} (manque ${fmtQ(qp * qte - a.stock)} ${a.unite})`);
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
    /* Déduire les articles consommés */
    if (p.recette) {
      for (const [aref, qp] of Object.entries(p.recette)) {
        const a = _articles.find(x => x.ref === aref);
        if (!a) continue;
        const newStock = Math.max(0, a.stock - qp * of.quantite);
        await updateArticleStock(a.id, newStock);
        await addMouvement({ type: 'sortie', ref: aref, nom: a.nom, qte: qp * of.quantite, motif: 'Production ' + of.ref, ref_doc: of.ref });
        a.stock = newStock;
      }
    }

    /* Ajouter au stock produits finis */
    const newPFStock = (p.stock || 0) + of.quantite;
    await updateProduitStock(p.id, newPFStock);
    await addMouvement({ type: 'entree_pf', ref: p.ref, nom: p.nom, qte: of.quantite, motif: 'Production ' + of.ref, ref_doc: of.ref });
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
        /* Auto-créer facture si elle n'existe pas */
        const dejafac = await factureExistePourCommande(c.id);
        if (!dejafac) {
          const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
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
    console.error(err);
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
  /* Vider le conteneur multi-lignes */
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

/* Compteur lignes OF */
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

function _checkOFFaisabilite() {
  const produitId = document.getElementById('ofRef').value;
  const qte       = parseInt(document.getElementById('ofQte').value) || 0;
  const p         = _produits.find(x => x.id === produitId);
  if (!p || !qte) { document.getElementById('ofFaisabilite').style.display = 'none'; return; }

  const manques = _calcManquesRecette(p, qte);
  const ok = !manques.length;
  document.getElementById('ofFaisabilite').style.display = 'block';
  document.getElementById('ofFaisabiliteContent').innerHTML = ok
    ? `<div class="alert-box alert-success"><span>✅</span><span>Stock suffisant pour produire ${qte} unités.</span></div>`
    : `<div class="alert-box alert-warn"><span>⚠</span><div><strong>Articles insuffisants :</strong><br>${manques.map(m => '• ' + m).join('<br>')}</div></div>`;
}

async function _savePlanifier() {
  /* Collecter toutes les lignes OF du formulaire multi-lignes */
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

      /* Créer BCs automatiques si articles insuffisants */
      if (p.recette) {
        for (const [aref, qp] of Object.entries(p.recette)) {
          const a = _articles.find(x => x.ref === aref);
          if (!a) continue;
          const manque = qp * qte - a.stock;
          if (manque <= 0) continue;
          const doublon = await achatDoublonExiste(aref, ref);
          if (doublon) continue;
          const bcRef = nextRef('BC', await getAchats());
          await createAchat({ ref: bcRef, article_id: a.id, article_nom: a.nom, quantite: Math.ceil(manque), prix_unitaire: a.prix, fournisseur: a.fournisseur || '', statut: 'brouillon', ref_commande: ref, notes: 'Auto OF ' + ref });
        }
      }
    }

    closeModal('modalPlanifier');
    _renderOFs();
    _renderCalendrier();
    showToast(`✅ ${createdCount} OF planifié(s).`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    showToast('❌ Erreur planification OF.', 'error');
  }
}
