/** HUD pieces shared by practice and online games. The viewer is always the 'player' side. */
import { PORTRAITS } from '../assets/manifest'
import type { PracticeView } from '../game/PracticeController'
import { lastRound, type MatchState, type Side } from '../game/rules'
import type { Strings } from './strings'

export interface Names {
  me: string
  opp: string
}

export function TopHud({ m, t, names, extra }: { m: MatchState; t: Strings; names: Names; extra?: React.ReactNode }) {
  return (
    <header className="hud-top">
      <PlayerChip side="player" name={names.me} score={m.scores.player} active={m.shooter === 'player'} />
      <div className="round-box">
        <div className="round-label">{t.round(Math.min(m.roundIndex + 1, m.totalRounds), m.totalRounds)}</div>
        <div className={`point-puck ${m.point ? 'on' : ''}`} aria-live="polite">
          {m.point ? (
            <>
              <span className="puck-label">{t.point}</span>
              <span className="puck-num">{m.point}</span>
            </>
          ) : (
            <span className="puck-off">OFF</span>
          )}
        </div>
        {extra}
      </div>
      <PlayerChip side="bot" name={names.opp} score={m.scores.bot} active={m.shooter === 'bot'} />
    </header>
  )
}

export function PlayerChip({ side, name, score, active }: { side: Side; name: string; score: number; active: boolean }) {
  return (
    <div className={`chip chip-${side} ${active ? 'active' : ''}`} data-testid={`chip-${side}`} aria-current={active ? 'true' : undefined}>
      <span className="portrait-wrap">
        <img className="portrait" src={PORTRAITS[side]} alt="" width={44} height={44} />
      </span>
      <div className="chip-text">
        <div className="chip-name">{name}</div>
        <div className="chip-score" data-testid={`score-${side}`}>
          {score}
        </div>
      </div>
    </div>
  )
}

export function statusText(m: MatchState, t: Strings, opp: string) {
  if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    const r = lastRound(m)
    return r ? t.outcome(r, r.winner === 'player', opp) : ''
  }
  if (m.shooter === 'player') return m.point ? t.needPoint(m.point) : t.needComeOut
  return m.point ? t.botPoint(opp, m.point) : t.botComeOut(opp)
}

export function Banner({ view, t, names }: { view: PracticeView; t: Strings; names: Names }) {
  const m = view.match
  if (view.rolling) return null
  let text = ''
  let tone = 'neutral'
  let sub = ''
  const r = m.lastRoll
  if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    const lr = lastRound(m)
    if (lr) {
      const youWon = lr.winner === 'player'
      text = t.kindBanner(lr.kind, lr.point)
      tone = youWon ? 'win' : 'lose'
      sub = youWon ? `${names.me} +100` : `${names.opp} +100`
    }
  } else if (m.phase === 'point' && r?.kind === 'pointSet' && m.rollsThisRound > 0) {
    text = t.pointSet(m.point!)
    tone = 'point'
  } else if (m.phase === 'point' && r?.kind === 'noDecision' && m.rollsThisRound > 0) {
    text = m.shooter === 'player' ? t.noDecision(r.total) : t.botNoDecision(r.total)
    tone = 'neutral small'
  } else if (m.phase === 'comeOut' && m.rollsThisRound === 0) {
    text = t.roundIntro(m.roundIndex + 1, m.shooter === 'player', names.opp)
    tone = 'intro'
  }
  if (!text) return null
  const total = r && m.rollsThisRound > 0 && (r.kind === 'natural' || r.kind === 'craps' || r.kind === 'sevenOut') ? r.total : null
  return (
    <div className={`banner ${tone}`} key={`${view.matchNo}-${m.rollId}-${m.phase}-${m.roundIndex}`} data-testid="banner">
      {total !== null && <div className="banner-total">{total}</div>}
      <div className="banner-text">{text}</div>
      {sub && <div className="banner-sub">{sub}</div>}
    </div>
  )
}

export function BottomHud(props: {
  status: string
  label: string
  disabled: boolean
  waiting: boolean
  onPrimary(): void
  onLeft(): void
  leftLabel: string
  onRight(): void
  rightLabel: string
}) {
  return (
    <footer className="hud-bottom">
      <div className="status" aria-live="polite">
        {props.status}
      </div>
      <div className="controls">
        <button className="icon-btn" onClick={props.onLeft} aria-label={props.leftLabel}>
          ⌂
        </button>
        <button className={`roll-btn ${props.waiting ? 'waiting' : ''}`} onClick={props.onPrimary} disabled={props.disabled} data-testid="primary">
          {props.label}
        </button>
        <button className="icon-btn" onClick={props.onRight} aria-label={props.rightLabel}>
          ?
        </button>
      </div>
    </footer>
  )
}
