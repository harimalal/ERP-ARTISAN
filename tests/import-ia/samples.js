import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'tenant-snapshot.json'), 'utf-8'));

const nomDe = ref => {
  const p = snapshot.produits.find(x => x.ref === ref);
  if (!p) throw new Error(`Produit ${ref} absent de tenant-snapshot.json`);
  return p.nom;
};
const client = nom => {
  if (!snapshot.clients.includes(nom)) throw new Error(`Client "${nom}" absent de tenant-snapshot.json`);
  return nom;
};

/* Reproduit à l'identique serialiserLignesTexte() de js/modules/admin.js :
   c'est le texte que l'application envoie réellement à la fonction
   pour xlsx / xls / csv. */
function serialiser(onglets) {
  return Object.entries(onglets).map(([nom, rows]) =>
    `--- Onglet "${nom}" (${rows.length} ligne(s)) ---\n` +
    rows.map(r => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | ')).join('\n')
  ).join('\n\n');
}
const csvOnglet = rows => serialiser({ 'Fichier CSV': rows });

const R = { fra: 'PF001', fraise: 'PF003', abr: 'PF005', fig: 'PF007', cas: 'PF008', rouge: 'PF009', coffret: 'PF010' };

/* expected.lignes : { ref | nom (sous-chaîne), qte } ; ref null = produit absent de la base
   expected.exact  : nombre exact de lignes attendu
   expected.client : nom exact | 'nonNull' (client nouveau) | undefined (non vérifié)
   expected.allNull : toutes les qte doivent être null
   expected.vide   : aucune ligne attendue, pas de crash */
export const samples = [
  {
    id: 'S01', ext: 'xlsx', titre: 'Tableau clair Désignation / Quantité',
    texte: serialiser({ Commande: [
      { Désignation: nomDe(R.fraise), Quantité: 12 },
      { Désignation: nomDe(R.fra), Quantité: 24 },
      { Désignation: nomDe(R.abr), Quantité: 6 },
      { Désignation: nomDe(R.cas), Quantité: 18 },
    ] }),
    expected: { exact: 4, lignes: [{ ref: R.fraise, qte: 12 }, { ref: R.fra, qte: 24 }, { ref: R.abr, qte: 6 }, { ref: R.cas, qte: 18 }] },
  },
  {
    id: 'S02', ext: 'xlsx', titre: 'Ambigu Stock / Ventes / Réassort',
    texte: serialiser({ Stock: [
      { Produit: nomDe(R.fraise), Réf: R.fraise, 'Stock actuel': 140, 'Ventes 30j': 60, 'Prix HT': '3.20', Réassort: 48 },
      { Produit: nomDe(R.fra), Réf: R.fra, 'Stock actuel': 90, 'Ventes 30j': 75, 'Prix HT': '3.40', Réassort: 96 },
      { Produit: nomDe(R.fig), Réf: R.fig, 'Stock actuel': 30, 'Ventes 30j': 20, 'Prix HT': '3.60', Réassort: 24 },
      { Produit: nomDe(R.rouge), Réf: R.rouge, 'Stock actuel': 200, 'Ventes 30j': 35, 'Prix HT': '3.50', Réassort: 12 },
    ] }),
    expected: { exact: 4, lignes: [{ ref: R.fraise, qte: 48 }, { ref: R.fra, qte: 96 }, { ref: R.fig, qte: 24 }, { ref: R.rouge, qte: 12 }] },
  },
  {
    id: 'S03', ext: 'xlsx', titre: 'Colonne "À commander" avec Stock et Prix',
    texte: serialiser({ Besoins: [
      { Article: nomDe(R.abr), Stock: 15, 'Prix unitaire': '3.30', 'À commander': 30 },
      { Article: nomDe(R.cas), Stock: 4, 'Prix unitaire': '3.80', 'À commander': 60 },
      { Article: nomDe(R.coffret), Stock: 8, 'Prix unitaire': '9.90', 'À commander': 10 },
    ] }),
    expected: { exact: 3, lignes: [{ ref: R.abr, qte: 30 }, { ref: R.cas, qte: 60 }, { ref: R.coffret, qte: 10 }] },
  },
  {
    id: 'S04', ext: 'xlsx', titre: 'Deux onglets, onglet Notes à ignorer',
    texte: serialiser({
      Commande: [
        { Produit: nomDe(R.fraise), Qté: 36 },
        { Produit: nomDe(R.fig), Qté: 12 },
      ],
      Notes: [
        { Remarque: 'Livraison avant 10h', Contact: 'Magasin ouvert du mardi au samedi' },
      ],
    }),
    expected: { exact: 2, lignes: [{ ref: R.fraise, qte: 36 }, { ref: R.fig, qte: 12 }] },
  },
  {
    id: 'S05', ext: 'xlsx', titre: 'Ligne TOTAL à ignorer',
    texte: serialiser({ Commande: [
      { Produit: nomDe(R.fra), Quantité: 20, 'Prix HT': '68.00' },
      { Produit: nomDe(R.fraise), Quantité: 10, 'Prix HT': '32.00' },
      { Produit: nomDe(R.cas), Quantité: 5, 'Prix HT': '19.00' },
      { Produit: 'TOTAL GÉNÉRAL', Quantité: 35, 'Prix HT': '119.00' },
    ] }),
    expected: { exact: 3, lignes: [{ ref: R.fra, qte: 20 }, { ref: R.fraise, qte: 10 }, { ref: R.cas, qte: 5 }] },
  },
  {
    id: 'S06', ext: 'xlsx', titre: 'Nom du produit réparti sur deux colonnes',
    texte: serialiser({ Commande: [
      { Famille: 'Confiture', Parfum: 'Framboise', Quantité: 18 },
      { Famille: 'Confiture', Parfum: 'Figue', Quantité: 9 },
      { Famille: 'Confiture', Parfum: 'Abricot', Quantité: 14 },
    ] }),
    expected: { exact: 3, lignes: [{ ref: R.fra, qte: 18 }, { ref: R.fig, qte: 9 }, { ref: R.abr, qte: 14 }] },
  },
  {
    id: 'S07', ext: 'csv', titre: 'EAN + code + prix + Qté cmd',
    texte: csvOnglet([
      { EAN: '3760001230011', Code: R.fraise, Désignation: nomDe(R.fraise), 'Prix HT': '3.20', 'Qté cmd': 24 },
      { EAN: '3760001230028', Code: R.fra, Désignation: nomDe(R.fra), 'Prix HT': '3.40', 'Qté cmd': 36 },
      { EAN: '3760001230035', Code: R.rouge, Désignation: nomDe(R.rouge), 'Prix HT': '3.50', 'Qté cmd': 12 },
    ]),
    expected: { exact: 3, lignes: [{ ref: R.fraise, qte: 24 }, { ref: R.fra, qte: 36 }, { ref: R.rouge, qte: 12 }] },
  },
  {
    id: 'S08', ext: 'csv', titre: 'Catalogue prix / EAN / poids, sans quantité',
    texte: csvOnglet([
      { Désignation: nomDe(R.fraise), EAN: '3760001230011', 'Prix HT': '3.20', Poids: '350g' },
      { Désignation: nomDe(R.fra), EAN: '3760001230028', 'Prix HT': '3.40', Poids: '350g' },
      { Désignation: nomDe(R.cas), EAN: '3760001230042', 'Prix HT': '3.80', Poids: '350g' },
      { Désignation: nomDe(R.coffret), EAN: '3760001230059', 'Prix HT': '9.90', Poids: '1050g' },
    ]),
    expected: { exact: 4, allNull: true },
  },
  {
    id: 'S09', ext: 'csv', titre: 'Colonne Besoin vs Stock mini vs Stock',
    texte: csvOnglet([
      { Produit: nomDe(R.fraise), Stock: 80, 'Stock mini': 100, Besoin: 40 },
      { Produit: nomDe(R.abr), Stock: 10, 'Stock mini': 50, Besoin: 60 },
      { Produit: nomDe(R.fig), Stock: 55, 'Stock mini': 40, Besoin: 15 },
    ]),
    expected: { exact: 3, lignes: [{ ref: R.fraise, qte: 40 }, { ref: R.abr, qte: 60 }, { ref: R.fig, qte: 15 }] },
  },
  {
    id: 'S10', ext: 'csv', titre: 'Colonne Proposition + Ventes moyennes + Prix',
    texte: csvOnglet([
      { Produit: nomDe(R.fra), 'Ventes moyennes': 70, 'Prix HT': '3.40', Proposition: 84 },
      { Produit: nomDe(R.cas), 'Ventes moyennes': 22, 'Prix HT': '3.80', Proposition: 30 },
      { Produit: nomDe(R.rouge), 'Ventes moyennes': 41, 'Prix HT': '3.50', Proposition: 48 },
    ]),
    expected: { exact: 3, lignes: [{ ref: R.fra, qte: 84 }, { ref: R.cas, qte: 30 }, { ref: R.rouge, qte: 48 }] },
  },
  {
    id: 'S11', ext: 'docx', titre: 'BC libre, client exact en en-tête',
    texte: [
      'BON DE COMMANDE N° 2026-0412',
      `Client : ${client('Épicerie Fine du Marais')}`,
      'Date : 2026-10-12',
      '',
      `Merci de nous livrer : 24 pots de ${nomDe(R.fraise)}, 12 pots de ${nomDe(R.fig)} et 6 ${nomDe(R.coffret)}.`,
      'Livraison souhaitée le 2026-10-20.',
    ].join('\n'),
    expected: { client: 'Épicerie Fine du Marais', exact: 3, lignes: [{ ref: R.fraise, qte: 24 }, { ref: R.fig, qte: 12 }, { ref: R.coffret, qte: 6 }] },
  },
  {
    id: 'S12', ext: 'docx', titre: 'Tableau Word extrait par mammoth (cellules ligne à ligne)',
    texte: [
      `Bon de commande - ${client('La Ferme Gourmande')}`,
      '',
      'Désignation', 'Quantité',
      nomDe(R.fraise), '30',
      nomDe(R.abr), '18',
      nomDe(R.cas), '12',
    ].join('\n'),
    expected: { client: 'La Ferme Gourmande', exact: 3, lignes: [{ ref: R.fraise, qte: 30 }, { ref: R.abr, qte: 18 }, { ref: R.cas, qte: 12 }] },
  },
  {
    id: 'S13', ext: 'txt', titre: 'Email libre signé du client',
    texte: [
      'Bonjour,',
      '',
      `Pour la semaine prochaine, pouvez-vous nous préparer 48 pots de ${nomDe(R.fra)} et 24 pots de ${nomDe(R.fraise)} ?`,
      'Merci d\'avance.',
      '',
      'Cordialement,',
      client('Chocolaterie Bertrand'),
    ].join('\n'),
    expected: { client: 'Chocolaterie Bertrand', exact: 2, lignes: [{ ref: R.fra, qte: 48 }, { ref: R.fraise, qte: 24 }] },
  },
  {
    id: 'S14', ext: 'txt', titre: 'Notations "x6 u." et "12 pots"',
    texte: [
      `Commande ${client('Comptoir des Saveurs')}`,
      `${nomDe(R.cas)} x6 u.`,
      `${nomDe(R.fig)} : 12 pots`,
      `${nomDe(R.rouge)} - 8`,
    ].join('\n'),
    expected: { client: 'Comptoir des Saveurs', exact: 3, lignes: [{ ref: R.cas, qte: 6 }, { ref: R.fig, qte: 12 }, { ref: R.rouge, qte: 8 }] },
  },
  {
    id: 'S15', ext: 'txt', titre: 'Client absent de la base (nouveau client)',
    texte: [
      'BON DE COMMANDE',
      'Biocoop Les Lilas - 14 rue des Lilas, 75020 Paris',
      '',
      `${nomDe(R.fraise)} : 12`,
      `${nomDe(R.abr)} : 12`,
    ].join('\n'),
    expected: { client: 'nonNull', exact: 2, lignes: [{ ref: R.fraise, qte: 12 }, { ref: R.abr, qte: 12 }] },
  },
  {
    id: 'S16', ext: 'txt', titre: 'Client abrégé à rapprocher de la liste',
    texte: [
      'Ep. Fine du Marais',
      '',
      `18 x ${nomDe(R.fraise)}`,
      `6 x ${nomDe(R.coffret)}`,
    ].join('\n'),
    expected: { client: 'Épicerie Fine du Marais', exact: 2, lignes: [{ ref: R.fraise, qte: 18 }, { ref: R.coffret, qte: 6 }] },
  },
  {
    id: 'S17', ext: 'txt', titre: 'Faux tableau "Produit: X | Quantité: N"',
    texte: [
      `Client: ${client('Table & Terroir Traiteur')}`,
      `Produit: ${nomDe(R.fra)} | Quantité: 15`,
      `Produit: ${nomDe(R.fig)} | Quantité: 9`,
      `Produit: ${nomDe(R.cas)} | Quantité: 21`,
    ].join('\n'),
    expected: { client: 'Table & Terroir Traiteur', exact: 3, lignes: [{ ref: R.fra, qte: 15 }, { ref: R.fig, qte: 9 }, { ref: R.cas, qte: 21 }] },
  },
  {
    id: 'S18', ext: 'txt', titre: 'Document illisible, pas de crash',
    texte: '%%% ### @@@ \u0000\u0001 ~~~ ///// ... ???',
    expected: { vide: true },
  },
  {
    id: 'S19', ext: 'xlsx', titre: 'Produits connus et produits inconnus mélangés',
    texte: serialiser({ Commande: [
      { Produit: nomDe(R.fraise), Quantité: 12 },
      { Produit: nomDe(R.fra), Quantité: 12 },
      { Produit: 'Miel Acacia 250g', Quantité: 6 },
      { Produit: nomDe(R.cas), Quantité: 24 },
      { Produit: 'Pâte à tartiner noisette 200g', Quantité: 4 },
    ] }),
    expected: { exact: 5, lignes: [
      { ref: R.fraise, qte: 12 }, { ref: R.fra, qte: 12 }, { ref: R.cas, qte: 24 },
      { ref: null, nom: 'Miel Acacia', qte: 6 }, { ref: null, nom: 'noisette', qte: 4 },
    ] },
  },
  {
    id: 'S20', ext: 'csv', titre: 'Accents, virgules et guillemets dans les valeurs',
    texte: csvOnglet([
      { 'Désignation article': `${nomDe(R.coffret)}`, 'Qté à livrer': 6, Commentaire: 'Emballage cadeau, ruban raphia' },
      { 'Désignation article': nomDe(R.fraise), 'Qté à livrer': 30, Commentaire: '' },
      { 'Désignation article': nomDe(R.rouge), 'Qté à livrer': 18, Commentaire: 'Étiquette "fait maison"' },
    ]),
    expected: { exact: 3, lignes: [{ ref: R.coffret, qte: 6 }, { ref: R.fraise, qte: 30 }, { ref: R.rouge, qte: 18 }] },
  },
];

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function evaluer(sample, data) {
  const e = sample.expected;
  const echecs = [];
  const lignes = Array.isArray(data?.lignes) ? data.lignes : [];

  if (e.vide) {
    if (lignes.length !== 0) echecs.push(`attendu 0 ligne, reçu ${lignes.length}`);
    return echecs;
  }
  if (e.client === 'nonNull') {
    if (!data.client) echecs.push('client null alors que le document en nomme un');
  } else if (e.client !== undefined && norm(data.client) !== norm(e.client)) {
    echecs.push(`client attendu "${e.client}", reçu "${data.client}"`);
  }
  if (e.exact !== undefined && lignes.length !== e.exact) {
    echecs.push(`attendu ${e.exact} ligne(s), reçu ${lignes.length}`);
  }
  if (e.allNull) {
    const pasNull = lignes.filter(l => l.qte !== null);
    if (pasNull.length) echecs.push(`qte attendues null, reçu [${lignes.map(l => l.qte).join(', ')}]`);
  }
  for (const att of e.lignes || []) {
    const trouvee = att.ref
      ? lignes.find(l => l.refDetectee === att.ref)
      : lignes.find(l => !l.refDetectee && norm(l.nomOriginal).includes(norm(att.nom)));
    const lib = att.ref || att.nom;
    if (!trouvee) { echecs.push(`ligne ${lib} introuvable`); continue; }
    if (Number(trouvee.qte) !== att.qte) echecs.push(`${lib} : qte attendue ${att.qte}, reçue ${trouvee.qte}`);
  }
  return echecs;
}
