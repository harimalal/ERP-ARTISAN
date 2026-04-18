/* -------------------------------------------------------
   AppMee — modules/achats.js
   Bons de commande fournisseurs : liste, création,
   détail/édition, réception (mise à jour stock).
   Fix BC — suppression champs ref_article et unite
   inexistants dans la table Supabase achats.
   Fix S10 — Suppression physique BC via deleteAchat
   Fix R17 — Délégation document capture (Règle 17)
   Fix S12 — Groupement BC par fournisseur :
             ajout dans BC brouillon existant si même fournisseur,
             nouveau BC si statut envoye/recu/annule ou aucun BC existant
   Dépend de : db.js, ui.js
------------------------------------------------------- */

import {
  getAchats, createAchat, updateAchat, deleteAchat,
  getArticles, getFournisseurs, getTenant,
  updateArticleStock, addMouvement,
} from '../db.js';
import {
  fmt, fmtQ, esc, badgeAchat, showToast, today,
  openModal, closeModal, nextRef, confirmDialog,
} from '../ui.js';

let _achats       = [];
let _articles     = [];
let _fournisseurs = [];
let _tenant       = {};
let _currentBCRef = null;
let _bcLignes     = [];

/* Guard Règle 17 — listener posé une seule fois dans init() */
let _delegationBound = false;

/* -------------------------------------------------------
   HELPERS — groupement par ref BC
------------------------------------------------------- */
function _refRacine(ref) {
  if (!ref) return ref;
  const m = ref.match(/^(BC\d+)/i);
  return m ? m[1] : ref;
}

