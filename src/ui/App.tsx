import { useCallback, useEffect, useState } from 'react'
import type { Platform } from '../platform/telegram'
import { Home } from './Home'
import { Practice } from './Practice'
import { detectLang, STRINGS, type Lang } from './strings'

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
  const [screen, setScreen] = useState<'home' | 'practice'>('home')
  const [lang, setLangState] = useState<Lang>(() => initialLang(platform))
  const reducedMotion = useReducedMotion()
  const t = STRINGS[lang]

  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('sd.lang', l)
    } catch {
      /* ignore */
    }
  }
  const goHome = useCallback(() => setScreen('home'), [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className={`app ${platform.inTelegram ? 'tg' : 'browser'}`}>
      {screen === 'home' ? (
        <Home t={t} lang={lang} onLang={setLang} onPractice={() => setScreen('practice')} />
      ) : (
        <Practice t={t} lang={lang} platform={platform} reducedMotion={reducedMotion} onHome={goHome} />
      )}
    </div>
  )
}
