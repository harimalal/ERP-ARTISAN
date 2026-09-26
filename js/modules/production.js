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
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

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
  _renderOFs();
  _renderFabPlan();
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

function _calDayCellHtml(day, jourLabel, todayStr, muted) {
  const ds      = day.toISOString().split('T')[0];
  const isToday = ds === todayStr;
  const ofDay   = _ofs.filter(o => o.date_prevue === ds && !['clos', 'annule'].includes(o.statut));
  const cmdDay  = _commandes.filter(c => c.date_livraison === ds && c.statut !== 'cloture');

  return `<div class="cal-day" style="${muted ? 'opacity:.45;' : ''}">
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

function _renderSemaineOuQuinzaine(nbJours) {
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
      html += _calDayCellHtml(day, jourLabel, todayStr, false);
    }
    html += '</div>';
  }
  document.getElementById('calWeek').innerHTML = html;
}

function _renderMois() {
  const todayStr = today();
  const base     = new Date();
  const moisRef  = new Date(base.getFullYear(), base.getMonth() + _calOffset, 1);
  const premierDuMois = new Date(moisRef.getFullYear(), moisRef.getMonth(), 1);
  const dernierDuMois = new Date(moisRef.getFullYear(), moisRef.getMonth() + 1, 0);

  const debutGrille = _mondayOf(premierDuMois);
  const finGrille    = new Date(dernierDuMois);
  finGrille.setDate(finGrille.getDate() + ((7 - ((finGrille.getDay() + 6) % 7) - 1) % 7));

  const nbJours   = Math.round((finGrille - debutGrille) / 86400000) + 1;
  const nbSemaines = Math.ceil(nbJours / 7);

  let html = '';
  for (let semaine = 0; semaine < nbSemaines; semaine++) {
    html += '<div class="cal-week">';
    for (let d = 0; d < 7; d++) {
      const day = new Date(debutGrille);
      day.setDate(debutGrille.getDate() + semaine * 7 + d);
      const horsMois  = day.getMonth() !== moisRef.getMonth();
      const jourLabel = `${CAL_JOURS[d]} ${day.getDate()}/${day.getMonth() + 1}`;
      html += _calDayCellHtml(day, jourLabel, todayStr, horsMois);
    }
    html += '</div>';
  }
  document.getElementById('calWeek').innerHTML = html;
}

function _renderCalendrier() {
  _calModeButtonsUI();

  const titre = document.getElementById('calTitleLabel');
  if (titre) {
    const libelles = {
      semaine:   _calOffset === 0 ? 'semaine en cours' : (_calOffset > 0 ? `${_calOffset} semaine(s) plus tard` : `${-_calOffset} semaine(s) plus tôt`),
      quinzaine: _calOffset === 0 ? '2 semaines en cours' : (_calOffset > 0 ? `+${_calOffset} période(s) de 2 semaines` : `${_calOffset} période(s) de 2 semaines`),
      mois:      _calOffset === 0 ? 'mois en cours' : (_calOffset > 0 ? `${_calOffset} mois plus tard` : `${-_calOffset} mois plus tôt`),
    };
    titre.textContent = 'Calendrier de production — ' + (libelles[_calMode] || 'semaine en cours');
  }

  if (_calMode === 'quinzaine') _renderSemaineOuQuinzaine(14);
  else if (_calMode === 'mois') _renderMois();
  else _renderSemaineOuQuinzaine(7);
}

/* -------------------------------------------------------
   TABLE DES OFs — Fix S12
   - Lignes fond blanc (pas de bg coloré)
   - Pas de border-left colorée
   - Croix suppression discrète (gris, petite)
   - Select statut sans border colorée
------------------------------------------------------- */
function _renderOFs() {
  const tbody = document.getElementById('planningTbody');

  if (!_ofs.length) {
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

  tbody.innerHTML = _ofs.map(of => {
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

function _renderFabPlan() {
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
    const manquePF = Math.max(0, qteCmd - (p.stock || 0) - f.qteOF);
    return { produitId, nom: f.nom || p.nom, qteOF: f.qteOF, ofs: f.ofs, date: f.datePlusProche, manquePF };
  }).filter(Boolean);

  /* Tri : ce qui n'a encore aucun OF pour couvrir la commande d'abord (le plus urgent
     à planifier), puis par échéance OF la plus proche. */
  lignes.sort((a, b) => {
    if ((a.manquePF > 0) !== (b.manquePF > 0)) return a.manquePF > 0 ? -1 : 1;
    const da = a.date || '9999-99-99', db = b.date || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : a.nom.localeCompare(b.nom, 'fr');
  });

  const stockVirtuel = {};
  _articles.forEach(a => { stockVirtuel[a.ref] = a.stock; });

  document.getElementById('fabPlanTbody').innerHTML = lignes.map(l => {
    const recette = _recettes[l.produitId] || [];
    const manquesArticles = [];
    recette.forEach(r => {
      const aref = r.articles?.ref;
      if (!aref || !r.quantite || !l.qteOF) return;
      const besoin     = r.quantite * l.qteOF;
      const disponible = stockVirtuel[aref] ?? 0;
      stockVirtuel[aref] = disponible - besoin;
      if (disponible < besoin) {
        const a = _articles.find(x => x.ref === aref);
        const manqueQte = besoin - disponible;
        const enCours = _achatsEnCoursPourArticle(a?.id);
        const infoCommande = enCours.length
          ? enCours.map(ac => `en commande chez ${esc(ac.fournisseur || '—')}${ac.date_livraison ? ' (livraison ' + ac.date_livraison.split('-').reverse().join('/') + ')' : ' (date non renseignée)'}`).join(', ')
          : 'aucune commande en cours';
        manquesArticles.push(`${esc(a?.nom || aref)} : manque ${fmtQ(manqueQte)} ${esc(a?.unite || '')} — ${infoCommande}`);
      }
    });

    const rowClass = (l.manquePF > 0 || manquesArticles.length) ? 'prod-fail' : 'prod-ok';
    return `<tr class="${rowClass}">
      <td class="td-bold">${esc(l.nom)}</td>
      <td>${l.qteOF > 0 ? `<strong>${l.qteOF}</strong> unités (${l.ofs.join(', ')})` : '<span style="color:var(--ink-muted)">aucun OF</span>'}</td>
      <td>${l.manquePF > 0 ? `<strong style="color:var(--ui-red)">${l.manquePF} unité(s)</strong>` : '—'}</td>
      <td>${l.qteOF === 0 ? '—' : (manquesArticles.length ? `<span class="badge badge-alert">${manquesArticles.length} manque(s)</span>` : '<span class="badge badge-ok">✓ Faisable</span>')}</td>
      <td style="font-size:10.5px;color:var(--ui-red)">${manquesArticles.join('<br>') || '—'}</td>
    </tr>`;
  }).join('') ||
    '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucun OF actif ni commande en attente.</td></tr>';
}

/* -------------------------------------------------------
   ARTICLES À COMMANDER
   Liste d'achat basée sur la demande totale des commandes en
   cours (indépendante des OF) — reste tel quel, seul le bouton
   BC agit réellement (ouvre le bon de commande pré-rempli).
------------------------------------------------------- */
function _renderBesoins() {
  const besoins = {};
  _commandes.filter(c => c.statut !== 'cloture').forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      besoins[l.produit_id] = (besoins[l.produit_id] || 0) + l.quantite;
    });
  });

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
    _renderFabPlan();
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
      const toutOK = (c.commande_lignes || []).every(l => {
        const pp = _produits.find(x => x.id === l.produit_id);
        return pp && pp.stock >= l.quantite;
      });
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
