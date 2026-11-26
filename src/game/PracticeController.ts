/**
 * Single owner of practice-match state. Framework-agnostic: React renders the view,
 * the Phaser scene animates `rolling`, and nobody else mutates the match.
 *
 * Roll lifecycle:
 *   requestRoll(side) -> dice decided NOW by the RNG, next state precomputed, input locked
 *   scene animates the predetermined dice -> finishRoll(rollId) commits (idempotent)
 *   a safety timer commits anyway if the scene never reports back
 *
 * Pause (tab hidden / rules open) cancels bot and safety timers; resume commits a
 * pending roll with the SAME dice (never rerolls) and reschedules the bot.
 */
import { applyRoll, createMatch, nextRound, type MatchState, type Side } from './rules'
import { rollDice, type DicePair, type Rng } from './rng'

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface PendingRoll {
  rollId: number
  by: Side
  dice: DicePair
  /** The state that will be committed when the animation lands. */
  next: MatchState
}

export interface PracticeView {
  match: MatchState
  /** Non-null while dice are in the air; input is locked. */
  rolling: Omit<PendingRoll, 'next'> | null
  paused: boolean
  /** Bumps on every new match so the UI/scene can reset. */
  matchNo: number
}

export interface PracticeOptions {
  rng: Rng
  firstShooter?: Side
  /** Delay before the bot throws when it is the shooter (GDD: 800 ms). */
  botDelayMs?: number
  /** Expected dice animation length; used for the safety commit. */
  rollAnimMs?: number
  /** Auto-advance after a resolved round; 0 = wait for continueRound(). */
  roundEndHoldMs?: number
  scheduler?: Scheduler
}

type Listener = (view: PracticeView) => void

/** What the Phaser scene needs: a view stream and a way to report that the dice landed. */
export interface ViewSource {
  getView(): PracticeView
  subscribe(fn: Listener): () => void
  finishRoll(rollId: number): boolean
}

export class PracticeController implements ViewSource {
  private readonly rng: Rng
  private readonly firstShooter: Side
  private readonly botDelayMs: number
  private readonly rollAnimMs: number
  private readonly roundEndHoldMs: number
  private readonly sched: Scheduler

  private match: MatchState
  private pending: PendingRoll | null = null
  private paused = false
  private destroyed = false
  private matchNo = 1
  private listeners = new Set<Listener>()
  private view: PracticeView

  private botTimer: unknown = null
  private safetyTimer: unknown = null
  private advanceTimer: unknown = null

  constructor(opts: PracticeOptions) {
    this.rng = opts.rng
    this.firstShooter = opts.firstShooter ?? 'player'
    this.botDelayMs = opts.botDelayMs ?? 800
    this.rollAnimMs = opts.rollAnimMs ?? 1000
    this.roundEndHoldMs = opts.roundEndHoldMs ?? 0
    this.sched = opts.scheduler ?? realScheduler
    this.match = createMatch(this.firstShooter)
    this.view = this.buildView()
    this.scheduleBot()
  }

  getView(): PracticeView {
    return this.view
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Human or bot asks to throw. Returns false if the request was ignored. */
  requestRoll(by: Side = 'player'): boolean {
    if (this.destroyed || this.paused || this.pending) return false
    const rollId = this.match.rollId
    const dice = rollDice(this.rng)
    const res = applyRoll(this.match, dice, by, rollId)
    if (!res.ok) return false
    this.cancel('bot')
    this.pending = { rollId, by, dice, next: res.state }
    this.safetyTimer = this.sched.setTimeout(() => this.finishRoll(rollId), this.rollAnimMs + 1200)
    this.emit()
    return true
  }

  /** Called by the scene when the dice land. Idempotent per rollId. */
  finishRoll(rollId: number): boolean {
    if (this.destroyed || !this.pending || this.pending.rollId !== rollId) return false
    if (this.paused) return false // committed on resume, same dice
    this.commitPending()
    return true
  }

  /** Leave a resolved round and start the next come-out. */
  continueRound(): boolean {
    if (this.destroyed || this.pending) return false
    const res = nextRound(this.match)
    if (!res.ok) return false
    this.cancel('advance')
    this.match = res.state
    this.emit()
    this.scheduleBot()
    return true
  }

  /** Explicit replay: brand-new match, all timers cancelled. */
  newMatch(): void {
    if (this.destroyed) return
    this.cancelAll()
    this.pending = null
    this.match = createMatch(this.firstShooter)
    this.matchNo += 1
    this.emit()
    this.scheduleBot()
  }

  pause(): void {
    if (this.destroyed || this.paused) return
    this.paused = true
    this.cancelAll()
    this.emit()
  }

  resume(): void {
    if (this.destroyed || !this.paused) return
    this.paused = false
    if (this.pending) {
      this.commitPending()
      return
    }
    this.emit()
    this.scheduleBot()
    this.scheduleAdvance()
  }

  destroy(): void {
    this.destroyed = true
    this.cancelAll()
    this.listeners.clear()
  }

  /** Exposed for tests/diagnostics. */
  hasPendingTimers(): boolean {
    return this.botTimer !== null || this.safetyTimer !== null || this.advanceTimer !== null
  }

  private commitPending(): void {
    const p = this.pending
    if (!p) return
    this.cancel('safety')
    this.pending = null
    this.match = p.next
    this.emit()
    this.scheduleBot()
    this.scheduleAdvance()
  }

  private scheduleBot(): void {
    if (this.destroyed || this.paused || this.pending || this.botTimer !== null) return
    const m = this.match
    if (m.shooter !== 'bot' || (m.phase !== 'comeOut' && m.phase !== 'point')) return
    this.botTimer = this.sched.setTimeout(() => {
      this.botTimer = null
      this.requestRoll('bot')
    }, this.botDelayMs)
  }

  private scheduleAdvance(): void {
    if (this.roundEndHoldMs <= 0 || this.destroyed || this.paused || this.advanceTimer !== null) return
    if (this.match.phase !== 'roundEnd') return
    this.advanceTimer = this.sched.setTimeout(() => {
      this.advanceTimer = null
      this.continueRound()
    }, this.roundEndHoldMs)
  }

  private cancel(which: 'bot' | 'safety' | 'advance'): void {
    const key = `${which}Timer` as 'botTimer' | 'safetyTimer' | 'advanceTimer'
    if (this[key] !== null) {
      this.sched.clearTimeout(this[key])
      this[key] = null
    }
  }

  private cancelAll(): void {
    this.cancel('bot')
    this.cancel('safety')
    this.cancel('advance')
  }

  private buildView(): PracticeView {
    const p = this.pending
    return {
      match: this.match,
      rolling: p ? { rollId: p.rollId, by: p.by, dice: p.dice } : null,
      paused: this.paused,
      matchNo: this.matchNo,
    }
  }

  private emit(): void {
    this.view = this.buildView()
    for (const fn of [...this.listeners]) fn(this.view)
  }
}
