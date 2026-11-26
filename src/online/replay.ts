/**
 * Deterministic replay of an online match from its roll log. Used by the server
 * (single transition code path) and by the client (animate rolls it has not shown).
 * Pure: rules engine only.
 */
import { applyRoll, createMatch, nextRound, type MatchState, type RoundResult, type Side } from '../game/rules'
import { seatSide, type LoggedRoll, type Seat } from './protocol'

export interface ReplayStep {
  /** State the roll was applied to (round already started). */
  before: MatchState
  /** State right after the roll (may be roundEnd / matchEnd). */
  after: MatchState
}

/** After a resolved round the next one starts immediately (online has no "next round" button). */
export function advance(s: MatchState): MatchState {
  if (s.phase !== 'roundEnd') return s
  const n = nextRound(s)
  return n.ok ? n.state : s
}

export function replay(firstSeat: Seat, log: readonly LoggedRoll[]): { steps: ReplayStep[]; current: MatchState } {
  let cur = createMatch(seatSide(firstSeat))
  const steps: ReplayStep[] = []
  for (const r of log) {
    const res = applyRoll(cur, r.dice, seatSide(r.seat), cur.rollId)
    if (!res.ok) throw new Error(`replay: roll ${cur.rollId} rejected (${res.error})`)
    steps.push({ before: cur, after: res.state })
    cur = advance(res.state)
  }
  return { steps, current: cur }
}

const flipSide = (s: Side): Side => (s === 'player' ? 'bot' : 'player')
const flipRound = (r: RoundResult): RoundResult => ({ ...r, shooter: flipSide(r.shooter), winner: flipSide(r.winner) })

/** Swap the two sides so that seat 1 sees itself as 'player'. */
export function flipMatch(s: MatchState): MatchState {
  return {
    ...s,
    shooter: flipSide(s.shooter),
    firstShooter: flipSide(s.firstShooter),
    scores: { player: s.scores.bot, bot: s.scores.player },
    lastRoll: s.lastRoll ? { ...s.lastRoll, shooter: flipSide(s.lastRoll.shooter) } : null,
    rounds: s.rounds.map(flipRound),
  }
}

/** State from the viewer's perspective (viewer = 'player'). */
export function forViewer(s: MatchState, me: Seat | null): MatchState {
  return me === 1 ? flipMatch(s) : s
}
