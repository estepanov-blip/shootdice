"""UI end-to-end duel: two fake Telegram users in two browser contexts play a full game.

Same setup as duel_api_e2e.py (wrangler dev on :8787 + mock Bot API on :8788).
Usage: python3 -I scripts/qa/duel_ui_e2e.py http://127.0.0.1:8787 /tmp/tg-mock.jsonl docs/qa-screenshots/duel
"""
import hashlib, hmac, json, sys, time, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE, MOCK_LOG, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
TOKEN = "123456:TEST-token"
CHAT = "-4242" + str(int(time.time()))


def init_data(user, start_param=None):
    fields = {"user": json.dumps(user, ensure_ascii=False, separators=(",", ":")), "auth_date": str(int(time.time())),
              "chat_instance": CHAT, "chat_type": "group"}
    if start_param:
        fields["start_param"] = start_param
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(fields)


def fake_tg(init, user, start_param=None):
    return """
    window.__tg = { shared: [], write: 0 };
    window.Telegram = { WebApp: {
      initData: %s, platform: 'ios', version: '9.0',
      initDataUnsafe: { start_param: %s, user: Object.assign(%s, { language_code: 'ru', allows_write_to_pm: false }) },
      safeAreaInset: {top:0,bottom:0,left:0,right:0}, contentSafeAreaInset: {top:0,bottom:0,left:0,right:0},
      ready(){}, expand(){}, disableVerticalSwipes(){}, setHeaderColor(){}, setBackgroundColor(){}, setBottomBarColor(){},
      isVersionAtLeast(){ return true; }, onEvent(){}, offEvent(){},
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){} },
      BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
      shareMessage(id, cb){ window.__tg.shared.push(id); setTimeout(() => cb && cb(true), 50); },
      openTelegramLink(u){ window.__tg.shared.push(u); },
      requestWriteAccess(cb){ window.__tg.write++; cb && cb(true); },
    } };
    """ % (json.dumps(init), json.dumps(start_param), json.dumps(user, ensure_ascii=False))


def try_click(loc):
    try:
        loc.click(timeout=2000)
    except Exception:
        pass


A = {"id": 5001, "first_name": "Саня"}
B = {"id": 6002, "first_name": "Кирилл"}
errors, report = [], {}

