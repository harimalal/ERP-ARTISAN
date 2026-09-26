/* -------------------------------------------------------
   AppMee — modules/messagesEquipe.js
   Messages à l'équipe — mini tableau type Trello (page Admin).
   2 colonnes : En cours / C'est fait. Icônes : urgent, marquer
   fait/remettre en cours, supprimer (sans confirmation — usage
   interne bas risque, pas de donnée métier).
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getMessagesEquipe, createMessageEquipe,
  updateMessageEquipeStatut, updateMessageEquipeUrgent, deleteMessageEquipe,
} from '../db.js';
import { esc, showToast } from '../ui.js';

let _messages = [];

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  _messages = await getMessagesEquipe();
  _bindBoard();
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _messages = await getMessagesEquipe();
  _renderBoard();
}

function _bindBoard() {
  document.getElementById('btnAddMessageEquipe')?.addEventListener('click', _ajouterMessage);
  document.getElementById('msgEquipeInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') _ajouterMessage();
  });

  document.getElementById('msgEquipeBoard')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const m  = _messages.find(x => x.id === id);
    if (!m) return;

    if (btn.dataset.action === 'urgent') {
      try {
        const updated = await updateMessageEquipeUrgent(id, !m.urgent);
        m.urgent = updated.urgent;
        _renderBoard();
      } catch (err) {
        showToast('❌ Erreur mise à jour message.', 'error');
      }
    }

    if (btn.dataset.action === 'statut') {
      const nouveauStatut = m.statut === 'encours' ? 'fait' : 'encours';
      try {
        const updated = await updateMessageEquipeStatut(id, nouveauStatut);
        m.statut = updated.statut;
        _renderBoard();
      } catch (err) {
        showToast('❌ Erreur mise à jour message.', 'error');
      }
    }

    if (btn.dataset.action === 'supprimer') {
      try {
        await deleteMessageEquipe(id);
        _messages = _messages.filter(x => x.id !== id);
        _renderBoard();
      } catch (err) {
        showToast('❌ Erreur suppression message.', 'error');
      }
    }
  });
}

async function _ajouterMessage() {
  const input = document.getElementById('msgEquipeInput');
  const texte = input?.value.trim();
  if (!texte) return;
  try {
    const msg = await createMessageEquipe(texte);
    _messages.unshift(msg);
    input.value = '';
    _renderBoard();
  } catch (err) {
    console.error('[messagesEquipe] _ajouterMessage ERREUR:', err.message, err);
    showToast('❌ Erreur ajout message.', 'error');
  }
}

function _card(m) {
  return `<div class="meq-card${m.urgent ? ' urgent' : ''}">
    <div class="meq-text">${esc(m.texte)}</div>
    <div class="meq-actions">
      <button type="button" class="meq-btn" data-action="urgent" data-id="${m.id}" title="Marquer/démarquer urgent">⚡</button>
      <button type="button" class="meq-btn" data-action="statut" data-id="${m.id}" title="${m.statut === 'encours' ? 'Marquer comme fait' : 'Remettre en cours'}">${m.statut === 'encours' ? '✓' : '↺'}</button>
      <button type="button" class="meq-btn meq-btn-del" data-action="supprimer" data-id="${m.id}" title="Supprimer">✕</button>
    </div>
  </div>`;
}

function _renderBoard() {
  const colEnCours = document.getElementById('msgEquipeEnCours');
  const colFait    = document.getElementById('msgEquipeFait');
  if (!colEnCours || !colFait) return;

  const enCours = _messages.filter(m => m.statut === 'encours');
  const fait    = _messages.filter(m => m.statut === 'fait');

  const countEC = document.getElementById('msgEquipeCountEnCours');
  const countF  = document.getElementById('msgEquipeCountFait');
  if (countEC) countEC.textContent = enCours.length;
  if (countF)  countF.textContent  = fait.length;

  colEnCours.innerHTML = enCours.length ? enCours.map(_card).join('') : '<div class="meq-empty">Aucun message en cours.</div>';
  colFait.innerHTML    = fait.length    ? fait.map(_card).join('')    : '<div class="meq-empty">Rien de terminé pour l’instant.</div>';
}