function _grouperAchats(achats) {
  const map = new Map();
  for (const a of achats) {
    const racine = _refRacine(a.ref);
    if (!map.has(racine)) {
      map.set(racine, {
        ref: racine, date: a.date_cmd, fournisseur: a.fournisseur,
        refCommande: a.ref_commande, statut: a.statut || 'brouillon',
        notes: a.notes, lignes: [], totalHT: 0, ids: [],
      });
    }
    const g = map.get(racine);
    g.lignes.push(a);
    g.totalHT += (a.montant_ht || (a.quantite * (a.prix_unitaire || 0)) || 0);
    g.ids.push(a.id);
  }
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */
export async function init() {
  [_achats, _articles, _fournisseurs, _tenant] = await Promise.all([
    getAchats(), getArticles(), getFournisseurs(), getTenant(),
  ]);
  _bindAchatForm();
  _bindDetailBCForm();

  /* Règle 17 — délégation sur document, posée une seule fois */
  if (!_delegationBound) {
    _delegationBound = true;

    document.addEventListener('click', async (e) => {
      const tbody = document.getElementById('achatsTbody');
      if (!tbody) return;

      const delBtn = e.target.closest('#achatsTbody [data-action="supprimer"]');
      if (delBtn) {
        e.stopPropagation();
        await _supprimerBC(delBtn.dataset.ref);
        return;
      }

      const tr = e.target.closest('#achatsTbody tr[data-ref]');
      if (tr && !e.target.closest('[data-action]')) {
        _openDetailBC(tr.dataset.ref);
      }
    }, true);

    document.addEventListener('change', async (e) => {
      const sel = e.target.closest('#achatsTbody [data-action="changer-statut"]');
      if (sel && sel.value) await _changerStatutGroupe(sel.dataset.ref, sel.value);
    }, true);
  }
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */
export async function render() {
  _achats = await getAchats();
  _renderTable();
}

/* -------------------------------------------------------
   TABLEAU — affichage groupé
   Fix R17 : plus de tbody.onclick ici — délégation dans init()
------------------------------------------------------- */
function _renderTable() {
  const groupes = _grouperAchats(_achats);
  const tbody = document.getElementById('achatsTbody');
  if (!tbody) return;

  tbody.innerHTML = groupes.map(g => {
    const articlesLabel = g.lignes.length === 1
      ? esc(g.lignes[0].article_nom || g.lignes[0].ref)
      : `${g.lignes.length} articles — ${g.lignes.map(l => esc(l.article_nom || '')).join(', ')}`;
    const qteTotale = g.lignes.length === 1
      ? `${fmtQ(g.lignes[0].quantite)}`
      : `${g.lignes.length} lignes`;

    return `
    <tr class="clickable" data-ref="${esc(g.ref)}">
      <td class="td-ref">${esc(g.ref)}</td>
      <td>${esc(g.date || '—')}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600" title="${articlesLabel}">${articlesLabel}</td>
      <td>${qteTotale}</td>
      <td style="font-weight:600">${fmt(g.totalHT)} €</td>
      <td style="font-size:11px">${esc(g.fournisseur || '—')}</td>
      <td style="font-size:11px;color:var(--ink-muted)">${esc(g.refCommande || '—')}</td>
      <td onclick="event.stopPropagation()">
        ${badgeAchat(g.statut)}
        <select style="font-size:10.5px;padding:2px 6px;border:1px solid var(--ui-brd);border-radius:5px;margin-left:5px;"
             data-ref="${esc(g.ref)}" data-action="changer-statut">
           <option value="">Changer…</option>
           <option value="brouillon">Brouillon</option>
           <option value="envoye">Envoyé</option>
           <option value="recu">Reçu ✓</option>
           <option value="annule">Annulé</option>
         </select>
      </td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-danger btn-xs" data-ref="${esc(g.ref)}" data-action="supprimer" title="Supprimer">✕</button>
      </td>
    </tr>`;
  }).join('') ||
    '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--ink-muted)">Aucun bon de commande.</td></tr>';
}

/* -------------------------------------------------------
   SUPPRESSION BC — Fix S10 : suppression physique
------------------------------------------------------- */
async function _supprimerBC(refGroupe) {
  const ok = await confirmDialog('Supprimer définitivement le BC ' + refGroupe + ' ?');
  if (!ok) return;
  const groupes = _grouperAchats(_achats);
  const g = groupes.find(x => x.ref === refGroupe);
  if (!g) return;
  try {
    for (const l of g.lignes) {
      await deleteAchat(l.id);
    }
    _achats = _achats.filter(a => !g.ids.includes(a.id));
    _renderTable();
    showToast('✅ BC ' + refGroupe + ' supprimé.');
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur suppression BC.', 'error');
    console.error('[achats] _supprimerBC ERREUR:', err.message, err);
  }
}

/* -------------------------------------------------------
   FORMULAIRE NOUVEAU BC
------------------------------------------------------- */
export function initAchatModal(preselectArticleRef = null) {
  document.getElementById('achatDate').value     = today();
  document.getElementById('achatRemarque').value = '';
  document.getElementById('achatRefCmd').value   = '';
  document.getElementById('achatMontant').style.display = 'none';

  const fSel = document.getElementById('achatFournisseur');
  fSel.innerHTML = '<option value="">— Tous fournisseurs —</option>' +
    _fournisseurs.map(f => `<option value="${esc(f.nom)}">${esc(f.nom)}</option>`).join('');

  _renderBlocEmetteur();
  _bcLignes = [];
  _renderBCLignes();
  _addBCLigne(preselectArticleRef);

  if (preselectArticleRef) {
    const art = _articles.find(a => a.ref === preselectArticleRef);
    if (art && art.fournisseur) {
      fSel.value = art.fournisseur;
      _renderBlocFournisseur(art.fournisseur);
    }
  }
}

function _renderBlocEmetteur() {
  let bloc = document.getElementById('bcBlocEmetteur');
  if (!bloc) {
    bloc = document.createElement('div');
    bloc.id = 'bcBlocEmetteur';
    bloc.style.cssText = 'margin:0 16px 10px;padding:9px 12px;background:var(--ui-bg2);border-radius:7px;font-size:11.5px;display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    const container = document.getElementById('bcLignesContainer');
    if (container) container.parentElement.insertBefore(bloc, container);
  }
  const t = _tenant || {};
  bloc.innerHTML = `
    <div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Émetteur</div>
      <div style="font-weight:700;">${esc(t.nom || '(raison sociale non configurée)')}</div>
      ${t.adresse ? '<div style="color:var(--ink-muted);">' + esc(t.adresse) + '</div>' : ''}
      ${t.tel    ? '<div>Tél : ' + esc(t.tel)   + '</div>' : ''}
      ${t.email  ? '<div>'     + esc(t.email) + '</div>' : ''}
      ${t.siret  ? '<div style="font-size:10px;color:var(--ink-muted);">SIRET : ' + esc(t.siret) + '</div>' : ''}
    </div>
    <div id="bcBlocFournisseurInfo">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Fournisseur</div>
      <div style="color:var(--ink-muted);font-size:11px;">— Sélectionner un fournisseur —</div>
    </div>`;
}

function _renderBlocFournisseur(nomFournisseur) {
  const el = document.getElementById('bcBlocFournisseurInfo');
  if (!el) return;
  const f = _fournisseurs.find(x => x.nom === nomFournisseur);
  if (!f) {
    el.innerHTML = `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Fournisseur</div>
      <div style="font-weight:700;">${esc(nomFournisseur)}</div>`;
    return;
  }
  el.innerHTML = `
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Fournisseur</div>
    <div style="font-weight:700;">${esc(f.nom)}</div>
    ${f.contact ? '<div>' + esc(f.contact) + '</div>'                               : ''}
    ${f.adresse ? '<div style="color:var(--ink-muted);">' + esc(f.adresse) + '</div>' : ''}
    ${f.tel     ? '<div>Tél : ' + esc(f.tel)   + '</div>'                            : ''}
    ${f.email   ? '<div>' + esc(f.email) + '</div>'                                   : ''}
    ${f.delai   ? '<div style="font-size:10px;color:var(--ink-muted);">Délai : ' + esc(f.delai) + '</div>' : ''}`;
}

function _bindAchatForm() {
  document.getElementById('achatFournisseur')?.addEventListener('change', (e) => {
    _renderBCLignes();
    _renderBCTotal();
    _renderBlocFournisseur(e.target.value);
  });
  document.getElementById('btnAddBCLigne')?.addEventListener('click', () => _addBCLigne());
  document.getElementById('btnSaveAchat')?.addEventListener('click', _saveAchat);
  document.getElementById('btnAperçuBC')?.addEventListener('click', _aperçuBCFormulaire);
}

function _renderBCLignes() {
  const container = document.getElementById('bcLignesContainer');
  if (!container) return;
  container.innerHTML = '';
  _bcLignes.forEach((ligne, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 90px 90px auto;gap:7px;margin-bottom:7px;align-items:center;';
    const fournisseur = document.getElementById('achatFournisseur')?.value || '';
    const list = fournisseur ? _articles.filter(a => a.fournisseur === fournisseur) : _articles;
    const opts = list.map(a => `<option value="${esc(a.id)}" ${a.id === ligne.articleId ? 'selected' : ''}>` +
      `${esc(a.ref)} — ${esc(a.nom)}</option>`).join('');
    div.innerHTML = `
      <select class="bc-art" data-idx="${i}">${opts}</select>
      <input type="number" class="bc-qte" data-idx="${i}" value="${ligne.qte || ''}" placeholder="Qté" min="0.001" step="0.001">
      <input type="number" class="bc-px"  data-idx="${i}" value="${ligne.prix || ''}" placeholder="Prix HT" step="0.001">
      <button class="bc-del" data-idx="${i}" style="background:none;border:none;color:var(--ui-red);font-size:18px;cursor:pointer;">×</button>`;
    div.querySelector('.bc-art').addEventListener('change', (e) => {
      const a = _articles.find(x => x.id === e.target.value);
      _bcLignes[i].articleId = e.target.value;
      _bcLignes[i].nom       = a ? a.nom   : '';
      _bcLignes[i].unite     = a ? a.unite : '';
      if (a) { _bcLignes[i].prix = a.prix; div.querySelector('.bc-px').value = a.prix; }
      if (a && a.fournisseur) {
        const fSel = document.getElementById('achatFournisseur');
        if (fSel && !fSel.value) { fSel.value = a.fournisseur; _renderBlocFournisseur(a.fournisseur); }
      }
      _renderBCTotal();
    });
    div.querySelector('.bc-qte').addEventListener('input', (e) => {
      _bcLignes[i].qte = parseFloat(e.target.value) || 0; _renderBCTotal();
    });
    div.querySelector('.bc-px').addEventListener('input', (e) => {
      _bcLignes[i].prix = parseFloat(e.target.value) || 0; _renderBCTotal();
    });
    div.querySelector('.bc-del').addEventListener('click', () => {
      _bcLignes.splice(i, 1); _renderBCLignes(); _renderBCTotal();
    });
    container.appendChild(div);
  });
}

function _addBCLigne(preselectRef = null) {
  const fournisseur = document.getElementById('achatFournisseur')?.value || '';
  const list = fournisseur ? _articles.filter(a => a.fournisseur === fournisseur) : _articles;
  const defArt = preselectRef
    ? _articles.find(a => a.ref === preselectRef)
    : (list[0] || null);
  _bcLignes.push({
    articleId: defArt ? defArt.id    : (list[0]?.id || ''),
    nom:       defArt ? defArt.nom   : '',
    unite:     defArt ? defArt.unite : '',
    qte:       0,
    prix:      defArt ? defArt.prix  : 0,
  });
  _renderBCLignes();
  _renderBCTotal();
  if (defArt && defArt.fournisseur) {
    const fSel = document.getElementById('achatFournisseur');
    if (fSel && !fSel.value) { fSel.value = defArt.fournisseur; _renderBlocFournisseur(defArt.fournisseur); }
  }
}

function _renderBCTotal() {
  const total = _bcLignes.reduce((s, l) => s + (l.qte * l.prix), 0);
  const el    = document.getElementById('achatMontant');
  const valEl = document.getElementById('achatMontantVal');
  if (el && valEl) {
    el.style.display = total > 0 ? 'block' : 'none';
    valEl.textContent = fmt(total) + ' €';
  }
}

/* -------------------------------------------------------
   SAVE NOUVEAU BC — Fix S12
   Groupement par fournisseur :
   - Si BC brouillon existant pour ce fournisseur → on y ajoute les lignes
     (statut brouillon UNIQUEMENT — jamais envoye / recu / annule)
   - Si plusieurs brouillons → prendre le plus récent (date_cmd desc)
   - Si aucun BC brouillon → nouveau BC avec nextRef
   Reload cache UNE SEULE FOIS avant la boucle (Règle 11)
   nextRef appelé UNE FOIS par groupe fournisseur (Règle 21)
------------------------------------------------------- */
async function _saveAchat() {
  const lignesValides = _bcLignes.filter(l => l.articleId && l.qte > 0);
  if (!lignesValides.length) {
    showToast('⚠ Ajoutez au moins une ligne avec article et quantité.', 'error');
    return;
  }
  const fournisseurGlobal = document.getElementById('achatFournisseur')?.value || '';
  const refCommande = document.getElementById('achatRefCmd')?.value            || '';
  const notes       = document.getElementById('achatRemarque')?.value          || '';
  const date        = document.getElementById('achatDate')?.value               || today();

  const btn = document.getElementById('btnSaveAchat');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    /* Règle 11 — recharger les caches UNE FOIS avant toute la boucle */
    try { [_achats, _articles] = await Promise.all([getAchats(), getArticles()]); } catch (_) {}

    /* Grouper les lignes par fournisseur */
    const parFournisseur = new Map();
    for (const ligne of lignesValides) {
      const a     = _articles.find(x => x.id === ligne.articleId);
      const fourn = fournisseurGlobal || (a ? (a.fournisseur || '') : '');
      if (!parFournisseur.has(fourn)) parFournisseur.set(fourn, []);
      parFournisseur.get(fourn).push({ ligne, a });
    }

    const toasts = [];

    for (const [fourn, items] of parFournisseur) {
      /* Chercher UN BC brouillon existant pour ce fournisseur
         Statut brouillon UNIQUEMENT — jamais envoye / recu / annule
         On cherche dans les GROUPES reconstruits (pas les lignes brutes)
         pour avoir le statut réel du BC complet, pas d'une ligne isolée
         Si plusieurs brouillons → prendre le plus récent */
      const groupes = _grouperAchats(_achats);
      const bcExistant = groupes
        .filter(g => g.fournisseur === fourn && g.statut === 'brouillon')
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;

      /* Règle 21 — nextRef appelé UNE FOIS par groupe, jamais dans la boucle article */
      const bcRef = bcExistant ? bcExistant.ref : nextRef('BC', _achats);

      let nbCrees   = 0;
      let nbCumules = 0;

      for (const { ligne, a } of items) {
        const prix = ligne.prix > 0 ? ligne.prix : (a ? a.prix : 0);

        /* Règle 21B — cas doublon :
           Si BC existant, chercher si cet article_id est déjà dans ses lignes
           → OUI : updateAchat (cumul quantité) — jamais de doublon
           → NON : createAchat (nouvelle ligne dans le BC) */
        const ligneExistante = bcExistant
          ? bcExistant.lignes.find(l => l.article_id === ligne.articleId)
          : null;

        if (ligneExistante) {
          /* Cumul quantité sur la ligne existante */
          const newQte     = ligneExistante.quantite + ligne.qte;
          const newMontant = newQte * (ligneExistante.prix_unitaire || prix);
          await updateAchat(ligneExistante.id, {
            quantite:   newQte,
            montant_ht: newMontant,
          });
          /* Mise à jour cache local */
          const idx = _achats.findIndex(x => x.id === ligneExistante.id);
          if (idx >= 0) {
            _achats[idx].quantite   = newQte;
            _achats[idx].montant_ht = newMontant;
          }
          nbCumules++;
        } else {
          /* Nouvelle ligne — article absent du BC ou nouveau BC */
          const bc = await createAchat({
            ref:           bcRef,
            article_id:    ligne.articleId,
            article_nom:   ligne.nom || (a ? a.nom : ''),
            quantite:      ligne.qte,
            prix_unitaire: prix,
            montant_ht:    ligne.qte * prix,
            fournisseur:   fourn,
            statut:        'brouillon',
            ref_commande:  refCommande,
            notes,
            date_cmd:      date,
          });
          _achats.unshift(bc);
          nbCrees++;
        }
      }

      /* Toast différencié selon ce qui s'est passé */
      if (bcExistant && nbCumules > 0 && nbCrees > 0) {
        toasts.push(`✅ ${bcRef} — ${nbCumules} quantité(s) cumulée(s), ${nbCrees} nouvel(s) article(s) ajouté(s).`);
      } else if (bcExistant && nbCumules > 0) {
        toasts.push(`✅ ${bcRef} — quantité(s) mise(s) à jour (${fourn || 'fournisseur non défini'}).`);
      } else if (bcExistant) {
        toasts.push(`✅ ${nbCrees} article(s) ajouté(s) au ${bcRef} (${fourn || 'fournisseur non défini'}).`);
      } else {
        toasts.push(`✅ BC ${bcRef} créé — ${nbCrees} ligne(s).`);
      }
    }

    closeModal('modalAchat');
    _renderTable();
    toasts.forEach((t, i) => setTimeout(() => showToast(t), i * 600));
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));

  } catch (err) {
    showToast('❌ Erreur création BC.', 'error');
    console.error('[achats] _saveAchat ERREUR:', err.message, err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Créer le BC'; }
  }
}

