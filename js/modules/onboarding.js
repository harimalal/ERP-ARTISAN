/* -------------------------------------------------------
   AppMee — onboarding.js
   Module d'import guidé des données existantes.
   Page dédiée /import-donnees, un onglet par catégorie.

   Logique figée avec l'utilisateur :
   - une donnée manquante ne bloque JAMAIS l'import : la fiche est
     créée quand même, la case manquante est signalée en rouge
   - le rapport d'anomalies est agrégé PAR CHAMP ("Email manquant : 2"),
     jamais détaillé fiche par fiche
   - dédoublonnage silencieux uniquement sur correspondance forte
     (nom normalisé + email/tel/siret) — sinon proposé, pas décidé
   - Recettes se fait en dernier : le matching a besoin des articles
------------------------------------------------------- */

import { getSession, getTenantId } from '/js/auth.js';
import { API } from '/js/config.js';
import { showToast, esc } from '/js/ui.js';
import {
  getFournisseurs, createFournisseur,
  getClients, createClient,
  getArticles, createArticle,
} from '/js/db.js';

/* -------------------------------------------------------
   CONFIGURATION PAR CATÉGORIE
   Ajouter une catégorie = ajouter une entrée ici.
------------------------------------------------------- */
const CONFIG = {
  fournisseur: {
    titre: 'Vos fournisseurs',
    lead: "Bon de commande envoyé à vos fournisseurs, facture reçue, catalogue tarifaire — tout document où leurs coordonnées apparaissent.",
    dropLabel: 'Glissez vos documents fournisseurs ici',
    champs: [
      { cle: 'nom',       label: 'Nom',       obligatoire: true },
      { cle: 'contact',   label: 'Contact' },
      { cle: 'email',     label: 'Email' },
      { cle: 'tel',       label: 'Téléphone' },
      { cle: 'siret',     label: 'SIRET' },
      { cle: 'delai',     label: 'Délai' },
      { cle: 'categorie', label: 'Catégorie' },
    ],
    getExistants: getFournisseurs,
    creer: createFournisseur,
    labelExistant: (e) => e.nom,
  },
  client: {
    titre: 'Vos clients',
    lead: "Facture émise, bon de commande client — avec les coordonnées complètes.",
    dropLabel: 'Glissez vos documents clients ici',
    champs: [
      { cle: 'nom',     label: 'Nom', obligatoire: true },
      { cle: 'email',   label: 'Email' },
      { cle: 'tel',     label: 'Téléphone' },
      { cle: 'adresse', label: 'Adresse' },
      { cle: 'siret',   label: 'SIRET' },
      { cle: 'notes',   label: 'Notes' },
    ],
    getExistants: getClients,
    creer: createClient,
    labelExistant: (e) => e.nom,
  },
  article: {
    titre: 'Vos articles',
    lead: "Bon de commande fournisseur, bon d'achat — vos matières premières et fournitures avec leur prix d'achat.",
    dropLabel: "Glissez vos documents d'achat ici",
    champs: [
      { cle: 'ref',         label: 'Réf',      obligatoire: true },
      { cle: 'nom',         label: 'Nom',      obligatoire: true },
      { cle: 'categorie',   label: 'Catégorie' },
      { cle: 'unite',       label: 'Unité' },
      { cle: 'prix',        label: 'Prix achat', obligatoire: true },
      { cle: 'fournisseur', label: 'Fournisseur' },
    ],
    getExistants: getArticles,
    creer: createArticle,
    cleRef: 'ref',
    labelExistant: (e) => `${e.ref} — ${e.nom}`,
  },
};

const EXT_TABULAIRE = ['xlsx', 'xls', 'csv'];
const EXT_OK = ['pdf', 'png', 'jpg', 'jpeg', 'webp', ...EXT_TABULAIRE];

/* État par catégorie — jamais partagé entre onglets */
const _etat = {};
for (const cat of Object.keys(CONFIG)) {
  _etat[cat] = { fichiers: [], entites: [], existants: [], analyse: false, valide: false, enCours: false };
}

/* -------------------------------------------------------
   LECTURE DE FICHIERS (mêmes patterns que admin.js)
------------------------------------------------------- */
function _lireBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Lecture échouée : ' + file.name));
    r.readAsDataURL(file);
  });
}

