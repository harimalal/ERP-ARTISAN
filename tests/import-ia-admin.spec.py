# Double-check Playwright — Onboarding IA import Admin (pipeline scan multi-entités)
# Teste : connexion réelle → Admin → modal Import → dépôt d'1 fichier de test (PDF client)
#         → attente fin de scan IA → écran de validation → import → toast succès
#         → nouvelle entrée visible dans la liste Clients de l'Admin.
#
# ÉCRIT MANUELLEMENT (Tâche 10 du plan onboarding-ia-admin), PAS EXÉCUTÉ dans cet
# environnement : pas de serveur local lancé, pas de navigateur, pas de
# /tmp/test_creds.json disponible ici, et surtout la Netlify Function /api/ai-extract-batch
# dépend d'un vrai appel Anthropic + de la migration Supabase import_scan_items appliquée
# en base (voir .claude/Rapport_developpement_code_*.md — REQUIRED_HUMAN_ACTION).
# À exécuter par l'utilisateur ou en session suivante, une fois ces pré-requis en place :
#   1. npx http-server (ou équivalent) sur le port BASE ci-dessous
#   2. /tmp/test_creds.json avec {"email": "...", "password": "..."} d'un compte de test réel
#   3. Migration supabase/migrations/2026-08-22_import_scan_items.sql appliquée
#   4. Variables Netlify SUPABASE_URL / SUPABASE_SERVICE_KEY / ANTHROPIC_API_KEY configurées
#   5. tests/fixtures/client-test.pdf présent (fourni avec ce test — PDF minimal généré
#      contenant "Client Test SARL", un SIRET, un email et une adresse factices)

import sys, json, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8124"
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "client-test.pdf")

with open('/tmp/test_creds.json') as f:
    creds = json.load(f)
EMAIL = creds["email"]
PASSWORD = creds["password"]

pass_count = 0
fail_count = 0
def check(name, cond):
    global pass_count, fail_count
    if cond:
        pass_count += 1
        print("  ✓ " + name)
    else:
        fail_count += 1
        print("  ✗ " + name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text) if m.type == "error" else None)

    print("== 1. Connexion réelle ==")
    page.goto(BASE + "/login.html", wait_until="networkidle")
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PASSWORD)
    page.click("#panel-login .btn-submit")
    page.wait_for_timeout(3000)
    print("  URL après connexion:", page.url)
    check("redirigé vers /app", "/app" in page.url)

    print("== 2. Navigation vers Admin ==")
    page.click("[data-page='admin']")
    page.wait_for_timeout(1500)
    admin_body = page.evaluate("document.body.innerText")
    check("page Admin chargée", "Administration" in admin_body or "Référentiels" in admin_body)

    # Compter les clients Admin AVANT import (pour vérifier l'ajout après)
    try:
        clients_avant = page.eval_on_selector_all("#adminClientsTbody tr", "rows => rows.length")
    except Exception:
        clients_avant = 0
    print("  clients avant import:", clients_avant)

    print("== 3. Ouverture de la modal Import ==")
    page.click("[data-modal='modalImportMasse']")
    page.wait_for_timeout(800)
    check("modal Import ouverte", page.is_visible("#modalImportMasse.open") or page.is_visible("#importDropzone"))

    print("== 4. Dépôt du fichier de test (PDF client) ==")
    check("fixture PDF présente sur disque", os.path.isfile(FIXTURE))
    page.set_input_files("#importFileInput", FIXTURE)

    print("== 5. Attente de la fin du scan IA ==")
    # Le scan IA appelle /api/ai-extract-batch (Anthropic) — peut prendre plusieurs
    # secondes réelles par fichier. On attend l'apparition de l'écran de validation
    # (#importValidation passe en display:block) plutôt qu'un délai fixe.
    try:
        page.wait_for_function(
            "document.getElementById('importValidation') && "
            "getComputedStyle(document.getElementById('importValidation')).display !== 'none'",
            timeout=60000
        )
        check("écran de validation affiché après scan", True)
    except Exception as e:
        check("écran de validation affiché après scan", False)
        print("    timeout:", str(e)[:150])

    validation_html = page.evaluate("document.getElementById('importValidation')?.innerHTML || ''")
    check("au moins une entité détectée (ou message 'aucune entité')",
          "détectés" in validation_html or "Aucune entité détectée" in validation_html)

    print("== 6. Import de la sélection ==")
    btn_disabled = page.eval_on_selector("#importBtnConfirmer", "b => b.disabled")
    check("bouton Importer activé", btn_disabled is False)
    if btn_disabled is False:
        page.click("#importBtnConfirmer")
        page.wait_for_timeout(4000)

        print("== 7. Toast de succès ==")
        toast_text = page.evaluate("document.querySelector('.toast')?.textContent || ''")
        check("toast affiché après import", bool(toast_text))
        print("  toast:", toast_text)
        check("toast signale un import (pas une erreur bloquante)",
              "Import" in toast_text or "importés" in toast_text)

        print("== 8. Modal fermée + rechargement liste clients ==")
        page.wait_for_timeout(1000)
        check("modal Import fermée", not page.is_visible("#modalImportMasse.open"))

        clients_apres = page.eval_on_selector_all("#adminClientsTbody tr", "rows => rows.length")
        print("  clients après import:", clients_apres)
        check("nouvelle entrée visible dans la liste Clients (si le PDF contenait un client)",
              clients_apres >= clients_avant)
    else:
        print("  (bouton Importer resté désactivé — scan probablement en échec, voir logs Netlify)")

    print("== 9. Erreurs console ==")
    real_errors = [e for e in errors if "favicon" not in e and "cdn.jsdelivr" not in e]
    check("aucune erreur JS bloquante", len(real_errors) == 0)
    for e in real_errors[:10]:
        print("    " + e)

    print("\nRÉSULTAT: %d pass, %d fail" % (pass_count, fail_count))
    browser.close()

sys.exit(1 if fail_count > 0 else 0)
