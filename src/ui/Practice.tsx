import { useEffect, useRef, useState } from 'react'
import { CHARACTERS, PORTRAITS } from '../assets/manifest'
import type { PracticeView } from '../game/PracticeController'
import { lastRound, matchOutcome, type Side } from '../game/rules'
import type { Platform } from '../platform/telegram'
import { GameCanvas } from './GameCanvas'
import { ResultsOverlay, RulesOverlay } from './Overlays'
import type { Lang, Strings } from './strings'
import { usePractice, usePracticeView } from './usePractice'

interface Props {
  t: Strings
  lang: Lang
  platform: Platform
  reducedMotion: boolean
  onHome(): void
}

export function Practice({ t, lang, platform, reducedMotion, onHome }: Props) {
  const { ctrl, setPaused } = usePractice()
  const view = usePracticeView(ctrl)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const botName = CHARACTERS.bot.name[lang]

  useEffect(() => {
    platform.setBackHandler(onHome)
    return () => platform.setBackHandler(null)
  }, [platform, onHome])

  // haptics on throw start and on match end
  const lastRollSeen = useRef(0)
  useEffect(() => {
    if (view?.rolling && view.rolling.rollId !== lastRollSeen.current) {
      lastRollSeen.current = view.rolling.rollId
      platform.haptic('roll')
    }
  }, [view?.rolling, platform])

  const ended = view?.match.phase === 'matchEnd' && !view.rolling
  useEffect(() => {
    if (!ended || !view) {
      setResultsOpen(false)
      return
    }
    const o = matchOutcome(view.match)
    platform.haptic(o?.winner === 'player' ? 'win' : 'lose')
    const id = setTimeout(() => setResultsOpen(true), reducedMotion ? 200 : 1100)
    return () => clearTimeout(id)
  }, [ended, view?.matchNo]) // eslint-disable-line react-hooks/exhaustive-deps

  const openRules = (on: boolean) => {
    setRulesOpen(on)
    setPaused('rules', on)
  }

  const primary = () => {
    if (!ctrl || !view) return
    const m = view.match
    if (m.phase === 'roundEnd') ctrl.continueRound()
    else if (m.phase === 'matchEnd') setResultsOpen(true)
    else ctrl.requestRoll('player')
  }

  // keyboard: Space / Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rulesOpen || resultsOpen) return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        primary()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!ctrl || !view) return <div className="screen practice" />

  const m = view.match
  const btn = primaryButton(view, t, botName)

  return (
    <div className="screen practice">
      <GameCanvas ctrl={ctrl} reducedMotion={reducedMotion} />

      <header className="hud-top">
        <PlayerChip side="player" name={t.you} score={m.scores.player} active={m.shooter === 'player'} />
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
        </div>
        <PlayerChip side="bot" name={botName} score={m.scores.bot} active={m.shooter === 'bot'} />
      </header>

      <Banner view={view} t={t} botName={botName} />

      <footer className="hud-bottom">
        <div className="status" aria-live="polite">
          {statusText(view, t, botName)}
        </div>
        <div className="controls">
          <button className="icon-btn" onClick={onHome} aria-label={t.home}>
            ⌂
          </button>
          <button
            className={`roll-btn ${btn.waiting ? 'waiting' : ''}`}
            onClick={primary}
            disabled={btn.disabled}
            data-testid="primary"
          >
            {btn.label}
          </button>
          <button className="icon-btn" onClick={() => openRules(true)} aria-label={t.rules}>
            ?
          </button>
        </div>
      </footer>

      {view.paused && !rulesOpen && (
        <div className="pause-veil" onClick={() => setPaused('user', false)}>
          {t.paused}
        </div>
      )}
      {rulesOpen && <RulesOverlay t={t} onClose={() => openRules(false)} />}
      {resultsOpen && ended && (
        <ResultsOverlay
          t={t}
          botName={botName}
          match={m}
          onAgain={() => {
            setResultsOpen(false)
            ctrl.newMatch()
          }}
          onHome={onHome}
        />
      )}
    </div>
  )
}

function PlayerChip({ side, name, score, active }: { side: Side; name: string; score: number; active: boolean }) {
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

function primaryButton(v: PracticeView, t: Strings, bot: string) {
  const m = v.match
  if (v.paused) return { label: t.paused, disabled: true, waiting: true }
  if (v.rolling) return { label: t.rolling, disabled: true, waiting: true }
  if (m.phase === 'roundEnd') return { label: t.nextRound, disabled: false, waiting: false }
  if (m.phase === 'matchEnd') return { label: t.seeResults, disabled: false, waiting: false }
  if (m.shooter === 'bot') return { label: t.waitBot(bot), disabled: true, waiting: true }
  return { label: t.roll, disabled: false, waiting: false }
}

function statusText(v: PracticeView, t: Strings, bot: string) {
  const m = v.match
  if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    const r = lastRound(m)
    return r ? t.outcome(r, r.winner === 'player') : ''
  }
  if (m.shooter === 'player') return m.point ? t.needPoint(m.point) : t.needComeOut
  return m.point ? t.botPoint(bot, m.point) : t.botComeOut(bot)
}

function Banner({ view, t, botName }: { view: PracticeView; t: Strings; botName: string }) {
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
      sub = youWon ? `${t.you} +100` : `${botName} +100`
    }
  } else if (m.phase === 'point' && r?.kind === 'pointSet') {
    text = t.pointSet(m.point!)
    tone = 'point'
  } else if (m.phase === 'point' && r?.kind === 'noDecision') {
    text = m.shooter === 'player' ? t.noDecision(r.total) : t.botNoDecision(r.total)
    tone = 'neutral small'
  } else if (m.phase === 'comeOut' && m.rollsThisRound === 0) {
    text = t.roundIntro(m.roundIndex + 1, m.shooter === 'player', botName)
    tone = 'intro'
  }
  if (!text) return null
  const total = r && m.rollsThisRound > 0 && r.kind !== 'pointSet' && r.kind !== 'pointMade' && r.kind !== 'noDecision' ? r.total : null
  return (
    <div className={`banner ${tone}`} key={`${view.matchNo}-${m.rollId}-${m.phase}`} data-testid="banner">
      {total !== null && <div className="banner-total">{total}</div>}
      <div className="banner-text">{text}</div>
      {sub && <div className="banner-sub">{sub}</div>}
    </div>
  )
}
