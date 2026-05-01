exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const NOTION_API_KEY = process.env.NOTIONTOKEN;
  const NOTION_DB_ID   = 'cd07e4e606e44bf9bf5727bf78c3868c';

  if (!NOTION_API_KEY) {
    console.error('[notion_lead] ERREUR: NOTION_API_KEY manquante');
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuration serveur manquante' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Données invalides' }) };
  }

  const { prenom, secteur, metier, taille, anciennete, gestion, whatsapp, dispo, difficultes, douleur, score, statut } = data;

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties: {
          'Prénom':           { title: [{ text: { content: prenom || '' } }] },
          'Statut':           { select: { name: statut || '❄️ Froid' } },
          'Score':            { number: score || 0 },
          'WhatsApp':         { rich_text: [{ text: { content: whatsapp || '' } }] },
          'Secteur':          { rich_text: [{ text: { content: secteur || '' } }] },
          'Métier':           { rich_text: [{ text: { content: metier || '' } }] },
          'Taille équipe':    { select: { name: taille || '' } },
          'Ancienneté':       { select: { name: anciennete || '' } },
          'Gestion actuelle': { select: { name: gestion || '' } },
          'Difficultés':      { rich_text: [{ text: { content: (difficultes || []).join(', ') || '—' } }] },
          'Casse-tête':       { rich_text: [{ text: { content: douleur || '—' } }] },
          'Disponibilité':    { select: { name: dispo || '' } },
          'Suivi':            { select: { name: 'À contacter' } },
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[notion_lead] Erreur Notion:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'Erreur Notion' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error('[notion_lead] ERREUR:', err.message, err.stack);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erreur serveur' }) };
  }
};
