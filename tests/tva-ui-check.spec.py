# Test UI — TVA multi-taux : navigation + admin + achats + livraisons
import sys, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8124"

with open('/tmp/test_creds.json') as f:
    creds = json.load(f)
EMAIL = creds.get("email", "test-23994cd1@arteasy.test")
PASSWORD = creds.get("password", "")

results = []
def check(name, ok, detail=""):
    sym = "PASS" if ok else "FAIL"
    results.append((sym, name, detail))
    print(f"[{sym}] {name}{' — ' + detail if detail else ''}")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    
    # 1. Login
    print("\n=== LOGIN ===")
    page.goto(BASE + "/login.html", wait_until="networkidle")
    try:
        page.fill("#loginEmail", EMAIL)
        page.fill("#loginPassword", PASSWORD)
        page.click("#panel-login .btn-submit")
    except Exception as e:
        check("login form fill", False, str(e)[:80])
        browser.close()
        sys.exit(1)
    page.wait_for_timeout(5000)
    is_app = "/app" in page.url
    check("redirected to /app", is_app, page.url)
    if not is_app:
        print("ABORT: login failed")
        browser.close()
        sys.exit(1)
    
    # 2. App loaded
    print("\n=== APP LOADED ===")
    page.wait_for_timeout(3000)
    body = page.evaluate("document.body.innerText")
    check("header ARTEASY visible", "ARTEASY" in body, page.title())
    check("no blocking JS errors", len(errors) == 0, "; ".join(errors[:3]) if errors else "none")
    
    # 3. Navigate to Admin
    print("\n=== ADMIN: PARAMÈTRES ENTREPRISE ===")
    try:
        page.click("text=Admin")
        page.wait_for_timeout(2000)
    except:
        page.click("text=Admin", timeout=3000)
        page.wait_for_timeout(2000)
    admin_html = page.evaluate("document.body.innerText")
    check("admin tab loads", "Mon entreprise" in admin_html or "Entreprise" in admin_html, "admin content visible")
    
    # Check for TVA in tenant settings (Mon entreprise section)
    tva_found = "TVA" in admin_html or "tva" in admin_html.lower()
    check("TVA field in tenant", tva_found)
    
    # 4. Admin — check articles table has TVA column
    print("\n=== ADMIN: ARTICLES ===")
    # Click on Articles tab in admin
    try:
        page.click("text=Articles")
        page.wait_for_timeout(1500)
    except:
        pass
    # Try to edit first article to see TVA field
    try:
        first_row = page.query_selector("#articlesTbody tr")
        if first_row:
            first_row.click()
            page.wait_for_timeout(1500)
            modal_html = page.evaluate("document.querySelector('.modal.open')?.innerHTML || ''")
            has_tva = "Taux TVA" in modal_html or "er_tva" in modal_html or "TVA" in modal_html
            check("article edit has TVA select", has_tva, "er_tva present" if "er_tva" in modal_html else "missing")
            # Close modal
            try:
                page.click(".modal-close, #btnCloseEditRow, .modal .btn-cancel")
                page.wait_for_timeout(500)
            except:
                pass
        else:
            check("articles table has rows", False, "empty — creating test article needed")
    except Exception as e:
        check("article edit modal", False, str(e)[:80])
    
    # 5. Admin — check produits
    print("\n=== ADMIN: PRODUITS ===")
    try:
        page.click("text=Produits")
        page.wait_for_timeout(1500)
    except:
        pass
    try:
        first_row = page.query_selector("#produitsTbody tr")
        if first_row:
            first_row.click()
            page.wait_for_timeout(1500)
            modal_html = page.evaluate("document.querySelector('.modal.open')?.innerHTML || ''")
            has_tva = "Taux TVA" in modal_html or "er_tva" in modal_html or "TVA" in modal_html
            check("produit edit has TVA select", has_tva, "er_tva present" if "er_tva" in modal_html else "missing")
            try:
                page.click(".modal-close, #btnCloseEditRow, .modal .btn-cancel")
                page.wait_for_timeout(500)
            except:
                pass
        else:
            check("produits table has rows", False, "empty")
    except Exception as e:
        check("produit edit modal", False, str(e)[:80])
    
    # 6. Navigate to Achats
    print("\n=== ACHATS: DÉTAIL BC ===")
    try:
        page.click("text=Achats")
        page.wait_for_timeout(2000)
    except:
        pass
    achats_html = page.evaluate("document.body.innerText")
    has_achats = "BC" in achats_html or "Aucun" in achats_html or "achat" in achats_html.lower()
    check("achats tab loads", has_achats)
    
    # 7. Navigate to Livraisons
    print("\n=== LIVRAISONS ===")
    try:
        page.click("text=Livraisons")
        page.wait_for_timeout(2000)
    except:
        pass
    liv_html = page.evaluate("document.body.innerText")
    has_liv = "facture" in liv_html.lower() or "Aucune" in liv_html or "Livraison" in liv_html
    check("livraisons tab loads", has_liv)
    
    print(f"\n{'='*50}")
    total = len(results)
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    print(f"RESULTS: {passed}/{total} PASS, {failed}/{total} FAIL")
    
    if failed > 0:
        print("\nFAILURES:")
        for r in results:
            if r[0] == "FAIL":
                print(f"  - {r[1]}: {r[2]}")
    
    browser.close()

sys.exit(1 if failed > 0 else 0)
