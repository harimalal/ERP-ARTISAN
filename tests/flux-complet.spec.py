# Double-check Playwright — flux complet ARTEASY (UI)
# Teste : connexion réelle → chargement app → navigation modules
# Le flux métier (commande→facture) est déjà validé en intégration API.
import sys, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8124"

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
    # Après connexion, redirection vers /app
    print("  URL après connexion:", page.url)
    check("redirigé vers /app", "/app" in page.url)

    print("== 2. Chargement de l'app ==")
    page.wait_for_timeout(3000)
    check("titre ARTEASY présent", "ARTEASY" in (page.title() or ""))
    # Vérifier que le header utilisateur est rempli
    try:
        uname = page.locator("#hdrUserName").text_content()
        check("nom utilisateur affiché", bool(uname and uname.strip()))
        print("  utilisateur:", uname)
    except:
        check("nom utilisateur affiché", False)

    print("== 3. Navigation modules ==")
    # Vérifier la présence des onglets/modules principaux
    body = page.evaluate("document.body.innerText")
    for kw in ["Dashboard", "Commandes", "Livraisons", "Achats", "Production", "Stock", "Admin"]:
        check(f"module '{kw}' présent", kw.lower() in body.lower())

    print("== 4. Erreurs console ==")
    # Filtrer les erreurs réseau attendues (CDN, favicon)
    real_errors = [e for e in errors if "favicon" not in e and "cdn.jsdelivr" not in e]
    check("aucune erreur JS bloquante", len(real_errors) == 0)
    for e in real_errors[:10]:
        print("    " + e)

    print("\nRÉSULTAT: %d pass, %d fail" % (pass_count, fail_count))
    browser.close()

sys.exit(1 if fail_count > 0 else 0)
