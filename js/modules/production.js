/* -------------------------------------------------------
   AppMee — modules/production.js
   Ordres de fabrication (un par ligne de commande, créés
   automatiquement à l'enregistrement de la commande), calendrier,
   besoins de production par produit, articles à commander,
   historique des lots.
   Dépend de : db.js, ui.js, commandes.js
------------------------------------------------------- */

import {
  getAllOFs, createOF, updateOFDate,
  countOFsClosPourDate, cloturerOF,
  getCommandes, getProduits, getArticles, getRecettesByProduit, getClients,
  ajusterStockArticle, ajusterStockProduit, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, showToast, today,
  openModal, nextRef, estSurveille,
  allouerStockSequentiel, selectStatutCmd, restyleSelectStatutCmd,
} from '../ui.js';
import { changerStatutCommande } from './commandes.js';

let _ofs       = [];
let _commandes = [];
let _produits  = [];
let _articles  = [];
let _clients   = [];
let _recettes  = {};
let _calOffset = 0;
let _calMode   = 'semaine'; // 'semaine' | 'quinzaine' | 'mois'

/* Une commande n'a plus besoin de production dès qu'elle a atteint
   « Prêt » — le stock a déjà été décrémenté/incrémenté à ce moment-là
   (cloturerOFsPourCommande). Seules « à produire » et « en production »
   comptent encore dans les besoins et les manques d'articles. */
const STATUTS_AVANT_PRODUCTION = ['a_produire', 'en_production'];
function _enAttenteDeProduction(c) { return STATUTS_AVANT_PRODUCTION.includes(c.statut); }

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_ofs, _commandes, _produits, _articles, _clients] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(), getClients(),
  ]);
  await _chargerRecettes();
  _bindCalNav();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  [_ofs, _commandes, _produits, _articles, _clients] = await Promise.all([
    getAllOFs(), getCommandes(), getProduits(), getArticles(), getClients(),
  ]);
  await _chargerRecettes();
  _renderBadges();
  _renderCalendrier();
  _renderCommandesEnCours();
  _renderVueConsolidee();
  _renderBesoins();
  _renderHistorique();
}

/* -------------------------------------------------------
   BADGES INDICATEURS
------------------------------------------------------- */
function _renderBadges() {
  const actifs = _ofs.filter(o => !['clos', 'annule'].includes(o.statut));
  const total  = actifs.length;
  const avecDate = actifs.filter(o => o.date_prevue).length;
  const sansDate  = total - avecDate;

  const bof = document.getElementById('badgeOF');
  if (bof) { bof.textContent = total; bof.style.display = total > 0 ? '' : 'none'; }

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
        <span style="width:8px;height:8px;border-radius:50%;background:#4c6ef5;display:inline-block;"></span>
        <span style="font-weight:600;">Date planifiée</span>
        <span style="font-weight:800;color:#364fc7;">${avecDate}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fff;border:1.5px solid var(--ui-brd);border-radius:20px;font-size:12.5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:#f59f00;display:inline-block;"></span>
        <span style="font-weight:600;">Date à choisir</span>
        <span style="font-weight:800;color:#b45309;">${sansDate}</span>
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
  'planifie': { bg: 'rgba(76,110,245,0.12)',  brd: '#4c6ef5', txt: '#364fc7' },
  'en_cours': { bg: 'rgba(255,146,43,0.15)',  brd: '#f59f00', txt: '#7c5200' },
  'clos':     { bg: 'rgba(32,201,151,0.08)',  brd: '#20c997', txt: '#0b7a5a' },
  'annule':   { bg: 'rgba(250,82,82,0.10)',   brd: '#fa5252', txt: '#c92a2a' },
};

/* Une commande n'a plus de date de livraison pertinente une fois
   expédiée/facturée/annulée. */
function _estTerminale(c) { return ['expedie', 'en_facturation', 'annule'].includes(c.statut); }

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
  const cmdDay  = _commandes.filter(c => c.date_livraison === ds && !_estTerminale(c));

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
   ORDRES DE FABRICATION — une ligne par commande, dépliable par
   ligne de produit. Chaque ligne de produit porte sa propre date de
   production voulue (l'OF qui lui est implicitement associé, créé
   automatiquement à l'enregistrement de la commande — voir
   creerOFsPourCommande). Plus de statut par ligne : le seul statut
   qui compte est celui de la commande, affiché en tête de ligne. Le
   passage à « Prêt » déclenche la production réelle (décrément
   articles, incrément stock produit fini, génération du numéro de
   lot pour chaque ligne) — voir cloturerOFsPourCommande.
