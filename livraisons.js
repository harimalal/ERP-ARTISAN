/* -------------------------------------------------------
   AppMee — modules/livraisons.js
   Livraisons et factures : liste, confirmation,
   changement statut, aperçu PDF.
   BUG CORRIGÉ : identification par UUID, écouteur
   calcNFTtc ajouté une seule fois (pas de duplication).
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getFactures, createFacture, updateFactureStatut,
  createLivraison, factureExistePourCommande,
  getCommandes, getClients, getProduits,
  updateProduitStock, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeFac, showToast, today,
  openModal, closeModal, nextRef,
} from '../ui.js';

/* Cache local */
let _factures  = [];
let _commandes = [];
let _clients   = [];
let _produits  = [];

/* BUG CORRIGÉ : écouteur calcNFTtc ajouté une seule fois */
let _nfListenersBound = false;

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_factures, _commandes, _clients, _produits] = await Promise.all([
    getFactures(), getCommandes(), getClients(), getProduits(),
  ]);
  _bindLivraisonForm();
  _bindNewFactureForm();

  /* Écouter l'événement de confirmation livraison depuis commandes.js */
  document.getElementById('btnSaveLivraison')?.addEventListener('click', _saveLivraison);
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _factures  = await getFactures();
  _commandes = await getCommandes();
  _renderTable();
}

function _renderTable() {
  document.getElementById('facturesTbody').innerHTML = _factures.map(f => `
    <tr class="clickable" data-id="${f.id}" data-action="pdf">
      <td class="td-ref">${esc(f.ref)}</td>
      <td>${esc(f.date_facture)}</td>
      <td class="td-ref">${esc(f.ref_commande || '—')}</td>
      <td class="td-bold">${esc(f.client_nom)}</td>
      <td style="font-weight:700">${fmt(f.montant_ht)} €</td>
      <td onclick="event.stopPropagation()">
        ${badgeFac(f.statut || 'facture')}
        <select style="font-size:10.5px;padding:2px 6px;border:1px solid var(--ui-brd);border-radius:5px;margin-left:5px;"
          data-id="${f.id}" data-action="changer-statut">
          <option value="">Changer…</option>
          <option value="a_lancer">À lancer</option>
          <option value="facture">Facturée</option>
          <option value="a_relancer">À relancer</option>
          <option value="paye">Payée ✓</option>
        </select>
      </td>
      <td onclick="event.stopPropagation()">
        <button class="btn-icon" data-id="${f.id}" data-action="pdf" title="Aperçu PDF">👁</button>
      </td>
    </tr>`).join('') ||
    '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucune facture.</td></tr>';

  const tbody = document.getElementById('facturesTbody');

  tbody.onclick = (e) => {
    const btn = e.target.closest('[data-action="pdf"]');
    if (btn) _aperçuPdfFac(btn.dataset.id);
  };

  tbody.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-action="changer-statut"]');
    if (sel && sel.value) await _changerStatutFac(sel.dataset.id, sel.value);
  });
}

/* -------------------------------------------------------
   CONFIRMATION LIVRAISON
   livCmdId contient l'UUID de la commande (bug corrigé)
------------------------------------------------------- */
function _bindLivraisonForm() {
  /* L'écouteur est dans init() pour éviter les doublons */
}

async function _saveLivraison() {
  const commandeId = document.getElementById('livCmdId').value; /* UUID */
  const date       = document.getElementById('livDate').value || today();

  if (!commandeId) { showToast('⚠ Commande introuvable.', 'error'); return; }

  const c = _commandes.find(x => x.id === commandeId);
  if (!c) { showToast('⚠ Commande introuvable.', 'error'); return; }

  try {
    /* Décrémenter le stock produits finis */
    for (const l of (c.commande_lignes || [])) {
      const p = _produits.find(x => x.id === l.produit_id);
      if (!p) continue;
      const newStock = Math.max(0, p.stock - l.quantite);
      await updateProduitStock(p.id, newStock);
      await addMouvement({
        type:    'sortie_pf',
        ref:     p.ref,
        nom:     p.nom,
        qte:     l.quantite,
        motif:   'Livraison ' + c.ref,
        ref_doc: c.ref,
      });
      p.stock = newStock;
    }

    /* Créer la livraison */
    const livRef = nextRef('LIV', []);
    await createLivraison({
      commande_id:    commandeId,
      ref:            livRef,
      date_livraison: date,
      statut:         'livree',
    });

    /* Créer la facture si elle n'existe pas encore */
    const dejafac = await factureExistePourCommande(commandeId);
    if (!dejafac) {
      const tot = (c.commande_lignes || []).reduce((s, l) =>
        s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);
      const facRef = nextRef('FAC', _factures);
      const fac = await createFacture({
        ref:          facRef,
        commande_id:  commandeId,
        client_nom:   c.client_nom,
        montant_ht:   tot,
        taux_tva:     20,
        statut:       'facture',
        date_facture: date,
      });
      _factures.unshift(fac);
    }

    closeModal('modalLivraison');
    _renderTable();
    showToast('✅ ' + c.ref + ' livrée — facture créée.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'livraisons' } }));
  } catch (err) {
    console.error(err);
    showToast('❌ Erreur confirmation livraison.', 'error');
  }
}

/* -------------------------------------------------------
   NOUVELLE FACTURE MANUELLE
   BUG CORRIGÉ : écouteur calcNFTtc ajouté une seule fois
------------------------------------------------------- */
function _bindNewFactureForm() {
  if (_nfListenersBound) return;
  _nfListenersBound = true;

  document.getElementById('nfMontant')?.addEventListener('input', _calcNFTtc);
  document.getElementById('nfTva')?.addEventListener('input', _calcNFTtc);
  document.getElementById('btnSaveNewFacture')?.addEventListener('click', _saveNewFacture);
}

export function initNewFactureModal() {
  document.getElementById('nfDate').value        = today();
  document.getElementById('nfMontant').value     = '';
  document.getElementById('nfNotes').value       = '';
  document.getElementById('nfDescription').value = '';
  document.getElementById('nfTtcPreview').textContent = '—';

  const clientSel = document.getElementById('nfClient');
  clientSel.innerHTML = _clients.map(c =>
    `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('');

  const cmdSel = document.getElementById('nfRefCmd');
  cmdSel.innerHTML = '<option value="">— Aucune —</option>' +
    _commandes.map(c =>
      `<option value="${esc(c.ref)}">${esc(c.ref)} — ${esc(c.client_nom)}</option>`).join('');
}

function _calcNFTtc() {
  const ht  = parseFloat(document.getElementById('nfMontant').value) || 0;
  const tva = parseFloat(document.getElementById('nfTva').value) || 0;
  document.getElementById('nfTtcPreview').textContent = fmt(ht * (1 + tva / 100)) + ' €';
}

async function _saveNewFacture() {
  const clientNom = document.getElementById('nfClient').value;
  const montant   = parseFloat(document.getElementById('nfMontant').value) || 0;
  if (!clientNom || !montant) {
    showToast('⚠ Client et montant requis.', 'error');
    return;
  }

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
   CHANGEMENT STATUT FACTURE
------------------------------------------------------- */
async function _changerStatutFac(id, statut) {
  try {
    await updateFactureStatut(id, statut);
    const fac = _factures.find(x => x.id === id);
    if (fac) fac.statut = statut;
    _renderTable();
  } catch (err) {
    showToast('❌ Erreur changement statut facture.', 'error');
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
