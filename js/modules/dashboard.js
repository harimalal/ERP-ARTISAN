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

/* NOTE : getDashboardData() doit retourner { articles, produits, commandes, achats, ofs, factures }
   Si factures n'est pas encore dans getDashboardData, ajouter : factures: await getFactures()
   dans db.js → getDashboardData(). Le calcul "Factures à relancer" en dépend. */

/* -------------------------------------------------------
   KPIs
------------------------------------------------------- */
function renderKPIs({ articles, produits, commandes, achats, ofs, factures }) {
  const alertsA    = articles.filter(a => a.stock <= a.seuil).length;
  const bcPending  = achats.filter(a => ['envoye', 'en_cours'].includes(a.statut)).length;
  const ofCours    = ofs.filter(o => o.statut === 'en_cours').length;

  /* Factures à relancer : statut 'a_relancer' ou facturée depuis > 30j */
  const factures_  = factures || [];
  const today30    = new Date(); today30.setDate(today30.getDate() - 30);
  const aRelancer  = factures_.filter(f =>
    f.statut === 'a_relancer' ||
    (f.statut === 'facture' && new Date(f.date_facture) < today30)
  ).length;

  /* Valeur BdC en cours : achats statut envoyé ou en_cours */
  const valBdc = achats
    .filter(a => ['envoye', 'en_cours'].includes(a.statut))
    .reduce((s, a) => s + (a.quantite || 0) * (a.prix_unitaire || 0), 0);

  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi ${alertsA > 0 ? 'alert' : 'good'}">
      <div class="kpi-label">Alertes stock</div>
      <div class="kpi-value">${alertsA}</div>
      <div class="kpi-sub">${alertsA > 0 ? 'articles sous le seuil' : 'Tout OK'}</div>
    </div>
    <div class="kpi ${bcPending > 0 ? 'warn' : ''}">
      <div class="kpi-label">BC en attente</div>
      <div class="kpi-value">${bcPending}</div>
      <div class="kpi-sub">bons envoyés / en cours</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Valeur BdC en cours</div>
      <div class="kpi-value">${fmt(valBdc)} €</div>
      <div class="kpi-sub">achats engagés</div>
    </div>
    <div class="kpi ${aRelancer > 0 ? 'alert' : ''}">
      <div class="kpi-label">Factures à relancer</div>
      <div class="kpi-value">${aRelancer}</div>
      <div class="kpi-sub">${aRelancer > 0 ? 'en attente de paiement' : 'Tout à jour'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">OF en cours</div>
      <div class="kpi-value">${ofCours}</div>
      <div class="kpi-sub">ordres actifs</div>
    </div>`;
}

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
  const el = document.getElementById('dashProduits');
  el.innerHTML = `
    <table>
      <thead><tr><th>Produit</th><th>Stock</th><th>Statut</th><th></th></tr></thead>
      <tbody>${produits.map(p => `
        <tr>
          <td>${esc(p.nom)}</td>
          <td><strong>${p.stock}</strong></td>
          <td>${stockStatus(p.stock, p.seuil)}</td>
          <td>
            <button class="btn btn-outline btn-sm" data-ref="${esc(p.ref)}" data-action="produire">▶ Produire</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="produire"]');
    if (btn) {
      document.dispatchEvent(new CustomEvent('appmee:planifierOF', { detail: { ref: btn.dataset.ref } }));
      openModal('modalPlanifier');
    }
  });
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