------------------------------------------------------- */
function _commandesEnCours() {
  return _commandes.filter(_enAttenteDeProduction);
}

function _ofPourLigne(ligneId) {
  return _ofs.find(o => o.commande_ligne_id === ligneId) || null;
}

/* OF de toutes les lignes d'une commande, et date de production
   affichée pour la commande entière — une seule date, celle du premier
   OF qui en a une (en pratique tous les OF d'une même commande sont
   produits le même jour : on ne gère pas une date par ligne, juste une
   date par commande, qui s'applique à chacun de ses OF implicites). */
function _ofsCommande(c) {
  return (c.commande_lignes || []).map(l => _ofPourLigne(l.id)).filter(Boolean);
}

function _datePrevueCommande(c) {
  const ofs = _ofsCommande(c);
  const avecDate = ofs.find(o => o.date_prevue);
  return avecDate ? avecDate.date_prevue : '';
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
      <td onclick="event.stopPropagation()"><input type="date" value="${esc(_datePrevueCommande(c))}" data-action="date-commande" data-id="${esc(c.id)}" style="font-size:11px;padding:3px 6px;border:1px solid var(--ui-brd2);border-radius:6px;"></td>
      <td onclick="event.stopPropagation()">${selectStatutCmd(c.id, c.statut)}</td>
    </tr>
    <tr class="prod-cmd-detail" data-id="${esc(c.id)}" style="display:none;">
      <td colspan="5" style="background:var(--ui-bg2);padding:10px 14px;">
        <table style="width:100%;">
          <thead><tr><th>Produit</th><th>Qté</th></tr></thead>
          <tbody>${(c.commande_lignes || []).map(l => `<tr>
              <td class="td-bold">${esc(l.produit_nom || '—')}</td>
              <td>${fmtQ(l.quantite)}</td>
            </tr>`).join('')}</tbody>
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

    const inpDate = e.target.closest('[data-action="date-commande"]');
    if (inpDate) {
      const c = _commandes.find(x => x.id === inpDate.dataset.id);
      if (!c) return;
      const ofs = _ofsCommande(c);
      for (const of_ of ofs) {
        try {
          await updateOFDate(of_.id, inpDate.value);
          of_.date_prevue = inpDate.value;
        } catch (err) {
          console.error('[production] date-commande ERREUR:', err.message, err);
        }
      }
      _renderCalendrier();
      _renderBadges();
      showToast('✅ Date de production mise à jour — s\'affiche dans le calendrier.');
    }
  };
}

/* -------------------------------------------------------
   BESOINS DE PRODUCTION PAR PRODUIT
   Une ligne par produit déjà commandé au moins une fois, montre le
   « reste à produire » en avant, et se déplie pour voir, par client,
   ce qui est déjà couvert par le stock (vert) et ce qu'il reste à
   produire pour satisfaire tout le monde (rouge). Seules les
   commandes pas encore produites (« à produire »/« en production »)
   comptent : une commande « Prêt » a déjà consommé le stock qui la
   concernait au moment de sa clôture.
   Allocation séquentielle partagée avec Commandes Clients
   (allouerStockSequentiel, ui.js) — même ordre d'enregistrement, même
   résultat des deux côtés, pour ne jamais diverger.
------------------------------------------------------- */
/* Une fois une commande expédiée (ou facturée, ou annulée), elle ne
   doit plus garder un produit affiché ici — même "entièrement couvert" :
   une commande expédiée n'a plus aucun besoin, ni réel ni résiduel.
   Un produit encore présent dans une commande active (à produire, en
   production ou prête) reste affiché normalement. */
function _produitsCommandes() {
  const ids = new Set();
  _commandes.filter(c => !_estTerminale(c)).forEach(c => (c.commande_lignes || []).forEach(l => { if (l.produit_id) ids.add(l.produit_id); }));
  return ids;
}

