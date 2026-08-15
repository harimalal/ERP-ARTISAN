/* -------------------------------------------------------
   AppMee — modules/livraisons.js
   Livraisons et factures : liste, confirmation,
   changement statut, modal édition, aperçu PDF.
   Fix S11 — statut défaut facture : 'a_lancer'
   Fix S11 — colonne Date ajoutée + mise à jour auto à 'facture'
   Fix S11 — déroulant statut Règle 17 (delegationBound)
   Fix S11 — modal édition au clic sur ligne
   Fix S11 — saveLivraison exportée + listener dans app.html
   Fix S11 — Règle 11 recharge cache avant saveLivraison
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getFactures, createFacture, updateFactureStatut,
  createLivraison, factureExistePourCommande,
  getCommandes, getClients, getProduits,
  updateProduitStock, addMouvement,
  updateCommandeStatut, getTenant,
  createFactureLignes, nextRefServeur, getFactureLignes,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeFac, showToast, today,
  openModal, closeModal,
} from '../ui.js';

let _factures  = [];
let _commandes = [];
let _clients   = [];
let _produits  = [];
let _nfListenersBound = false;
let _delegationBound  = false;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_factures, _commandes, _clients, _produits] = await Promise.all([
    getFactures(), getCommandes(), getClients(), getProduits(),
  ]);
  _bindNewFactureForm();

  /* Règle 17 — delegation posée une seule fois */
  if (!_delegationBound) {
    _delegationBound = true;

    /* Clic ligne → ouvre modal édition OU aperçu PDF */
    document.addEventListener('click', (e) => {
      /* Bouton PDF */
      const btnPdf = e.target.closest('#facturesTbody [data-action="pdf"]');
      if (btnPdf) {
        e.stopPropagation();
        _aperçuPdfFac(btnPdf.dataset.id).catch(() => {});
        return;
      }
      /* Clic ligne → édition */
      const row = e.target.closest('#facturesTbody tr[data-id]');
      if (!row) return;
      if (e.target.closest('[data-action]') || e.target.closest('select')) return;
      _ouvrirEditFacture(row.dataset.id);
    }, true);

    /* Changement statut via select */
    document.addEventListener('change', async (e) => {
      const sel = e.target.closest('#facturesTbody [data-action="changer-statut"]');
      if (!sel || !sel.value) return;
      await _changerStatutFac(sel.dataset.id, sel.value);
      sel.value = ''; /* reset après action */
    }, true);
  }
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _factures  = await getFactures();
  _commandes = await getCommandes();
  _renderTable();
}

/* -------------------------------------------------------
   TABLEAU FACTURES
   Colonnes : N° Facture | Date | Client | Montant HT | TTC | Statut | Changer | Aperçu
------------------------------------------------------- */
function _renderTable() {
  const facAlerte = _factures.filter(f => f.statut === 'a_lancer' || f.statut === 'a_relancer').length;
  const bliv = document.getElementById('badgeLivraisons');
  if (bliv) { bliv.textContent = facAlerte; bliv.style.display = facAlerte > 0 ? '' : 'none'; }

  const tbody = document.getElementById('facturesTbody');
  if (!tbody) return; /* Règle 21 — guard : page Livraisons peut ne pas être active */
  tbody.innerHTML = _factures.map(f => `
    <tr class="clickable" data-id="${f.id}">
      <td class="td-ref">${esc(f.ref)}</td>
      <td style="font-size:11.5px;">${esc(f.date_facture || '—')}</td>
      <td class="td-bold">${esc(f.client_nom)}</td>
      <td style="font-weight:600">${fmt(f.montant_ht)} €</td>
      <td style="color:var(--ink-muted);font-size:11.5px;">${fmt((f.montant_ht || 0) * (1 + (f.taux_tva || 20) / 100))} €</td>
      <td>${badgeFac(f.statut)}</td>
      <td onclick="event.stopPropagation()">
        <select data-id="${f.id}" data-action="changer-statut"
          style="font-size:10.5px;padding:2px 6px;border:1px solid var(--ui-brd);border-radius:5px;">
          <option value="">Changer…</option>
          <option value="a_lancer">À lancer</option>
          <option value="facture">Facturée</option>
          <option value="a_relancer">À relancer</option>
          <option value="regle">Réglée ✓</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()">
        <button class="btn-icon" data-id="${f.id}" data-action="pdf" title="Aperçu PDF">👁</button>
      </td>
    </tr>`).join('') ||
    '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucune facture.</td></tr>';
}

