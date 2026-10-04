/* -------------------------------------------------------
   AppMee — modules/commandes.js
   Commandes clients : création, avancement, livraison.
   BUG CORRIGÉ : identification par UUID, jamais par index.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getCommandes, createCommande, updateCommande, updateCommandeStatut,
  replaceCommandeLignes, deleteCommande, getClients, getProduits, getArticles,
  createAchat, achatDoublonExiste,
  upsertClient, nextRefServeur, updateCommandePrioritaire,
  deleteOFsForCommande, updateOFsStatutPourCommande,
  ajusterStockProduit, addMouvement, createLivraison,
  getTenant, createFacture, createFactureLignes, factureExistePourCommande,
} from '../db.js';
import {
  fmt, fmtQ, esc, showToast, today,
  openModal, closeModal, confirmDialog,
  selectStatutCmd, allouerStockSequentiel,
} from '../ui.js';

/* Cache local */
let _commandes  = [];
let _clients    = [];
let _produits   = [];
let _articles   = [];
let _cmdLineN   = 0;
let _editId     = null;

/* Une commande n'entre plus en compétition pour le stock une fois sa
   production faite (passage à Prêt — voir cloturerOFsPourCommande) :
   seules « à produire » et « en production » comptent encore. */
const STATUTS_AVANT_PRODUCTION = ['a_produire', 'en_production'];

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_commandes, _clients, _produits, _articles] = await Promise.all([
    getCommandes(), getClients(), getProduits(), getArticles(),
  ]);
  _bindCommande();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _commandes = await getCommandes();
  _renderListe();
}

/* -------------------------------------------------------
   FAISABILITÉ — allocation séquentielle du stock
   Un même produit peut être demandé par plusieurs commandes à la fois :
   le stock dispo n'est pas évalué commande par commande contre le stock
   total, mais réparti dans l'ordre d'enregistrement (allouerStockSequentiel,
   ui.js — même fonction que Production, pour ne jamais diverger).
   Clôturée/annulée = besoin déjà soldé, exclu de la compétition pour le
   stock restant.
------------------------------------------------------- */
function _allocationsParProduit() {
  const besoinsParProduit = {};
  _commandes.forEach(c => {
    if (!STATUTS_AVANT_PRODUCTION.includes(c.statut)) return;
    (c.commande_lignes || []).forEach(l => {
      if (!l.produit_id) return;
      (besoinsParProduit[l.produit_id] ||= []).push({
        id: l.id || (c.id + '_' + l.produit_id),
        commandeId: c.id,
        quantite: l.quantite,
        created_at: c.created_at || c.date_cmd,
      });
    });
  });

  const map = {};
  Object.entries(besoinsParProduit).forEach(([produitId, besoins]) => {
    const p = _produits.find(x => x.id === produitId);
    map[produitId] = allouerStockSequentiel(p ? p.stock : 0, besoins);
  });
  return map;
}

/* Carte d'une commande — identique pour la liste active et l'historique
   (même gabarit que achats.js : un seul template, deux conteneurs selon
   le statut). `allocations` peut être {} pour une commande déjà en
   facturation, qui ne concourt plus pour le stock (_allocationsParProduit
   l'exclut déjà), la colonne Faisable retombe alors sur la comparaison
   simple. Le bandeau passe en gris pour une commande archivée dans
   l'historique, pour bien la distinguer des commandes en cours. */