function _vueConsolideeParProduit() {
  const produitIds = _produitsCommandes();

  const lignes = [...produitIds].map(produitId => {
    const p = _produits.find(x => x.id === produitId);
    if (!p) return null;

    const besoins = [];
    _commandes.filter(_enAttenteDeProduction).forEach(c => {
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

    return { produitId, nom: p.nom, stock: p.stock, demandeTotale, resteAProduire, clients };
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--ink-muted)">Aucun produit commandé.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map(l => {
    const resteBadge = l.resteAProduire > 0
      ? `<span class="badge badge-alert">${fmtQ(l.resteAProduire)} à produire</span>`
      : '<span class="badge badge-ok">✓ Tout couvert</span>';

    const detailRows = l.clients.map((c, i) => {
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
        <td>${resteBadge}</td>
      </tr>
      <tr class="prod-vue-detail" data-id="${esc(l.produitId)}" style="display:none;">
        <td colspan="5" style="background:var(--ui-bg2);padding:10px 14px;">
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
   ARTICLES À COMMANDER
   Seulement ce qui manque réellement pour honorer les commandes pas
   encore produites (« à produire »/« en production ») — pas un bilan
   de tous les articles de recette. Une commande déjà « Prêt » a déjà
   consommé son stock à la clôture, elle ne compte plus ici.
------------------------------------------------------- */
function _demandeParProduit() {
  const commande = {};
  _commandes.filter(_enAttenteDeProduction).forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      commande[l.produit_id] = (commande[l.produit_id] || 0) + l.quantite;
    });
  });

  return Object.entries(commande).map(([produitId, qteCmd]) => {
    const p = _produits.find(x => x.id === produitId);
    if (!p) return null;
    /* Produit hors stock : son stock n'est pas suivi, il ne peut donc pas
       être signalé manquant. */
    const manquePF = estSurveille(p) ? Math.max(0, qteCmd - (p.stock || 0)) : 0;
    return { produitId, nom: p.nom, manquePF };
  }).filter(Boolean);
}

function _renderBesoins() {
  const mg = {};
  _demandeParProduit().forEach(l => {
    if (!l.manquePF) return;
    const recette = _recettes[l.produitId] || [];
    recette.forEach(r => {
      const aref = r.articles?.ref;
      if (!aref) return;
      mg[aref] = (mg[aref] || 0) + r.quantite * l.manquePF;
    });
  });

  /* Quantité à commander : au moins de quoi couvrir le manque de
     production, et au moins de quoi remonter le stock au seuil de
     sécurité — jamais les deux séparément, on prend le plus grand des
     deux besoins. */
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

  const detailHtml = detail.length
    ? detail.map(d => `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;">
        <span>${esc(d.commande_ref || '—')} — ${esc(d.client_nom || '—')}</span>
        <strong>${fmtQ(d.quantite)}</strong>
      </div>`).join('')
    : '<span style="color:var(--ink-muted)">Aucun détail enregistré.</span>';

  const detailTr = document.createElement('tr');
  detailTr.className = 'hist-detail-row';
  detailTr.dataset.of = id;
  detailTr.innerHTML = `<td colspan="5" style="background:var(--ui-bg2);padding:10px 14px;font-size:12px;">${detailHtml}</td>`;
  tr.insertAdjacentElement('afterend', detailTr);
}

/* -------------------------------------------------------
   AUTO-OF À LA CRÉATION D'UNE COMMANDE
   Chaque ligne de produit devient implicitement un OF, sans date — la
   date se choisit ensuite depuis Ordres de fabrication. Idempotent :
   ne recrée jamais un OF déjà lié à une ligne de commande donnée (une
   commande modifiée dont les lignes ont été remplacées n'en crée pas
   de doublon, voir commandes.js _saveEdit — deleteOFsForCommande est
   toujours appelé avant).
------------------------------------------------------- */
export async function creerOFsPourCommande(commande) {
  if (!commande || !Array.isArray(commande.commande_lignes) || !commande.commande_lignes.length) return;

  try { _ofs = await getAllOFs(); } catch (_) {}

  let crees = 0;
  for (const l of commande.commande_lignes) {
    if (!l.id || !l.produit_id || !l.quantite) continue;
    const dejaCree = _ofs.some(o => o.commande_ligne_id === l.id);
    if (dejaCree) continue;

    try {
      const ref = nextRef('OF', _ofs);
      const of = await createOF({
        ref, produit_id: l.produit_id, produit_nom: l.produit_nom,
        quantite: l.quantite, date_prevue: null, statut: 'planifie',
        commandes_ids: [commande.id], commande_ligne_id: l.id,
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
    _renderCalendrier();
    _renderCommandesEnCours();
    _renderVueConsolidee();
    _renderBesoins();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  }
}

/* -------------------------------------------------------
   CLÔTURE DE LA PRODUCTION — déclenchée quand une commande passe à
   « Prêt » (événement appmee:commandePrete, écouté depuis app.html).
   Pour chaque ligne de la commande (= un OF implicite) : décrément des
   articles de la recette, incrément du stock du produit fini,
   génération du numéro de lot (format AA-JJJ-rang, rang de clôture du
   jour partagé entre toutes les lignes/commandes, comme avant).
   Règle 11 — recharge les caches avant l'opération : peut être
   déclenché depuis Commandes Clients ou le Dashboard sans que
   Production ait jamais été ouverte dans cette session.
------------------------------------------------------- */
export async function cloturerOFsPourCommande(commande) {
  if (!commande || !Array.isArray(commande.commande_lignes) || !commande.commande_lignes.length) return;

  try {
    [_ofs, _produits, _articles] = await Promise.all([getAllOFs(), getProduits(), getArticles()]);
  } catch (_) {}

  let nbLots = 0;
  for (const l of commande.commande_lignes) {
    const of_ = _ofs.find(o => o.commande_ligne_id === l.id && !['clos', 'annule'].includes(o.statut));
    if (!of_) continue;
    const p = _produits.find(x => x.id === of_.produit_id);
    if (!p) continue;

    try {
      const lignesRecette = await getRecettesByProduit(of_.produit_id);
      for (const r of lignesRecette) {
        const aref = r.articles?.ref;
        const qp   = r.quantite || 0;
        if (!aref || !qp) continue;
        const a = _articles.find(x => x.ref === aref);
        if (!a) continue;
        a.stock = await ajusterStockArticle(a.id, -(qp * of_.quantite));
        await addMouvement({ type: 'sortie', ref: aref, nom: a.nom, qte: qp * of_.quantite, motif: 'Production ' + of_.ref, ref_doc: of_.ref });
      }

      p.stock = await ajusterStockProduit(p.id, of_.quantite);
      await addMouvement({ type: 'entree_pf', ref: p.ref, nom: p.nom, qte: of_.quantite, motif: 'Production ' + of_.ref, ref_doc: of_.ref });

      const dateCloture    = today();
      const dejaClosCeJour = await countOFsClosPourDate(dateCloture);
      const numeroLot      = _formatNumeroLot(new Date(), dejaClosCeJour + 1);
      const detailClients  = [{ commande_ref: commande.ref, client_nom: commande.client_nom, quantite: of_.quantite }];
      await cloturerOF(of_.id, { numero_lot: numeroLot, date_cloture: dateCloture, detail_clients: detailClients });
      of_.statut = 'clos'; of_.numero_lot = numeroLot; of_.date_cloture = dateCloture; of_.detail_clients = detailClients;
      nbLots++;
    } catch (err) {
      console.error('[production] cloturerOFsPourCommande ERREUR:', err.message, err);
    }
  }

  if (nbLots) {
    _renderBadges();
    _renderCalendrier();
    _renderCommandesEnCours();
    _renderVueConsolidee();
    _renderBesoins();
    _renderHistorique();
    showToast(`✅ Production clôturée — ${nbLots} lot${nbLots > 1 ? 's' : ''} généré${nbLots > 1 ? 's' : ''} pour ${commande.ref}.`);
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'production' } }));
  }
}

/* -------------------------------------------------------
   NUMÉRO DE LOT — AA-JJJ-rang
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

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */
async function _chargerRecettes() {
  const recettesRaw = await Promise.all(_produits.map(p => getRecettesByProduit(p.id)));
  _recettes = {};
  _produits.forEach((p, i) => { _recettes[p.id] = recettesRaw[i] || []; });
}