/* -------------------------------------------------------
   CONFIRMATION LIVRAISON — exportée pour app.html
   Fix S11 — statut défaut 'a_lancer' au lieu de 'facture'
   Fix S11 — Règle 11 recharge cache avant opération
   Fix S11 — date_facture mise à jour lors du passage à 'facture'
------------------------------------------------------- */
export async function saveLivraison() {
  const commandeId = document.getElementById('livCmdId').value;
  const date       = document.getElementById('livDate').value || today();
  if (!commandeId) { showToast('⚠ Commande introuvable.', 'error'); return; }

  /* Règle 11 — recharger avant opération critique */
  try {
    [_factures, _commandes, _clients, _produits] = await Promise.all([
      getFactures(), getCommandes(), getClients(), getProduits(),
    ]);
  } catch (_) {}

  const c = _commandes.find(x => x.id === commandeId);
  if (!c) { showToast('⚠ Commande introuvable.', 'error'); return; }

  const btn = document.getElementById('btnSaveLivraison');
  if (btn) { btn.disabled = true; btn.textContent = 'Traitement…'; }

  try {
    /* Décrémenter stock PF */
    for (const l of (c.commande_lignes || [])) {
      const p = _produits.find(x => x.id === l.produit_id);
      if (!p) continue;
      const newStock = Math.max(0, p.stock - l.quantite);
      await updateProduitStock(p.id, newStock);
      await addMouvement({ type: 'sortie_pf', ref: p.ref, nom: p.nom, qte: l.quantite, motif: 'Livraison ' + c.ref, ref_doc: c.ref });
      p.stock = newStock;
    }

    /* Créer la livraison */
    await createLivraison({ commande_id: commandeId, ref: await nextRefServeur('LIV'), date_livraison: date, statut: 'livree' });

    /* Créer la facture si inexistante — statut par défaut : 'a_lancer' */
    const dejafac = await factureExistePourCommande(commandeId);
    if (!dejafac) {
      const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);

      /* TVA multi-taux : taux par défaut du tenant */
      let tauxTva = 20;
      try {
        const tenant = await getTenant();
        if (tenant && tenant.taux_tva != null) tauxTva = Number(tenant.taux_tva);
      } catch (_) {}

      /* Résoudre le client pour les mentions légales (SIREN, adresse) */
      let clientId = c.client_id || null;
      let siretClient = '';
      let adresseClient = '';
      try {
        const client = clientId
          ? _clients.find(x => x.id === clientId)
          : _clients.find(x => x.nom === c.client_nom);
        if (client) {
          clientId = client.id;
          siretClient = client.siret || '';
          adresseClient = client.adresse || '';
        }
      } catch (_) {}

      const fac = await createFacture({
        ref:           await nextRefServeur('FAC'),
        commande_id:   commandeId,
        client_id:     clientId,
        client_nom:    c.client_nom,
        siret_client:  siretClient,
        adresse_client: adresseClient,
        montant_ht:    tot,
        taux_tva:      tauxTva,
        statut:        'a_lancer',   /* Fix S11 — défaut À lancer */
        date_facture:  date,
      });
      _factures.unshift(fac);

      /* Figer les lignes de facture (copie depuis la commande) */
      const lignesFigees = (c.commande_lignes || []).map(l => ({
        produit_id:    l.produit_id,
        produit_nom:   l.produit_nom,
        quantite:      l.quantite,
        prix_unitaire: l.prix_unitaire,
        taux_tva:      tauxTva,
        total_ht:      l.total_ht || (l.quantite * l.prix_unitaire),
      }));
      await createFactureLignes(fac.id, lignesFigees);
    }

    /* Clôturer la commande — isolé pour ne pas bloquer */
    try { await updateCommandeStatut(commandeId, 'cloture'); } catch (e) {
      console.error('[livraisons] cloture non bloquante:', e.message);
    }

    closeModal('modalLivraison');
    _renderTable();
    showToast('✅ ' + c.ref + ' livrée — facture créée (À lancer).');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'livraisons' } }));
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    console.error('[livraisons] saveLivraison ERREUR:', err.message, err);
    showToast('❌ Erreur confirmation livraison.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmer livraison'; }
  }
}

