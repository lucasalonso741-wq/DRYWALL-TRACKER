#!/usr/bin/env python3
import os
import time
import re
from playwright.sync_api import sync_playwright

DOWNLOAD_DIR = "/home/user/DRYWALL-TRACKER/provident_invoices"
CHROME_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
EMAIL = "Mandy@aadrywallconstruction.com"
PASSWORD = "Miamiwahoo123$"
LOGIN_URL = "https://www.termsync.com"

INVOICE_NUMBERS = [
    "5476107-00","5476106-00","5476105-00","5476104-00","5476108-00",
    "5476134-00","5476136-00","5476141-00","5476138-00","5476137-00",
    "5476139-00","5476135-00","8600932-00","8600918-00","8600960-00",
    "8601002-00","8601124-00","8601145-00","8601104-00","8601108-00",
    "8601142-00","8601129-00","8601115-00","8601155-00","8601123-00",
    "8601114-00","8601133-00","8601111-00","8601135-00","8601148-00",
    "8601130-00","8601140-00","8601154-00","8601116-00","8601157-00",
    "8601151-00","8601127-00","8601141-00","8601107-00","8601126-00",
    "8601152-00","8601120-00","8601149-00","8601122-00","8601125-00",
    "8601136-00","8601139-00","8601132-00","8601147-00","8601109-00",
    "8601156-00","8601112-00","8601128-00","8601144-00","8601118-00",
    "8601146-00","8601150-00","8601119-00","8601143-00","8601121-00",
    "8601138-00","8601158-00","8601113-00","8601117-00","8601131-00",
    "8601137-00","8601134-00","8601153-00","8601236-00","8601235-00",
    "8601246-00","8601250-00","8601247-00","8601249-00","8601280-00",
    "8601281-00","8601274-00","8601279-00","8601277-00","8601273-00",
    "8601278-00","8601275-00","8601299-00","8601314-00","8601348-00",
    "8601359-00","8601344-00","8601361-00","8601375-00","8601345-00",
    "8601379-00","8601355-00","8601346-00","8601363-00","8601360-00",
    "8601380-00","8601373-00","8601354-00","8601369-00","8601362-00",
    "8601356-00","8601374-00","8601358-00","8601352-00","8601372-00",
    "8601365-00","8601370-00","8601357-00","8601353-00","8601364-00",
    "8601351-00","8601347-00","8601350-00","8601343-00","8601371-00",
    "8601341-00","8601415-00","8601413-00","8601433-00","8601414-00",
    "8601405-00","8601401-00","8601402-00","8601438-00","8601424-00",
    "8601428-00","8601426-00","8601427-00","8601432-00","8601431-00",
    "8601437-00","8601435-00","8601429-00","8601439-00","8601425-00",
    "8601430-00","8601436-00","8601440-00","8601423-00","8601434-00",
    "8601507-00","8601517-00","8601562-00","8601576-00","8601592-00",
    "8601630-00","8601631-00","8601608-00","8601633-00","8601605-00",
    "8601607-00","8601636-00","8601632-00","8601635-00","8601656-00",
    "8601763-00","8601734-00","8601739-00","8601737-00","8601735-00",
    "8601736-00","8601740-00","8601770-00","8601898-00","8601897-00",
    "8601896-00","8601989-00","8601966-00","8601948-00","8601969-00",
    "8601943-00","8601964-00","8601963-00","8601949-00","8601985-00",
    "8601950-00","8601987-00","8601947-00","8601967-00","8601983-00",
    "8601965-00","8601970-00","8601971-00","8601986-00","8601968-00",
    "8601923-00","8601928-00","8601930-00","8601926-00","8601925-00",
    "8601941-00","8601937-00","8602020-00","8601924-00","8601927-00",
    "8601938-00","8601934-00","8601900-00","8601942-00","8601929-00",
    "8601935-00","8601933-00","8601940-00","8602042-00","8602088-00",
    "8602087-00","8602132-00","8602129-00","8602125-00","8602126-00",
    "8602123-00","8602131-00","8602121-00","8602128-00","8602120-00",
    "8602127-00","8602130-00","8602122-00","8602124-00","8602134-00",
    "8602133-00","8602181-00","8602211-00","8602230-00","8602253-00",
    "8602282-00","8602315-00","8602280-00","8602277-00","8602261-00",
    "8602313-00","8602274-00","8602287-00","8602289-00","8602278-00",
    "8602275-00","8602288-00","8602409-00","8602276-00","8602286-00",
    "8602383-00","8602290-00","8602285-00","8602281-00","8602283-00",
    "8602284-00","8602364-00","8602307-00","8601931-00","8602424-00",
    "8602363-00","8602368-00","8602365-00","8602371-00","8602361-00",
    "8602279-00","8602362-00","8602375-00","8602298-00","8602373-00",
    "8602304-00","8602299-00","8602372-00","8602402-00","8602370-00",
    "8602303-00","8602376-00","8602367-00","8602369-00","8602414-00",
    "8602389-00","8602366-00","8602390-00","8602413-00","8602302-00",
    "8602301-00","8602392-00","8602391-00","8602450-00","8602118-00",
    "8602412-00","8602387-00","8602297-00","8602296-00","8602449-00",
    "8602399-00","8602466-00","8602525-00","8602526-00","8602543-00",
    "8602605-00","8602611-00","8602634-00","8602612-00","8602653-00",
    "8602651-00","8602751-00","8602727-00","8602819-00","8602885-00",
    "8602856-00","8602915-00","8602916-00","8602924-00","8602935-00",
    "8602969-00","8602934-00","8602984-00",
]

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

