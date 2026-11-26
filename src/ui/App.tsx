import { useCallback, useEffect, useMemo, useState } from 'react'
import { createApi, detectOnline } from '../online/api'
import type { Platform } from '../platform/telegram'
import { DuelScreen } from './DuelScreen'
import { DuelsScreen } from './DuelsScreen'
import { Home } from './Home'
import { Practice } from './Practice'
import { detectLang, STRINGS, type Lang } from './strings'

type Screen = { name: 'home' } | { name: 'practice' } | { name: 'duels' } | { name: 'duel'; id: string }

function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)'
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setR(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return r
}

function initialLang(platform: Platform): Lang {
  try {
    const saved = localStorage.getItem('sd.lang')
    if (saved === 'en' || saved === 'ru') return saved
  } catch {
    /* storage unavailable */
  }
  return detectLang(platform.langHint)
}

export function App({ platform }: { platform: Platform }) {
  const [screen, setScreen] = useState<Screen>(() =>
    platform.startDuelId ? { name: 'duel', id: platform.startDuelId } : { name: 'home' },
  )
  const [lang, setLangState] = useState<Lang>(() => initialLang(platform))
  const [online, setOnline] = useState(false)
  const [challenging, setChallenging] = useState(false)
  const [homeError, setHomeError] = useState<string | null>(null)
  const reducedMotion = useReducedMotion()
  const t = STRINGS[lang]
  const api = useMemo(() => createApi(platform.initData), [platform.initData])

  useEffect(() => {
    void detectOnline(platform.inTelegram, platform.initData).then(setOnline)
  }, [platform])

  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('sd.lang', l)
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const goHome = useCallback(() => setScreen({ name: 'home' }), [])
  const goDuels = useCallback(() => setScreen(online ? { name: 'duels' } : { name: 'home' }), [online])
  const openDuel = useCallback((id: string) => setScreen({ name: 'duel', id }), [])

  const challenge = useCallback(async () => {
    if (challenging) return
    setChallenging(true)
    setHomeError(null)
    try {
      await platform.requestWriteAccess() // opt-in for "твой бросок" messages
      const r = await api.create()
      const me = r.duel.players[0]
      await platform.share(r.prepared, r.duel.link, t.shareText(me.name))
      setScreen({ name: 'duel', id: r.duel.id })
    } catch (e) {
      setHomeError(e instanceof Error ? e.message : String(e))
    } finally {
      setChallenging(false)
    }
  }, [api, challenging, platform, t])

  return (
    <div className={`app ${platform.inTelegram ? 'tg' : 'browser'}`}>
      {screen.name === 'home' && (
        <Home
          t={t}
          lang={lang}
          online={online}
          inTelegram={platform.inTelegram}
          challenging={challenging}
          error={homeError}
          onLang={setLang}
          onPractice={() => setScreen({ name: 'practice' })}
          onChallenge={challenge}
          onDuels={() => setScreen({ name: 'duels' })}
        />
      )}
      {screen.name === 'practice' && (
        <Practice t={t} lang={lang} platform={platform} reducedMotion={reducedMotion} onHome={goHome} />
      )}
      {screen.name === 'duels' && (
        <DuelsScreen
          api={api}
          t={t}
          platform={platform}
          challenging={challenging}
          onChallenge={challenge}
          onOpen={openDuel}
          onBack={goHome}
        />
      )}
      {screen.name === 'duel' && (
        <DuelScreen
          key={screen.id}
          id={screen.id}
          api={api}
          t={t}
          platform={platform}
          reducedMotion={reducedMotion}
          onBack={online ? goDuels : goHome}
          onOpen={openDuel}
        />
      )}
    </div>
  )
}