/* -------------------------------------------------------
   CHANGEMENT STATUT FACTURE
   Fix S11 — date_facture mise à jour auto au passage à 'facture'
------------------------------------------------------- */
async function _changerStatutFac(id, statut) {
  try {
    const changes = { statut };
    /* Mise à jour automatique de la date au passage en Facturée */
    if (statut === 'facture') changes.date_facture = today();
    await updateFactureStatut(id, statut);
    if (statut === 'facture') {
    }
    const fac = _factures.find(x => x.id === id);
    if (fac) {
      fac.statut = statut;
      if (statut === 'facture') fac.date_facture = today();
    }
    _renderTable();
    showToast('✅ Statut mis à jour.');
  } catch (err) {
    showToast('❌ Erreur changement statut.', 'error');
    console.error('[livraisons] _changerStatutFac ERREUR:', err.message, err);
  }
}

/* -------------------------------------------------------
   MODAL ÉDITION FACTURE — ouverture au clic ligne
------------------------------------------------------- */
function _ouvrirEditFacture(id) {
  const f = _factures.find(x => x.id === id);
  if (!f) return;
  document.dispatchEvent(new CustomEvent('appmee:editFacture', { detail: f }));
}

/* -------------------------------------------------------
   NOUVELLE FACTURE MANUELLE
------------------------------------------------------- */
function _bindNewFactureForm() {
  if (_nfListenersBound) return;
  _nfListenersBound = true;
  document.getElementById('nfMontant')?.addEventListener('input', _calcNFTtc);
  document.getElementById('nfTva')?.addEventListener('input', _calcNFTtc);
  document.getElementById('nfRefCmd')?.addEventListener('change', (e) => {
    const cmd = _commandes.find(c => c.ref === e.target.value);
    if (!cmd) return;
    const opt = Array.from(document.getElementById('nfClient').options).find(o => o.value === cmd.client_nom);
    if (opt) document.getElementById('nfClient').value = cmd.client_nom;
    const tot = (cmd.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
    document.getElementById('nfMontant').value = tot.toFixed(2);
    _calcNFTtc();
  });
  document.getElementById('btnSaveNewFacture')?.addEventListener('click', _saveNewFacture);
}

export function initNewFactureModal() {
  document.getElementById('nfDate').value    = today();
  document.getElementById('nfMontant').value = '';
  document.getElementById('nfNotes').value   = '';
  document.getElementById('nfDescription').value = '';
  document.getElementById('nfTtcPreview').textContent = '—';
  const clientSel = document.getElementById('nfClient');
  clientSel.innerHTML = '<option value="">— Sélectionner un client —</option>' +
    _clients.map(c => `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('');
  const cmdSel = document.getElementById('nfRefCmd');
  cmdSel.innerHTML = '<option value="">— Aucune —</option>' +
    _commandes.map(c => `<option value="${esc(c.ref)}">${esc(c.ref)} — ${esc(c.client_nom)}</option>`).join('');
}

function _calcNFTtc() {
  const ht  = parseFloat(document.getElementById('nfMontant').value) || 0;
  const tva = parseFloat(document.getElementById('nfTva').value) || 0;
  document.getElementById('nfTtcPreview').textContent = fmt(ht * (1 + tva / 100)) + ' €';
}

async function _saveNewFacture() {
  const clientNom = document.getElementById('nfClient').value;
  const montant   = parseFloat(document.getElementById('nfMontant').value) || 0;
  if (!clientNom || !montant) { showToast('⚠ Client et montant requis.', 'error'); return; }
  const ref = await nextRefServeur('FAC');
  try {
    /* Résoudre le client pour les mentions légales */
    let clientId = null, siretClient = '', adresseClient = '';
    try {
      const client = _clients.find(x => x.nom === clientNom);
      if (client) {
        clientId = client.id;
        siretClient = client.siret || '';
        adresseClient = client.adresse || '';
      }
    } catch (_) {}

    const fac = await createFacture({
      ref,
      date_facture: document.getElementById('nfDate').value || today(),
      client_id:    clientId,
      client_nom:   clientNom,
      siret_client: siretClient,
      adresse_client: adresseClient,
      montant_ht:   montant,
      taux_tva:     parseFloat(document.getElementById('nfTva').value) || 20,
      statut:       document.getElementById('nfStatut').value,
      notes:        document.getElementById('nfNotes').value,
    });
    _factures.unshift(fac);
    closeModal('modalNewFacture');
    _renderTable();
    showToast('✅ Facture ' + ref + ' créée.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'factures' } }));
  } catch (err) {
    showToast('❌ Erreur création facture.', 'error');
  }
}

/* -------------------------------------------------------
   APERÇU PDF — nouvelle fenêtre A4 identique au BC
------------------------------------------------------- */
async function _aperçuPdfFac(id) {
  const f = _factures.find(x => x.id === id);
  if (!f) return;
  const c = _commandes.find(x => x.id === f.commande_id);
  const t = await getTenant() || {};
  /* Lignes figées : priorité à facture_lignes, sinon fallback commande */
  let lignes = [];
  try {
    lignes = await getFactureLignes(f.id);
  } catch (_) {}
  if (!lignes.length && c) lignes = c.commande_lignes || [];
  _ouvrirFenetrePDFFac(f, t, c, lignes);
}

function _ouvrirFenetrePDFFac(f, t, c, lignes) {
  const montantHT = f.montant_ht || 0;
  const tvaRate = f.taux_tva || 20;
  const tva = montantHT * (tvaRate / 100);
  const ttc = f.montant_ttc || montantHT + tva;
  const fmtPrix = v => fmt(Number(v)) + ' €';

  const lignesHTML = lignes.map(l => {
    const ref = (_produits.find(p => p.id === l.produit_id) || {}).ref || '—';
    return `
    <tr>
      <td style="font-weight:700;color:#2563eb;font-size:10px;white-space:nowrap;">${esc(ref)}</td>
      <td>${esc(l.produit_nom || '—')}</td>
      <td class="r">${fmtQ(l.quantite || 0)}</td>
      <td class="r">${fmtPrix(l.prix_unitaire || 0)}</td>
      <td class="r" style="font-weight:600;">${fmtPrix(l.total_ht || ((l.quantite || 0) * (l.prix_unitaire || 0)))}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Facture ${esc(f.ref)}</title>
    <style>
    @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:11px;margin:0 auto;padding:20px 50px;color:#1a1a1a;max-width:860px;}
    .btn-print{display:block;margin:0 auto 20px;padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;}
    @media print{.btn-print{display:none;}body{padding:0;margin:0;}}
    h1{font-size:17px;text-transform:uppercase;margin:0 0 2px;}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:16px;}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;padding:10px 12px;background:#f9fafb;border-radius:6px;}
    .plbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:4px;}
    .pnom{font-size:12px;font-weight:700;margin-bottom:2px;}
    .pinfo{font-size:10px;color:#555;line-height:1.5;}
    table{width:100%;border-collapse:collapse;margin-bottom:0;}
    thead tr{background:#1a1a1a;color:#fff;}
    thead th{padding:7px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;}
    thead th.r{text-align:right;}
    tbody tr{border-bottom:1px solid #eee;}tbody tr:nth-child(even){background:#f9fafb;}
    tbody td{padding:5px 8px;font-size:10.5px;}tbody td.r{text-align:right;}
    .totaux{width:240px;margin-left:auto;margin-top:8px;border-collapse:collapse;}
    .totaux td{padding:4px 8px;font-size:11px;}
    .totaux .lbl{text-align:right;color:#555;}.totaux .val{text-align:right;font-weight:600;}
    .totaux tr.ttc td{background:#1a1a1a;color:#fff;font-weight:700;font-size:12px;padding:6px 8px;}
    .mentions{margin-top:16px;padding:10px 12px;background:#f9fafb;border-radius:6px;font-size:9.5px;color:#555;line-height:1.6;border-left:3px solid #2563eb;}
    .footer{margin-top:12px;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#aaa;}
    </style></head><body>
    <button class="btn-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF (A4)</button>
    <div class="hdr">
      <div>
        <h1>Facture</h1>
        <div style="font-size:10px;color:#666;margin-top:2px;">${esc(t.nom || '')}</div>
      </div>
      <div style="text-align:right;font-size:10.5px;">
        <div style="font-size:14px;font-weight:700;color:#2563eb;margin-bottom:2px;">N° ${esc(f.ref)}</div>
        <div style="color:#555;">Date : ${esc(f.date_facture || '—')}</div>
        ${f.ref_commande ? `<div style="color:#555;">Commande : ${esc(f.ref_commande)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <div>
        <div class="plbl">Émetteur</div>
        <div class="pnom">${esc(t.nom || '—')}</div>
        <div class="pinfo">
          ${t.adresse ? esc(t.adresse) + '<br>' : ''}
          ${t.tel     ? 'Tél : ' + esc(t.tel) + '<br>' : ''}
          ${t.email   ? esc(t.email) + '<br>' : ''}
          ${t.siret   ? '<strong>SIRET : ' + esc(t.siret) + '</strong><br>' : ''}
          ${t.tva     ? 'N° TVA : ' + esc(t.tva) + '<br>' : ''}
        </div>
      </div>
      <div>
        <div class="plbl">Facturé à</div>
        <div class="pnom">${esc(f.client_nom || '—')}</div>
        <div class="pinfo">
          ${f.adresse_client ? esc(f.adresse_client) + '<br>' : ''}
          ${f.siret_client ? '<strong>SIRET : ' + esc(f.siret_client) + '</strong>' : ''}
        </div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Réf</th>
        <th>Produit</th>
        <th class="r">Qté</th>
        <th class="r">PU HT</th>
        <th class="r">Total HT</th>
      </tr></thead>
      <tbody>${lignesHTML}</tbody>
    </table>
    <table class="totaux">
      <tr><td class="lbl">Total HT</td><td class="val">${fmtPrix(montantHT)}</td></tr>
      <tr><td class="lbl">TVA ${tvaRate} %</td><td class="val">${fmtPrix(tva)}</td></tr>
      <tr class="ttc"><td class="lbl" style="color:#fff;font-weight:700;">TOTAL TTC</td><td class="val">${fmtPrix(ttc)}</td></tr>
    </table>
    ${f.notes ? `<div style="margin-top:12px;padding:8px 10px;background:#eff6ff;border-left:3px solid #2563eb;font-size:10px;"><strong>Note :</strong> ${esc(f.notes)}</div>` : ''}
    ${t.iban || t.siret || t.tva || t.forme || t.cpt ? `<div class="mentions">
      ${t.cpt ? '<strong>Conditions de règlement :</strong> ' + esc(t.cpt) + (t.iban ? ' — <strong>IBAN :</strong> ' + esc(t.iban) : '') + '<br>' : (t.iban ? '<strong>IBAN :</strong> ' + esc(t.iban) + '<br>' : '')}
      ${t.siret ? '<strong>SIRET :</strong> ' + esc(t.siret) + (t.tva ? ' — ' : '') : ''}
      ${t.tva   ? '<strong>N° TVA :</strong> ' + esc(t.tva) + (t.forme ? ' — ' : '') : ''}
      ${t.forme ? '<strong>Forme juridique :</strong> ' + esc(t.forme) : ''}
    </div>` : ''}
    <div class="footer">
      <span>${esc(t.nom || 'AppMee')} — Document généré le ${new Date().toLocaleDateString('fr-FR')}</span>
      <span>Page 1/1</span>
    </div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('⚠ Pop-up bloqué — autorisez les pop-ups.', 'error');
}
