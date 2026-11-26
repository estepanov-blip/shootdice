import { useState } from 'react'
import { ART } from '../assets/manifest'
import { RulesOverlay } from './Overlays'
import type { Lang, Strings } from './strings'

interface Props {
  t: Strings
  lang: Lang
  online: boolean
  inTelegram: boolean
  challenging: boolean
  error: string | null
  onLang(l: Lang): void
  onPractice(): void
  onChallenge(): void
  onDuels(): void
}

export function Home({ t, lang, online, inTelegram, challenging, error, onLang, onPractice, onChallenge, onDuels }: Props) {
  const [rules, setRules] = useState(false)
  return (
    <div className="screen home" style={{ backgroundImage: `url(${ART.background.url})` }}>
      <div className="home-top">
        <button className="lang-btn" onClick={() => onLang(lang === 'en' ? 'ru' : 'en')} aria-label="Language">
          {lang === 'en' ? 'RU' : 'EN'}
        </button>
      </div>
      <div className="logo" aria-label="Shoot Dice">
        <div className="logo-shoot">SHOOT</div>
        <div className="logo-dice">DICE</div>
        <div className="logo-tag">{t.tagline}</div>
      </div>
      <img className="home-hero" src={ART.charPlayer.url} alt="" />
      <nav className="home-menu">
        {online ? (
          <>
            <button className="btn primary big" onClick={onChallenge} disabled={challenging} data-testid="challenge">
              🎲 {challenging ? t.sending : t.challenge}
              <small>{t.challengeSub}</small>
            </button>
            <div className="row2">
              <button className="btn dark" onClick={onDuels} data-testid="duels">
                {t.myDuels}
              </button>
              <button className="btn dark" onClick={onPractice} data-testid="practice">
                {t.practice}
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="btn primary big" onClick={onPractice} data-testid="practice">
              ▶ {t.practice}
              <small>{t.practiceSub}</small>
            </button>
            {!inTelegram && (
              <button className="btn dark" disabled>
                {t.online} <em>· {t.duelsInTelegram}</em>
              </button>
            )}
          </>
        )}
        {error && <p className="panel-error">{error}</p>}
        <button className="btn dark" onClick={() => setRules(true)}>
          {t.rules}
        </button>
        <p className="disclaimer">{t.disclaimer}</p>
      </nav>
      {rules && <RulesOverlay t={t} onClose={() => setRules(false)} />}
    </div>
  )
}
