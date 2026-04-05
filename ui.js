/* -------------------------------------------------------
   AppMee — ui.js
   Utilitaires UI partagés par TOUS les modules.
   - Navigation entre pages
   - Modals (open/close)
   - Toast notifications
   - Formatage (fmt, fmtQ, esc, today)
   - Tri et filtrage des tables
   - Génération de références (nextRef)
   - Badges statuts
   Dépend de : rien (aucun import AppMee)
------------------------------------------------------- */

/* -------------------------------------------------------
   NAVIGATION
------------------------------------------------------- */
export function showPage(name, tabEl) {
  /* Désactiver toutes les pages et onglets */
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  /* Activer la page cible */
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  /* Activer l'onglet */
  if (tabEl) tabEl.classList.add('active');

  /* Déclencher le rendu du module correspondant */
  const event = new CustomEvent('appmee:pagechange', { detail: { page: name } });
  document.dispatchEvent(event);
}

/* -------------------------------------------------------
   MODALS
------------------------------------------------------- */
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    /* Focus trap : focus sur le premier élément interactif */
    setTimeout(() => {
      const focusable = el.querySelector('input, select, textarea, button');
      if (focusable) focusable.focus();
    }, 50);
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* Fermer les modals au clic sur l'overlay */
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* Fermer les modals avec Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

/* -------------------------------------------------------
   TOAST
------------------------------------------------------- */
export function showToast(msg, type = 'default') {
  const t = document.createElement('div');
  t.className = 'toast';
  if (type === 'error') t.style.background = 'var(--ui-red)';
  if (type === 'success') t.style.borderLeft = '4px solid var(--ui-green)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .4s';
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

/* -------------------------------------------------------
   FORMATAGE
------------------------------------------------------- */

/* Échappe le HTML pour prévenir le XSS */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Formate un montant en euros */
export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0,00';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Formate une quantité (supprime les zéros inutiles) */
export function fmtQ(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  const num = Number(n);
  return num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, '');
}

/* Date du jour au format YYYY-MM-DD */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/* Valide un nombre positif */
export function isPositiveNumber(val) {
  const n = parseFloat(val);
  return !isNaN(n) && n > 0;
}

/* Valide qu'une chaîne n'est pas vide */
export function isNonEmpty(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/* -------------------------------------------------------
   GÉNÉRATION DE RÉFÉRENCES
   nextRef('CMD', rows) → 'CMD0012'
   nextRef('A', rows)   → 'A0028'
   Utilise la propriété 'ref' par défaut, ou 'id' si précisé.
------------------------------------------------------- */
export function nextRef(prefix, rows, field = 'ref') {
  if (!rows || !rows.length) return prefix + '0001';
  const nums = rows
    .map(r => {
      const val = r[field] || '';
      const match = val.toString().replace(prefix, '');
      const n = parseInt(match, 10);
      return isNaN(n) ? 0 : n;
    })
    .filter(n => n > 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return prefix + String(max + 1).padStart(4, '0');
}

/* -------------------------------------------------------
   BADGES STATUTS
------------------------------------------------------- */
export function badgeCmd(statut) {
  const map = {
    a_produire:    '<span class="badge badge-warn">À produire</span>',
    planifie:      '<span class="badge badge-blue">Planifié</span>',
    en_production: '<span class="badge badge-purple">En production</span>',
    pret:          '<span class="badge badge-ok">Prêt ✓</span>',
    cloture:       '<span class="badge badge-neutral">Clôturée</span>',
    annule:        '<span class="badge badge-alert">Annulée</span>',
  };
  return map[statut] || `<span class="badge badge-neutral">${esc(statut)}</span>`;
}

export function badgePlan(statut) {
  const map = {
    planifie:  '<span class="badge badge-blue">Planifié</span>',
    a_venir:   '<span class="badge badge-blue">À venir</span>',
    en_cours:  '<span class="badge badge-warn">En cours</span>',
    en_stock:  '<span class="badge badge-ok">En stock</span>',
    clos:      '<span class="badge badge-ok">Clos ✓</span>',
    annule:    '<span class="badge badge-alert">Annulé</span>',
  };
  return map[statut] || `<span class="badge badge-neutral">${esc(statut)}</span>`;
}

export function badgeFac(statut) {
  const map = {
    a_lancer:   '<span class="badge badge-neutral">À lancer</span>',
    facture:    '<span class="badge badge-blue">Facturée</span>',
    a_relancer: '<span class="badge badge-warn">À relancer</span>',
    paye:       '<span class="badge badge-ok">Payée ✓</span>',
  };
  return map[statut] || `<span class="badge badge-neutral">${esc(statut)}</span>`;
}

export function badgeAchat(statut) {
  const map = {
    brouillon: '<span class="badge badge-neutral">Brouillon</span>',
    envoye:    '<span class="badge badge-blue">Envoyé</span>',
    en_cours:  '<span class="badge badge-warn">En cours</span>',
    recu:      '<span class="badge badge-ok">Reçu ✓</span>',
    annule:    '<span class="badge badge-alert">Annulé</span>',
  };
  return map[statut] || `<span class="badge badge-neutral">${esc(statut)}</span>`;
}

export function stockStatus(stock, seuil) {
  if (stock <= 0)           return '<span class="badge badge-alert">Rupture</span>';
  if (stock <= seuil)       return '<span class="badge badge-warn">Bas</span>';
  if (stock <= seuil * 1.5) return '<span class="badge badge-warn">Faible</span>';
  return '<span class="badge badge-ok">OK</span>';
}

/* -------------------------------------------------------
   TRI ET FILTRAGE DES TABLES
------------------------------------------------------- */
let _sortState = {};

export function sortTable(tableId, col) {
  const tbl   = document.getElementById(tableId);
  if (!tbl) return;
  const tbody = tbl.querySelector('tbody');
  const key   = tableId + '_' + col;
  const asc   = _sortState[key] !== true;
  _sortState[key] = asc;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const av = a.cells[col]?.textContent.trim() || '';
    const bv = b.cells[col]?.textContent.trim() || '';
    const an = parseFloat(av.replace(',', '.'));
    const bn = parseFloat(bv.replace(',', '.'));
    if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
    return asc ? av.localeCompare(bv, 'fr') : bv.localeCompare(av, 'fr');
  });

  rows.forEach(r => tbody.appendChild(r));

  tbl.querySelectorAll('th').forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (i === col) th.classList.add(asc ? 'sort-asc' : 'sort-desc');
  });
}

export function filterTable(tableId, query) {
  const q = query.toLowerCase();
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* -------------------------------------------------------
   MISE À JOUR DU HEADER DATE
------------------------------------------------------- */
export function renderHeaderDate() {
  const el = document.getElementById('headerDate');
  if (el) {
    el.textContent = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}

/* -------------------------------------------------------
   CONFIRMATION STYLISÉE (remplace confirm() natif)
   Usage : if (await confirmDialog('Supprimer ?')) { ... }
------------------------------------------------------- */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    /* Pour l'instant, utilise le confirm natif.
       À remplacer par une modal custom dans une prochaine itération. */
    resolve(window.confirm(message));
  });
}
