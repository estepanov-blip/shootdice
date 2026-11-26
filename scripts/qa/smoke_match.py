import sys, time, json
from playwright.sync_api import sync_playwright
out = sys.argv[1]
URL = 'http://localhost:4173/'
log = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for (w,h,tag,lang) in [(360,640,'360x640','en'),(390,844,'390x844','ru')]:
        ctx = b.new_context(viewport={'width':w,'height':h}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ru-RU' if lang=='ru' else 'en-US')
        pg = ctx.new_page()
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        reqs=[]
        pg.on('request', lambda r: reqs.append(r.url))
        pg.goto(URL); pg.wait_for_timeout(800)
        pg.screenshot(path=f'{out}/{tag}_01_home.png')
        pg.click('[data-testid=practice]'); pg.wait_for_timeout(1200)
        pg.screenshot(path=f'{out}/{tag}_02_round_intro.png')
        shots = {'point':False,'roundEnd':False,'bot':False}
        clicks=0
        for i in range(400):
            btn = pg.locator('[data-testid=primary]')
            if pg.locator('[data-testid=results-title]').count():
                break
            label = btn.inner_text().lower()
            dis = btn.is_disabled()
            banner = pg.locator('[data-testid=banner]').inner_text() if pg.locator('[data-testid=banner]').count() else ''
            puck_on = pg.locator('.point-puck.on').count()>0
            if puck_on and not shots['point'] and not dis:
                pg.screenshot(path=f'{out}/{tag}_03_point.png'); shots['point']=True
            if dis and not shots['bot'] and ('lou' in label or 'лу' in label):
                pg.screenshot(path=f'{out}/{tag}_04_bot_turn.png'); shots['bot']=True
            if not dis:
                if (('next' in label) or ('следующий' in label)) and not shots['roundEnd']:
                    pg.screenshot(path=f'{out}/{tag}_05_round_end.png'); shots['roundEnd']=True
                if 'throw' in label or 'бросить' in label:
                    # double tap: must not duplicate
                    btn.dblclick(); clicks+=1
                else:
                    btn.click()
            pg.wait_for_timeout(250)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{out}/{tag}_06_results.png')
        ps = int(pg.locator('[data-testid=score-player]').inner_text()); bs=int(pg.locator('[data-testid=score-bot]').inner_text())
        rows = pg.locator('.rl-row').count()
        title = pg.locator('[data-testid=results-title]').inner_text()
        # rules overlay + replay
        pg.click('[data-testid=again]'); pg.wait_for_timeout(600)
        ps2 = pg.locator('[data-testid=score-player]').inner_text(); bs2=pg.locator('[data-testid=score-bot]').inner_text()
        pg.click('button[aria-label="Rules"], button[aria-label="Правила"]'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'{out}/{tag}_07_rules.png')
        # touch target check
        small = pg.evaluate("""() => [...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&(r.width<44||r.height<44)}).map(b=>b.outerHTML.slice(0,60))""")
        external = [u for u in reqs if not u.startswith('http://localhost')]
        log.append(dict(size=tag, final=[ps,bs], sum_ok=(ps+bs==300), rounds=rows, title=title, replay=[ps2,bs2], throws=clicks, shots=shots, errors=errs, small_buttons=small, external=external))
        ctx.close()
    b.close()
print(json.dumps(log, ensure_ascii=False, indent=1))
