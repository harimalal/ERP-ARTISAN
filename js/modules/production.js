/* -------------------------------------------------------
   AppMee — modules/production.js
   Ordres de fabrication, calendrier, besoins, manques.
   Fix S12 — Badges indicateurs Total OF / En cours / Planifiés
             Lignes tableau blanc (pas de coloration)
             Croix suppression discrète
             Statuts select sans bordure colorée
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getAllOFs, createOF, updateOFStatut, updateOFDate, deleteOF,
  countOFsClosPourDate, cloturerOF,
  getCommandes, getProduits, getArticles, getRecettesByProduit, getClients, getTenant,
  ajusterStockArticle, ajusterStockProduit,
  createAchat, achatDoublonExiste, getAchats,
  addMouvement, factureExistePourCommande, createFacture, createFactureLignes, nextRefServeur,
  updateCommandeStatut,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgePlan, showToast, today,
  openModal, closeModal, nextRef, confirmDialog, estSurveille,
  allouerStockSequentiel, selectStatutCmd, restyleSelectStatutCmd,
} from '../ui.js';
import { changerStatutCommande } from './commandes.js';

let _ofs       = [];
let _commandes = [];
let _produits  = [];
let _articles  = [];
let _clients   = [];
let _achats    = [];
let _recettes  = {};
let _calOffset = 0;
let _calMode   = 'semaine'; // 'semaine' | 'quinzaine' | 'mois'

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_ofs, _commandes, _produits, _articles, _clients, _achats] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(), getClients(), getAchats(),
  ]);
  await _chargerRecettes();
  _bindCalNav();
  _bindPlanifierForm();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  [_ofs, _commandes, _produits, _articles, _clients, _achats] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(), getClients(), getAchats(),
  ]);
  await _chargerRecettes();
  _renderBadges();
  _renderCalendrier();
  _renderCommandesEnCours();
  _renderOFs();
  _renderVueConsolidee();
  _renderBesoins();
  _renderHistorique();
}

/* -------------------------------------------------------
   BADGES INDICATEURS — Fix S12
------------------------------------------------------- */
function _renderBadges() {
  const total    = _ofs.filter(o => !['clos', 'annule'].includes(o.statut)).length;
  const enCours  = _ofs.filter(o => o.statut === 'en_cours').length;
  const planifies = _ofs.filter(o => o.statut === 'planifie').length;

  const bof = document.getElementById('badgeOF');
  if (bof) { bof.textContent = planifies + enCours; bof.style.display = (planifies + enCours) > 0 ? '' : 'none'; }

  const el = document.getElementById('productionBadges');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
        <span style="font-weight:600;">Total OF actifs</span>
        <span style="font-weight:800;color:#16a34a;">${total}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#f59f00;display:inline-block;"></span>
        <span style="font-weight:600;">En cours</span>
        <span style="font-weight:800;color:#b45309;">${enCours}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#4c6ef5;display:inline-block;"></span>
        <span style="font-weight:600;">Planifiés</span>
        <span style="font-weight:800;color:#364fc7;">${planifies}</span>
      </div>
    </div>`;
}

/* -------------------------------------------------------
   CALENDRIER
   3 vues : semaine (défaut, inchangée), 2 semaines, mois.
   _calOffset s'exprime dans l'unité de la vue active (en semaines
   pour "semaine", en blocs de 14 jours pour "quinzaine", en mois
   pour "mois") — il est remis à 0 à chaque changement de vue pour
   toujours revenir sur la période en cours.
------------------------------------------------------- */
const CAL_JOURS  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const CAL_COLORS = {
  'a_planifier': { bg: 'rgba(108,117,125,0.12)', brd: '#868e96', txt: '#495057' },
  'planifie':    { bg: 'rgba(76,110,245,0.12)',  brd: '#4c6ef5', txt: '#364fc7' },
  'en_cours':    { bg: 'rgba(255,146,43,0.15)',  brd: '#f59f00', txt: '#7c5200' },
  'fabrique':    { bg: 'rgba(32,201,151,0.12)',  brd: '#20c997', txt: '#087f5b' },
  'clos':        { bg: 'rgba(32,201,151,0.08)',  brd: '#20c997', txt: '#0b7a5a' },
  'annule':      { bg: 'rgba(250,82,82,0.10)',   brd: '#fa5252', txt: '#c92a2a' },
};

function _bindCalNav() {
  document.getElementById('calPrev')?.addEventListener('click', () => { _calOffset--; _renderCalendrier(); });
  document.getElementById('calNext')?.addEventListener('click', () => { _calOffset++; _renderCalendrier(); });
  document.querySelectorAll('.cal-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_calMode === btn.dataset.mode) return;
      _calMode   = btn.dataset.mode;
      _calOffset = 0;
      _renderCalendrier();
    });
  });
}

function _calModeButtonsUI() {
  document.querySelectorAll('.cal-mode-btn').forEach(btn => {
    const actif = btn.dataset.mode === _calMode;
    btn.style.background = actif ? 'var(--ink)' : '#fff';
    btn.style.color      = actif ? 'var(--cream)' : 'var(--ink-muted)';
    btn.style.borderColor = actif ? 'var(--ink)' : 'var(--ui-brd2)';
  });
}

function _calDayCellHtml(day, jourLabel, todayStr) {
  const ds      = day.toISOString().split('T')[0];
  const isToday = ds === todayStr;
  const ofDay   = _ofs.filter(o => o.date_prevue === ds && !['clos', 'annule'].includes(o.statut));
  const cmdDay  = _commandes.filter(c => c.date_livraison === ds && c.statut !== 'cloture');

  return `<div class="cal-day">
      <div class="cal-day-hdr ${isToday ? 'today' : ''}">${jourLabel}</div>
      <div class="cal-day-body" style="min-height:60px;">
        ${ofDay.map(o => {
          const col = CAL_COLORS[o.statut] || CAL_COLORS['planifie'];
          return `<div class="cal-item" style="background:${col.bg};border-left:3px solid ${col.brd};color:${col.txt};border-radius:4px;padding:3px 6px;margin-bottom:3px;font-size:10.5px;line-height:1.3;" title="${esc(o.produit_nom)} ×${o.quantite} — ${esc(o.statut)}">
            🍳 ${esc((o.produit_nom || '').split(' ').slice(0, 2).join(' '))} ×${o.quantite}
          </div>`;
        }).join('')}
        ${cmdDay.map(c => `<div class="cal-item cmd" title="Livraison ${esc(c.client_nom)}">📦 ${esc((c.client_nom || '').split(' ')[0])}</div>`).join('')}
      </div>
    </div>`;
}

function _mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay() dimanche=0 -> lundi=0
  return d;
}

/* Les 3 vues partent TOUJOURS de la semaine en cours (lundi de aujourd'hui),
   jamais du 1er du mois — la vue "mois" n'est pas calée sur le mois civil,
   c'est une fenêtre glissante de 4 ou 5 semaines (selon la longueur du mois
   en cours) qui démarre elle aussi à la semaine en cours. _calOffset avance
   par blocs de nbJours, propre à chaque vue. */
function _renderGrilleParSemaines(nbJours, mode) {
  const todayStr = today();
  const monday   = _mondayOf(new Date());
  monday.setDate(monday.getDate() + _calOffset * nbJours);

  let html = '';
  for (let semaine = 0; semaine < nbJours / 7; semaine++) {
    html += '<div class="cal-week">';
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + semaine * 7 + d);
      const jourLabel = `${CAL_JOURS[d]} ${day.getDate()}/${day.getMonth() + 1}`;
      html += _calDayCellHtml(day, jourLabel, todayStr);
    }
    html += '</div>';
  }
  const calWeek = document.getElementById('calWeek');
  calWeek.className = 'cal-mode-' + mode;
  calWeek.innerHTML = html;
}

function _nbSemainesMoisCourant() {
  const base = new Date();
  const joursDuMois = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return Math.ceil(joursDuMois / 7); // 28j->4, 29-31j->5
}

function _renderCalendrier() {
  _calModeButtonsUI();

  const titre = document.getElementById('calTitleLabel');
  if (titre) {
    const libelles = {
      semaine:   _calOffset === 0 ? 'semaine en cours' : (_calOffset > 0 ? `${_calOffset} semaine(s) plus tard` : `${-_calOffset} semaine(s) plus tôt`),
      quinzaine: _calOffset === 0 ? '2 semaines en cours' : (_calOffset > 0 ? `+${_calOffset} période(s) de 2 semaines` : `${_calOffset} période(s) de 2 semaines`),
      mois:      _calOffset === 0 ? 'vue mois en cours' : (_calOffset > 0 ? `+${_calOffset} période(s) de mois` : `${_calOffset} période(s) de mois`),
    };
    titre.textContent = 'Calendrier de production — ' + (libelles[_calMode] || 'semaine en cours');
  }

  if (_calMode === 'quinzaine') _renderGrilleParSemaines(14, 'quinzaine');
  else if (_calMode === 'mois') _renderGrilleParSemaines(_nbSemainesMoisCourant() * 7, 'mois');
  else _renderGrilleParSemaines(7, 'semaine');
}

/* -------------------------------------------------------
   TABLE DES OFs — Fix S12
   - Lignes fond blanc (pas de bg coloré)
   - Pas de border-left colorée
   - Croix suppression discrète (gris, petite)
   - Select statut sans border colorée
------------------------------------------------------- */
/* -------------------------------------------------------
   ORDRES DE FABRICATION (vue par commande)
   Vue de suivi client ET point d'entrée pour planifier : une ligne par
   commande non clôturée, date de livraison + statut (même contrôle que
   Commandes Clients et Dashboard, toujours synchronisé), dépliable pour
   voir quels produits de CETTE commande sont déjà couverts par le stock
   (vert) et lesquels restent à produire (rouge) — allouerStockSequentiel,
   la même allocation que partout ailleurs.
   Choisir une date sur une ligne « à produire » crée (ou met à jour s'il
   existe déjà) l'OF du produit — TOUJOURS une seule fournée qui couvre
   d'un coup toutes les commandes en attente de ce produit, jamais un OF
   par commande (creerOFPourProduit, commandes_ids = toutes les commandes
   couvertes). La table « Ordres de fabrication — suivi des lots » plus
   bas reste le seul endroit où on clôture réellement une fabrication
   (décrémente le stock, facture) — ça n'a pas changé ici.
------------------------------------------------------- */
function _commandesEnCours() {
  return _commandes.filter(c => c.statut !== 'cloture' && c.statut !== 'annule');
}

/* Pour une commande donnée, couvert/à produire par ligne — recalculé à
   chaque appel à partir du stock et des commandes actuelles — plus l'OF
   actif qui couvre déjà ce produit, s'il existe (pour proposer soit de
   modifier sa date, soit d'en planifier un nouveau). */
function _detailPretCommande(c) {
  return (c.commande_lignes || []).map(l => {
    const p = _produits.find(x => x.id === l.produit_id);
    const ofExistant = _ofs.find(o => o.produit_id === l.produit_id && !['clos', 'annule'].includes(o.statut)) || null;
    if (!p) return { produit_nom: l.produit_nom, produit_id: l.produit_id, quantite: l.quantite, couvert: 0, aProduire: l.quantite, ofExistant };
    const besoins = [];
    _commandes.filter(cc => cc.statut !== 'cloture' && cc.statut !== 'annule').forEach(cc => {
      (cc.commande_lignes || []).forEach(ll => {
        if (ll.produit_id !== l.produit_id) return;
        besoins.push({ id: ll.id || (cc.id + '_' + l.produit_id), commandeId: cc.id, quantite: ll.quantite, created_at: cc.created_at || cc.date_cmd });
      });
    });
    const alloc = allouerStockSequentiel(p.stock, besoins);
    const mine = alloc.find(b => b.commandeId === c.id && (!l.id || b.id === l.id));
    return {
      produit_nom: l.produit_nom, produit_id: l.produit_id, quantite: l.quantite,
      couvert: mine ? mine.couvert : 0, aProduire: mine ? mine.aProduire : l.quantite, ofExistant,
    };
  });
}

/* Vrai si TOUTES les lignes de la commande sont couvertes par le stock
   actuel, selon la même allocation séquentielle — utilisé pour faire
   passer automatiquement une commande à « prêt » dès que la production
   (clôture d'OF) ou un inventaire renfloue le stock. */
function _commandeEstCouverte(c) {
  const lignes = c.commande_lignes || [];
  if (!lignes.length) return false;
  return _detailPretCommande(c).every(l => l.aProduire <= 0);
}

function _renderCommandesEnCours() {
  const tbody = document.getElementById('prodCommandesTbody');
  if (!tbody) return;

  const commandes = _commandesEnCours();

  if (!commandes.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucune commande en cours.</td></tr>';
    return;
  }

  tbody.innerHTML = commandes.map(c => `
    <tr class="prod-cmd-row" data-id="${esc(c.id)}" style="cursor:pointer;">
      <td style="width:18px;"><span class="prod-cmd-chevron">▶</span></td>
      <td class="td-ref">${esc(c.ref)}</td>
      <td class="td-bold">${esc(c.client_nom || '—')}</td>
      <td>${esc(c.date_livraison || '—')}</td>
      <td onclick="event.stopPropagation()">${selectStatutCmd(c.id, c.statut)}</td>
    </tr>
    <tr class="prod-cmd-detail" data-id="${esc(c.id)}" style="display:none;">
      <td colspan="5" style="background:var(--ui-bg2);padding:10px 14px;">
        <table style="width:100%;">
          <thead><tr><th>Produit</th><th>Qté commandée</th><th>Couvert</th><th>À produire</th><th>Date de production</th></tr></thead>
          <tbody>${_detailPretCommande(c).map(l => {
            let dateCell = '—';
            if (l.aProduire > 0) {
              dateCell = l.ofExistant
                ? `<input type="date" value="${esc(l.ofExistant.date_prevue || '')}" data-action="date-of-existant" data-of-id="${esc(l.ofExistant.id)}" style="font-size:11px;padding:3px 6px;border:1px solid var(--ui-brd2);border-radius:6px;">`
                : `<input type="date" data-action="planifier-production" data-produit-id="${esc(l.produit_id)}" style="font-size:11px;padding:3px 6px;border:1px solid var(--ui-brd2);border-radius:6px;" title="Choisir une date planifie la fabrication de ce produit pour toutes les commandes en attente">`;
            }
            return `<tr>
            <td class="td-bold">${esc(l.produit_nom || '—')}</td>
            <td>${fmtQ(l.quantite)}</td>
            <td style="color:#15803D;font-weight:700;">${fmtQ(l.couvert)}</td>
            <td style="color:${l.aProduire > 0 ? '#B42318' : 'var(--ink-muted)'};font-weight:${l.aProduire > 0 ? '700' : '400'};">${l.aProduire > 0 ? fmtQ(l.aProduire) : '—'}</td>
            <td onclick="event.stopPropagation()">${dateCell}</td>
          </tr>`;
          }).join('')}</tbody>
        </table>
      </td>
    </tr>`).join('');

  tbody.onclick = (e) => {
    if (e.target.closest('[data-action]')) return;
    const row = e.target.closest('.prod-cmd-row');
    if (!row) return;
    const id = row.dataset.id;
    const detail = tbody.querySelector(`.prod-cmd-detail[data-id="${id}"]`);
    if (!detail) return;
    const ouvert = detail.style.display !== 'none';
    detail.style.display = ouvert ? 'none' : '';
    const chevron = row.querySelector('.prod-cmd-chevron');
    if (chevron) chevron.textContent = ouvert ? '▶' : '▼';
  };

  tbody.onchange = async (e) => {
    const sel = e.target.closest('.cmd-statut-select');
    if (sel) {
      restyleSelectStatutCmd(sel);
      await changerStatutCommande(sel.dataset.id, sel.value);
      return;
    }

    const inpExistant = e.target.closest('[data-action="date-of-existant"]');
    if (inpExistant) {
      await updateOFDate(inpExistant.dataset.ofId, inpExistant.value);
      const of = _ofs.find(o => o.id === inpExistant.dataset.ofId);
      if (of) of.date_prevue = inpExistant.value;
      _renderCalendrier();
      _renderOFs();
      showToast('✅ Date de production mise à jour.');
      return;
    }

    const inpNouveau = e.target.closest('[data-action="planifier-production"]');
    if (inpNouveau) {
      await creerOFPourProduit(inpNouveau.dataset.produitId, inpNouveau.value);
    }
  };
}

function _renderOFs() {
  const tbody = document.getElementById('planningTbody');
  /* Un OF clos sort de cette table dès sa clôture — il vit désormais dans
     Historique de production, jamais les deux à la fois. */
  const ofsActifs = _ofs.filter(o => o.statut !== 'clos');

  if (!ofsActifs.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun ordre de fabrication.</td></tr>';
    return;
  }

  const STATUT_LABELS = {
    'a_planifier':  'À planifier',
    'planifie':     'Planifié',
    'en_cours':     'En cours de fabrication',
    'fabrique':     'Fabriqué',
    'clos':         'Clos',
    'annule':       'Annulé',
  };

  /* Badge statut coloré — sans bordure sur le select */
  const STATUT_BADGE = {
    'a_planifier': { bg: 'rgba(108,117,125,0.10)', txt: '#495057' },
    'planifie':    { bg: 'rgba(76,110,245,0.10)',  txt: '#364fc7' },
    'en_cours':    { bg: 'rgba(255,146,43,0.12)',  txt: '#7c5200' },
    'fabrique':    { bg: 'rgba(32,201,151,0.12)',  txt: '#087f5b' },
    'clos':        { bg: 'rgba(32,201,151,0.08)',  txt: '#0b7a5a' },
    'annule':      { bg: 'rgba(250,82,82,0.10)',   txt: '#c92a2a' },
  };

  const fmtDateFR = (d) => {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  tbody.innerHTML = ofsActifs.map(of => {
    const sb = STATUT_BADGE[of.statut] || STATUT_BADGE['a_planifier'];
    return `<tr data-id="${of.id}" class="of-row" style="cursor:pointer;" title="Cliquer pour voir le détail par client">
      <td class="td-ref">${esc(of.ref)}</td>
      <td class="td-bold">${esc(of.produit_nom)}</td>
      <td><strong>${of.quantite}</strong></td>
      <td style="font-size:10.5px;color:var(--ink-muted)">${esc(of.notes || '')}</td>
      <td style="font-size:11.5px;" data-no-toggle>
        <span style="cursor:pointer;" title="Cliquer pour modifier"
          onclick="document.getElementById('dp-${of.id}').showPicker?.()">
          ${fmtDateFR(of.date_prevue)}
        </span>
        <input type="date" value="${esc(of.date_prevue || '')}"
          style="width:0;height:0;opacity:0;position:absolute;"
          data-id="${of.id}" data-action="update-date" id="dp-${of.id}">
        <button onclick="document.getElementById('dp-${of.id}').showPicker?.()"
          style="background:none;border:none;cursor:pointer;font-size:10px;padding:2px 4px;color:var(--ink-muted);" title="Modifier la date">✏</button>
      </td>
      <td data-no-toggle>
        <select data-id="${of.id}" data-action="changer-statut"
          style="font-size:11px;padding:4px 9px;border:1px solid var(--ui-brd);border-radius:6px;
                 background:${sb.bg};color:${sb.txt};font-weight:600;cursor:pointer;">
          ${Object.entries(STATUT_LABELS).map(([val, label]) =>
            `<option value="${val}" ${of.statut === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </td>
      <td data-no-toggle>
        <button class="btn btn-ghost btn-xs" data-id="${of.id}" data-action="supprimer-of"
          title="Supprimer cet OF"
          style="color:var(--ink-muted);font-size:10px;padding:2px 6px;opacity:0.6;">✕</button>
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

  tbody.onclick = async (e) => {
    const btn = e.target.closest('[data-action="supprimer-of"]');
    if (btn) {
      e.stopPropagation();
      await _supprimerOF(btn.dataset.id);
      return;
    }
    if (e.target.closest('[data-no-toggle]')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) _toggleDetailOF(tr.dataset.id);
  };
}

/* Dépliage au clic sur une ligne d'OF : liste les commandes/clients qui
   attendent ce produit fini, avec le numéro de commande et la quantité.
   Sur un OF clos, on relit le snapshot figé à la clôture (detail_clients)
   plutôt que de recalculer à partir des commandes actuelles, qui ont pu
   changer depuis — l'historique doit rester exact. */
function _toggleDetailOF(id) {
  const tbody = document.getElementById('planningTbody');
  if (!tbody) return;
  const tr = tbody.querySelector(`tr.of-row[data-id="${id}"]`);
  if (!tr) return;

  const dejaOuvert = tbody.querySelector(`tr.of-detail-row[data-of="${id}"]`);
  tbody.querySelectorAll('tr.of-detail-row').forEach(r => r.remove());
  if (dejaOuvert) return;

  const of = _ofs.find(o => o.id === id);
  if (!of) return;
  const detail = (of.statut === 'clos' && Array.isArray(of.detail_clients))
    ? of.detail_clients
    : _detailClientsPourProduit(of.produit_id);

  const rows = detail.length
    ? detail.map(d => `<tr>
        <td style="padding:4px 10px;font-size:11px;color:var(--ink-muted)">${esc(d.commande_ref || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;">${esc(d.client_nom || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;text-align:right;">${d.quantite ?? '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:6px 10px;font-size:11px;color:var(--ink-muted)">Aucune commande en attente pour ce produit.</td></tr>`;

  const detailTr = document.createElement('tr');
  detailTr.className = 'of-detail-row';
  detailTr.dataset.of = id;
  detailTr.innerHTML = `<td colspan="7" style="background:#FAFAF8;padding:8px 12px;">
    <div style="font-size:10.5px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">Détail par commande client</div>
    <table style="width:auto;min-width:280px;"><thead><tr>
      <th style="padding:2px 10px;font-size:10px;text-align:left;">N° commande</th>
      <th style="padding:2px 10px;font-size:10px;text-align:left;">Client</th>
      <th style="padding:2px 10px;font-size:10px;text-align:right;">Qté</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </td>`;
  tr.after(detailTr);
}

/* -------------------------------------------------------
   PLAN DE FABRICATION
   Une ligne par produit ayant un OF actif et/ou une commande
   en cours non couverte. La faisabilité articles est calculée
   de façon CUMULÉE ligne après ligne (le stock virtuel s'épuise
   au fil du tableau) pour révéler les conflits entre deux OF
   qui piochent dans le même article — un contrôle produit par
   produit isolément ne le voit pas.
------------------------------------------------------- */
function _achatsEnCoursPourArticle(articleId) {
  if (!articleId) return [];
  return _achats.filter(a => a.article_id === articleId && ['brouillon', 'envoye'].includes(a.statut));
}

/* Demande de production par produit, tous OF actifs confondus (manuels ou
   liés à une commande) + le manque encore non couvert par un OF pour les
   commandes en cours. Partagé par Plan de fabrication ET Articles à
   commander — avant ce partage, Articles à commander ne regardait QUE les
   commandes et restait vide dès qu'un OF était planifié sans commande
   (cas réel : production sur stock, sans commande client derrière). */
function _demandeParProduit() {
  const parProduit = {};
  _ofs.filter(o => !['clos', 'annule'].includes(o.statut)).forEach(of => {
    if (!parProduit[of.produit_id]) parProduit[of.produit_id] = { nom: of.produit_nom, qteOF: 0, ofs: [], datePlusProche: null };
    const f = parProduit[of.produit_id];
    f.qteOF += of.quantite;
    f.ofs.push(of.ref);
    if (of.date_prevue && (!f.datePlusProche || of.date_prevue < f.datePlusProche)) f.datePlusProche = of.date_prevue;
  });

  const commande = {};
  _commandes.filter(c => c.statut !== 'cloture').forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      commande[l.produit_id] = (commande[l.produit_id] || 0) + l.quantite;
    });
  });

  const produitIds = new Set([...Object.keys(parProduit), ...Object.keys(commande)]);
  let lignes = [...produitIds].map(produitId => {
    const p = _produits.find(x => x.id === produitId);
    if (!p) return null;
    const f = parProduit[produitId] || { nom: p.nom, qteOF: 0, ofs: [], datePlusProche: null };
    const qteCmd = commande[produitId] || 0;
    /* Produit hors stock : son stock n'est pas suivi, il ne peut donc pas
       être signalé manquant. Ses OF restent affichés, eux sont réels. */
    const manquePF = estSurveille(p) ? Math.max(0, qteCmd - (p.stock || 0) - f.qteOF) : 0;
    return { produitId, nom: f.nom || p.nom, qteOF: f.qteOF, ofs: f.ofs, date: f.datePlusProche, manquePF };
  }).filter(Boolean);

  /* Tri : ce qui n'a encore aucun OF pour couvrir la commande d'abord (le plus urgent
     à planifier), puis par échéance OF la plus proche. */
  lignes.sort((a, b) => {
    if ((a.manquePF > 0) !== (b.manquePF > 0)) return a.manquePF > 0 ? -1 : 1;
    const da = a.date || '9999-99-99', db = b.date || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : a.nom.localeCompare(b.nom, 'fr');
  });

  return lignes;
}

/* -------------------------------------------------------
   VUE CONSOLIDÉE PAR PRODUIT
   Remplace l'ancien Plan de fabrication : une ligne par produit fini
   avec demande, montre le « reste à produire » en avant, et se déplie
   pour voir, par client, ce qui est déjà couvert par le stock (vert) et
   ce qu'il reste à produire pour satisfaire tout le monde (rouge).
   Allocation séquentielle partagée avec Commandes Clients
   (allouerStockSequentiel, ui.js) — même ordre d'enregistrement, même
   résultat des deux côtés, pour ne jamais diverger.
   Les articles à commander (matières premières) restent dans leur
   propre tableau plus bas, inchangé — cette vue porte sur les produits
   finis, pas sur les ingrédients.
------------------------------------------------------- */
function _vueConsolideeParProduit() {
  const produitIds = new Set();
  _ofs.filter(o => !['clos', 'annule'].includes(o.statut)).forEach(o => produitIds.add(o.produit_id));
  _commandes.filter(c => c.statut !== 'cloture').forEach(c => (c.commande_lignes || []).forEach(l => produitIds.add(l.produit_id)));

  const lignes = [...produitIds].map(produitId => {
    const p = _produits.find(x => x.id === produitId);
    if (!p) return null;

    const ofsActifs = _ofs.filter(o => o.produit_id === produitId && !['clos', 'annule'].includes(o.statut));
    const qteOF = ofsActifs.reduce((s, o) => s + o.quantite, 0);

    const besoins = [];
    _commandes.filter(c => c.statut !== 'cloture').forEach(c => {
      (c.commande_lignes || []).forEach(l => {
        if (l.produit_id !== produitId) return;
        besoins.push({
          id: l.id || (c.id + '_' + produitId), commandeId: c.id, ref: c.ref,
          client_nom: c.client_nom, quantite: l.quantite, created_at: c.created_at || c.date_cmd,
        });
      });
    });

    const clients = allouerStockSequentiel(p.stock, besoins);
    const demandeTotale  = besoins.reduce((s, b) => s + b.quantite, 0);
    const resteAProduire = clients.reduce((s, c) => s + c.aProduire, 0);

    return { produitId, nom: p.nom, stock: p.stock, demandeTotale, resteAProduire, qteOF, ofsRefs: ofsActifs.map(o => o.ref), clients };
  }).filter(Boolean);

  /* Le plus urgent (reste à produire) d'abord. */
  lignes.sort((a, b) => (b.resteAProduire > 0) - (a.resteAProduire > 0) || a.nom.localeCompare(b.nom, 'fr'));
  return lignes;
}

function _renderVueConsolidee() {
  const tbody = document.getElementById('prodVueTbody');
  if (!tbody) return;

  const lignes = _vueConsolideeParProduit();

  if (!lignes.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucun OF actif ni commande en attente.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map(l => {
    const resteBadge = l.resteAProduire > 0
      ? `<span class="badge badge-alert">${fmtQ(l.resteAProduire)} à produire</span>`
      : '<span class="badge badge-ok">✓ Tout couvert</span>';
    const ofInfo = l.qteOF > 0
      ? `<strong>${fmtQ(l.qteOF)}</strong> <span style="font-size:10px;color:var(--ink-muted)">(${l.ofsRefs.join(', ')})</span>`
      : '<span style="color:var(--ink-muted)">aucun</span>';

    const detailRows = l.clients.map((c, i) => {
      const pct = c.quantite > 0 ? Math.round(c.couvert / c.quantite * 100) : 0;
      const ordre = i === 0 ? '1ʳᵉ commande enregistrée' : 'Enregistrée ensuite';
      return `<tr>
        <td class="td-ref">${esc(c.ref)}</td>
        <td>${esc(c.client_nom)}</td>
        <td style="font-size:10px;color:var(--ink-muted)">${ordre}</td>
        <td style="min-width:140px;">
          <div style="display:flex;height:9px;border-radius:5px;overflow:hidden;background:#EEEEEC;">
            <div style="flex-grow:${c.couvert};flex-basis:0;background:#22C55E;"></div>
            <div style="flex-grow:${c.aProduire};flex-basis:0;background:#F04438;"></div>
          </div>
        </td>
        <td style="text-align:right;">${fmtQ(c.couvert)} / ${fmtQ(c.quantite)}</td>
        <td style="text-align:right;color:${c.aProduire > 0 ? 'var(--ui-red)' : 'var(--ink-muted)'};font-weight:${c.aProduire > 0 ? '700' : '400'};">${c.aProduire > 0 ? fmtQ(c.aProduire) : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="color:var(--ink-muted)">Aucune commande en attente pour ce produit.</td></tr>';

    return `
      <tr class="prod-vue-row" data-id="${esc(l.produitId)}" style="cursor:pointer;">
        <td style="width:18px;"><span class="prod-vue-chevron">▶</span></td>
        <td class="td-bold">${esc(l.nom)}</td>
        <td>${fmtQ(l.stock)}</td>
        <td>${fmtQ(l.demandeTotale)}</td>
        <td>${ofInfo}</td>
        <td>${resteBadge}</td>
      </tr>
      <tr class="prod-vue-detail" data-id="${esc(l.produitId)}" style="display:none;">
        <td colspan="6" style="background:var(--ui-bg2);padding:10px 14px;">
          <table style="width:100%;">
            <thead><tr><th>N° commande</th><th>Client</th><th>Ordre</th><th>Faisable / Reste</th><th>Couvert</th><th>À produire</th></tr></thead>
            <tbody>${detailRows}</tbody>
          </table>
        </td>
      </tr>`;
  }).join('');

  tbody.onclick = (e) => {
    const row = e.target.closest('.prod-vue-row');
    if (!row) return;
    const id = row.dataset.id;
    const detail = tbody.querySelector(`.prod-vue-detail[data-id="${id}"]`);
    if (!detail) return;
    const ouvert = detail.style.display !== 'none';
    detail.style.display = ouvert ? 'none' : '';
    const chevron = row.querySelector('.prod-vue-chevron');
    if (chevron) chevron.textContent = ouvert ? '▶' : '▼';
  };
}

/* -------------------------------------------------------
   CRÉER OF DEPUIS LE RESTE À PRODUIRE D'UN PRODUIT
   Une seule fournée qui couvre d'un coup toutes les commandes en attente
   de ce produit — jamais un OF par commande : c'est comme ça qu'un
   artisan produit réellement. commandes_ids porte la liste des commandes
   couvertes par cette fournée, pour que creerOFsPourCommande() (déclenché
   quand une commande passe à « planifié ») ne recrée pas un second OF en
   double pour elles.
------------------------------------------------------- */
export async function creerOFPourProduit(produitId, datePrevue = null) {
  const ligne = _vueConsolideeParProduit().find(l => l.produitId === produitId);
  if (!ligne || ligne.resteAProduire <= 0) return;
  const p = _produits.find(x => x.id === produitId);
  if (!p) return;

  const commandesIds = [...new Set(ligne.clients.filter(c => c.aProduire > 0).map(c => c.commandeId))];

  try {
    const ref = nextRef('OF', _ofs);
    const of = await createOF({
      ref, produit_id: produitId, produit_nom: p.nom, quantite: ligne.resteAProduire,
      date_prevue: datePrevue || null, statut: 'planifie', commandes_ids: commandesIds,
      notes: 'Depuis commandes en cours',
    });
    _ofs.push(of);
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    _renderCommandesEnCours();
    _renderVueConsolidee();
    _renderBesoins();
    showToast(datePrevue
      ? `✅ OF ${ref} créé et planifié — ${fmtQ(ligne.resteAProduire)} ${p.nom} à produire.`
      : `✅ OF ${ref} créé — ${fmtQ(ligne.resteAProduire)} ${p.nom} à produire, choisissez sa date dans la liste.`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    console.error('[production] creerOFPourProduit ERREUR:', err.message, err);
    showToast('❌ Erreur création OF.', 'error');
  }
}

/* -------------------------------------------------------
   ARTICLES À COMMANDER
   Liste d'achat basée sur la demande totale de production —
   OF actifs (manuels ou liés à une commande) + manque encore non
   planifié pour les commandes en cours (même base que Plan de
   fabrication, voir _demandeParProduit). Seul le bouton BC agit
   réellement (ouvre le bon de commande pré-rempli).
------------------------------------------------------- */
function _renderBesoins() {
  const mg = {};
  _demandeParProduit().forEach(l => {
    const qteTotale = l.qteOF + l.manquePF;
    if (!qteTotale) return;
    const recette = _recettes[l.produitId] || [];
    recette.forEach(r => {
      const aref = r.articles?.ref;
      if (!aref) return;
      mg[aref] = (mg[aref] || 0) + r.quantite * qteTotale;
    });
  });

  /* Quantité à commander : au moins de quoi couvrir le manque de production,
     et au moins de quoi remonter le stock au seuil de sécurité — jamais les
     deux séparément, on prend le plus grand des deux besoins. */
  const manques = Object.entries(mg).map(([aref, besoin]) => {
    const a = _articles.find(x => x.ref === aref);
    if (!a || !estSurveille(a)) return null;
    const manque = besoin - a.stock;
    if (manque <= 0) return null;
    const qteACommander = Math.max(manque, (a.seuil || 0) - a.stock);
    return { aref, a, besoin, manque, qteACommander };
  }).filter(Boolean);

  document.getElementById('manquesTbody').innerHTML = manques.map(m => `<tr>
      <td class="td-ref">${esc(m.aref)}</td>
      <td>${esc(m.a.nom)}</td>
      <td>${fmtQ(m.a.stock)} ${esc(m.a.unite)}</td>
      <td>${fmtQ(m.besoin)} ${esc(m.a.unite)}</td>
      <td style="color:var(--ui-red);font-weight:700">⚠ ${fmtQ(m.manque)} ${esc(m.a.unite)}</td>
      <td>${fmt(m.manque * m.a.prix)} €</td>
      <td style="font-size:11px">${esc(m.a.fournisseur || '—')}</td>
      <td><button class="btn btn-primary btn-xs" data-ref="${esc(m.aref)}" data-action="bc">BC</button></td>
    </tr>`).join('') ||
    '<tr><td colspan="8" style="text-align:center;padding:12px;color:var(--ui-green)">✅ Tous les articles disponibles.</td></tr>';

  document.getElementById('manquesTbody').onclick = (e) => {
    const btn = e.target.closest('[data-action="bc"]');
    if (!btn) return;
    const clicked = manques.find(m => m.aref === btn.dataset.ref);
    if (!clicked) return;
    /* Regroupe en un seul BC tous les articles manquants du même fournisseur
       que celui cliqué — sans fournisseur renseigné, on ne peut pas
       présumer qu'ils viennent du même endroit, on garde une ligne seule. */
    const fournisseur = clicked.a.fournisseur || '';
    const memeFournisseur = fournisseur
      ? manques.filter(m => (m.a.fournisseur || '') === fournisseur)
      : [clicked];
    document.dispatchEvent(new CustomEvent('appmee:openAchatFor', {
      detail: {
        fournisseur,
        lignes: memeFournisseur.map(m => ({ ref: m.aref, qte: m.qteACommander })),
      },
    }));
    openModal('modalAchat');
  };
}

/* -------------------------------------------------------
   HISTORIQUE DE PRODUCTION
   Tous les OF clos, du plus récent au plus ancien. Le détail client
   affiché est le snapshot figé au moment de la clôture (detail_clients),
   jamais recalculé depuis les commandes actuelles — l'historique doit
   rester exact même si les commandes évoluent après coup.
------------------------------------------------------- */
function _renderHistorique() {
  const tbody = document.getElementById('historiqueTbody');
  if (!tbody) return;

  const clos = _ofs.filter(o => o.statut === 'clos').sort((a, b) => {
    const da = a.date_cloture || '', db = b.date_cloture || '';
    if (da !== db) return da < db ? 1 : -1;
    return (b.numero_lot || '').localeCompare(a.numero_lot || '');
  });

  const countEl = document.getElementById('historiqueProductionCount');
  if (countEl) countEl.textContent = clos.length;

  if (!clos.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucune production clôturée pour le moment.</td></tr>';
    return;
  }

  const fmtDateFR = (d) => {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  tbody.innerHTML = clos.map(of => `<tr data-id="${of.id}" class="hist-row" style="cursor:pointer;" title="Cliquer pour voir le détail par client">
    <td class="td-ref">${esc(of.ref)}</td>
    <td class="td-bold">${esc(of.produit_nom)}</td>
    <td>${esc(of.numero_lot || '—')}</td>
    <td>${fmtDateFR(of.date_cloture)}</td>
    <td><strong>${of.quantite}</strong></td>
  </tr>`).join('');

  tbody.onclick = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) _toggleDetailHistorique(tr.dataset.id);
  };
}

function _toggleDetailHistorique(id) {
  const tbody = document.getElementById('historiqueTbody');
  if (!tbody) return;
  const tr = tbody.querySelector(`tr.hist-row[data-id="${id}"]`);
  if (!tr) return;

  const dejaOuvert = tbody.querySelector(`tr.hist-detail-row[data-of="${id}"]`);
  tbody.querySelectorAll('tr.hist-detail-row').forEach(r => r.remove());
  if (dejaOuvert) return;

  const of = _ofs.find(o => o.id === id);
  if (!of) return;
  const detail = Array.isArray(of.detail_clients) ? of.detail_clients : [];

  const rows = detail.length
    ? detail.map(d => `<tr>
        <td style="padding:4px 10px;font-size:11px;color:var(--ink-muted)">${esc(d.commande_ref || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;">${esc(d.client_nom || '—')}</td>
        <td style="padding:4px 10px;font-size:11px;text-align:right;">${d.quantite ?? '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:6px 10px;font-size:11px;color:var(--ink-muted)">Aucune commande n'était en attente pour ce produit à la clôture.</td></tr>`;

  const detailTr = document.createElement('tr');
  detailTr.className = 'hist-detail-row';
  detailTr.dataset.of = id;
  detailTr.innerHTML = `<td colspan="5" style="background:#FAFAF8;padding:8px 12px;">
    <div style="font-size:10.5px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">Détail par commande client (au moment de la clôture)</div>
    <table style="width:auto;min-width:280px;"><thead><tr>
      <th style="padding:2px 10px;font-size:10px;text-align:left;">N° commande</th>
      <th style="padding:2px 10px;font-size:10px;text-align:left;">Client</th>
      <th style="padding:2px 10px;font-size:10px;text-align:right;">Qté</th>
    </tr></thead><tbody>${rows}</tbody></table>
  </td>`;
  tr.after(detailTr);
}

/* -------------------------------------------------------
   NUMÉRO DE LOT — format AA-JJJ-rang
   AA = année sur 2 chiffres, JJJ = jour de l'année sur 3 chiffres,
   rang = rang de clôture dans la journée, tous produits confondus
   (1er OF clos dans la journée = rang 1, peu importe le produit).
------------------------------------------------------- */
function _jourDeLAnnee(date) {
  const debutAnnee = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - debutAnnee) / 86400000);
}

function _formatNumeroLot(date, rang) {
  const annee = String(date.getFullYear()).slice(-2);
  const jour  = String(_jourDeLAnnee(date)).padStart(3, '0');
  return `${annee}-${jour}-${rang}`;
}

/* Détail des clients/commandes en attente pour un produit fini donné — utilisé
   à la fois pour le dépliage en direct des OF actifs et pour le snapshot figé
   au moment de la clôture (l'historique doit rester exact même si les
   commandes évoluent ensuite). */
function _detailClientsPourProduit(produitId) {
  const detail = [];
  _commandes.filter(c => c.statut !== 'cloture').forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      if (l.produit_id === produitId) {
        detail.push({ commande_ref: c.ref, client_nom: c.client_nom, quantite: l.quantite });
      }
    });
  });
  return detail;
}

/* -------------------------------------------------------
   HELPERS
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

async function _chargerRecettes() {
  const recettesRaw = await Promise.all(_produits.map(p => getRecettesByProduit(p.id)));
  _recettes = {};
  _produits.forEach((p, i) => { _recettes[p.id] = recettesRaw[i] || []; });
}

/* -------------------------------------------------------
   ACTIONS OFs
------------------------------------------------------- */
async function _setOFStatut(id, statut) {
  try {
    await updateOFStatut(id, statut);
    const of = _ofs.find(o => o.id === id);
    if (of) of.statut = statut;
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    _renderVueConsolidee();
  } catch (err) {
    showToast('❌ Erreur mise à jour OF.', 'error');
  }
}

async function _supprimerOF(id) {
  const of = _ofs.find(o => o.id === id);
  if (!of) return;
  const ok = await confirmDialog(`Supprimer définitivement ${of.ref} (${of.produit_nom}) ?`);
  if (!ok) return;
  try {
    await deleteOF(id);
    _ofs = _ofs.filter(o => o.id !== id);
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    _renderVueConsolidee();
    showToast('✅ OF ' + of.ref + ' supprimé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    console.error('[production] _supprimerOF ERREUR:', err.message, err);
    showToast('❌ Erreur suppression OF.', 'error');
  }
}

/* Le stock est ajusté côté base : un double clic compterait la fabrication deux fois. */
let _terminerEnCours = false;

async function _terminerFab(id) {
  if (_terminerEnCours) return;
  _terminerEnCours = true;
  try { await _terminerFabrication(id); } finally { _terminerEnCours = false; }
}

async function _terminerFabrication(id) {
  const of = _ofs.find(o => o.id === id);
  if (!of || of.statut === 'clos') return;
  const p = _produits.find(x => x.id === of.produit_id);
  if (!p) return;

  const ok = await confirmDialog(`Terminer ${of.quantite}×${of.produit_nom} ?\nArticles déduits + produits finis ajoutés.`);
  if (!ok) return;

  try {
    const lignesRecette = _recettes[of.produit_id] || [];

    for (const l of lignesRecette) {
      const aref = l.articles?.ref;
      const qp   = l.quantite || 0;
      if (!aref || !qp) continue;
      const a = _articles.find(x => x.ref === aref);
      if (!a) continue;
      a.stock = await ajusterStockArticle(a.id, -(qp * of.quantite));
      await addMouvement({ type: 'sortie', ref: aref, nom: a.nom, qte: qp * of.quantite, motif: 'Production ' + of.ref, ref_doc: of.ref });
    }

    p.stock = await ajusterStockProduit(p.id, of.quantite);
    await addMouvement({ type: 'entree_pf', ref: p.ref, nom: p.nom, qte: of.quantite, motif: 'Production ' + of.ref, ref_doc: of.ref });

    const dateCloture   = today();
    const dejaClosCeJour = await countOFsClosPourDate(dateCloture);
    const numeroLot      = _formatNumeroLot(new Date(), dejaClosCeJour + 1);
    const detailClients  = _detailClientsPourProduit(of.produit_id);
    await cloturerOF(id, { numero_lot: numeroLot, date_cloture: dateCloture, detail_clients: detailClients });
    of.statut         = 'clos';
    of.numero_lot     = numeroLot;
    of.date_cloture   = dateCloture;
    of.detail_clients = detailClients;

    for (const c of _commandes) {
      if (!['planifie', 'en_production'].includes(c.statut)) continue;
      /* Même allocation séquentielle que partout ailleurs (Commandes
         Clients, Besoins de production) — pas le stock brut comparé
         indépendamment pour chaque commande, sinon deux commandes sur le
         même produit se voient toutes les deux déclarées « prêtes » avec
         un seul stock qui ne couvre en réalité qu'une des deux. */
      const toutOK = _commandeEstCouverte(c);
      if (toutOK) {
        try { await updateCommandeStatut(c.id, 'pret'); } catch (e) {
          console.error('[production] passage a pret non bloquant:', e.message);
        }
        c.statut = 'pret';
        const dejafac = await factureExistePourCommande(c.id);
        if (!dejafac) {
          const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);

          /* TVA multi-taux : priorité produit > tenant > 20 (aligné livraisons.js) */
          let tauxFacture = 20;
          try {
            const tenant = await getTenant();
            if (tenant && tenant.taux_tva != null) tauxFacture = Number(tenant.taux_tva);
          } catch (_) {}

          const lignesFigees = (c.commande_lignes || []).map(l => {
            const pl = _produits.find(x => x.id === l.produit_id);
            const tauxLigne = (pl && pl.taux_tva != null) ? Number(pl.taux_tva) : tauxFacture;
            return {
              produit_id:    l.produit_id,
              produit_nom:   l.produit_nom,
              quantite:      l.quantite,
              prix_unitaire: l.prix_unitaire,
              taux_tva:      tauxLigne,
              total_ht:      l.total_ht || (l.quantite * l.prix_unitaire),
            };
          });
          /* Taux effectif pondéré — montant_ttc est une colonne générée en base
             à partir d'un seul taux_tva, Math.max() sur les taux surfacturait
             toute ligne à un taux inférieur au max (aligné livraisons.js). */
          const totalTvaLignes = lignesFigees.reduce((s, l) => s + l.total_ht * l.taux_tva / 100, 0);
          if (tot > 0) tauxFacture = totalTvaLignes / tot * 100;

          const client = c.client_id
            ? _clients.find(x => x.id === c.client_id)
            : _clients.find(x => x.nom === c.client_nom);

          const facRef = await nextRefServeur('FAC');
          const fac = await createFacture({
            ref:            facRef,
            commande_id:    c.id,
            client_id:      client ? client.id : (c.client_id || null),
            client_nom:     c.client_nom,
            siret_client:   client?.siret || '',
            adresse_client: client?.adresse || '',
            montant_ht:     tot,
            taux_tva:       tauxFacture,
            statut:         'facture',
          });
          await createFactureLignes(fac.id, lignesFigees);
        }
      }
    }

    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    _renderCommandesEnCours();
    _renderVueConsolidee();
    _renderBesoins();
    _renderHistorique();
    showToast(`✅ ${of.quantite}×${of.produit_nom} produits. Lot ${numeroLot}.`);
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
    _renderBadges();
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
    const of = await createOF({ ref, produit_id: p.id, produit_nom: p.nom, quantite: qte, date_prevue: today(), statut: 'planifie' });
    _ofs.push(of);
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    showToast('✅ OF ' + ref + ' créé.');
  } catch (err) {
    showToast('❌ Erreur création OF.', 'error');
  }
}

/* -------------------------------------------------------
   AUTO-OF À LA PLANIFICATION D'UNE COMMANDE
   Quand une commande passe de « à produire » à « planifié »
   (app.html, evenement appmee:commandePlanifiee), chacune de ses
   lignes devient un OF sans date — la date se choisit ensuite
   depuis la liste des OF (crayon sur la colonne date), exactement
   comme pour un OF cree a la main.
   Idempotent : recharge toujours les OF avant de verifier, et ne
   recree jamais un OF deja lie a cette commande pour ce produit
   (colonne commandes_ids) — une commande qui repasserait par
   « planifie » n'en cree pas un second.
------------------------------------------------------- */
export async function creerOFsPourCommande(commande) {
  if (!commande || !Array.isArray(commande.commande_lignes) || !commande.commande_lignes.length) return;

  try { _ofs = await getAllOFs(); } catch (_) {}

  let crees = 0;
  for (const l of commande.commande_lignes) {
    if (!l.produit_id || !l.quantite) continue;
    const dejaCree = _ofs.some(o => o.statut !== 'annule'
      && Array.isArray(o.commandes_ids) && o.commandes_ids.includes(commande.id)
      && o.produit_id === l.produit_id);
    if (dejaCree) continue;

    try {
      const ref = nextRef('OF', _ofs);
      const of = await createOF({
        ref, produit_id: l.produit_id, produit_nom: l.produit_nom,
        quantite: l.quantite, date_prevue: null, statut: 'planifie',
        commandes_ids: [commande.id],
        notes: 'Depuis commande ' + (commande.ref || ''),
      });
      _ofs.push(of);
      crees++;
    } catch (err) {
      console.error('[production] creerOFsPourCommande ERREUR:', err.message, err);
    }
  }

  if (crees) {
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    _renderCommandesEnCours();
    _renderVueConsolidee();
    _renderBesoins();
    showToast(`✅ ${crees} ordre${crees > 1 ? 's' : ''} de fabrication créé${crees > 1 ? 's' : ''} depuis ${commande.ref || 'la commande'} — choisissez leur date dans la liste.`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
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

  div.querySelector('.of-ref').addEventListener('change', (e) => { div.querySelector('.of-nom').value = e.target.value; });
  div.querySelector('.of-nom').addEventListener('change', (e) => { div.querySelector('.of-ref').value = e.target.value; });
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
      const of  = await createOF({ ref, produit_id: p.id, produit_nom: p.nom, quantite: qte, notes: notesClients, date_prevue: date, statut: 'planifie' });
      _ofs.push(of);
      createdCount++;

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
        const bcRef = await nextRefServeur('BC');
        await createAchat({ ref: bcRef, article_id: a.id, article_nom: a.nom, quantite: Math.ceil(manque), prix_unitaire: a.prix, fournisseur: a.fournisseur || '', statut: 'brouillon', ref_commande: ref, notes: 'Auto OF ' + ref });
      }
    }

    closeModal('modalPlanifier');
    _renderBadges();
    _renderOFs();
    _renderCalendrier();
    showToast(`✅ ${createdCount} OF planifié(s).`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  } catch (err) {
    console.error('[production] _savePlanifier ERREUR:', err.message, err);
    showToast('❌ Erreur planification OF.', 'error');
  }
}
