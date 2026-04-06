/* -------------------------------------------------------
   AppMee — modules/commandes.js
   Commandes clients : création, avancement, livraison.
   BUG CORRIGÉ : identification par UUID, jamais par index.
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getCommandes, createCommande, avancerStatutCommande,
  deleteCommande, getClients, getProduits, getArticles,
  createAchat, achatDoublonExiste, getAchats,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeCmd, showToast, today,
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

/* Cache local */
let _commandes  = [];
let _clients    = [];
let _produits   = [];
let _articles   = [];
let _cmdLineN   = 0;

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

function _renderListe() {
  const el = document.getElementById('commandesList');

  if (!_commandes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>Aucune commande.</p>
    </div>`;
    return;
  }

  el.innerHTML = [..._commandes].reverse().map(c => {
    const tot = (c.commande_lignes || []).reduce((s, l) =>
      s + (l.total_ht || (l.quantite * l.prix_unitaire) || 0), 0);

    const rows = (c.commande_lignes || []).map(l => {
      const p = _produits.find(x => x.id === l.produit_id);
      if (!p) return '';
      const ok = p.stock >= l.quantite;
      return `<tr>
        <td class="td-ref">${esc(p.ref)}</td>
        <td>${esc(p.nom)}</td>
        <td><strong>${l.quantite}</strong></td>
        <td>${p.stock}</td>
        <td>${ok
          ? '<span class="badge badge-ok">✓ OK</span>'
          : `<span class="badge badge-alert">Manque ${l.quantite - p.stock}</span>`}
        </td>
        <td>${fmt(l.prix_unitaire)} €</td>
        <td style="font-weight:600">${fmt(l.total_ht || l.quantite * l.prix_unitaire)} €</td>
      </tr>`;
    }).join('');

    return `<div class="cmd-card">
      <div class="cmd-card-hdr">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="cmd-ref">${esc(c.ref)}</span>
          <span class="cmd-client">${esc(c.client_nom)}</span>
          <span class="cmd-date">${esc(c.date_cmd)}</span>
          ${c.date_livraison ? `<span class="cmd-date">Livr. : ${esc(c.date_livraison)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          ${badgeCmd(c.statut)}
          <span style="font-weight:700;color:var(--accent)">${fmt(tot)} €</span>
          ${c.statut !== 'cloture'
            ? `<button class="btn btn-ghost btn-xs" data-id="${c.id}" data-action="avancer">↻ Avancer</button>`
            : ''}
          ${c.statut === 'pret'
            ? `<button class="btn btn-success btn-xs" data-id="${c.id}" data-action="livrer">Livrer</button>`
            : ''}
          <button class="btn btn-ghost btn-xs" data-id="${c.id}" data-action="pdf">👁</button>
          <button class="btn btn-danger btn-xs" data-id="${c.id}" data-action="supprimer">✕</button>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Réf</th><th>Produit</th><th>Qté</th>
          <th>Stock dispo</th><th>Faisable</th><th>Prix unit.</th><th>Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  /* Délégation d'événements — identification par UUID */
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'avancer') await _avancerCmd(id);
    if (action === 'livrer')  _ouvrirLivraison(id);
    if (action === 'supprimer') await _supprimerCmd(id);
    if (action === 'pdf')     _aperçuPdfCmd(id);
  };
}

/* -------------------------------------------------------
   AVANCER STATUT — UUID, pas index (bug corrigé)
------------------------------------------------------- */
async function _avancerCmd(id) {
  try {
    const updated = await avancerStatutCommande(id);
    const idx = _commandes.findIndex(c => c.id === id);
    if (idx >= 0) _commandes[idx].statut = updated.statut;
    _renderListe();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    showToast('❌ Erreur avancement commande.', 'error');
  }
}

/* -------------------------------------------------------
   SUPPRIMER — UUID
------------------------------------------------------- */
async function _supprimerCmd(id) {
  const ok = await confirmDialog('Supprimer cette commande ?');
  if (!ok) return;
  try {
    await deleteCommande(id);
    _commandes = _commandes.filter(c => c.id !== id);
    _renderListe();
    showToast('✅ Commande supprimée.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    showToast('❌ Erreur suppression.', 'error');
  }
}

/* -------------------------------------------------------
   LIVRAISON
------------------------------------------------------- */
function _ouvrirLivraison(commandeId) {
  const c = _commandes.find(x => x.id === commandeId);
  if (!c) return;
  const tot = (c.commande_lignes || []).reduce((s, l) =>
    s + (l.total_ht || l.quantite * l.prix_unitaire || 0), 0);

  document.getElementById('livCmd').textContent    = c.ref + ' — ' + c.client_nom;
  document.getElementById('livMontant').textContent = fmt(tot) + ' €';
  document.getElementById('livDate').value          = today();
  document.getElementById('livCmdId').value         = commandeId; /* UUID */
  openModal('modalLivraison');
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

  document.getElementById('btnAddCmdLigne')?.addEventListener('click', _addCmdLigne);
  document.getElementById('btnSaveCommande')?.addEventListener('click', _saveCommande);
}

export function initCommandeModal() {
  document.getElementById('cmdDate').value       = today();
  document.getElementById('cmdDateLiv').value    = '';
  document.getElementById('cmdRemarques').value  = '';
  document.getElementById('cmdLignes').innerHTML = '';
  _cmdLineN = 0;

  /* Remplir le select clients */
  const sel = document.getElementById('cmdClientSel');
  sel.innerHTML = '<option value="">— Sélectionner un client —</option>' +
    _clients.map(c => `<option value="${esc(c.nom)}">${esc(c.nom)}</option>`).join('') +
    '<option value="__nouveau__">✏ Saisir un nouveau client…</option>';

  /* Masquer le champ texte libre par défaut */
  const clientInput = document.getElementById('cmdClient');
  if (clientInput) {
    clientInput.style.display = 'none';
    clientInput.value = '';
  }

  _addCmdLigne();
}

function _addCmdLigne() {
  _cmdLineN++;
  const div = document.createElement('div');
  div.id = 'CL' + _cmdLineN;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 70px auto;gap:7px;margin-bottom:7px;align-items:start;';

  const byRef  = _produits.map(p => `<option value="${esc(p.id)}">${esc(p.ref)}</option>`).join('');
  const byName = _produits.map(p => `<option value="${esc(p.id)}">${esc(p.nom)}</option>`).join('');

  div.innerHTML = `
    <select class="crs" style="font-size:11.5px;font-weight:600;color:var(--accent);">${byRef}</select>
    <select class="cns">${byName}</select>
    <input type="number" placeholder="Qté" min="1" class="cq">
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

  /* Initialiser le hint sur le premier produit */
  if (_produits.length) {
    div.querySelector('.crs').value = _produits[0].id;
    div.querySelector('.cns').value = _produits[0].id;
    _updateCmdHint(_produits[0].id, div.querySelector('.ch'));
  }
}

function _updateCmdHint(produitId, el, qte) {
  if (!el) return;
  const p = _produits.find(x => x.id === produitId);
  if (!p) return;
  const col = !qte ? 'var(--ink-muted)' : p.stock >= qte ? 'var(--ui-green)' : 'var(--ui-red)';
  el.style.color = col;
  const hint = qte ? (p.stock >= qte ? ' ✓' : ` — manque ${qte - p.stock}`) : '';
  el.textContent = 'Stock : ' + p.stock + hint;
}

async function _saveCommande() {
  const date      = document.getElementById('cmdDate').value || today();
  const dateLiv   = document.getElementById('cmdDateLiv').value || null;
  const selVal    = document.getElementById('cmdClientSel')?.value || '';
  const clientNom = selVal === '__nouveau__'
    ? (document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu')
    : (selVal || document.getElementById('cmdClient')?.value?.trim() || 'Client inconnu');
  const notes     = document.getElementById('cmdRemarques').value;

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

  if (!lignes.length) { showToast('⚠ Ajoutez au moins une ligne.', 'error'); return; }

  const ref = nextRef('CMD', _commandes);

  try {
    /* Créer la commande avec son UUID Supabase */
    const cmd = await createCommande({
      ref,
      client_nom:     clientNom,
      date_cmd:       date,
      date_livraison: dateLiv,
      statut:         'a_produire',
      notes,
    }, lignes);

    _commandes.push({ ...cmd, commande_lignes: lignes });

    closeModal('modalCommande');
    _renderListe();
    showToast('✅ Commande ' + ref + ' enregistrée.');

    /* Analyser le stock et créer les BCs manquants */
    await _analyserStock(cmd, lignes);

    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'commandes' } }));
  } catch (err) {
    showToast('❌ Erreur création commande.', 'error');
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

    const bcRef = nextRef('BC', await getAchats());
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
   APERÇU PDF
------------------------------------------------------- */
function _aperçuPdfCmd(id) {
  const c = _commandes.find(x => x.id === id);
  if (!c) return;
  document.dispatchEvent(new CustomEvent('appmee:showPdf', {
    detail: { title: 'Commande ' + c.ref, type: 'commande', data: c },
  }));
}

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getCommandesCache()  { return _commandes; }
export function getClientsCache()    { return _clients; }

export async function refreshClients() {
  _clients = await getClients();
}