already_done = {
    f.replace(".pdf", "")
    for f in os.listdir(DOWNLOAD_DIR)
    if f.endswith(".pdf")
}

todo = [inv for inv in INVOICE_NUMBERS if inv not in already_done]
print(f"Total invoices: {len(INVOICE_NUMBERS)}, already downloaded: {len(already_done)}, remaining: {len(todo)}")

failed = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=CHROME_PATH,
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()

    # --- Login ---
    print("Navigating to login page...")
    page.goto(LOGIN_URL, wait_until="networkidle", timeout=60000)
    page.screenshot(path="/tmp/step1_login.png")
    print(f"Title: {page.title()}, URL: {page.url}")

    # Fill login form - try common selectors
    try:
        page.fill('input[type="email"], input[name="email"], input[name="username"], input[id*="email"], input[placeholder*="email" i]', EMAIL)
        page.fill('input[type="password"]', PASSWORD)
        page.screenshot(path="/tmp/step2_filled.png")
        page.click('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")')
        page.wait_for_load_state("networkidle", timeout=30000)
        page.screenshot(path="/tmp/step3_after_login.png")
        print(f"After login - Title: {page.title()}, URL: {page.url}")
    except Exception as e:
        print(f"Login error: {e}")
        page.screenshot(path="/tmp/login_error.png")
        browser.close()
        exit(1)

    # --- Download each invoice ---
    for i, inv_num in enumerate(todo):
        print(f"[{i+1}/{len(todo)}] Downloading invoice {inv_num}...")
        dest_path = os.path.join(DOWNLOAD_DIR, f"{inv_num}.pdf")

        try:
            # Search for the invoice
            # Try navigating to a search/invoice page
            # First let's look at what the page looks like after login
            if i == 0:
                print(f"Current URL: {page.url}")
                # Try to find a search box or invoice list
                page.screenshot(path="/tmp/step4_dashboard.png")

            # Common pattern: search for invoice number
            search_selectors = [
                'input[placeholder*="search" i]',
                'input[placeholder*="invoice" i]',
                'input[type="search"]',
                '#search',
                '.search-input',
            ]
            searched = False
            for sel in search_selectors:
                if page.locator(sel).count() > 0:
                    page.fill(sel, inv_num)
                    page.keyboard.press("Enter")
                    page.wait_for_load_state("networkidle", timeout=15000)
                    searched = True
                    break

            if not searched:
                # Try URL-based navigation
                # Check if there's a specific URL pattern for invoices
                current_url = page.url
                base = re.match(r'(https?://[^/]+)', current_url).group(1)
                page.goto(f"{base}/invoices?search={inv_num}", wait_until="networkidle", timeout=15000)

            if i == 0:
                page.screenshot(path="/tmp/step5_search.png")

            # Find and click the PDF download link
            pdf_selectors = [
                f'a[href*="{inv_num}"]',
                f'a:has-text("{inv_num}")',
                'a[href*=".pdf"]',
                'a:has-text("PDF")',
                'a:has-text("Download")',
                'button:has-text("PDF")',
                'button:has-text("Download")',
            ]

            downloaded = False
            for sel in pdf_selectors:
                try:
                    loc = page.locator(sel).first
                    if loc.count() > 0 or True:
                        with page.expect_download(timeout=30000) as dl_info:
                            loc.click()
                        download = dl_info.value
                        download.save_as(dest_path)
                        print(f"  -> Saved via selector '{sel}'")
                        downloaded = True
                        break
                except Exception:
                    continue

            if not downloaded:
                if i == 0:
                    page.screenshot(path="/tmp/step5b_not_found.png")
                print(f"  -> Could not find download link for {inv_num}")
                failed.append(inv_num)

        except Exception as e:
            print(f"  -> Error for {inv_num}: {e}")
            failed.append(inv_num)

        time.sleep(0.5)

    browser.close()

print(f"\nDone. Downloaded: {len(todo) - len(failed)}, Failed: {len(failed)}")
if failed:
    print("Failed invoices:", failed[:20])