/* -------------------------------------------------------
   DÉTAIL / ÉDITION BC (groupe entier)
------------------------------------------------------- */
function _openDetailBC(refGroupe) {
  _currentBCRef = refGroupe;
  const groupes  = _grouperAchats(_achats);
  const g        = groupes.find(x => x.ref === refGroupe);
  if (!g) return;

  const t = _tenant || {};
  const f = _fournisseurs.find(x => x.nom === g.fournisseur) || {};

  const lignesHTML = g.lignes.map(l => `
    <tr>
      <td style="font-size:11.5px;font-weight:600">${esc(l.article_nom || '—')}</td>
      <td>
        <input type="number" class="dbc-qte" data-id="${l.id}" value="${l.quantite || 0}"
          step="0.01" style="width:70px;padding:3px 6px;border:1px solid var(--ui-brd);border-radius:5px;font-size:11.5px;"
          oninput="_dbcRecalcLigne(this)">
      </td>
      <td>
        <input type="number" class="dbc-prix" data-id="${l.id}" value="${l.prix_unitaire || 0}"
          step="0.001" style="width:80px;padding:3px 6px;border:1px solid var(--ui-brd);border-radius:5px;font-size:11.5px;"
          oninput="_dbcRecalcLigne(this)">
      </td>
      <td class="dbc-total-${esc(l.id)}" style="font-weight:600;font-size:11.5px;text-align:right">
        ${fmt(l.montant_ht || (l.quantite * (l.prix_unitaire || 0)))} €
      </td>
    </tr>`).join('');

  document.getElementById('detailBCTitle').textContent = 'BC ' + g.ref + ' — ' + (g.fournisseur || '—');
  document.getElementById('detailBCContent').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;padding:10px 12px;background:var(--ui-bg2);border-radius:7px;font-size:11.5px;">
      <div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Émetteur</div>
        <div style="font-weight:700;">${esc(t.nom || '(non configuré)')}</div>
        ${t.adresse ? '<div style="color:var(--ink-muted);">' + esc(t.adresse) + '</div>' : ''}
        ${t.tel     ? '<div>Tél : ' + esc(t.tel)   + '</div>' : ''}
        ${t.email   ? '<div>' + esc(t.email)   + '</div>' : ''}
        ${t.siret   ? '<div style="font-size:10px;color:var(--ink-muted);">SIRET : ' + esc(t.siret) + '</div>' : ''}
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:4px;">Fournisseur</div>
        <div style="font-weight:700;">${esc(g.fournisseur || '—')}</div>
        ${f.contact ? '<div>' + esc(f.contact) + '</div>'                                   : ''}
        ${f.adresse ? '<div style="color:var(--ink-muted);">' + esc(f.adresse) + '</div>'   : ''}
        ${f.tel     ? '<div>Tél : ' + esc(f.tel)   + '</div>'                               : ''}
        ${f.email   ? '<div>' + esc(f.email)   + '</div>'                                   : ''}
        ${f.delai   ? '<div style="font-size:10px;color:var(--ink-muted);">Délai : ' + esc(f.delai) + '</div>' : ''}
      </div>
    </div>
    <div class="form-grid" style="padding:0 0 10px;">
      <div class="form-group">
        <label>N° BC</label>
        <input type="text" id="dbcRef" value="${esc(g.ref)}" readonly style="background:var(--ui-bg2);color:var(--ink-muted);">
      </div>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="dbcDate" value="${esc(g.date || '')}">
      </div>
      <div class="form-group">
        <label>Fournisseur</label>
        <select id="dbcFournisseur">
          <option value="${esc(g.fournisseur || '')}">${esc(g.fournisseur || '— aucun —')}</option>
          ${_fournisseurs.filter(f2 => f2.nom !== g.fournisseur).map(f2 => `<option value="${esc(f2.nom)}">${esc(f2.nom)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Réf commande</label>
        <input type="text" id="dbcRefCmd" value="${esc(g.refCommande || '')}">
      </div>
      <div class="form-group">
        <label>Statut</label>
        <select id="dbcStatut">
          <option value="brouillon" ${g.statut === 'brouillon' ? 'selected' : ''}>Brouillon</option>
          <option value="envoye"    ${g.statut === 'envoye'    ? 'selected' : ''}>Envoyé</option>
          <option value="recu"      ${g.statut === 'recu'      ? 'selected' : ''}>Reçu ✓</option>
          <option value="annule"    ${g.statut === 'annule'    ? 'selected' : ''}>Annulé</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Remarque</label>
        <input type="text" id="dbcRemarque" value="${esc(g.notes || '')}">
      </div>
    </div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);margin-bottom:6px;">Articles commandés</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;">
      <thead>
        <tr style="background:var(--ui-bg2);font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-muted);">
          <th style="padding:6px 8px;text-align:left;">Article</th>
          <th style="padding:6px 8px;text-align:left;">Qté</th>
          <th style="padding:6px 8px;text-align:left;">Prix HT</th>
          <th style="padding:6px 8px;text-align:right;">Total HT</th>
        </tr>
      </thead>
      <tbody id="dbcLignesTbody">${lignesHTML}</tbody>
      <tfoot>
        <tr style="background:var(--ui-bg2);">
          <td colspan="3" style="text-align:right;font-weight:700;padding:7px 8px;">Total HT</td>
          <td id="dbcTotalHT" style="font-weight:700;padding:7px 8px;text-align:right;">${fmt(g.totalHT)} €</td>
        </tr>
        <tr>
          <td colspan="3" style="text-align:right;padding:4px 8px;font-size:10.5px;color:var(--ink-muted);">TVA 20%</td>
          <td id="dbcTVA" style="padding:4px 8px;font-size:10.5px;color:var(--ink-muted);text-align:right;">${fmt(g.totalHT * 0.2)} €</td>
        </tr>
        <tr style="background:var(--ui-bg2);">
          <td colspan="3" style="text-align:right;font-weight:700;padding:7px 8px;">Total TTC</td>
          <td id="dbcTotalTTC" style="font-weight:700;padding:7px 8px;text-align:right;">${fmt(g.totalHT * 1.2)} €</td>
        </tr>
      </tfoot>
    </table>`;

  window._dbcRecalcLigne = _dbcRecalcLigne;
  openModal('modalDetailBC');
}

function _dbcRecalcLigne(input) {
  const id  = input.dataset.id;
  const tr  = input.closest('tr');
  if (!tr) return;
  const qte  = parseFloat(tr.querySelector('.dbc-qte')?.value) || 0;
  const prix = parseFloat(tr.querySelector('.dbc-prix')?.value) || 0;
  const tot  = qte * prix;
  const cellTot = document.querySelector(`.dbc-total-${id}`);
  if (cellTot) cellTot.textContent = fmt(tot) + ' €';
  let totalHT = 0;
  document.querySelectorAll('#dbcLignesTbody tr').forEach(r => {
    const q = parseFloat(r.querySelector('.dbc-qte')?.value) || 0;
    const p = parseFloat(r.querySelector('.dbc-prix')?.value) || 0;
    totalHT += q * p;
  });
  const elHT  = document.getElementById('dbcTotalHT');
  const elTVA = document.getElementById('dbcTVA');
  const elTTC = document.getElementById('dbcTotalTTC');
  if (elHT)  elHT.textContent  = fmt(totalHT) + ' €';
  if (elTVA) elTVA.textContent = fmt(totalHT * 0.2) + ' €';
  if (elTTC) elTTC.textContent = fmt(totalHT * 1.2) + ' €';
}

function _bindDetailBCForm() {
  document.getElementById('btnSaveDetailBC')?.addEventListener('click', _saveDetailBC);
  document.getElementById('btnAperçuBCDetail')?.addEventListener('click', () => {
    if (_currentBCRef) _aperçuPdfBC(_currentBCRef);
  });
}

/* -------------------------------------------------------
   SAVE DÉTAIL BC
------------------------------------------------------- */
async function _saveDetailBC() {
  if (!_currentBCRef) return;
  const groupes  = _grouperAchats(_achats);
  const g        = groupes.find(x => x.ref === _currentBCRef);
  if (!g) return;

  const newStatut = document.getElementById('dbcStatut').value;
  const newDate   = document.getElementById('dbcDate').value;
  const newFourn  = document.getElementById('dbcFournisseur').value;
  const newRefCmd = document.getElementById('dbcRefCmd').value;
  const newNotes  = document.getElementById('dbcRemarque').value;
  const oldStatut = g.statut;
  const passeRecu = newStatut === 'recu' && oldStatut !== 'recu';

  const btn = document.getElementById('btnSaveDetailBC');
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    const lignesData = {};
    document.querySelectorAll('#dbcLignesTbody tr').forEach(tr => {
      const qteInput  = tr.querySelector('.dbc-qte');
      const prixInput = tr.querySelector('.dbc-prix');
      if (qteInput) {
        const id  = qteInput.dataset.id;
        const qte  = parseFloat(qteInput.value)  || 0;
        const prix = parseFloat(prixInput?.value) || 0;
        lignesData[id] = { qte, prix };
      }
    });

    for (const l of g.lignes) {
      const ld = lignesData[l.id] || { qte: l.quantite, prix: l.prix_unitaire };
      const updated = await updateAchat(l.id, {
        date_cmd:      newDate,
        fournisseur:   newFourn,
        ref_commande:  newRefCmd,
        notes:         newNotes,
        statut:        newStatut,
        quantite:      ld.qte,
        prix_unitaire: ld.prix,
      });

      if (passeRecu) {
        const art = _articles.find(x => x.id === l.article_id);
        if (art) {
          await updateArticleStock(art.id, art.stock + ld.qte);
          await addMouvement({
            type: 'entree', ref: art.ref, nom: art.nom,
            qte: ld.qte, motif: 'Réception ' + g.ref, ref_doc: g.ref,
          });
          art.stock += ld.qte;
        }
      }

      const idx = _achats.findIndex(x => x.id === l.id);
      if (idx >= 0) _achats[idx] = { ..._achats[idx], ...updated };
    }

    if (passeRecu) showToast(`✅ ${g.ref} reçu — stock mis à jour.`);
    else           showToast(`✅ ${g.ref} enregistré.`);

    closeModal('modalDetailBC');
    _renderTable();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur enregistrement BC.', 'error');
    console.error('[achats] _saveDetailBC ERREUR:', err.message, err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
  }
}

/* -------------------------------------------------------
   CHANGEMENT STATUT RAPIDE
------------------------------------------------------- */
async function _changerStatutGroupe(refGroupe, statut) {
  if (!statut) return;
  const groupes = _grouperAchats(_achats);
  const g       = groupes.find(x => x.ref === refGroupe);
  if (!g) return;
  const passeRecu = statut === 'recu' && g.statut !== 'recu';
  try {
    for (const l of g.lignes) {
      await updateAchat(l.id, { statut });
      if (passeRecu) {
        const art = _articles.find(x => x.id === l.article_id);
        if (art) {
          await updateArticleStock(art.id, art.stock + l.quantite);
          await addMouvement({ type: 'entree', ref: art.ref, nom: art.nom, qte: l.quantite, motif: 'Réception ' + g.ref, ref_doc: g.ref });
          art.stock += l.quantite;
        }
      }
      const bc = _achats.find(x => x.id === l.id);
      if (bc) bc.statut = statut;
    }
    if (passeRecu) showToast(`✅ ${g.ref} reçu — stock mis à jour.`);
    _renderTable();
    document.dispatchEvent(new CustomEvent('appmee:datachanged', { detail: { entity: 'achats' } }));
  } catch (err) {
    showToast('❌ Erreur changement statut.', 'error');
    console.error('[achats] _changerStatutGroupe ERREUR:', err.message, err);
  }
}

/* -------------------------------------------------------
   APERÇU PDF
------------------------------------------------------- */
function _aperçuPdfBC(refGroupe) {
  const groupes = _grouperAchats(_achats);
  const g       = groupes.find(x => x.ref === refGroupe);
  if (!g) { showToast('⚠ BC introuvable.', 'error'); return; }
  const t = _tenant || {};
  const f = _fournisseurs.find(x => x.nom === g.fournisseur) || {};
  _ouvrirFenetrePDF(_buildPdfData(g, t, f));
}

function _aperçuBCFormulaire() {
  const lignesValides = _bcLignes.filter(l => l.articleId && l.qte > 0);
  if (!lignesValides.length) { showToast('⚠ Ajoutez au moins une ligne.', 'error'); return; }
  const fournisseur = document.getElementById('achatFournisseur')?.value || '';
  const f = _fournisseurs.find(x => x.nom === fournisseur) || {};
  const t = _tenant || {};
  const fakeGroupe = {
    ref: '[Aperçu]', date: document.getElementById('achatDate')?.value || today(),
    fournisseur, refCommande: document.getElementById('achatRefCmd')?.value || '',
    notes: document.getElementById('achatRemarque')?.value || '', statut: 'brouillon',
    totalHT: lignesValides.reduce((s, l) => s + l.qte * l.prix, 0),
    lignes: lignesValides.map(l => {
      const a = _articles.find(x => x.id === l.articleId);
      return { article_nom: l.nom || (a ? a.nom : ''), quantite: l.qte, prix_unitaire: l.prix, montant_ht: l.qte * l.prix };
    }),
  };
  _ouvrirFenetrePDF(_buildPdfData(fakeGroupe, t, f));
}

function _buildPdfData(g, t, f) {
  const totalHT = g.totalHT || g.lignes.reduce((s, l) => s + (l.montant_ht || ((l.quantite || 0) * (l.prix_unitaire || 0))), 0);
  return { g, t, f, totalHT, tva: totalHT * 0.2, ttc: totalHT * 1.2 };
}

function _ouvrirFenetrePDF({ g, t, f, totalHT, tva, ttc }) {
  const lignesHTML = (g.lignes || []).map(l => `
    <tr>
      <td>${_esc(l.article_nom || '—')}</td>
      <td style="text-align:right;">${_fmtQ(l.quantite || 0)}</td>
      <td style="text-align:right;">${_fmtPrix(l.prix_unitaire || 0)}</td>
      <td style="text-align:right;font-weight:600;">${_fmtPrix(l.montant_ht || ((l.quantite || 0) * (l.prix_unitaire || 0)))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>BC ${_esc(g.ref)}</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:28px 32px;}
    .btn-print{display:block;margin:0 auto 24px;padding:9px 28px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;}
    @media print{.btn-print{display:none;}}
    h1{font-size:19px;text-transform:uppercase;}
    .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #1a1a1a;padding-bottom:14px;margin-bottom:18px;}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:18px;}
    .plbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:5px;}
    .pnom{font-size:12px;font-weight:700;margin-bottom:3px;}
    table{width:100%;border-collapse:collapse;margin-bottom:0;}
    thead tr{background:#1a1a1a;color:#fff;}
    thead th{padding:7px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;}
    tbody tr{border-bottom:1px solid #eee;}tbody tr:nth-child(even){background:#f9fafb;}
    tbody td{padding:6px 8px;font-size:11px;}
    .totaux{width:220px;margin-left:auto;margin-top:0;border-collapse:collapse;}
    .totaux td{padding:5px 8px;font-size:11.5px;}
    .totaux .lbl{text-align:right;color:#555;}.totaux .val{text-align:right;font-weight:600;}
    .totaux tr.ttc td{background:#1a1a1a;color:#fff;font-weight:700;font-size:12.5px;}
    .footer{margin-top:22px;border-top:1px solid #e5e7eb;padding-top:8px;text-align:center;font-size:9.5px;color:#aaa;}</style>
    </head><body>
    <button class="btn-print" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    <div class="hdr">
      <div><h1>Bon de commande fournisseur</h1><div style="font-size:10.5px;color:#666">${_esc(t.nom || 'AppMee')}</div></div>
      <div style="text-align:right;font-size:11px;"><div style="font-size:15px;font-weight:700;color:#2563eb">Réf : ${_esc(g.ref)}</div>
      <div style="color:#555">Date : ${_esc(g.date || '—')}</div>
      ${g.refCommande ? `<div style="color:#555">Réf commande : ${_esc(g.refCommande)}</div>` : ''}</div>
    </div>
    <div class="parties">
      <div><div class="plbl">Émetteur</div><div class="pnom">${_esc(t.nom || '—')}</div>
      ${t.adresse ? `<div>${_esc(t.adresse)}</div>` : ''}${t.tel ? `<div>Tél : ${_esc(t.tel)}</div>` : ''}
      ${t.siret ? `<div>SIRET : ${_esc(t.siret)}</div>` : ''}</div>
      <div><div class="plbl">Fournisseur</div><div class="pnom">${_esc(g.fournisseur || '—')}</div>
      ${f.tel ? `<div>Tél : ${_esc(f.tel)}</div>` : ''}${f.email ? `<div>${_esc(f.email)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th>Désignation</th><th style="text-align:right">Qté</th><th style="text-align:right">PU HT</th><th style="text-align:right">Total HT</th></tr></thead>
    <tbody>${lignesHTML}</tbody></table>
    <table class="totaux">
      <tr><td class="lbl">Total HT</td><td class="val">${_fmtPrix(totalHT)}</td></tr>
      <tr><td class="lbl">TVA 20%</td><td class="val">${_fmtPrix(tva)}</td></tr>
      <tr class="ttc"><td class="lbl" style="color:#fff;font-weight:700">TOTAL TTC</td><td class="val">${_fmtPrix(ttc)}</td></tr>
    </table>
    ${g.notes ? `<div style="margin-top:14px;padding:8px 10px;background:#f9fafb;border-left:3px solid #2563eb;font-size:10.5px;"><strong>Note :</strong> ${_esc(g.notes)}</div>` : ''}
    <div class="footer">AppMee — appmee.fr</div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  else showToast('⚠ Pop-up bloqué — autorisez les pop-ups.', 'error');
}

function _esc(s)     { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmtPrix(v) { return Number(v).toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €'; }
function _fmtQ(v)    { return Number(v).toLocaleString('fr-FR', { maximumFractionDigits:3 }); }

/* -------------------------------------------------------
   GETTERS publics
------------------------------------------------------- */
export function getAchatsCache()       { return _achats; }
export function getArticlesCache()     { return _articles; }
export function getFournisseursCache() { return _fournisseurs; }
