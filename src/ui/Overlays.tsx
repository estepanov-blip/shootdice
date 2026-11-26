import { useEffect, useRef } from 'react'
import { matchOutcome, type MatchState } from '../game/rules'
import type { Strings } from './strings'

export function RulesOverlay({ t, onClose }: { t: Strings; onClose(): void }) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    btn.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="sheet paper">
        <h2 id="rules-title">{t.rulesTitle}</h2>
        <ol className="rules-list">
          {t.rulesBody.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <div className="dice-legend">
          <span className="tag win">7 · 11</span>
          <span className="tag lose">2 · 3 · 12</span>
          <span className="tag point">4 5 6 8 9 10</span>
        </div>
        <button ref={btn} className="btn primary" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  )
}

interface ResultsProps {
  t: Strings
  botName: string
  match: MatchState
  onAgain(): void
  onHome(): void
}

export function ResultsOverlay({ t, botName, match, onAgain, onHome }: ResultsProps) {
  const o = matchOutcome(match)
  const again = useRef<HTMLButtonElement>(null)
  useEffect(() => again.current?.focus(), [])
  if (!o) return null
  const title = o.draw ? t.draw : o.winner === 'player' ? t.win : t.lose
  const tone = o.draw ? 'draw' : o.winner === 'player' ? 'win' : 'lose'
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className={`sheet results ${tone}`}>
        <h2 id="results-title" className="results-title" data-testid="results-title">
          {title}
        </h2>
        <div className="results-score">
          <div>
            <div className="rs-name">{t.you}</div>
            <div className="rs-num">{o.scores.player}</div>
          </div>
          <div className="rs-sep">:</div>
          <div>
            <div className="rs-name">{botName}</div>
            <div className="rs-num">{o.scores.bot}</div>
          </div>
        </div>
        <div className="rounds-log">
          <div className="rl-title">{t.roundsLog}</div>
          {match.rounds.map((r) => (
            <div key={r.round} className={`rl-row ${r.winner === 'player' ? 'w' : 'l'}`}>
              <span>#{r.round}</span>
              <span>{t.shooter(r.shooter, botName)}</span>
              <span>
                {t.kindBanner(r.kind, r.point).replace('!', '')}
              </span>
              <span>{r.winner === 'player' ? '+100' : '—'}</span>
            </div>
          ))}
        </div>
        <div className="results-actions">
          <button ref={again} className="btn primary" onClick={onAgain} data-testid="again">
            {t.playAgain}
          </button>
          <button className="btn ghost" onClick={onHome}>
            {t.home}
          </button>
        </div>
      </div>
    </div>
  )
}
