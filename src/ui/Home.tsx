import { useState } from 'react'
import { ART } from '../assets/manifest'
import { RulesOverlay } from './Overlays'
import type { Lang, Strings } from './strings'

interface Props {
  t: Strings
  lang: Lang
  onLang(l: Lang): void
  onPractice(): void
}

export function Home({ t, lang, onLang, onPractice }: Props) {
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
        <button className="btn primary big" onClick={onPractice} data-testid="practice">
          ▶ {t.practice}
          <small>{t.practiceSub}</small>
        </button>
        <button className="btn dark" onClick={() => setRules(true)}>
          {t.rules}
        </button>
        <button className="btn dark" disabled>
          {t.online} <em>· {t.soon}</em>
        </button>
        <div className="location-card">
          <span className="pin">📍</span> {t.location}
        </div>
        <p className="disclaimer">{t.disclaimer}</p>
      </nav>
      {rules && <RulesOverlay t={t} onClose={() => setRules(false)} />}
    </div>
  )
}
