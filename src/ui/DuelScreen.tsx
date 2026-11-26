import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BACKGROUNDS, PORTRAITS } from '../assets/manifest'
import { ROLL_ANIM_MS } from '../game/PracticeScene'
import { ApiError, type Api } from '../online/api'
import { DuelController } from '../online/DuelController'
import { otherSeat, type DuelView } from '../online/protocol'
import { forViewer } from '../online/replay'
import type { Platform } from '../platform/telegram'
import { GameCanvas } from './GameCanvas'
import { Banner, BottomHud, statusText, TopHud, type Names } from './hud'
import { ResultSheet, RulesOverlay } from './Overlays'
import { useSpaceKey } from './Practice'
import type { Strings } from './strings'
import { usePracticeView } from './usePractice'

const POLL_WAITING = 2500 // opponent's throw / open challenge
const POLL_MY_TURN = 10000 // just to notice a surrender
const POLL_OVER = 6000 // to notice a rematch request

interface Props {
  id: string
  api: Api
  t: Strings
  platform: Platform
  reducedMotion: boolean
  onBack(): void
  onOpen(id: string): void
}

const panelBg = { backgroundImage: `url(${BACKGROUNDS.cornerStore.url})` }

const short = (s: string | undefined, fallback: string) => {
  const v = (s || fallback).trim()
  return v.length > 14 ? v.slice(0, 13) + '…' : v
}

