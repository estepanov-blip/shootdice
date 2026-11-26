import { useState } from 'react'
import { ART } from '../assets/manifest'
import { Crown, Logo } from './art'
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
      <img className="home-hero" src={ART.charPlayer.url} alt="" />
      <div className="home-top">
        <button className="lang-btn" onClick={() => onLang(lang === 'en' ? 'ru' : 'en')} aria-label="Language">
          {lang === 'en' ? 'RU' : 'EN'}
        </button>
      </div>
      <Logo tagline={t.tagline} />
      <nav className="home-menu">
        {online ? (
          <>
            <button className="btn torn primary big" onClick={onChallenge} disabled={challenging} data-testid="challenge">
              <Crown className="btn-crown" />
              <span className="btn-main">▶ {challenging ? t.sending : t.challenge}</span>
              <small>{t.challengeSub}</small>
            </button>
            <div className="row2">
              <button className="btn torn dark" onClick={onDuels} data-testid="duels">
                {t.myDuels}
              </button>
              <button className="btn torn dark" onClick={onPractice} data-testid="practice">
                {t.practice}
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="btn torn primary big" onClick={onPractice} data-testid="practice">
              <Crown className="btn-crown" />
              <span className="btn-main">▶ {t.practice}</span>
              <small>{t.practiceSub}</small>
            </button>
            {!inTelegram && (
              <button className="btn torn dark" disabled>
                {t.online} <em>· {t.duelsInTelegram}</em>
              </button>
            )}
          </>
        )}
        {error && <p className="panel-error">{error}</p>}
        <div className="home-bottom">
          <button className="btn torn dark small" onClick={() => setRules(true)}>
            {t.rules}
          </button>
          <div className="polaroid" aria-label={t.location}>
            <img src={ART.background.url} alt="" />
            <span className="polaroid-label">📍 {t.location}</span>
          </div>
        </div>
        <p className="disclaimer">{t.disclaimer}</p>
      </nav>
      {rules && <RulesOverlay t={t} onClose={() => setRules(false)} />}
    </div>
  )
}
