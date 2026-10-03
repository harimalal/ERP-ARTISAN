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
  if (type === 'warn') t.style.borderLeft = '4px solid #f59e0b';
  t.textContent = msg;
  document.body.appendChild(t);
  const duree = type === 'warn' ? 7000 : 3200;
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .4s';
    setTimeout(() => t.remove(), 400);
  }, duree);
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
  return num % 1 === 0 ? num.toString() : num.toFixed(6).replace(/\.?0+$/, '');
}

/* -------------------------------------------------------
   QUANTITÉ LISIBLE
   Bascule vers l'unité qui se lit le mieux : sous le kilo on
   passe en grammes, sous le litre en millilitres. L'artisan lit
   « 120,458 g » et « 0,117 g » au lieu de « 0.120458 » et
   « 0.000117 », sans jamais changer la valeur stockée.
   Renvoie valeur et unité séparément pour les tableaux qui ont
   une colonne pour chacune.
------------------------------------------------------- */
export function qteLisible(quantite, unite) {
  const q = Number(quantite);
  if (!isFinite(q)) return { valeur: '0', unite: unite || '—' };
  if (q !== 0 && Math.abs(q) < 1) {
    if (unite === 'kg') return { valeur: fmtQ(q * 1000), unite: 'g' };
    if (unite === 'L')  return { valeur: fmtQ(q * 1000), unite: 'ml' };
  }
  return { valeur: fmtQ(q), unite: unite || '—' };
}

/* -------------------------------------------------------
   SURVEILLANCE STOCK
   Plus de case « hors stock » manuelle : chaque article/produit est
   réellement surveillé, y compris à stock 0 — Stock Articles, Produits
   Finis et Production doivent voir une vraie rupture pour pouvoir la
   traiter (commander, planifier). Un stock à 0 est signalé par le badge
   « Hors stock » (stockStatus ci-dessous), pas masqué.
   Seul le Dashboard a une règle différente : un article à stock 0 n'y
   apparaît pas dans les 4 encarts d'alertes (estAlerteDashboard), pour
   ne pas noyer l'artisan sous des ruptures déjà visibles ailleurs — sans
   toucher à la surveillance réelle utilisée partout ailleurs.
   Prédicats uniques partagés par tous les points d'alerte : c'est ce qui
   garantit qu'ils ne divergeront pas avec le temps.
------------------------------------------------------- */
export function estSurveille(item) {
  return !!item;
}

export function sousSeuil(item) {
  return estSurveille(item) && Number(item.stock) <= Number(item.seuil);
}

/* Réservé aux 4 encarts d'alertes du Dashboard — jamais à Stock Articles,
   Produits Finis ou Production, qui doivent continuer à voir les vraies
   ruptures (stock 0) pour pouvoir agir dessus. */
export function estAlerteDashboard(item) {
  return sousSeuil(item) && Number(item.stock) > 0;
}