export function DuelScreen({ id, api, t, platform, reducedMotion, onBack, onOpen }: Props) {
  const ctrl = useMemo(() => new DuelController({ rollAnimMs: ROLL_ANIM_MS }), [id])
  useEffect(() => () => ctrl.destroy(), [ctrl])
  const view = usePracticeView(ctrl)
  const [duel, setDuel] = useState<DuelView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)

  useEffect(() => {
    platform.setBackHandler(onBack)
    return () => platform.setBackHandler(null)
  }, [platform, onBack])

  const accept = useCallback(
    (v: DuelView) => {
      ctrl.update(v)
      setDuel(ctrl.getDuel())
      setError(null)
    },
    [ctrl],
  )

  const load = useCallback(
    async (first = false) => {
      try {
        accept(await api.duel(id))
      } catch (e) {
        if (first || !(e instanceof ApiError && e.status === 0)) setError(e instanceof Error ? e.message : String(e))
      }
    },
    [accept, api, id],
  )

  useEffect(() => {
    setDuel(null)
    setResultsOpen(false)
    void load(true)
  }, [id, load])

  // polling (paused while hidden / sending)
  useEffect(() => {
    if (!duel) return
    const period = duel.status === 'over' ? POLL_OVER : duel.status === 'active' && duel.yourTurn ? POLL_MY_TURN : POLL_WAITING
    const timer = window.setInterval(() => {
      if (document.hidden || busyRef.current) return
      void load(false)
    }, period)
    return () => window.clearInterval(timer)
  }, [duel, load])

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (e instanceof ApiError && e.code === 'turn_expired') void load(false)
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [load])

  // haptic on every new roll
  const lastRoll = useRef(0)
  useEffect(() => {
    if (view?.rolling && view.rolling.rollId !== lastRoll.current) {
      lastRoll.current = view.rolling.rollId
      platform.haptic('roll')
    }
  }, [view?.rolling, platform])

  const settled = !!duel && duel.status === 'over' && !view?.rolling && ctrl.isHolding() !== 'roundEnd'
  useEffect(() => {
    if (!settled || !duel) {
      setResultsOpen(false)
      return
    }
    platform.haptic(duel.result?.winner === duel.me ? 'win' : 'lose')
    const timer = setTimeout(() => setResultsOpen(true), reducedMotion ? 200 : 1000)
    return () => clearTimeout(timer)
  }, [settled, duel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const names: Names = useMemo(() => {
    if (!duel) return { me: t.you, opp: t.opponent }
    const me = duel.me ?? 0
    return { me: short(duel.players[me]?.name, t.you), opp: short(duel.players[otherSeat(me)]?.name, t.opponent) }
  }, [duel, t])

  const roll = () =>
    run(async () => {
      const d = ctrl.getDuel()
      if (!d?.match || !d.yourTurn || !ctrl.inSync()) return
      const res = await api.roll(id, d.match.rollId)
      accept(res.duel)
    })

  const primary = () => {
    if (!duel) return
    const hold = ctrl.isHolding()
    if (hold === 'roundEnd') ctrl.continueRound()
    else if (duel.status === 'over') setResultsOpen(true)
    else if (duel.yourTurn && ctrl.inSync()) void roll()
  }
  useSpaceKey(primary, rulesOpen || resultsOpen || !duel || duel.status === 'open')

  // ------------------------------------------------------------------ not started yet
  if (!duel) {
    return (
      <div className="screen panel-screen" style={panelBg}>
        <div className="panel">
          {error ? (
            <>
              <p className="panel-error">{error}</p>
              <button className="btn primary" onClick={() => load(true)}>
                {t.retry}
              </button>
            </>
          ) : (
            <p className="panel-sub">{t.loading}</p>
          )}
          <button className="btn ghost" onClick={onBack}>
            {t.back}
          </button>
        </div>
      </div>
    )
  }

  if (duel.status === 'open') {
    const challenger = duel.players[0]
    const mine = duel.me === 0
    return (
      <div className="screen panel-screen" style={panelBg}>
        <div className="panel">
          <div className="vs-row" aria-hidden="true">
            <span className="vs-face me">
              <img src={PORTRAITS.player} alt="" />
            </span>
            <span className="vs-word">{t.vs}</span>
            <span className="vs-face opp">
              <img src={PORTRAITS.bot} alt="" />
            </span>
          </div>
          {mine ? (
            <>
              <h2>{t.waitingTitle}</h2>
              <p className="panel-sub">{t.waitingSub}</p>
              <button
                className="btn primary big"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await api.share(id)
                    await platform.share(r.prepared, duel.link, t.shareText(challenger.name))
                  })
                }
                data-testid="share"
              >
                {busy ? t.sending : t.sendChallenge}
              </button>
            </>
          ) : (
            <>
              <h2 data-testid="challenged">{t.challengedBy(challenger.name)}</h2>
              <p className="panel-sub">{t.challengeSub2}</p>
              <button
                className="btn primary big"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await platform.requestWriteAccess()
                    accept(await api.accept(id))
                  })
                }
                data-testid="accept"
              >
                {busy ? t.sending : t.accept}
              </button>
            </>
          )}
          {error && <p className="panel-error">{error}</p>}
          <button className="btn ghost" onClick={onBack}>
            {t.back}
          </button>
        </div>
      </div>
    )
  }

  if (duel.me === null) {
    return (
      <div className="screen panel-screen" style={panelBg}>
        <div className="panel">
          <h2>{t.takenTitle}</h2>
          <button className="btn ghost" onClick={onBack}>
            {t.back}
          </button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------ the game
  if (!view) return <div className="screen practice" />
  const m = view.match
  const hold = ctrl.isHolding()
  let btn: { label: string; disabled: boolean; waiting: boolean }
  if (view.rolling) btn = { label: t.rolling, disabled: true, waiting: true }
  else if (hold === 'roundEnd') btn = { label: t.nextRound, disabled: false, waiting: false }
  else if (duel.status === 'over') btn = { label: t.seeResults, disabled: false, waiting: false }
  else if (busy) btn = { label: t.sendingRoll, disabled: true, waiting: true }
  else if (duel.yourTurn && ctrl.inSync()) btn = { label: t.roll, disabled: false, waiting: false }
  else btn = { label: t.waitBot(names.opp), disabled: true, waiting: true }

  const status =
    error ??
    (duel.status === 'active' && !duel.yourTurn && !view.rolling && hold === null && m.phase !== 'roundEnd'
      ? t.oppTurn(names.opp)
      : statusText(m, t, names.opp))

  const hoursLeft = duel.deadline ? Math.floor((duel.deadline - Date.now()) / 3600_000) : null
  const r = duel.result
  const finalMatch = duel.match ? forViewer(duel.match, duel.me) : m
  const tone = !r || r.winner === null ? 'draw' : r.winner === duel.me ? 'win' : 'lose'
  const won = tone === 'win'
  const reason = !r
    ? undefined
    : r.reason === 'score'
      ? t.reasonScore
      : r.reason === 'surrender'
        ? won
          ? t.reasonSurrenderWin
          : t.reasonSurrenderLose
        : won
          ? t.reasonTimeoutWin
          : t.reasonTimeoutLose

  return (
    <div className="screen practice">
      <GameCanvas key={duel.id} ctrl={ctrl} reducedMotion={reducedMotion} />
      <TopHud
        m={m}
        t={t}
        names={names}
        extra={
          duel.status === 'active' && hoursLeft !== null && hoursLeft < 23 ? (
            <div className="deadline" data-testid="deadline">
              {t.timeLeft(Math.max(0, hoursLeft))}
            </div>
          ) : null
        }
      />
      <Banner view={view} t={t} names={names} />
      <BottomHud
        status={status}
        label={btn.label}
        disabled={btn.disabled}
        waiting={btn.waiting}
        myTurn={!btn.disabled && duel.status === 'active' && duel.yourTurn && ctrl.inSync()}
        yourTurnLabel={t.yourTurn}
        onPrimary={primary}
        onLeft={onBack}
        leftLabel={t.myDuels}
        onRight={() => setRulesOpen(true)}
        rightLabel={t.rules}
      />
      {rulesOpen && (
        <RulesOverlay
          t={t}
          onClose={() => setRulesOpen(false)}
          onSurrender={
            duel.status === 'active'
              ? () => {
                  setRulesOpen(false)
                  void run(async () => accept(await api.forfeit(id)))
                }
              : undefined
          }
        />
      )}
      {resultsOpen && duel.status === 'over' && (
        <ResultSheet
          t={t}
          names={names}
          match={finalMatch}
          tone={tone}
          reason={reason}
          note={
            duel.rematchId ? (
              <div className="rematch-note" data-testid="rematch-note">
                {t.rematchAsked(names.opp)}
              </div>
            ) : null
          }
          primary={{
            label: duel.rematchId ? t.openRematch : t.rematch,
            testId: 'rematch',
            onClick: () =>
              void run(async () => {
                const next = duel.rematchId ?? (await api.rematch(id)).id
                onOpen(next)
              }),
          }}
          secondary={{ label: t.myDuels, onClick: onBack, testId: 'to-duels' }}
        />
      )}
    </div>
  )
}
