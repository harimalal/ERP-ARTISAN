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
  updateCommandeStatut,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeFac, showToast, today,
  openModal, closeModal, nextRef,
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
        _aperçuPdfFac(btnPdf.dataset.id);
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
    await createLivraison({ commande_id: commandeId, ref: nextRef('LIV', []), date_livraison: date, statut: 'livree' });

    /* Créer la facture si inexistante — statut par défaut : 'a_lancer' */
    const dejafac = await factureExistePourCommande(commandeId);
    if (!dejafac) {
      const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
      const fac = await createFacture({
        ref:          nextRef('FAC', _factures),
        commande_id:  commandeId,
        client_nom:   c.client_nom,
        montant_ht:   tot,
        taux_tva:     20,
        statut:       'a_lancer',   /* Fix S11 — défaut À lancer */
        date_facture: date,
      });
      _factures.unshift(fac);
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
  const ref = nextRef('FAC', _factures);
  try {
    const fac = await createFacture({
      ref,
      date_facture: document.getElementById('nfDate').value || today(),
      client_nom:   clientNom,
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
   APERÇU PDF
------------------------------------------------------- */
function _aperçuPdfFac(id) {
  const f = _factures.find(x => x.id === id);
  if (!f) return;
  const c = _commandes.find(x => x.id === f.commande_id);
  document.dispatchEvent(new CustomEvent('appmee:showPdf', {
    detail: { title: 'Facture ' + f.ref, type: 'facture', data: f, commande: c },
  }));
}
