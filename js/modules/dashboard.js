/* -------------------------------------------------------
   AppMee — modules/dashboard.js
   Tableau de bord : KPIs, alertes stock, dernières
   commandes, stock produits finis.
   Fix S11 — Suppression barres de scroll dashboard
   Fix S12 — Redesign barres progression + chiffres stock
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import { getDashboardData } from '../db.js';
import { fmt, fmtQ, esc, openModal, estAlerteDashboard,
  selectStatutCmd, restyleSelectStatutCmd,
} from '../ui.js';
import { changerStatutCommande } from './commandes.js';

let _data = null;

export async function render() {
  try {
    _data = await getDashboardData();
    renderKPIs(_data);
    renderAlertes(_data.articles);
    renderStockProduits(_data.produits, _data.commandes);
    renderDernieresCommandes(_data.commandes, _data.produits);
    updateBadges(_data);
  } catch (err) {
    console.error('[Dashboard]', err);
  }
}

/* -------------------------------------------------------
   KPIs
------------------------------------------------------- */
function renderKPIs({ articles, produits, commandes, achats, ofs, factures }) {
  const alertsA = articles.filter(estAlerteDashboard).length;
  const nbArticlesCommandes = new Set((achats || []).filter(a => a.statut === 'envoye').map(a => a.article_id)).size;

  const cmdTotal  = commandes.length;
  const cmdValeur = commandes.reduce((s, c) =>
    s + (c.commande_lignes || []).reduce((sl, l) =>
      sl + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0), 0);

  const now = Date.now();
  const factRelancer = (factures || []).filter(f => {
    if (f.statut === 'a_relancer' || f.statut === 'a_lancer') return true;
    if (f.statut === 'facturee' || f.statut === 'facture') {
      const d = new Date(f.date_facture || f.created_at).getTime();
      return (now - d) / 86400000 > 30;
    }
    return false;
  });
  const nbFactRelancer  = factRelancer.length;
  const mntFactRelancer = factRelancer.reduce((s, f) => s + (f.montant_ttc || f.montant_ht || 0), 0);

  const ofCours = ofs.filter(o => o.statut === 'en_cours').length;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi ${alertsA > 0 ? 'alert' : 'good'}">
      <div class="kpi-banner">Alertes Stock</div>
      <div class="kpi-body">
        <div class="kpi-value">${alertsA}</div>
        <div class="kpi-sub">${alertsA > 0 ? 'articles sous seuil' : 'Tout OK'}</div>
      </div>
    </div>
    <div class="kpi purple">
      <div class="kpi-banner">Articles commandés</div>
      <div class="kpi-body">
        <div class="kpi-value">${nbArticlesCommandes}</div>
        <div class="kpi-sub">${nbArticlesCommandes > 0 ? 'en commande envoyée' : 'Aucune'}</div>
      </div>
    </div>
    <div class="kpi blue">
      <div class="kpi-banner">Commandes</div>
      <div class="kpi-body">
        <div class="kpi-value">${fmt(cmdValeur)} €</div>
        <div class="kpi-sub">${cmdTotal} commande${cmdTotal > 1 ? 's' : ''} enregistrée${cmdTotal > 1 ? 's' : ''}</div>
      </div>
    </div>
    <div class="kpi ${nbFactRelancer > 0 ? 'alert' : 'good'}">
      <div class="kpi-banner">Factures à relancer</div>
      <div class="kpi-body">
        <div class="kpi-value">${fmt(mntFactRelancer)} €</div>
        <div class="kpi-sub">${nbFactRelancer > 0 ? nbFactRelancer + ' facture' + (nbFactRelancer > 1 ? 's' : '') : 'Aucune'}</div>
      </div>
    </div>
    <div class="kpi ${ofCours > 0 ? 'warn' : ''}">
      <div class="kpi-banner">OF en cours</div>
      <div class="kpi-body">
        <div class="kpi-value">${ofCours}</div>
        <div class="kpi-sub">ordre${ofCours > 1 ? 's' : ''} de fabrication</div>
      </div>
    </div>`;
}

/* -------------------------------------------------------
   HELPER — barre de progression redesignée
   Même logique que stock.js : couleur selon ratio stock/seuil
------------------------------------------------------- */
function _progBar(stock, seuil, unite = '') {
  const pct   = seuil > 0 ? Math.min(100, Math.round(stock / seuil * 100)) : 100;
  const isZero  = stock <= 0;
  const isBas   = stock <= seuil;
  const isFaible = stock <= seuil * 1.5 && stock > seuil;

  const col = isZero   ? 'rgba(239,68,68,0.5)'
    : isBas    ? 'rgba(239,68,68,0.5)'
    : isFaible ? 'rgba(245,158,11,0.5)'
    : 'rgba(34,197,94,0.5)';

  const stockCol = isZero ? '#ef4444' : isBas ? '#dc2626' : isFaible ? '#b45309' : '#15803d';

  return `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:13px;font-weight:800;color:${stockCol};min-width:40px;">${fmtQ(stock)}</span>
      <div style="flex:1;min-width:60px;">
        <div style="height:5px;background:var(--ui-bg2);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;transition:width .3s;"></div>
        </div>
      </div>
      <span style="font-size:10px;color:var(--ink-muted);white-space:nowrap;">/ ${fmtQ(seuil)} ${esc(unite)}</span>
    </div>`;
}

/* -------------------------------------------------------
   HELPER — overflow fix
------------------------------------------------------- */
function _fixCardOverflow(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const card = el.closest('.card');
  if (card) {
    card.style.overflow = 'visible';
    card.style.overflowX = 'visible';
    card.style.overflowY = 'visible';
  }
  el.style.overflow = 'visible';
  el.style.maxHeight = 'none';
}

/* -------------------------------------------------------
   ALERTES STOCK ARTICLES — Fix S12 redesign barres
------------------------------------------------------- */
function renderAlertes(articles) {
  const al = articles.filter(estAlerteDashboard);
  const el = document.getElementById('dashAlerts');

  _fixCardOverflow('dashAlerts');

  if (!al.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><p>Aucune alerte !</p></div>';
    return;
  }

  const rows = al.map(a => `
    <tr>
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td style="min-width:160px;">${_progBar(a.stock, a.seuil, a.unite)}</td>
      <td><button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button></td>
    </tr>`).join('');

  el.innerHTML = `
    <table>
      <thead><tr><th>Réf</th><th>Article</th><th>Stock / Seuil</th><th></th></tr></thead>
      <tbody id="dashAlertsTbody">${rows}</tbody>
    </table>`;

  document.getElementById('dashAlertsTbody').onclick = (e) => {
    const btn = e.target.closest('[data-action="commander"]');
    if (!btn) return;
    const ref = btn.dataset.ref;
    document.dispatchEvent(new CustomEvent('appmee:openAchatFor', { detail: { ref } }));
    openModal('modalAchat');
  };
}

/* -------------------------------------------------------
   PRODUITS FINIS MANQUANTS POUR LES COMMANDES EN COURS
   Ne compare plus le stock à un seuil statique : l'alerte porte sur ce
   qu'il manque réellement pour honorer les commandes pas encore
   produites (« à produire »/« en production » — une commande « Prêt »
   a déjà consommé son stock à sa clôture, voir production.js). Même
   principe que Production (Besoins de production par produit), en
   version compacte pour le Dashboard.
------------------------------------------------------- */
function renderStockProduits(produits, commandes) {
  const demande = {};
  (commandes || []).filter(c => ['a_produire', 'en_production'].includes(c.statut)).forEach(c => {
    (c.commande_lignes || []).forEach(l => {
      demande[l.produit_id] = (demande[l.produit_id] || 0) + l.quantite;
    });
  });

  const manquants = produits
    .map(p => ({ p, manque: Math.max(0, (demande[p.id] || 0) - (p.stock || 0)) }))
    .filter(x => x.manque > 0)
    .sort((a, b) => b.manque - a.manque);

  const el = document.getElementById('dashProduits');
  _fixCardOverflow('dashProduits');

  if (!manquants.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><p>Tous les produits commandés sont couverts par le stock.</p></div>';
    return;
  }

  const rows = manquants.map(({ p, manque }) => `
    <tr>
      <td class="td-bold">${esc(p.nom)}</td>
      <td>${fmtQ(p.stock)}</td>
      <td style="color:var(--ui-red);font-weight:700">⚠ ${fmtQ(manque)}</td>
    </tr>`).join('');

  el.innerHTML = `
    <table>
      <thead><tr><th>Produit</th><th>Stock</th><th>Manque pour les commandes en cours</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* -------------------------------------------------------
   COMMANDES CLIENTS EN COURS
   Volontairement une simple vue d'ensemble — référence, client, date
   de livraison, statut — rien de plus. Le détail commercial (lignes,
   prix, faisabilité) vit dans Commandes Clients ; le détail prêt/à
   produire vit dans Production. Trois écrans suivent les commandes en
   cours, chacun avec son propre rôle, pour ne pas répéter trois fois la
   même chose. Le statut se change directement ici via le même contrôle
   que le module Commandes Clients (selectStatutCmd / changerStatutCommande,
   ui.js + commandes.js) : un seul code qui décide, jamais deux qui
   pourraient diverger.
------------------------------------------------------- */
function renderDernieresCommandes(commandes, produits) {
  const el = document.getElementById('dashCommandes');
  const rec = [...commandes].filter(c => !['expedie', 'en_facturation', 'annule'].includes(c.statut));

  if (!rec.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon neutral"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9"/><polyline points="14 2 14 8 20 8"/></svg></div><p>Aucune commande en cours.</p></div>';
    return;
  }

  const rows = rec.map(c => `
    <tr>
      <td class="td-ref">${esc(c.ref)}</td>
      <td class="td-bold">${esc(c.client_nom)}</td>
      <td>${esc(c.date_livraison || '—')}</td>
      <td>${selectStatutCmd(c.id, c.statut)}</td>
    </tr>`).join('');

  el.innerHTML = `
    <table>
      <thead><tr><th>Réf</th><th>Client</th><th>Livraison</th><th>Statut</th></tr></thead>
      <tbody id="dashCommandesTbody">${rows}</tbody>
    </table>`;

  const tbody = document.getElementById('dashCommandesTbody');

  /* Règle 7 — onchange (écrasé à chaque render), pas addEventListener */

  tbody.onchange = async (e) => {
    const sel = e.target.closest('.cmd-statut-select');
    if (!sel) return;
    restyleSelectStatutCmd(sel);
    await changerStatutCommande(sel.dataset.id, sel.value);
  };
}

/* -------------------------------------------------------
   BADGES NAVIGATION
------------------------------------------------------- */
function updateBadges({ articles, commandes, ofs, factures, messagesEquipe }) {
  const alertsA = articles.filter(estAlerteDashboard).length;
  const cmdOpen = commandes.filter(c => !['expedie', 'en_facturation', 'annule'].includes(c.statut)).length;
  const ofActifs = (ofs || []).filter(o => ['planifie', 'en_cours'].includes(o.statut)).length;
  const facAlerte = (factures || []).filter(f => f.statut === 'a_lancer' || f.statut === 'a_relancer').length;
  const msgEnCours = (messagesEquipe || []).filter(m => m.statut === 'encours').length;

  const ba = document.getElementById('badgeStockAlert');
  if (ba) { ba.textContent = alertsA; ba.style.display = alertsA > 0 ? '' : 'none'; }

  const bc = document.getElementById('badgeCmd');
  if (bc) { bc.textContent = cmdOpen; bc.style.display = cmdOpen > 0 ? '' : 'none'; }

  const bof = document.getElementById('badgeOF');
  if (bof) { bof.textContent = ofActifs; bof.style.display = ofActifs > 0 ? '' : 'none'; }

  const bliv = document.getElementById('badgeLivraisons');
  if (bliv) { bliv.textContent = facAlerte; bliv.style.display = facAlerte > 0 ? '' : 'none'; }

  const bmsg = document.getElementById('badgeMessages');
  if (bmsg) { bmsg.textContent = msgEnCours; bmsg.style.display = msgEnCours > 0 ? '' : 'none'; }
}
