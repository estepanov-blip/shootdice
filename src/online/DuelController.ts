/**
 * Client side of an online game. The server is authoritative: this controller only
 * receives DuelViews, replays the roll log with the rules engine and animates the
 * rolls the screen has not shown yet (own and opponent's) through the same Phaser
 * scene as practice. The viewer is always drawn as the 'player' side.
 */
import type { PracticeView, ViewSource } from '../game/PracticeController'
import { createMatch, type MatchState, type Side } from '../game/rules'
import type { Scheduler } from '../game/PracticeController'
import { seatSide, type DuelView, type Seat } from './protocol'
import { advance, forViewer, replay, type ReplayStep } from './replay'

/** More missed rolls than this -> jump to the last one instead of replaying all. */
export const CATCH_UP_LIMIT = 3
/** If the opponent already kept rolling, a round result is held this long, then released. */
export const AUTO_RELEASE_MS = 2200

const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface DuelControllerOptions {
  rollAnimMs?: number
  scheduler?: Scheduler
}

type Listener = (v: PracticeView) => void

export class DuelController implements ViewSource {
  private duel: DuelView | null = null
  private steps: ReplayStep[] = []
  private shown = 0
  private animating: number | null = null
  private hold = false
  private listeners = new Set<Listener>()
  private view: PracticeView
  private readonly sched: Scheduler
  private readonly rollAnimMs: number
  private safety: unknown = null
  private release: unknown = null
  private destroyed = false

  constructor(opts: DuelControllerOptions = {}) {
    this.sched = opts.scheduler ?? realScheduler
    this.rollAnimMs = opts.rollAnimMs ?? 1000
    this.view = { match: createMatch('player'), rolling: null, paused: false, matchNo: 1 }
  }

  getView(): PracticeView {
    return this.view
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getDuel(): DuelView | null {
    return this.duel
  }

  /** All server rolls are on screen and nothing is held -> the UI may offer "roll". */
  inSync(): boolean {
    return this.animating === null && !this.hold && this.shown === this.duel?.log.length
  }

  isHolding(): 'roundEnd' | 'matchEnd' | null {
    if (!this.hold || this.shown === 0) return null
    const p = this.steps[this.shown - 1].after.phase
    return p === 'roundEnd' || p === 'matchEnd' ? p : null
  }

  isAnimating(): boolean {
    return this.animating !== null
  }

  /** New authoritative state from the server (first load, poll, own roll response). */
  update(d: DuelView): void {
    if (this.destroyed) return
    const first = this.duel === null || this.duel.id !== d.id
    // never go backwards (a slow poll arriving after a roll response)
    if (!first && this.duel && d.log.length < this.duel.log.length) return
    this.duel = d
    this.steps = d.firstSeat === null ? [] : replay(d.firstSeat, d.log).steps
    const len = d.log.length
    if (first) {
      this.animating = null
      this.shown = len
      this.hold = len > 0 && this.steps[len - 1].after.phase === 'matchEnd'
    } else if (this.animating === null && len - this.shown > CATCH_UP_LIMIT) {
      this.shown = len - 1
      this.hold = false
    }
    this.pump()
    this.emit()
  }

  /** Scene reports the dice landed. Idempotent per rollId. */
  finishRoll(rollId: number): boolean {
    if (this.destroyed || this.animating === null) return false
    const step = this.steps[this.animating]
    if (step.before.rollId !== rollId) return false
    this.cancelSafety()
    this.animating = null
    this.shown += 1
    const phase = step.after.phase
    this.hold = phase === 'roundEnd' || phase === 'matchEnd'
    if (phase === 'roundEnd' && this.shown < this.steps.length) this.scheduleRelease()
    this.pump()
    this.emit()
    return true
  }

  /** Leave a shown round result ("Дальше"). */
  continueRound(): boolean {
    if (this.isHolding() !== 'roundEnd') return false
    this.hold = false
    this.cancelRelease()
    this.pump()
    this.emit()
    return true
  }

  destroy(): void {
    this.destroyed = true
    this.cancelSafety()
    this.cancelRelease()
    this.listeners.clear()
  }

  // ------------------------------------------------------------------ internals

  private localSide(seat: Seat): Side {
    const me = this.duel?.me ?? null
    return me === 1 ? (seat === 1 ? 'player' : 'bot') : seatSide(seat)
  }

  private pump(): void {
    if (this.animating !== null || this.hold || this.shown >= this.steps.length) return
    this.animating = this.shown
    const rollId = this.steps[this.shown].before.rollId
    this.safety = this.sched.setTimeout(() => this.finishRoll(rollId), this.rollAnimMs + 1200)
  }

  private displayed(): MatchState {
    const d = this.duel
    const me = d?.me ?? null
    if (!d) return createMatch('player')
    if (this.animating !== null) return forViewer(this.steps[this.animating].before, me)
    if (this.shown === 0) return forViewer(d.match ?? createMatch(seatSide(d.firstSeat ?? 0)), me)
    const after = this.steps[this.shown - 1].after
    return forViewer(this.hold ? after : advance(after), me)
  }

  private emit(): void {
    const i = this.animating
    const d = this.duel
    this.view = {
      match: this.displayed(),
      rolling:
        i !== null && d
          ? { rollId: this.steps[i].before.rollId, by: this.localSide(d.log[i].seat), dice: d.log[i].dice }
          : null,
      paused: false,
      matchNo: 1,
    }
    for (const fn of [...this.listeners]) fn(this.view)
  }

  private scheduleRelease() {
    this.cancelRelease()
    this.release = this.sched.setTimeout(() => {
      this.release = null
      this.continueRound()
    }, AUTO_RELEASE_MS)
  }

  private cancelRelease() {
    if (this.release !== null) {
      this.sched.clearTimeout(this.release)
      this.release = null
    }
  }

  private cancelSafety() {
    if (this.safety !== null) {
      this.sched.clearTimeout(this.safety)
      this.safety = null
    }
  }
}