function _lireOnglets(file, ext) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const wb = XLSX.read(r.result, { type: 'array', cellDates: true });
        const out = {};
        for (const nom of wb.SheetNames) {
          out[nom] = XLSX.utils.sheet_to_json(wb.Sheets[nom], { defval: '' });
        }
        resolve(out);
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error('Lecture échouée : ' + file.name));
    r.readAsArrayBuffer(file);
  });
}

function _serialiser(onglets, maxLignes = 300) {
  const noms = Object.keys(onglets);
  if (!noms.length) return '(fichier vide)';
  return noms.map(nom => {
    const rows = onglets[nom];
    const lignes = rows.slice(0, maxLignes).map(row =>
      Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ')
    );
    return `--- Onglet "${nom}" (${rows.length} ligne(s)) ---\n` + lignes.join('\n') +
      (rows.length > maxLignes ? `\n… (${rows.length - maxLignes} lignes non incluses)` : '');
  }).join('\n\n');
}

/* Catalogue envoyé à l'IA : ce qui existe déjà, pour qu'elle repère
   les correspondances au lieu de recréer des doublons. */
function _catalogueTexte(cat, existants) {
  if (!existants.length) return '';
  const label = CONFIG[cat].labelExistant;
  return `${cat}s déjà en base (${existants.length}) :\n` +
    existants.map(e => '- ' + label(e)).join('\n');
}