with sync_playwright() as p:
    br = p.chromium.launch()

    def page_for(user, start_param=None, size=(390, 844)):
        ctx = br.new_context(viewport={"width": size[0], "height": size[1]}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.add_init_script(fake_tg(init_data(user, start_param), user, start_param))
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"{user['first_name']}: {e}"))
        pg.on("console", lambda m: errors.append(f"{user['first_name']} console: {m.text}") if m.type == "error" else None)
        pg.goto(BASE + "/#tgWebAppPlatform=ios&tgWebAppVersion=9.0")
        return pg

    a = page_for(A)
    a.wait_for_selector("[data-testid=challenge]", timeout=10000)
    a.screenshot(path=OUT / "01_home_online.jpg", quality=80)
    a.click("[data-testid=challenge]")
    a.wait_for_selector("[data-testid=share]", timeout=10000)
    report["shared"] = a.evaluate("window.__tg.shared")
    report["write_access_asked"] = a.evaluate("window.__tg.write")
    a.screenshot(path=OUT / "02_waiting.jpg", quality=80)
    duel_id = report["shared"][0].replace("prep-", "")

    b = page_for(B, "d_" + duel_id, (360, 640))
    b.wait_for_selector("[data-testid=accept]", timeout=10000)
    b.screenshot(path=OUT / "03_challenged.jpg", quality=80)
    b.click("[data-testid=accept]")
    b.wait_for_selector("[data-testid=primary]", timeout=10000)
    a.wait_for_selector("[data-testid=primary]", timeout=10000)  # A's waiting screen turns into the game by polling

    shots = {"my_turn": False, "their_turn": False, "round_end": False, "point": False}
    taps = 0
    deadline = time.time() + 180
    while time.time() < deadline:
        done = [pg.locator("[data-testid=results-title]").count() > 0 for pg in (a, b)]
        if all(done):
            break
        acted = False
        for name, pg in (("a", a), ("b", b)):
            if pg.locator("[data-testid=results-title]").count():
                continue
            btn = pg.locator("[data-testid=primary]")
            if not btn.count():
                continue
            label = btn.inner_text().lower()
            if btn.is_disabled():
                if not shots["their_turn"] and ("бросает" in label):
                    pg.screenshot(path=OUT / "05_their_turn.jpg", quality=80)
                    shots["their_turn"] = True
                continue
            if "дальше" in label:
                if not shots["round_end"]:
                    pg.screenshot(path=OUT / "06_round_end.jpg", quality=80)
                    shots["round_end"] = True
                try_click(btn)
                acted = True
            elif "бросить" in label:
                if not shots["my_turn"]:
                    pg.screenshot(path=OUT / "04_my_turn.jpg", quality=80)
                    shots["my_turn"] = True
                if pg.locator(".point-puck.on").count() and not shots["point"]:
                    pg.screenshot(path=OUT / "07_point.jpg", quality=80)
                    shots["point"] = True
                try:
                    btn.dblclick(timeout=2000)  # double tap must not roll twice
                except Exception:
                    pass
                taps += 1
                acted = True
            elif "итоги" in label:
                try_click(btn)
                acted = True
        time.sleep(0.35 if acted else 0.6)

    a.wait_for_timeout(1500)
    b.wait_for_timeout(1500)
    a.screenshot(path=OUT / "08_result_a.jpg", quality=80)
    b.screenshot(path=OUT / "09_result_b.jpg", quality=80)

    def scores(pg):
        nums = pg.locator(".rs-num").all_inner_texts()
        return [int(x) for x in nums]

    report["title_a"] = a.locator("[data-testid=results-title]").inner_text() if a.locator("[data-testid=results-title]").count() else None
    report["title_b"] = b.locator("[data-testid=results-title]").inner_text() if b.locator("[data-testid=results-title]").count() else None
    report["scores_a"] = scores(a) if report["title_a"] else None
    report["scores_b"] = scores(b) if report["title_b"] else None
    report["taps"] = taps
    report["shots"] = shots

    # rematch: A asks, B sees the note
    a.click("[data-testid=rematch]")
    a.wait_for_selector("[data-testid=primary]", timeout=10000)
    b.wait_for_selector("[data-testid=rematch-note]", timeout=15000)
    b.screenshot(path=OUT / "10_rematch_note.jpg", quality=80)
    report["rematch_note"] = True

    # my duels + chat champion (A)
    a.click("button[aria-label='Мои дуэли']")
    a.wait_for_selector("[data-testid=board]", timeout=10000)
    a.wait_for_timeout(500)
    a.screenshot(path=OUT / "11_my_duels.jpg", quality=80)
    report["duel_rows"] = a.locator("[data-testid=duel-row]").count()
    report["board_rows"] = a.locator(".board-list li").count()

    # surrender in the rematch (A)
    a.locator("[data-testid=duel-row]").first.click()
    a.wait_for_selector("[data-testid=primary]", timeout=10000)
    a.click("button[aria-label='Правила']")
    a.click("[data-testid=surrender]")
    a.screenshot(path=OUT / "12_surrender_confirm.jpg", quality=80)
    a.click("[data-testid=surrender-yes]")
    a.wait_for_selector("[data-testid=results-title]", timeout=10000)
    report["surrender_title_a"] = a.locator("[data-testid=results-title]").inner_text()
    b.wait_for_timeout(300)
    br.close()

report["errors"] = errors
print(json.dumps(report, ensure_ascii=False, indent=1))
ok = (
    report["title_a"] and report["title_b"] and report["title_a"] != report["title_b"]
    and report["scores_a"] and sum(report["scores_a"]) == 300 and report["scores_a"] == report["scores_b"][::-1]
    and report["write_access_asked"] >= 1 and not errors
)
print("UI E2E:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
