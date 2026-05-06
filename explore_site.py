#!/usr/bin/env python3
"""Explore termsync.com login flow and invoice page structure."""
import time
from playwright.sync_api import sync_playwright

CHROME_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
EMAIL = "Mandy@aadrywallconstruction.com"
PASSWORD = "Miamiwahoo123$"
LOGIN_URL = "https://www.termsync.com"

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=CHROME_PATH,
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )
    context = browser.new_context(accept_downloads=True, ignore_https_errors=True)
    page = context.new_page()

    print("=== Step 1: Load homepage ===")
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    time.sleep(5)
    page.screenshot(path="/tmp/explore_1_home.png")
    print(f"URL: {page.url}")
    print(f"Title: {page.title()}")
    print(f"Body HTML (first 2000): {page.content()[:2000]}")

    # Print all inputs
    inputs = page.locator("input").all()
    print(f"Inputs found: {len(inputs)}")
    for inp in inputs:
        print(f"  type={inp.get_attribute('type')} name={inp.get_attribute('name')} id={inp.get_attribute('id')} placeholder={inp.get_attribute('placeholder')}")

    # Print all buttons
    buttons = page.locator("button").all()
    print(f"Buttons found: {len(buttons)}")
    for btn in buttons:
        print(f"  text={btn.inner_text()[:50]!r} type={btn.get_attribute('type')}")

    print("\n=== Step 2: Try filling login form ===")
    # Try email field
    email_filled = False
    for sel in ['input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                'input[id="email"]', 'input[placeholder*="email" i]', 'input[placeholder*="user" i]']:
        try:
            if page.locator(sel).count() > 0:
                page.fill(sel, EMAIL)
                print(f"Filled email with selector: {sel}")
                email_filled = True
                break
        except Exception as e:
            pass

    if not email_filled:
        print("Could not find email field!")

    # Try password field
    pw_filled = False
    for sel in ['input[type="password"]', 'input[name="password"]']:
        try:
            if page.locator(sel).count() > 0:
                page.fill(sel, PASSWORD)
                print(f"Filled password with selector: {sel}")
                pw_filled = True
                break
        except Exception as e:
            pass

    if not pw_filled:
        print("Could not find password field!")

    page.screenshot(path="/tmp/explore_2_filled.png")

    if email_filled and pw_filled:
        print("\n=== Step 3: Submit login ===")
        for sel in ['button[type="submit"]', 'input[type="submit"]',
                    'button:has-text("Sign in")', 'button:has-text("Log in")',
                    'button:has-text("Login")', 'button:has-text("Sign In")']:
            try:
                if page.locator(sel).count() > 0:
                    print(f"Clicking: {sel}")
                    page.click(sel)
                    break
            except Exception:
                pass

        page.wait_for_load_state("networkidle", timeout=30000)
        page.screenshot(path="/tmp/explore_3_after_login.png")
        print(f"After login URL: {page.url}")
        print(f"After login title: {page.title()}")

        # Print page links
        links = page.locator("a").all()
        print(f"\nLinks on page ({len(links)} total), first 20:")
        for lnk in links[:20]:
            href = lnk.get_attribute("href") or ""
            text = lnk.inner_text()[:40].strip()
            print(f"  [{text!r}] -> {href}")

        # Check for invoice search
        print("\nSearching for invoice-related elements...")
        for sel in ['input[placeholder*="search" i]', 'input[placeholder*="invoice" i]',
                    'input[type="search"]', '#search', '.search']:
            count = page.locator(sel).count()
            if count > 0:
                print(f"  Found search input: {sel} (count={count})")

        # Try to navigate to invoices page
        print("\n=== Step 4: Try invoice navigation ===")
        for path in ["/invoices", "/invoice", "/documents", "/payments"]:
            try:
                base = page.url.split("/")[0] + "//" + page.url.split("/")[2]
                page.goto(base + path, wait_until="networkidle", timeout=15000)
                print(f"Navigated to {base + path} -> {page.url} (title: {page.title()})")
                page.screenshot(path=f"/tmp/explore_4{path.replace('/', '_')}.png")
                if page.url != LOGIN_URL and "login" not in page.url.lower():
                    print("  Seems like a valid page!")
                    links = page.locator("a").all()
                    print(f"  Links: {len(links)}")
                    for lnk in links[:10]:
                        href = lnk.get_attribute("href") or ""
                        text = lnk.inner_text()[:40].strip()
                        print(f"    [{text!r}] -> {href}")
                    break
            except Exception as e:
                print(f"  Error: {e}")

    browser.close()
    print("\nDone exploring. Check screenshots in /tmp/explore_*.png")