/* -------------------------------------------------------
   NORMALISATION & DÉDOUBLONNAGE
------------------------------------------------------- */
function _norm(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/* Correspondance forte uniquement — jamais une fusion sur un simple
   nom approchant. Référence exacte, ou nom identique confirmé par un
   champ fort (email, tel, siret). */
function _trouverExistant(cat, champs, existants) {
  const cfg = CONFIG[cat];
  if (cfg.cleRef) {
    const ref = _norm(champs[cfg.cleRef]);
    if (ref) {
      const parRef = existants.find(e => _norm(e[cfg.cleRef]) === ref);
      if (parRef) return parRef;
    }
  }
  const nom = _norm(champs.nom);
  if (!nom) return null;
  return existants.find(e => {
    if (_norm(e.nom) !== nom) return false;
    if (cfg.cleRef) return true;
    for (const fort of ['siret', 'email', 'tel']) {
      const a = _norm(champs[fort]), b = _norm(e[fort]);
      if (a && b && a === b) return true;
    }
    return false;
  }) || null;
}

/* Rapport agrégé PAR CHAMP, pas par fiche. */
function _agregerAnomalies(cat, entites) {
  const compte = {};
  for (const e of entites) {
    if (e.doublon) continue;
    for (const c of CONFIG[cat].champs) {
      if (!String(e.champs[c.cle] || '').trim()) {
        compte[c.label] = (compte[c.label] || 0) + 1;
      }
    }
  }
  return Object.entries(compte).sort((a, b) => b[1] - a[1]);
}

/* -------------------------------------------------------
   RENDU
------------------------------------------------------- */
function _panel(cat) { return document.getElementById('panel-' + cat); }

function _renderPanel(cat) {
  const cfg = CONFIG[cat];
  const st  = _etat[cat];
  const el  = _panel(cat);
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <h1 style="font-family:'Libre Baskerville',serif;font-size:22px;font-weight:700;margin:0;">${cfg.titre}</h1>
      <div id="ob-etat-${cat}"></div>
    </div>
    <p class="ob-lead" style="margin-bottom:18px;">${cfg.lead} Champs recherchés : ${cfg.champs.map(c => c.label.toLowerCase() + (c.obligatoire ? ' (obligatoire)' : '')).join(', ')}.</p>

    <div class="card" style="padding:20px;margin-bottom:18px;">
      <div class="ob-drop" id="ob-drop-${cat}">
        <div style="font-size:26px;margin-bottom:6px;">📄</div>
        <div style="font-size:12.5px;font-weight:600;">${cfg.dropLabel}</div>
        <div style="font-size:11px;color:var(--ink-muted);margin-top:2px;">PDF · Excel · CSV · Image</div>
      </div>
      <input type="file" id="ob-input-${cat}" multiple accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp" style="display:none">
      <div id="ob-fichiers-${cat}" style="margin-top:10px;font-size:11.5px;color:var(--ui-text2);"></div>
      <div style="margin-top:14px;text-align:right;">
        <button class="btn btn-primary" id="ob-extract-${cat}">Lancer l'extraction</button>
      </div>
    </div>

    <div id="ob-resultat-${cat}"></div>
  `;

  _bindDrop(cat);
  _renderFichiers(cat);
  _renderEtatOnglet(cat);
  if (st.analyse) _renderResultat(cat);
}

function _renderFichiers(cat) {
  const st = _etat[cat];
  const el = document.getElementById('ob-fichiers-' + cat);
  const btn = document.getElementById('ob-extract-' + cat);
  if (!el) return;
  el.textContent = st.fichiers.length
    ? st.fichiers.map(f => f.name).join(' · ')
    : 'Aucun document déposé pour l\'instant.';
  if (btn) {
    btn.disabled = !st.fichiers.length || st.enCours;
    btn.style.opacity = btn.disabled ? '.5' : '1';
  }
}

function _renderEtatOnglet(cat) {
  const st = _etat[cat];
  const badge = document.getElementById('ob-etat-' + cat);
  if (badge) {
    badge.innerHTML = st.valide
      ? '<span class="badge badge-ok">✓ Créé</span>'
      : st.analyse ? '<span class="badge badge-warn">En attente de validation</span>'
      : '<span class="badge badge-neutral">Non commencé</span>';
  }
  const pastille = document.querySelector(`[data-state="${cat}"]`);
  if (pastille && st.valide) {
    pastille.classList.add('done');
    pastille.textContent = '✓';
  }
}

function _renderResultat(cat) {
  const cfg = CONFIG[cat];
  const st  = _etat[cat];
  const el  = document.getElementById('ob-resultat-' + cat);
  if (!el) return;

  const aCreer        = st.entites.filter(e => !e.doublon);
  const doublonsBase  = st.entites.filter(e => e.doublonType === 'base');
  const doublonsLot   = st.entites.filter(e => e.doublonType === 'lot');
  const totalDoublons = doublonsBase.length + doublonsLot.length;
  const anomalies = _agregerAnomalies(cat, st.entites);
  const totalManquants = anomalies.reduce((s, [, n]) => s + n, 0);

  const ligneAnomalies = anomalies.length
    ? anomalies.map(([label, n]) => `${esc(label)} manquant : <strong>${n}</strong>`).join(' · ')
    : 'Aucun champ manquant.';

  const detailDoublons = totalDoublons
    ? [
        doublonsBase.length ? `<strong>${doublonsBase.length}</strong> déjà dans votre espace` : null,
        doublonsLot.length  ? `<strong>${doublonsLot.length}</strong> en double dans vos documents` : null,
      ].filter(Boolean).join(' · ') + ' — écarté(s) automatiquement, rien ne sera créé en double.'
    : '';

  el.innerHTML = `
    <div class="card" style="padding:20px;">
      <div class="ob-tiles">
        <div class="ob-tile"><div class="ob-tile-num">${st.entites.length}</div><div class="ob-tile-lbl">détecté(s) au total</div></div>
        <div class="ob-tile"><div class="ob-tile-num">${aCreer.length}</div><div class="ob-tile-lbl">à créer</div></div>
        <div class="ob-tile ${totalDoublons ? 'warn' : ''}"><div class="ob-tile-num">${totalDoublons}</div><div class="ob-tile-lbl">doublon(s) écarté(s)</div></div>
        <div class="ob-tile ${totalManquants ? 'warn' : ''}"><div class="ob-tile-num">${totalManquants}</div><div class="ob-tile-lbl">champs à compléter</div></div>
      </div>

      ${totalDoublons ? `<div class="alert-box alert-info" style="margin-bottom:12px;"><span>ℹ</span><span>${detailDoublons}</span></div>` : ''}

      <div class="alert-box ${totalManquants ? 'alert-warn' : 'alert-info'}" style="margin-bottom:16px;">
        <span>${totalManquants ? '⚠' : 'ℹ'}</span>
        <span>${ligneAnomalies}${totalManquants ? " — n'empêche pas la création, les cases en rouge ci-dessous restent modifiables après." : ''}</span>
      </div>

      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ui-text3);margin-bottom:8px;">Liste des données extraites</div>
      <div class="card" style="margin-bottom:18px;box-shadow:none;">
        <table>
          <thead><tr>${cfg.champs.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Statut</th><th></th></tr></thead>
          <tbody id="ob-tbody-${cat}">
            ${st.entites.map((e, i) => _ligne(cat, e, i)).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:14px;align-items:center;">
        <span style="font-size:11px;color:var(--ink-muted);">Modification possible après création</span>
        <button class="btn btn-primary" id="ob-valider-${cat}" ${st.valide ? 'disabled style="opacity:.5;"' : ''}>
          ${st.valide ? '✓ Créé' : `✓ OK pour créer (${aCreer.length})`}
        </button>
      </div>
    </div>
  `;

  document.getElementById('ob-valider-' + cat)?.addEventListener('click', () => _valider(cat));
  el.querySelectorAll('[data-suppr]').forEach(b => {
    b.addEventListener('click', () => {
      _etat[cat].entites.splice(Number(b.dataset.suppr), 1);
      _renderResultat(cat);
    });
  });
  el.querySelectorAll('[data-edit]').forEach(inp => {
    inp.addEventListener('change', () => {
      const [i, cle] = inp.dataset.edit.split('|');
      _etat[cat].entites[Number(i)].champs[cle] = inp.value.trim();
      _renderResultat(cat);
    });
  });
}

function _ligne(cat, e, i) {
  const cfg = CONFIG[cat];
  const cells = cfg.champs.map(c => {
    const v = String(e.champs[c.cle] || '').trim();
    const cls = v ? '' : 'ob-missing';
    return `<td class="${cls}"><input data-edit="${i}|${c.cle}" value="${esc(v)}"
      placeholder="${v ? '' : 'manquant'}"
      style="width:100%;min-width:70px;border:none;background:transparent;font-size:12px;font-family:inherit;color:inherit;"></td>`;
  }).join('');
  const statut = e.doublonType === 'base' ? '<span class="badge badge-neutral">Déjà dans votre espace</span>'
    : e.doublonType === 'lot' ? '<span class="badge badge-warn">En double dans vos documents</span>'
    : '<span class="badge badge-ok">À créer</span>';
  return `<tr>${cells}<td>${statut}</td><td><button class="btn-icon" data-suppr="${i}" title="Retirer">✕</button></td></tr>`;
}

/* -------------------------------------------------------
   EXTRACTION
------------------------------------------------------- */
async function _extraire(cat) {
  const st = _etat[cat];
  if (st.enCours || !st.fichiers.length) return;

  st.enCours = true;
  const btn = document.getElementById('ob-extract-' + cat);
  if (btn) { btn.disabled = true; btn.textContent = 'Extraction en cours…'; }

  try {
    /* Règle 11 — on recharge l'existant à chaque extraction plutôt que
       de dépendre d'un cache rempli par un autre écran. */
    st.existants = await CONFIG[cat].getExistants();
    const catalogue = _catalogueTexte(cat, st.existants);
    const session = await getSession();

    const trouvees = [];
    for (const file of st.fichiers) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!EXT_OK.includes(ext)) {
        showToast(`⚠ ${file.name} : format non supporté, ignoré.`, 'warn');
        continue;
      }
      const payload = { extension: ext, tenantId: getTenantId(), token: session?.access_token || '', catalogue, categorie: cat };
      if (EXT_TABULAIRE.includes(ext)) payload.texte = _serialiser(await _lireOnglets(file, ext));
      else payload.fichier = await _lireBase64(file);

      const resp = await fetch(API.aiExtractDoc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || `Erreur serveur ${resp.status}`);
      for (const ent of (data.entites || [])) {
        if (ent.type === cat) trouvees.push(ent);
      }
      (data.avertissements || []).forEach(a => console.warn('[onboarding]', file.name, a));
    }

    /* Dédoublonnage : contre la base, puis à l'intérieur du lot.
       Les deux cas sont comptés séparément — "déjà chez vous" et
       "en double dans vos documents" ne veulent pas dire la même
       chose pour l'artisan qui relit le bilan. */
    const vues = [];
    st.entites = trouvees.map(ent => {
      const existant = _trouverExistant(cat, ent.champs, st.existants);
      const dansLot  = existant ? null : _trouverExistant(cat, ent.champs, vues);
      if (!existant && !dansLot) vues.push(ent.champs);
      return {
        champs: ent.champs,
        confiance: ent.confiance,
        doublon: Boolean(existant || dansLot),
        doublonType: existant ? 'base' : (dansLot ? 'lot' : null),
      };
    });

    st.analyse = true;
    _renderResultat(cat);
    _renderEtatOnglet(cat);
    showToast(`✅ ${st.entites.filter(e => !e.doublon).length} ${cat}(s) détecté(s).`, 'success');

  } catch (err) {
    console.error('[onboarding] extraction ERREUR:', err.message, err.stack);
    showToast('⚠ Extraction échouée : ' + err.message, 'error');
  } finally {
    st.enCours = false;
    const b = document.getElementById('ob-extract-' + cat);
    if (b) { b.disabled = false; b.textContent = 'Relancer l\'extraction'; b.style.opacity = '1'; }
  }
}

/* -------------------------------------------------------
   VALIDATION — écriture en base
------------------------------------------------------- */
async function _valider(cat) {
  const st = _etat[cat];
  const aCreer = st.entites.filter(e => !e.doublon);
  if (!aCreer.length) { showToast('Rien à créer.', 'warn'); return; }

  const btn = document.getElementById('ob-valider-' + cat);
  if (btn) { btn.disabled = true; btn.textContent = 'Création en cours…'; }

  let ok = 0;
  const erreurs = [];
  for (const e of aCreer) {
    try {
      await CONFIG[cat].creer(_payload(cat, e.champs));
      ok++;
    } catch (err) {
      erreurs.push(`${e.champs.nom || e.champs.ref || '?'} : ${err.message}`);
    }
  }

  st.valide = erreurs.length === 0;
  _renderEtatOnglet(cat);
  _renderResultat(cat);

  if (erreurs.length) {
    erreurs.forEach(x => console.warn('[onboarding] création', x));
    showToast(`⚠ ${ok} créé(s), ${erreurs.length} en erreur. Voir console.`, 'warn');
  } else {
    showToast(`✅ ${ok} ${cat}(s) créé(s).`, 'success');
  }
}

/* Les champs vides partent quand même : une donnée manquante ne bloque
   pas la création, elle sera complétée plus tard depuis l'app. */
function _payload(cat, champs) {
  const out = {};
  for (const c of CONFIG[cat].champs) {
    const v = String(champs[c.cle] || '').trim();
    if (c.cle === 'prix')  { out.prix = parseFloat(v.replace(',', '.')) || 0; continue; }
    if (c.cle === 'seuil') { out.seuil = parseInt(v, 10) || 0; continue; }
    out[c.cle] = v;
  }
  if (cat === 'article') { out.stock = 0; out.seuil = out.seuil || 0; }
  return out;
}

/* -------------------------------------------------------
   DÉPÔT DE FICHIERS
------------------------------------------------------- */
function _bindDrop(cat) {
  const zone  = document.getElementById('ob-drop-' + cat);
  const input = document.getElementById('ob-input-' + cat);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => _ajouter(cat, e.target.files));
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    _ajouter(cat, e.dataTransfer.files);
  });

  document.getElementById('ob-extract-' + cat)?.addEventListener('click', () => _extraire(cat));
}

function _ajouter(cat, fileList) {
  const nouveaux = Array.from(fileList || []).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!EXT_OK.includes(ext)) { showToast(`⚠ ${f.name} ignoré (format non supporté).`, 'warn'); return false; }
    if (f.size > 15 * 1024 * 1024) { showToast(`⚠ ${f.name} ignoré (plus de 15 Mo).`, 'warn'); return false; }
    return true;
  });
  if (!nouveaux.length) return;
  _etat[cat].fichiers.push(...nouveaux);
  _renderFichiers(cat);
}

/* -------------------------------------------------------
   ONGLETS
------------------------------------------------------- */
function _activer(nom) {
  document.querySelectorAll('.ob-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === nom));
  document.querySelectorAll('.ob-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + nom));
  window.scrollTo(0, 0);
}

function _renderRecette() {
  const el = _panel('recette');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <h1 style="font-family:'Libre Baskerville',serif;font-size:22px;font-weight:700;margin:0;">Vos recettes</h1>
      <span class="badge badge-warn">À faire en dernier</span>
    </div>
    <p class="ob-lead" style="margin-bottom:18px;">Fiche technique, fichier de composition (Excel ou PDF) — produit, ingrédients, quantités ou pourcentages.</p>
    <div class="alert-box alert-warn" style="max-width:820px;">
      <span>⚠</span>
      <span>Cette étape se lance une fois <strong>Fournisseurs, Clients et Articles validés</strong> : le rapprochement des ingrédients a besoin que vos articles existent déjà en base, sinon rien ne peut être relié correctement.</span>
    </div>
  `;
}

export function init() {
  for (const cat of Object.keys(CONFIG)) _renderPanel(cat);
  _renderRecette();

  document.getElementById('obTabs')?.addEventListener('click', (e) => {
    const t = e.target.closest('.ob-tab');
    if (t) _activer(t.dataset.tab);
  });
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.addEventListener('click', () => _activer(b.dataset.goto));
  });
}
