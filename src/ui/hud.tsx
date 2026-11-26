/** HUD pieces shared by practice and online games. The viewer is always the 'player' side. */
import { PORTRAITS } from '../assets/manifest'
import type { PracticeView } from '../game/PracticeController'
import { lastRound, type MatchState, type Side } from '../game/rules'
import { Crown, DieIcon } from './art'
import type { Strings } from './strings'

export interface Names {
  me: string
  opp: string
}

export function TopHud({ m, t, names, extra }: { m: MatchState; t: Strings; names: Names; extra?: React.ReactNode }) {
  return (
    <header className="hud-top">
      <PlayerChip side="player" tag={t.tagPlayer} name={names.me} score={m.scores.player} active={m.shooter === 'player'} />
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
      <PlayerChip side="bot" tag={t.tagOpponent} name={names.opp} score={m.scores.bot} active={m.shooter === 'bot'} />
    </header>
  )
}

export function PlayerChip({ side, tag, name, score, active }: { side: Side; tag: string; name: string; score: number; active: boolean }) {
  return (
    <div className={`chip chip-${side} ${active ? 'active' : ''}`} data-testid={`chip-${side}`} aria-current={active ? 'true' : undefined}>
      <span className="portrait-wrap">
        <img className="portrait" src={PORTRAITS[side]} alt="" width={48} height={48} />
        {active && <Crown className="chip-crown" />}
      </span>
      <div className="chip-text">
        <div className="chip-tag">{tag}</div>
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

/** Comic-panel banners mapped to existing state changes (no new logic). */
export function Banner({ view, t, names }: { view: PracticeView; t: Strings; names: Names }) {
  const m = view.match
  if (view.rolling) return null
  const r = m.lastRoll
  const key = `${view.matchNo}-${m.rollId}-${m.phase}-${m.roundIndex}`

  if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    const lr = lastRound(m)
    if (!lr) return null
    const youWon = lr.winner === 'player'
    return (
      <div className={`banner graffiti ${youWon ? 'win' : 'lose'}`} key={key} data-testid="banner">
        <div className="burst" aria-hidden="true" />
        {youWon && <Crown className="banner-crown" />}
        <div className="graffiti-word">{youWon ? t.winWord : t.loseWord}</div>
        <div className="graffiti-sub">
          <span className="gs-kind">
            {t.kindBanner(lr.kind, lr.point)} {r && lr.kind !== 'pointMade' ? `· ${r.total}` : ''}
          </span>
          <span className="gs-score">{youWon ? `${names.me} +100` : `${names.opp} +100`}</span>
        </div>
      </div>
    )
  }
  if (m.phase === 'point' && r?.kind === 'pointSet' && m.rollsThisRound > 0) {
    return (
      <div className="banner paper point" key={key} data-testid="banner">
        <Crown className="paper-crown" />
        <div className="paper-title">{t.pointSetTitle}</div>
        <div className="paper-sub">{t.pointLabel(m.point!)}</div>
      </div>
    )
  }
  if (m.phase === 'point' && r?.kind === 'noDecision' && m.rollsThisRound > 0) {
    return (
      <div className="banner tag-small" key={key} data-testid="banner">
        {m.shooter === 'player' ? t.noDecision(r.total) : t.botNoDecision(r.total)}
      </div>
    )
  }
  if (m.phase === 'comeOut' && m.rollsThisRound === 0) {
    return (
      <div className="banner panel-intro" key={key} data-testid="banner">
        <div className="intro-round">{t.round(m.roundIndex + 1, m.totalRounds)}</div>
        <div className="intro-who">{m.shooter === 'player' ? t.yourTurn : t.waitBot(names.opp).replace('…', '')}</div>
      </div>
    )
  }
  return null
}

export function BottomHud(props: {
  status: string
  label: string
  disabled: boolean
  waiting: boolean
  myTurn?: boolean
  yourTurnLabel?: string
  onPrimary(): void
  onLeft(): void
  leftLabel: string
  onRight(): void
  rightLabel: string
}) {
  return (
    <footer className="hud-bottom">
      {props.myTurn && props.yourTurnLabel && (
        <div className="turn-sticker" aria-hidden="true">
          <DieIcon face={5} />
          {props.yourTurnLabel}
        </div>
      )}
      <div className="status" aria-live="polite">
        {props.status}
      </div>
      <div className="controls">
        <button className="icon-btn" onClick={props.onLeft} aria-label={props.leftLabel}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 11 L12 3 L21 11 M6 9 V21 H18 V9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
        </button>
        <button className={`roll-btn ${props.waiting ? 'waiting' : ''}`} onClick={props.onPrimary} disabled={props.disabled} data-testid="primary">
          <span className="roll-label">{props.label}</span>
          {!props.waiting && <DieIcon face={5} />}
        </button>
        <button className="icon-btn" onClick={props.onRight} aria-label={props.rightLabel}>
          <span className="icon-q">?</span>
        </button>
      </div>
    </footer>
  )
}