function _carteCommande(c, allocations) {
  const tot = (c.commande_lignes || []).reduce((s, l) =>
    s + (l.total_ht || (l.quantite * l.prix_unitaire) || 0), 0);

  const estArchivee = c.statut === 'en_facturation';

  const rows = (c.commande_lignes || []).map(l => {
    const p = _produits.find(x => x.id === l.produit_id);
    if (!p) return '';
    const alloc = (allocations[p.id] || []).find(b => b.commandeId === c.id && (!l.id || b.id === l.id));
    const aProduire = alloc ? alloc.aProduire : Math.max(0, l.quantite - (p.stock || 0));
    const ok = aProduire <= 0;
    return `<tr>
      <td class="td-ref">${esc(p.ref)}</td>
      <td>${esc(p.nom)}</td>
      <td><strong>${l.quantite}</strong></td>
      <td>${p.stock}</td>
      <td>${ok
        ? '<span class="badge badge-ok">✓ OK</span>'
        : `<span class="badge badge-alert">Manque ${fmtQ(aProduire)}</span>`}
      </td>
      <td>${fmt(l.prix_unitaire)} €</td>
      <td style="font-weight:600">${fmt(l.total_ht || l.quantite * l.prix_unitaire)} €</td>
    </tr>`;
  }).join('');

  const noteFacturation = estArchivee
    ? `<div style="padding:7px 12px;font-size:11.5px;color:var(--ink-muted);border-top:1px solid var(--ui-brd);">ℹ La commande est passée en facturation.</div>`
    : '';

  return `<div class="cmd-card">
    <div class="cmd-card-hdr"${estArchivee
      ? ' style="background:#EDEDEA;border-bottom-color:#D8D8D3;"'
      : (c.prioritaire ? ' style="background:var(--hdr-alert-bg);border-bottom-color:var(--hdr-alert-brd);"' : '')}>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="cmd-ref">${esc(c.ref)}</span>
        <span class="cmd-client">${esc(c.client_nom)}</span>
        <span class="cmd-date">${esc(c.date_cmd)}</span>
        ${c.date_livraison ? `<span class="cmd-date">Livr. : ${esc(c.date_livraison)}</span>` : ''}
        ${c.prioritaire ? `<span style="font-weight:700;font-size:11.5px;color:var(--hdr-alert-txt);">⚠ Commande prioritaire</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
        ${selectStatutCmd(c.id, c.statut)}
        <span style="font-weight:700;color:var(--accent)">${fmt(tot)} €</span>
        <button class="btn btn-ghost btn-xs" data-id="${c.id}" data-action="toggle-prioritaire">${c.prioritaire ? 'Retirer prioritaire' : 'Marquer prioritaire'}</button>
        <button class="btn btn-outline btn-xs" data-id="${c.id}" data-action="modifier">Modifier</button>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Réf</th><th>Produit</th><th>Qté</th>
        <th>Stock dispo</th><th>Faisable</th><th>Prix unit.</th><th>Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${noteFacturation}
  </div>`;
}

/* Une commande en facturation sort de la liste active et ne vit plus que
   dans l'historique replié en bas de page (même principe que
   Achats/Production : protéger le flux "commandes à gérer" d'un
   encombrement par des commandes qui n'ont plus d'action à faire). */
function _renderListe() {
  const elActives  = document.getElementById('commandesList');
  const elHisto     = document.getElementById('commandesHistoriqueList');
  const countHisto  = document.getElementById('commandesHistoriqueCount');

  const actives    = _commandes.filter(c => c.statut !== 'en_facturation');
  const historique = _commandes.filter(c => c.statut === 'en_facturation');

  if (!actives.length) {
    elActives.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>Aucune commande en cours.</p>
    </div>`;
  } else {
    const allocations = _allocationsParProduit();
    elActives.innerHTML = [...actives].reverse().map(c => _carteCommande(c, allocations)).join('');
  }

  if (elHisto) {
    elHisto.innerHTML = historique.length
      ? [...historique].reverse().map(c => _carteCommande(c, {})).join('')
      : `<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune commande clôturée.</p></div>`;
  }
  if (countHisto) countHisto.textContent = historique.length;

  /* Délégation d'événements — identification par UUID. Même handler
     pour les deux listes (Règle 7 — onX écrasé, pas addEventListener
     accumulé). */
  const onClick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'modifier') { initCommandeModal(id); openModal('modalCommande'); }
    if (action === 'toggle-prioritaire') await _toggleCmdPrioritaire(id);
  };
  const onChange = async (e) => {
    const sel = e.target.closest('.cmd-statut-select');
    if (!sel) return;
    await changerStatutCommande(sel.dataset.id, sel.value);
  };

  elActives.onclick  = onClick;
  elActives.onchange = onChange;
  if (elHisto) {
    elHisto.onclick  = onClick;
    elHisto.onchange = onChange;
  }
}

