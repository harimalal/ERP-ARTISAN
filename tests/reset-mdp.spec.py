# Double-check Playwright — UI reset mot de passe (login.html)
# Teste : panneaux forgot/reset, validation, détection token, client partagé.
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8123"

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

    print("== 1. Chargement login ==")
    page.goto(BASE + "/login.html", wait_until="networkidle")
    check("titre ARTEASY présent", page.locator(".logo-name").text_content() == "ARTEASY")
    check("panneau login actif par défaut", page.locator("#panel-login").evaluate("el => el.classList.contains('active')"))

    print("== 2. Panneau mot de passe oublié ==")
    page.click(".link-forgot")
    check("panneau forgot actif", page.locator("#panel-forgot").evaluate("el => el.classList.contains('active')"))

    print("== 3. Validation email forgot ==")
    page.fill("#forgotEmail", "pas-un-email")
    page.click("#panel-forgot .btn-submit")
    page.wait_for_timeout(300)
    msg1 = page.locator("#msgBox").text_content()
    check("message email invalide affiché", "invalide" in msg1)

    print("== 4. Panneau reset (nouveau mot de passe) ==")
    page.evaluate("switchTab('reset')")
    check("panneau reset actif", page.locator("#panel-reset").evaluate("el => el.classList.contains('active')"))

    print("== 5. Validation mots de passe différents ==")
    page.fill("#resetPassword", "motdepasse123")
    page.fill("#resetPassword2", "different123")
    page.click("#panel-reset .btn-submit")
    page.wait_for_timeout(300)
    msg2 = page.locator("#msgBox").text_content()
    check("message non-correspondance affiché", "correspondent" in msg2)

    print("== 6. Validation mot de passe trop court ==")
    page.fill("#resetPassword", "court")
    page.fill("#resetPassword2", "court")
    page.click("#panel-reset .btn-submit")
    page.wait_for_timeout(300)
    msg3 = page.locator("#msgBox").text_content()
    check("message 8 caractères affiché", "8 caractères" in msg3)

    print("== 7. Détection token recovery (hash simulé) ==")
    # Forcer une VRAIE navigation (nouvelle page) : en prod l'utilisateur
    # arrive directement sur /login#access_token=... et le script s'exécute.
    page.goto("about:blank")
    page.goto(BASE + "/login.html#access_token=fake&type=recovery", wait_until="networkidle")
    page.wait_for_timeout(2000)
    active = page.evaluate("() => { const p = document.querySelector('.tab-panel.active'); return p ? p.id : 'none'; }")
    check("panneau forgot ou reset affiché (pas login)", active in ("panel-forgot", "panel-reset"))

    print("== 8. Erreurs console ==")
    check("aucune erreur JS", len(errors) == 0)
    for e in errors:
        print("    " + e)

    print("\nRÉSULTAT: %d pass, %d fail" % (pass_count, fail_count))
    browser.close()

sys.exit(1 if fail_count > 0 else 0)
