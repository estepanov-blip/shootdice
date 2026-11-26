import { useEffect, useRef, useState } from 'react'
import { CHARACTERS } from '../assets/manifest'
import type { PracticeView } from '../game/PracticeController'
import { matchOutcome } from '../game/rules'
import type { Platform } from '../platform/telegram'
import { GameCanvas } from './GameCanvas'
import { Banner, BottomHud, statusText, TopHud } from './hud'
import { ResultSheet, RulesOverlay } from './Overlays'
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
  const names = { me: t.you, opp: CHARACTERS.bot.name[lang] }

  useEffect(() => {
    platform.setBackHandler(onHome)
    return () => platform.setBackHandler(null)
  }, [platform, onHome])

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

  useSpaceKey(primary, rulesOpen || resultsOpen)

  if (!ctrl || !view) return <div className="screen practice" />

  const m = view.match
  const btn = primaryButton(view, t, names.opp)
  const o = matchOutcome(m)

  return (
    <div className="screen practice">
      <GameCanvas ctrl={ctrl} reducedMotion={reducedMotion} />
      <TopHud m={m} t={t} names={names} />
      <Banner view={view} t={t} names={names} />
      <BottomHud
        status={statusText(m, t, names.opp)}
        label={btn.label}
        disabled={btn.disabled}
        waiting={btn.waiting}
        myTurn={!btn.disabled && m.shooter === 'player' && (m.phase === 'comeOut' || m.phase === 'point')}
        yourTurnLabel={t.yourTurn}
        onPrimary={primary}
        onLeft={onHome}
        leftLabel={t.home}
        onRight={() => openRules(true)}
        rightLabel={t.rules}
      />
      {view.paused && !rulesOpen && <div className="pause-veil">{t.paused}</div>}
      {rulesOpen && <RulesOverlay t={t} onClose={() => openRules(false)} />}
      {resultsOpen && ended && o && (
        <ResultSheet
          t={t}
          names={names}
          match={m}
          tone={o.draw ? 'draw' : o.winner === 'player' ? 'win' : 'lose'}
          primary={{
            label: t.playAgain,
            onClick: () => {
              setResultsOpen(false)
              ctrl.newMatch()
            },
          }}
          secondary={{ label: t.home, onClick: onHome }}
        />
      )}
    </div>
  )
}

export function useSpaceKey(fn: () => void, disabled: boolean) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled])
}

function primaryButton(v: PracticeView, t: Strings, opp: string) {
  const m = v.match
  if (v.paused) return { label: t.paused, disabled: true, waiting: true }
  if (v.rolling) return { label: t.rolling, disabled: true, waiting: true }
  if (m.phase === 'roundEnd') return { label: t.nextRound, disabled: false, waiting: false }
  if (m.phase === 'matchEnd') return { label: t.seeResults, disabled: false, waiting: false }
  if (m.shooter === 'bot') return { label: t.waitBot(opp), disabled: true, waiting: true }
  return { label: t.roll, disabled: false, waiting: false }
}
