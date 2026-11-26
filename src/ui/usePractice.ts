import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PracticeController, type PracticeView, type ViewSource } from '../game/PracticeController'
import { ROLL_ANIM_MS } from '../game/PracticeScene'
import { cryptoRng } from '../game/rng'

export type PauseReason = 'hidden' | 'rules' | 'user'

/** Owns one PracticeController for the lifetime of the Practice screen. */
export function usePractice() {
  const [ctrl, setCtrl] = useState<PracticeController | null>(null)

  useEffect(() => {
    const c = new PracticeController({ rng: cryptoRng(), botDelayMs: 800, rollAnimMs: ROLL_ANIM_MS })
    setCtrl(c)
    return () => c.destroy() // cancels bot/safety timers on exit
  }, [])

  const reasons = useRef(new Set<PauseReason>())
  const setPaused = useCallback(
    (reason: PauseReason, on: boolean) => {
      if (!ctrl) return
      if (on) reasons.current.add(reason)
      else reasons.current.delete(reason)
      if (reasons.current.size > 0) ctrl.pause()
      else ctrl.resume()
    },
    [ctrl],
  )

  // Tab hidden / app backgrounded: keep in-memory state, stop timers, never reroll.
  useEffect(() => {
    if (!ctrl) return
    const onVis = () => setPaused('hidden', document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [ctrl, setPaused])

  return { ctrl, setPaused }
}

const noop = () => () => {}
export function usePracticeView(ctrl: ViewSource | null): PracticeView | null {
  return useSyncExternalStore(
    ctrl ? (fn) => ctrl.subscribe(fn) : noop,
    () => (ctrl ? ctrl.getView() : null),
  )
}
