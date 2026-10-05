#!/bin/bash
# Setup interactif — demande les credentials et lance les tests
# Les credentials sont en mémoire uniquement, JAMAIS sauvegardés

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║  Test Import IA — Setup sécurisé (credentials caché)  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Vérifier si .env.local existe déjà
if [ -f "$(dirname "$0")/.env.local" ]; then
  echo "⚠️  .env.local détecté — utilisation des credentials présents"
  echo ""
  node "$(dirname "$0")/run-import-ia-tests.js"
  exit 0
fi

echo "Rentre tes credentials Supabase (pas de sauvegarde):"
echo ""

# Lire les credentials en mode caché si possible
read -p "SUPABASE_URL (ex. https://xxx.supabase.co): " SUPABASE_URL
read -sp "SUPABASE_SERVICE_KEY (caché): " SUPABASE_SERVICE_KEY
echo ""

read -p "TENANT_ID (UUID du tenant de test): " TENANT_ID
read -sp "ANTHROPIC_API_KEY (caché): " ANTHROPIC_API_KEY
echo ""

# Export en mémoire (jamais sauvegardé)
export SUPABASE_URL
export SUPABASE_SERVICE_KEY
export TENANT_ID
export ANTHROPIC_API_KEY

echo ""
echo "✓ Credentials chargés en mémoire"
echo "Lancement des tests..."
echo ""

# Lancer le script
node "$(dirname "$0")/run-import-ia-tests.js"

# Les variables se perdent à la fin du script
echo ""
echo "✓ Tests terminés. Les credentials ont été oubliés (jamais sauvegardés)."
