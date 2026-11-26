import { useEffect, useRef, useState } from 'react'
import { PORTRAITS } from '../assets/manifest'
import type { MatchState } from '../game/rules'
import { Crown } from './art'
import type { Names } from './hud'
import type { Strings } from './strings'

export function RulesOverlay({ t, onClose, onSurrender }: { t: Strings; onClose(): void; onSurrender?: () => void }) {
  const btn = useRef<HTMLButtonElement>(null)
  const [confirm, setConfirm] = useState(false)
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
        {onSurrender &&
          (confirm ? (
            <div className="surrender-confirm">
              <p>{t.surrenderConfirm}</p>
              <div className="row">
                <button className="btn danger" onClick={onSurrender} data-testid="surrender-yes">
                  {t.surrender}
                </button>
                <button className="btn ghost dark-text" onClick={() => setConfirm(false)}>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button className="link-btn" onClick={() => setConfirm(true)} data-testid="surrender">
              ⚑ {t.surrender}
            </button>
          ))}
      </div>
    </div>
  )
}

interface Action {
  label: string
  onClick(): void
  testId?: string
}

interface ResultProps {
  t: Strings
  names: Names
  /** Viewer perspective ('player' = viewer). */
  match: MatchState
  tone: 'win' | 'lose' | 'draw'
  reason?: string
  note?: React.ReactNode
  primary: Action
  secondary: Action
}

export function ResultSheet({ t, names, match, tone, reason, note, primary, secondary }: ResultProps) {
  const again = useRef<HTMLButtonElement>(null)
  useEffect(() => again.current?.focus(), [])
  const title = tone === 'draw' ? t.draw : tone === 'win' ? t.win : t.lose
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <div className={`sheet results ${tone}`}>
        <div className="results-faces" aria-hidden="true">
          <span className={`rf ${tone === 'win' ? 'won' : tone === 'lose' ? 'lost' : ''}`}>
            {tone === 'win' && <Crown className="rf-crown" />}
            <img src={PORTRAITS.player} alt="" />
          </span>
          <span className="rf-vs">VS</span>
          <span className={`rf ${tone === 'lose' ? 'won' : tone === 'win' ? 'lost' : ''}`}>
            {tone === 'lose' && <Crown className="rf-crown" />}
            <img src={PORTRAITS.bot} alt="" />
          </span>
        </div>
        <h2 id="results-title" className="results-title" data-testid="results-title">
          {title}
        </h2>
        {reason && <div className="results-reason">{reason}</div>}
        <div className="results-score">
          <div>
            <div className="rs-name">{names.me}</div>
            <div className="rs-num">{match.scores.player}</div>
          </div>
          <div className="rs-sep">:</div>
          <div>
            <div className="rs-name">{names.opp}</div>
            <div className="rs-num">{match.scores.bot}</div>
          </div>
        </div>
        {match.rounds.length > 0 && (
          <div className="rounds-log">
            <div className="rl-title">{t.roundsLog}</div>
            {match.rounds.map((r) => (
              <div key={r.round} className={`rl-row ${r.winner === 'player' ? 'w' : 'l'}`}>
                <span>#{r.round}</span>
                <span>{r.shooter === 'player' ? names.me : names.opp}</span>
                <span>{t.kindBanner(r.kind, r.point).replace('!', '')}</span>
                <span>{r.winner === 'player' ? '+100' : '—'}</span>
              </div>
            ))}
          </div>
        )}
        {note}
        <div className="results-actions">
          <button ref={again} className="btn primary" onClick={primary.onClick} data-testid={primary.testId ?? 'again'}>
            {primary.label}
          </button>
          <button className="btn ghost" onClick={secondary.onClick} data-testid={secondary.testId}>
            {secondary.label}
          </button>
        </div>
      </div>
    </div>
  )
}