/* -------------------------------------------------------
   COMMANDE PRIORITAIRE
------------------------------------------------------- */
async function _toggleCmdPrioritaire(id) {
  const c = _commandes.find(x => x.id === id);
  if (!c) return;
  try {
    const updated = await updateCommandePrioritaire(id, !c.prioritaire);
    c.prioritaire = updated.prioritaire;
    _renderListe();
  } catch (err) {
    showToast('❌ Erreur mise à jour commande.', 'error');
  }
}

/* -------------------------------------------------------
   CHANGER STATUT — UUID, pas index
   Exportée : réutilisée telle quelle par dashboard.js (le menu déroulant
   statut du Dashboard appelle cette même fonction) pour que le Dashboard,
   Commandes Clients et Production ne puissent jamais afficher un statut
   différent pour la même commande.
------------------------------------------------------- */
export async function changerStatutCommande(id, nouveauStatut) {
  try {
    const updated = await updateCommandeStatut(id, nouveauStatut);
    const idx = _commandes.findIndex(c => c.id === id);
    if (idx >= 0) _commandes[idx].statut = updated.statut;
    const commandeAvecLignes = idx >= 0 ? _commandes[idx] : updated;
    _renderListe();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));

    /* Chaque changement de statut déclenche son propre effet métier —
       jamais le même geste à deux endroits différents (Règle 9). */
    if (nouveauStatut === 'pret') {
      /* Décrément articles, incrément stock PF, génération des lots —
         une ligne de commande à la fois (production.js, écoute app.html). */
      document.dispatchEvent(new CustomEvent('appmee:commandePrete', { detail: { commande: commandeAvecLignes } }));
    } else if (nouveauStatut === 'expedie') {
      await _expedierCommande(commandeAvecLignes);
    } else if (nouveauStatut === 'en_facturation') {
      await _facturerCommande(commandeAvecLignes);
    } else if (nouveauStatut === 'annule') {
      try { await updateOFsStatutPourCommande(id, 'annule'); } catch (_) {}
    }
    return updated;
  } catch (err) {
    showToast('❌ Erreur changement de statut.', 'error');
    throw err;
  }
}

