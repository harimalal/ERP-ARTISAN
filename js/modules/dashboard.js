/* -------------------------------------------------------
   AppMee — modules/dashboard.js
   Tableau de bord : KPIs, alertes stock, dernières
   commandes, stock produits finis.
   Fix S11 — Suppression barres de scroll dashboard :
   la .card parente a overflow:hidden dans components.css
   → on force overflow:visible sur les .card des encarts.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import { getDashboardData } from '../db.js';
import { fmt, fmtQ, esc, badgeCmd, stockStatus, openModal } from '../ui.js';

let _data = null;

export async function render() {
  try {
    _data = await getDashboardData();
    renderKPIs(_data);
    renderAlertes(_data.articles);
    renderStockProduits(_data.produits);
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
  const alertsA = articles.filter(a => a.stock <= a.seuil).length;

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
      <div class="kpi-label">Alertes Stock</div>
      <div class="kpi-value">${alertsA}</div>
      <div class="kpi-sub">${alertsA > 0 ? 'articles sous seuil' : 'Tout OK'}</div>
    </div>
    <div class="kpi blue">
      <div class="kpi-label">Commandes</div>
      <div class="kpi-value">${fmt(cmdValeur)} €</div>
      <div class="kpi-sub">${cmdTotal} commande${cmdTotal > 1 ? 's' : ''} enregistrée${cmdTotal > 1 ? 's' : ''}</div>
    </div>
    <div class="kpi ${nbFactRelancer > 0 ? 'alert' : 'good'}">
      <div class="kpi-label">Factures à relancer</div>
      <div class="kpi-value">${fmt(mntFactRelancer)} €</div>
      <div class="kpi-sub">${nbFactRelancer > 0 ? nbFactRelancer + ' facture' + (nbFactRelancer > 1 ? 's' : '') : 'Aucune'}</div>
    </div>
    <div class="kpi ${ofCours > 0 ? 'warn' : ''}">
      <div class="kpi-label">OF en cours</div>
      <div class="kpi-value">${ofCours}</div>
      <div class="kpi-sub">ordre${ofCours > 1 ? 's' : ''} de fabrication</div>
    </div>`;
}

/* -------------------------------------------------------
   HELPER — forcer la .card parente en overflow visible
   Fix S11 : components.css impose overflow:hidden sur .card
   ce qui génère une scrollbar horizontale sur les encarts
------------------------------------------------------- */
function _fixCardOverflow(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  /* Cibler la .card parente directe */
  const card = el.closest('.card');
  if (card) {
    card.style.overflow = 'visible';
    card.style.overflowX = 'visible';
    card.style.overflowY = 'visible';
  }
  /* Cibler aussi l'élément lui-même */
  el.style.overflow = 'visible';
  el.style.maxHeight = 'none';
}

/* -------------------------------------------------------
   ALERTES STOCK ARTICLES
------------------------------------------------------- */
function renderAlertes(articles) {
  const al = articles.filter(a => a.stock <= a.seuil);
  const el = document.getElementById('dashAlerts');

  _fixCardOverflow('dashAlerts');

  if (!al.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Aucune alerte !</p></div>';
    return;
  }

  const rows = al.map(a => {
    const isEqual = a.stock === a.seuil;
    const stockColor = isEqual ? '#c8830a' : 'var(--ui-red)';
    return `<tr>
      <td class="td-ref">${esc(a.ref)}</td>
      <td class="td-bold">${esc(a.nom)}</td>
      <td>
        <span style="color:${stockColor};font-weight:700;">${fmtQ(a.stock)} ${esc(a.unite)}</span>
        <span style="color:var(--ui-text3);font-size:11px;"> / ${fmtQ(a.seuil)}</span>
      </td>
      <td><button class="btn btn-outline btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button></td>
    </tr>`;
  }).join('');

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
   STOCK PRODUITS FINIS
   Uniquement les produits en alerte (stock <= seuil)
   Pas de barre de progression — chiffres Stock / Seuil
------------------------------------------------------- */
function renderStockProduits(produits) {
  const alertes = produits.filter(p => p.stock <= p.seuil);
  const el = document.getElementById('dashProduits');

  _fixCardOverflow('dashProduits');

  if (!alertes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Tous les produits sont en stock.</p></div>';
    return;
  }

  const rows = alertes.map(p => {
    const stockColor = p.stock <= 0 ? 'var(--ui-red)' : '#c8830a';
    return `<tr>
      <td class="td-bold">${esc(p.nom)}</td>
      <td>
        <span style="font-size:13px;font-weight:700;color:${stockColor};">${fmtQ(p.stock)}</span>
        <span style="color:var(--ink-muted);font-size:11px;"> / ${fmtQ(p.seuil)}</span>
      </td>
      <td>${stockStatus(p.stock, p.seuil)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table>
      <thead><tr><th>Produit</th><th>Stock / Seuil</th><th>Statut</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* -------------------------------------------------------
   DERNIÈRES COMMANDES
------------------------------------------------------- */
function renderDernieresCommandes(commandes, produits) {
  const el = document.getElementById('dashCommandes');
  const rec = [...commandes].slice(0, 8);

  if (!rec.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune commande.</p></div>';
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr><th>Réf</th><th>Client</th><th>Date</th><th>Montant</th><th>Statut</th></tr></thead>
      <tbody>${rec.map(c => {
        const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
        return `<tr>
          <td class="td-ref">${esc(c.ref)}</td>
          <td class="td-bold">${esc(c.client_nom)}</td>
          <td>${esc(c.date_cmd)}</td>
          <td style="font-weight:600">${fmt(tot)} €</td>
          <td>${badgeCmd(c.statut)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;
}

/* -------------------------------------------------------
   BADGES NAVIGATION
------------------------------------------------------- */
function updateBadges({ articles, commandes }) {
  const alertsA = articles.filter(a => a.stock <= a.seuil).length;
  const cmdOpen = commandes.filter(c => c.statut !== 'cloture').length;

  const ba = document.getElementById('badgeStockAlert');
  if (ba) { ba.textContent = alertsA; ba.style.display = alertsA > 0 ? '' : 'none'; }

  const bc = document.getElementById('badgeCmd');
  if (bc) { bc.textContent = cmdOpen; bc.style.display = cmdOpen > 0 ? '' : 'none'; }
}