/* -------------------------------------------------------
   ALLOCATION SÉQUENTIELLE DU STOCK
   Pour un produit donné, répartit le stock disponible entre ses besoins
   (lignes de commandes clients, quelle que soit leur statut) dans l'ordre
   où les commandes ont été enregistrées — la première enregistrée est
   servie en premier, exactement comme un artisan sert ses clients dans
   l'ordre d'arrivée. Entre deux commandes enregistrées au même instant,
   celle qui ne consomme pas la totalité du stock restant passe devant.
   Sans ça, chaque commande est évaluée seule contre le stock total, et le
   même stock est compté « disponible » pour plusieurs clients à la fois.
   Fonction unique réutilisée par Commandes Clients (faisabilité par ligne)
   et Production (répartition par client, vert/rouge) — pour ne jamais les
   laisser diverger comme estSurveille()/sousSeuil() avant elles.
   `besoins` : tableau d'objets portant au moins `quantite` et une date
   d'enregistrement (`created_at` ou `date_cmd`). Renvoie les mêmes objets,
   triés par ordre d'allocation, augmentés de `couvert` (servi par le
   stock) et `aProduire` (reste à produire pour ce besoin).
------------------------------------------------------- */
function _clePriorite(besoin) {
  const v = besoin?.created_at || besoin?.date_cmd || besoin?.date_commande;
  const t = v ? new Date(v).getTime() : NaN;
  return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

export function allouerStockSequentiel(stockDisponible, besoins) {
  const tries = [...(besoins || [])].sort((a, b) => {
    const diff = _clePriorite(a) - _clePriorite(b);
    if (diff !== 0) return diff;
    /* Enregistrées au même instant : la plus petite quantité d'abord,
       pour ne pas laisser une grosse commande épuiser seule le stock. */
    return (Number(a.quantite) || 0) - (Number(b.quantite) || 0);
  });

  let stockRestant = Number(stockDisponible) || 0;
  return tries.map(besoin => {
    const quantite  = Number(besoin.quantite) || 0;
    const couvert   = Math.max(0, Math.min(quantite, stockRestant));
    const aProduire = Math.max(0, quantite - couvert);
    stockRestant    = Math.max(0, stockRestant - couvert);
    return { ...besoin, couvert, aProduire };
  });
}

/* -------------------------------------------------------
   CATÉGORIES D'ARTICLES
   La liste n'est jamais figée dans le code : elle est construite
   à partir des catégories réellement utilisées par le tenant
   connecté. Chaque client voit donc les siennes, et une liste
   codée en dur ne peut plus écraser silencieusement la catégorie
   d'un article dont la valeur n'y figurait pas.
------------------------------------------------------- */
export const CAT_NOUVELLE = '__nouvelle__';

/* Clés historiques de certains tenants : on affiche un libellé lisible,
   la valeur stockée, elle, n'est jamais modifiée. */
const CAT_LABELS_LEGACY = {
  matiere: 'Matière première', emballage: 'Emballage',
  ingredient: 'Ingrédient', fourniture: 'Fourniture', autre: 'Autre',
};

export function catLabel(categorie) {
  return CAT_LABELS_LEGACY[categorie] || categorie || '—';
}

/* Couleur stable déduite du nom de la catégorie. Permet à n'importe quel
   métier — bougies, cosmétiques, chocolats — d'avoir des catégories
   colorées et distinctes sans qu'aucune liste soit écrite dans le code.
   Même nom donne toujours la même couleur, d'un écran à l'autre et d'une
   session à l'autre. */
export function couleurCategorie(nom) {
  const s = String(nom || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return {
    bg:  `hsl(${h} 70% 50% / 0.12)`,
    txt: `hsl(${h} 65% 32%)`,
    brd: `hsl(${h} 70% 50% / 0.30)`,
  };
}

export function optionsCategories(categories, courante, opts = {}) {
  const liste = [...new Set([...(categories || []), courante].filter(c => c != null && c !== ''))]
    .sort((a, b) => catLabel(a).localeCompare(catLabel(b), 'fr'));
  /* Catégorie facultative (fournisseurs) : une entrée vide en tête, choisie
     si l'élément n'en porte aucune. */
  const vide = opts.avecVide
    ? `<option value=""${!courante ? ' selected' : ''}>—</option>`
    : '';
  return vide + liste.map(c =>
    `<option value="${esc(c)}"${c === courante ? ' selected' : ''}>${esc(catLabel(c))}</option>`).join('')
    + `<option value="${CAT_NOUVELLE}">+ Nouvelle catégorie…</option>`;
}

/* Affiche le champ texte quand « Nouvelle catégorie » est choisi. */
export function bindCategorieNouvelle(selectId, inputId) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  if (!sel || !inp) return;
  sel.addEventListener('change', () => {
    const neuf = sel.value === CAT_NOUVELLE;
    inp.style.display = neuf ? '' : 'none';
    if (neuf) inp.focus();
  });
}

/* Valeur retenue : la catégorie choisie, ou celle saisie si on en crée une. */
export function lireCategorie(selectId, inputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === CAT_NOUVELLE) return (document.getElementById(inputId)?.value || '').trim();
  return sel.value;
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

/* -------------------------------------------------------
   LISTE DÉROULANTE STATUT COMMANDE — numérotée + colorée
   Remplace le bouton « Avancer » : un seul contrôle, utilisé à la fois
   dans Commandes Clients et dans le Dashboard, pour que les deux ne
   puissent jamais afficher deux statuts différents pour la même
   commande. Mêmes couleurs que badgeCmd() — source unique partagée.
------------------------------------------------------- */
export const STATUT_CMD_STYLE = {
  a_produire:    { num: 1, label: 'À produire',    bg: '#FEF3D8', txt: '#7A5A00', brd: '#F0D9A0' },
  planifie:      { num: 2, label: 'Planifié',      bg: '#E8EFFE', txt: '#2A3A8A', brd: '#C4CAEF' },
  en_production: { num: 3, label: 'En production', bg: '#f0ecfb', txt: '#5a3e85', brd: '#c9bfef' },
  pret:          { num: 4, label: 'Prêt',          bg: '#D8EDE3', txt: '#1E4A30', brd: '#B0D4C0' },
  cloture:       { num: 5, label: 'Clôturée',      bg: '#EDE8DF', txt: '#6A5E54', brd: '#DDD6C8' },
  annule:        { num: null, label: 'Annulée',    bg: '#FCDDD8', txt: '#8A2010', brd: '#F0B4A8' },
};

export function selectStatutCmd(id, statutActuel) {
  const courant = STATUT_CMD_STYLE[statutActuel] || STATUT_CMD_STYLE.a_produire;
  const options = Object.entries(STATUT_CMD_STYLE).map(([val, s]) => {
    const texte = (s.num ? s.num + '. ' : '') + s.label;
    return `<option value="${val}"${val === statutActuel ? ' selected' : ''} style="background:${s.bg};color:${s.txt};">${esc(texte)}</option>`;
  }).join('');
  return `<select class="cmd-statut-select" data-id="${esc(id)}" style="font-size:11.5px;font-weight:700;padding:4px 8px;border-radius:20px;border:1px solid ${courant.brd};background:${courant.bg};color:${courant.txt};cursor:pointer;">${options}</select>`;
}

/* Réapplique les couleurs du statut choisi sur le <select> lui-même,
   pour un retour visuel immédiat avant tout re-render complet. */
export function restyleSelectStatutCmd(selectEl) {
  if (!selectEl) return;
  const s = STATUT_CMD_STYLE[selectEl.value] || STATUT_CMD_STYLE.a_produire;
  selectEl.style.background  = s.bg;
  selectEl.style.color       = s.txt;
  selectEl.style.borderColor = s.brd;
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
    regle:      '<span class="badge badge-ok">Payée ✓</span>',
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
  if (stock <= 0)           return '<span class="badge badge-neutral">Hors stock</span>';
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