/* -------------------------------------------------------
   EXPÉDITION — sortie physique du stock de produits finis.
   Pas de facture créée ici : elle n'est générée qu'au passage
   suivant, « En facturation » (_facturerCommande).
------------------------------------------------------- */
async function _expedierCommande(c) {
  try {
    for (const l of (c.commande_lignes || [])) {
      const p = _produits.find(x => x.id === l.produit_id);
      if (!p) continue;
      p.stock = await ajusterStockProduit(p.id, -l.quantite);
      await addMouvement({ type: 'sortie_pf', ref: p.ref, nom: p.nom, qte: l.quantite, motif: 'Expédition ' + c.ref, ref_doc: c.ref });
    }
    await createLivraison({ commande_id: c.id, ref: await nextRefServeur('LIV'), date_livraison: today(), statut: 'livree' });
    showToast('✅ ' + c.ref + ' expédiée — stock mis à jour.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    console.error('[commandes] _expedierCommande ERREUR:', err.message, err);
    showToast('❌ Erreur expédition.', 'error');
  }
}

/* -------------------------------------------------------
   FACTURATION — même logique de calcul TVA/lignes figées qu'avant
   (ex-bouton Livrer), déclenchée maintenant par le statut « En
   facturation ». La commande part dans l'historique au prochain
   rendu (_renderListe filtre sur ce statut).
------------------------------------------------------- */
async function _facturerCommande(c) {
  try {
    const dejafac = await factureExistePourCommande(c.id);
    if (dejafac) { showToast('ℹ Facture déjà existante pour ' + c.ref + '.'); return; }

    const tot = (c.commande_lignes || []).reduce((s, l) => s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);

    let tauxFacture = 20;
    try {
      const tenant = await getTenant();
      if (tenant && tenant.taux_tva != null) tauxFacture = Number(tenant.taux_tva);
    } catch (_) {}

    const lignesFigees = (c.commande_lignes || []).map(l => {
      const p = _produits.find(x => x.id === l.produit_id);
      const tauxLigne = (p && p.taux_tva != null) ? Number(p.taux_tva) : tauxFacture;
      return {
        produit_id: l.produit_id, produit_nom: l.produit_nom, quantite: l.quantite,
        prix_unitaire: l.prix_unitaire, taux_tva: tauxLigne,
        total_ht: l.total_ht || (l.quantite * l.prix_unitaire),
      };
    });
    /* Taux effectif pondéré — montant_ttc est une colonne générée en base
       à partir d'un seul taux_tva (aligné livraisons.js/production.js). */
    const totalTvaLignes = lignesFigees.reduce((s, l) => s + l.total_ht * l.taux_tva / 100, 0);
    if (tot > 0) tauxFacture = totalTvaLignes / tot * 100;

    const client = c.client_id
      ? _clients.find(x => x.id === c.client_id)
      : _clients.find(x => x.nom === c.client_nom);

    const facRef = await nextRefServeur('FAC');
    const fac = await createFacture({
      ref: facRef, commande_id: c.id,
      client_id: client ? client.id : (c.client_id || null),
      client_nom: c.client_nom,
      siret_client: client?.siret || '', adresse_client: client?.adresse || '',
      montant_ht: tot, taux_tva: tauxFacture, statut: 'a_lancer',
    });
    await createFactureLignes(fac.id, lignesFigees);
    showToast('✅ ' + c.ref + ' passée en facturation.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'livraisons' } }));
  } catch (err) {
    console.error('[commandes] _facturerCommande ERREUR:', err.message, err);
    showToast('❌ Erreur facturation.', 'error');
  }
}

/* -------------------------------------------------------
   SUPPRIMER — UUID. Les OF implicites de la commande doivent être
   nettoyés avant la commande elle-même (sinon la FK commande_ligne_id
   bloque la cascade sur commande_lignes).
------------------------------------------------------- */
async function _supprimerCmd(id) {
  const ok = await confirmDialog('Supprimer définitivement cette commande ?');
  if (!ok) return;
  try {
    try { await deleteOFsForCommande(id); } catch (_) {}
    await deleteCommande(id);
    _commandes = _commandes.filter(c => c.id !== id);
    closeModal('modalCommande');
    _renderListe();
    showToast('✅ Commande supprimée.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    showToast(err.suppressionBloquee ? '⚠ ' + err.message : '❌ Erreur suppression.', err.suppressionBloquee ? 'warn' : 'error');
  }
}

/* -------------------------------------------------------
   FORMULAIRE NOUVELLE COMMANDE
------------------------------------------------------- */
function _bindCommande() {
  /* Sync select client → on garde juste le select, pas de champ texte libre */
  document.getElementById('cmdClientSel')?.addEventListener('change', (e) => {
    const clientInput = document.getElementById('cmdClient');
    if (!clientInput) return;
    if (e.target.value === '__nouveau__') {
      clientInput.style.display = '';
      clientInput.value = '';
      clientInput.focus();
    } else {
      clientInput.style.display = 'none';
      clientInput.value = '';
    }
  });

  document.getElementById('btnAddCmdLigne')?.addEventListener('click', () => _addCmdLigne());
  document.getElementById('btnSaveCommande')?.addEventListener('click', _handleSave);
  document.getElementById('btnDeleteCommande')?.addEventListener('click', async () => {
    if (_editId) await _supprimerCmd(_editId);
  });
}

/* editId absent = création (comportement d'origine) ; fourni = édition,
   le formulaire est pré-rempli depuis le cache et le bouton Supprimer
   apparaît dans le modal (il n'est plus sur la carte — Règle de
   modification demandée : suppression déplacée dans le modal). */
export function initCommandeModal(editId = null) {
  _editId = editId;
  const c = editId ? _commandes.find(x => x.id === editId) : null;

  const titre = document.getElementById('cmdModalTitle');
  if (titre) titre.textContent = c ? 'Modifier ' + c.ref : 'Nouvelle commande client';

  document.getElementById('cmdDate').value       = c ? (c.date_cmd || today()) : today();
  document.getElementById('cmdDateLiv').value    = c ? (c.date_livraison || '') : '';
  document.getElementById('cmdRemarques').value  = c ? (c.notes || '') : '';
  document.getElementById('cmdLignes').innerHTML = '';
  const cmdPrio = document.getElementById('cmdPrioritaire');
  if (cmdPrio) cmdPrio.checked = c ? !!c.prioritaire : false;
  _cmdLineN = 0;

  /* Remplir le select clients */
  const sel = document.getElementById('cmdClientSel');
  sel.innerHTML = '<option value="">— Sélectionner un client —</option>' +
    _clients.map(x => `<option value="${esc(x.nom)}">${esc(x.nom)}</option>`).join('') +
    '<option value="__nouveau__">✏ Saisir un nouveau client…</option>';
  if (c && c.client_nom && !_clients.some(x => x.nom === c.client_nom)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${esc(c.client_nom)}">${esc(c.client_nom)}</option>`);
  }
  sel.value = c ? (c.client_nom || '') : '';

  /* Masquer le champ texte libre par défaut */
  const clientInput = document.getElementById('cmdClient');
  if (clientInput) {
    clientInput.style.display = 'none';
    clientInput.value = '';
  }

  const btnDelete = document.getElementById('btnDeleteCommande');
  if (btnDelete) btnDelete.style.display = c ? '' : 'none';

  if (c && Array.isArray(c.commande_lignes) && c.commande_lignes.length) {
    c.commande_lignes.forEach(l => _addCmdLigne(l));
  } else {
    _addCmdLigne();
  }
}

function _addCmdLigne(ligneExistante = null) {
  _cmdLineN++;
  const div = document.createElement('div');
  div.id = 'CL' + _cmdLineN;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 70px auto;gap:7px;margin-bottom:7px;align-items:start;';

  const byRef  = _produits.map(p => `<option value="${esc(p.id)}">${esc(p.ref)}</option>`).join('');
  const byName = _produits.map(p => `<option value="${esc(p.id)}">${esc(p.nom)}</option>`).join('');

  div.innerHTML = `
    <select class="crs" style="font-size:11.5px;font-weight:600;color:var(--accent);">${byRef}</select>
    <select class="cns">${byName}</select>
    <input type="number" placeholder="Qté" min="1" class="cq" value="${ligneExistante ? esc(String(ligneExistante.quantite)) : ''}">
    <button style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;" type="button">×</button>
    <div></div>
    <div class="ch" style="font-size:10.5px;color:var(--ink-muted);grid-column:2/3;margin-top:-4px;"></div>`;

  div.querySelector('.crs').addEventListener('change', (e) => {
    div.querySelector('.cns').value = e.target.value;
    _updateCmdHint(e.target.value, div.querySelector('.ch'));
  });
  div.querySelector('.cns').addEventListener('change', (e) => {
    div.querySelector('.crs').value = e.target.value;
    _updateCmdHint(e.target.value, div.querySelector('.ch'));
  });
  div.querySelector('.cq').addEventListener('input', (e) => {
    const prodId = div.querySelector('.crs').value;
    _updateCmdHint(prodId, div.querySelector('.ch'), parseInt(e.target.value));
  });
  div.querySelector('button').addEventListener('click', () => div.remove());

  document.getElementById('cmdLignes').appendChild(div);

  /* Initialiser le hint sur le produit de la ligne existante, sinon le premier */
  const produitInitial = ligneExistante?.produit_id || (_produits.length ? _produits[0].id : null);
  if (produitInitial) {
    div.querySelector('.crs').value = produitInitial;
    div.querySelector('.cns').value = produitInitial;
    _updateCmdHint(produitInitial, div.querySelector('.ch'), ligneExistante ? ligneExistante.quantite : undefined);
  }
}

/* Stock réel moins ce que les commandes en cours ont déjà réservé sur ce
   produit (même allocation séquentielle que partout ailleurs) — jamais le
   stock brut : une nouvelle commande ne doit pas voir « disponible » des
   unités déjà promises à des commandes enregistrées avant elle. */
function _stockDisponibleNet(produitId) {
  const p = _produits.find(x => x.id === produitId);
  if (!p) return 0;
  const besoins = [];
  _commandes.forEach(c => {
    if (!STATUTS_AVANT_PRODUCTION.includes(c.statut)) return;
    (c.commande_lignes || []).forEach(l => {
      if (l.produit_id !== produitId) return;
      besoins.push({ id: l.id || (c.id + '_' + produitId), commandeId: c.id, quantite: l.quantite, created_at: c.created_at || c.date_cmd });
    });
  });
  const alloc = allouerStockSequentiel(p.stock, besoins);
  const consomme = alloc.reduce((s, b) => s + b.couvert, 0);
  return Math.max(0, (p.stock || 0) - consomme);
}

function _updateCmdHint(produitId, el, qte) {
  if (!el) return;
  const p = _produits.find(x => x.id === produitId);
  if (!p) return;
  const disponible = _stockDisponibleNet(produitId);
  const col = !qte ? 'var(--ink-muted)' : disponible >= qte ? 'var(--ui-green)' : 'var(--ui-red)';
  el.style.color = col;
  const hint = qte ? (disponible >= qte ? ' ✓' : ` — manque ${fmtQ(qte - disponible)}`) : '';
  const note = disponible < p.stock ? ` (stock total ${fmtQ(p.stock)}, déjà réservé par d'autres commandes)` : '';
  el.textContent = 'Disponible : ' + fmtQ(disponible) + hint + note;
}

/* Route vers _saveNew() ou _saveEdit() selon _editId (convention du
   projet — voir CLAUDE.md, séparation create/edit). */
async function _handleSave() {
  if (_editId) await _saveEdit();
  else await _saveNew();
}

function _lireLignesFormulaire() {
  const lignes = [];
  document.querySelectorAll('#cmdLignes > div[id]').forEach(div => {
    const produitId = div.querySelector('.crs')?.value;
    const qte       = parseInt(div.querySelector('.cq')?.value);
    if (produitId && qte > 0) {
      const p = _produits.find(x => x.id === produitId);
      if (p) lignes.push({
        produit_id:    p.id,
        produit_nom:   p.nom,
        quantite:      qte,
        prix_unitaire: p.prix_vente || p.prix || 0,
      });
    }
  });
  return lignes;
}

async function _saveNew() {
  /* Fix B10 — protection double-clic : désactiver le bouton pendant l'appel */
  const btnSave = document.getElementById('btnSaveCommande');
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Enregistrement…'; }
  const date      = document.getElementById('cmdDate').value || today();
  const dateLiv   = document.getElementById('cmdDateLiv').value || null;
  const selVal    = document.getElementById('cmdClientSel')?.value || '';
  const clientNom = selVal === '__nouveau__'
    ? (document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu')
    : (selVal || document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu');
  const notes     = document.getElementById('cmdRemarques').value;
  const prioritaire = document.getElementById('cmdPrioritaire')?.checked || false;

  const lignes = _lireLignesFormulaire();

  if (!lignes.length) {
    showToast('⚠ Ajoutez au moins une ligne.', 'error');
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
    return;
  }

  const ref = await nextRefServeur('CMD');

  try {
    /* Résoudre le client en client_id (lien réel, pas juste le nom) */
    let clientId = null;
    if (clientNom && clientNom !== 'Client inconnu') {
      const client = await upsertClient(clientNom);
      clientId = client ? client.id : null;
    }

    /* Statut de départ "à produire" — chaque ligne devient
       immédiatement un OF implicite (creerOFsPourCommande, écouté
       depuis app.html), sans date : elle se choisit ensuite depuis
       Ordres de fabrication. */
    const cmd = await createCommande({
      ref,
      client_id:     clientId,
      client_nom:    clientNom,
      date_cmd:      date,
      date_livraison: dateLiv,
      statut:        'a_produire',
      notes,
      prioritaire,
    }, lignes);

    _commandes.push(cmd);

    closeModal('modalCommande');
    _renderListe();
    showToast('✅ Commande ' + ref + ' enregistrée.');

    /* Analyser le stock et créer les BCs manquants */
    await _analyserStock(cmd, lignes);

    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
    document.dispatchEvent(new CustomEvent('appmee:commandeCreee', { detail: { commande: cmd } }));
  } catch (err) {
    showToast('❌ Erreur création commande.', 'error');
  } finally {
    /* Fix B10 — réactiver le bouton dans tous les cas (succès ou erreur) */
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
  }
}

/* Remplace systématiquement toutes les lignes (plutôt qu'un diff ligne
   à ligne) : plus simple et plus sûr, les OF implicites des anciennes
   lignes sont supprimés puis recréés pour les nouvelles — jamais de
   désynchronisation entre une ligne modifiée et son OF. */
async function _saveEdit() {
  const btnSave = document.getElementById('btnSaveCommande');
  if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Enregistrement…'; }

  const c = _commandes.find(x => x.id === _editId);
  if (!c) {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
    _editId = null;
    return;
  }

  const date      = document.getElementById('cmdDate').value || today();
  const dateLiv   = document.getElementById('cmdDateLiv').value || null;
  const selVal    = document.getElementById('cmdClientSel')?.value || '';
  const clientNom = selVal === '__nouveau__'
    ? (document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu')
    : (selVal || document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu');
  const notes       = document.getElementById('cmdRemarques').value;
  const prioritaire = document.getElementById('cmdPrioritaire')?.checked || false;

  const lignes = _lireLignesFormulaire();

  if (!lignes.length) {
    showToast('⚠ Ajoutez au moins une ligne.', 'error');
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
    return;
  }

  try {
    let clientId = c.client_id || null;
    if (clientNom && clientNom !== 'Client inconnu') {
      const client = await upsertClient(clientNom);
      clientId = client ? client.id : null;
    }

    await updateCommande(c.id, {
      client_id: clientId, client_nom: clientNom,
      date_cmd: date, date_livraison: dateLiv,
      notes, prioritaire,
    });

    try { await deleteOFsForCommande(c.id); } catch (_) {}
    const nouvellesLignes = await replaceCommandeLignes(c.id, lignes);

    const commandeAvecLignes = {
      ...c, client_id: clientId, client_nom: clientNom,
      date_cmd: date, date_livraison: dateLiv, notes, prioritaire,
      commande_lignes: nouvellesLignes,
    };
    const idx = _commandes.findIndex(x => x.id === c.id);
    if (idx >= 0) _commandes[idx] = commandeAvecLignes;

    closeModal('modalCommande');
    _renderListe();
    showToast('✅ Commande ' + c.ref + ' modifiée.');

    await _analyserStock(commandeAvecLignes, lignes);

    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
    document.dispatchEvent(new CustomEvent('appmee:commandeCreee', { detail: { commande: commandeAvecLignes } }));
  } catch (err) {
    showToast('❌ Erreur modification commande.', 'error');
  } finally {
    if (btnSave) { btnSave.disabled = false; btnSave.textContent = '💾 Enregistrer'; }
    _editId = null;
  }
}

/* -------------------------------------------------------
   ANALYSE STOCK — crée BCs automatiques si manques
   BUG CORRIGÉ : vérification doublons avant création
------------------------------------------------------- */
async function _analyserStock(cmd, lignes) {
  const besoins = {};
  lignes.forEach(l => {
    const p = _produits.find(x => x.id === l.produit_id);
    if (!p || !p.recette) return;
    Object.entries(p.recette).forEach(([aref, qp]) => {
      besoins[aref] = (besoins[aref] || 0) + qp * l.quantite;
    });
  });

  let nb = 0;
  for (const [aref, besoin] of Object.entries(besoins)) {
    const a = _articles.find(x => x.ref === aref);
    if (!a) continue;
    const manque = besoin - a.stock;
    if (manque <= 0) continue;

    /* BUG CORRIGÉ : vérification doublon avant création */
    const doublon = await achatDoublonExiste(aref, cmd.ref);
    if (doublon) continue;

    const bcRef = await nextRefServeur('BC');
    await createAchat({
      ref:         bcRef,
      article_id:  a.id,
      article_nom: a.nom,
      quantite:    Math.ceil(manque),
      prix_unitaire: a.prix,
      fournisseur: a.fournisseur || '',
      statut:      'brouillon',
      ref_commande: cmd.ref,
      notes:       'Auto-généré',
    });
    nb++;
  }

  if (nb > 0) showToast(`⚠ ${nb} BC brouillon(s) créés automatiquement.`);
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getCommandesCache()  { return _commandes; }
export function getClientsCache()    { return _clients; }

export async function refreshClients() {
  _clients = await getClients();
}
