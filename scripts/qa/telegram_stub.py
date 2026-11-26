import json
from playwright.sync_api import sync_playwright
STUB = """
window.__calls=[];const c=(n)=>(...a)=>window.__calls.push(n+(a.length?':'+JSON.stringify(a):''));
window.Telegram={WebApp:{version:'8.0',platform:'ios',initData:'x',initDataUnsafe:{user:{language_code:'ru'}},
safeAreaInset:{top:47,bottom:34,left:0,right:0},contentSafeAreaInset:{top:46,bottom:0,left:0,right:0},
ready:c('ready'),expand:c('expand'),isVersionAtLeast:(v)=>parseFloat(v)<=8.0,setHeaderColor:c('header'),setBackgroundColor:c('bg'),
setBottomBarColor:c('bottombar'),disableVerticalSwipes:c('noswipe'),onEvent:c('on'),offEvent:c('off'),
HapticFeedback:{impactOccurred:c('haptic'),notificationOccurred:c('notify')},
BackButton:{show:c('back.show'),hide:c('back.hide'),onClick:c('back.onClick'),offClick:c('back.off')}}};
"""
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844})
    ctx.add_init_script(STUB)
    pg=ctx.new_page(); reqs=[]; pg.on('request',lambda r:reqs.append(r.url))
    pg.goto('http://localhost:4173/#tgWebAppPlatform=ios&tgWebAppVersion=8.0'); pg.wait_for_timeout(800)
    top=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-top')")
    lang=pg.evaluate("document.documentElement.lang")
    pg.click('[data-testid=practice]'); pg.wait_for_timeout(500); pg.click('[data-testid=primary]'); pg.wait_for_timeout(1500)
    pg.screenshot(path='docs/qa-screenshots/390x844_08_telegram_safearea.png')
    calls=pg.evaluate("window.__calls")
    print('tg', json.dumps(dict(safeTop=top, lang=lang, calls=sorted(set(c.split(':')[0] for c in calls)), external=[u for u in reqs if 'localhost' not in u and not u.startswith('blob')])))
    ctx.close()
    # reduced motion + browser (no tg) + hidden-tab pause
    ctx=b.new_context(viewport={'width':360,'height':640}, reduced_motion='reduce'); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:4173/'); pg.wait_for_timeout(500)
    tg=pg.evaluate("!!window.Telegram")
    pg.click('[data-testid=practice]'); pg.wait_for_timeout(400)
    pg.click('[data-testid=primary]'); pg.wait_for_timeout(450)
    landed = pg.locator('[data-testid=primary]').inner_text()
    print('rm', json.dumps(dict(telegramLoaded=tg, afterRoll=landed, errors=errs)))
    b.close()
