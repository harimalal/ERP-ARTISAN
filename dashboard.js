/* -------------------------------------------------------
   AppMee — modules/dashboard.js
   Tableau de bord : KPIs, alertes stock, dernières
   commandes, stock produits finis.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import { getDashboardData } from '../db.js';
import { fmt, fmtQ, esc, badgeCmd, stockStatus, openModal } from '../ui.js';

/* Cache local — rechargé à chaque render() */
let _data = null;

/* -------------------------------------------------------
   RENDER PRINCIPAL
------------------------------------------------------- */
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
function renderKPIs({ articles, produits, commandes, achats, ofs }) {
  const alertsA   = articles.filter(a => a.stock <= a.seuil).length;
  const totalPF   = produits.reduce((s, p) => s + (p.stock || 0), 0);
  const cmdOpen   = commandes.filter(c => c.statut !== 'cloture').length;
  const valA      = articles.reduce((s, a) => s + (a.stock || 0) * (a.prix || 0), 0);
  const bcPending = achats.filter(a => ['envoye', 'en_cours'].includes(a.statut)).length;
  const ofCours   = ofs.filter(o => o.statut === 'en_cours').length;

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi ${alertsA > 0 ? 'alert' : 'good'}">
      <div class="kpi-label">Alertes articles</div>
      <div class="kpi-value">${alertsA}</div>
      <div class="kpi-sub">${alertsA > 0 ? 'sous le seuil' : 'Tout OK'}</div>
    </div>
    <div class="kpi good">
      <div class="kpi-label">Stock produits finis</div>
      <div class="kpi-value">${totalPF.toLocaleString('fr')}</div>
      <div class="kpi-sub">unités dispo</div>
    </div>
    <div class="kpi blue">
      <div class="kpi-label">Commandes en cours</div>
      <div class="kpi-value">${cmdOpen}</div>
      <div class="kpi-sub">non clôturées</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Valeur stock articles</div>
      <div class="kpi-value">${fmt(valA)} €</div>
      <div class="kpi-sub">au prix d'achat</div>
    </div>
    <div class="kpi ${bcPending > 0 ? 'warn' : ''}">
      <div class="kpi-label">BC en attente</div>
      <div class="kpi-value">${bcPending}</div>
      <div class="kpi-sub">bons envoyés / cours</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">OF en cours</div>
      <div class="kpi-value">${ofCours}</div>
      <div class="kpi-sub">ordres actifs</div>
    </div>`;
}

/* -------------------------------------------------------
   ALERTES STOCK ARTICLES
------------------------------------------------------- */
function renderAlertes(articles) {
  const al = articles.filter(a => a.stock <= a.seuil);
  const el = document.getElementById('dashAlerts');

  if (!al.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Aucune alerte !</p></div>';
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr><th>Réf</th><th>Article</th><th>Stock</th><th>Seuil</th><th></th></tr></thead>
      <tbody>${al.map(a => `
        <tr>
          <td class="td-ref">${esc(a.ref)}</td>
          <td class="td-bold">${esc(a.nom)}</td>
          <td style="color:var(--ui-red);font-weight:600">${fmtQ(a.stock)} ${esc(a.unite)}</td>
          <td>${fmtQ(a.seuil)}</td>
          <td><button class="btn btn-primary btn-sm" data-ref="${esc(a.ref)}" data-action="commander">Commander</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  /* Délégation d'événement pour les boutons Commander */
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="commander"]');
    if (btn) {
      const ref = btn.dataset.ref;
      openModal('modalAchat');
      document.dispatchEvent(new CustomEvent('appmee:openAchatFor', { detail: { ref } }));
    }
  });
}

/* -------------------------------------------------------
   STOCK PRODUITS FINIS
------------------------------------------------------- */
function renderStockProduits(produits) {
  document.getElementById('dashProduits').innerHTML = `
    <table>
      <thead><tr><th>Produit</th><th>Stock</th><th>Statut</th><th>Prix</th></tr></thead>
      <tbody>${produits.map(p => `
        <tr>
          <td>${esc(p.nom)}</td>
          <td><strong>${p.stock}</strong></td>
          <td>${stockStatus(p.stock, p.seuil)}</td>
          <td>${fmt(p.prix_vente || p.prix)} €</td>
        </tr>`).join('')}
      </tbody>
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
