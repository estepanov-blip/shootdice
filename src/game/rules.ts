/**
 * SHOOT DICE — pure rules engine (no DOM, no timers, no randomness).
 *
 * Street craps, score-only practice:
 *  - Come-out: 7/11 shooter wins, 2/3/12 shooter loses, anything else sets the point.
 *  - Point phase: point again = shooter wins, 7 = shooter loses, anything else continues.
 *  - The opponent always takes the opposite side. Winner of a round +100, loser +0.
 *  - The shooter rotates after every resolved round. A match is three resolved rounds.
 *
 * Every transition returns a new state; invalid transitions return a typed error and
 * leave the input untouched. A roll must quote the current rollId, so a duplicate or
 * stale request (double tap, replayed event) is rejected instead of scored twice.
 */
import type { DicePair } from './rng'

export type Side = 'player' | 'bot'
export type Phase = 'comeOut' | 'point' | 'roundEnd' | 'matchEnd'
export type PointNumber = 4 | 5 | 6 | 8 | 9 | 10

export type RollKind =
  | 'natural' // come-out 7/11, shooter wins
  | 'craps' // come-out 2/3/12, shooter loses
  | 'pointSet' // come-out 4/5/6/8/9/10
  | 'pointMade' // point repeated, shooter wins
  | 'sevenOut' // 7 during point, shooter loses
  | 'noDecision' // anything else during point

export interface RollRecord {
  rollId: number
  round: number
  shooter: Side
  dice: DicePair
  total: number
  kind: RollKind
}

export interface RoundResult {
  round: number
  shooter: Side
  winner: Side
  kind: 'natural' | 'craps' | 'pointMade' | 'sevenOut'
  point: PointNumber | null
  rolls: number
}

export interface MatchState {
  readonly phase: Phase
  readonly point: PointNumber | null
  readonly shooter: Side
  /** 0-based index of the current (or just resolved) round. */
  readonly roundIndex: number
  readonly totalRounds: number
  readonly scores: Readonly<Record<Side, number>>
  readonly lastDice: DicePair | null
  readonly lastRoll: RollRecord | null
  /** Monotonic id of the NEXT roll this state accepts. */
  readonly rollId: number
  /** Rolls taken in the current round. */
  readonly rollsThisRound: number
  readonly rounds: readonly RoundResult[]
  readonly firstShooter: Side
}

export const ROUND_WIN_SCORE = 100
export const ROUNDS_PER_MATCH = 3
export const POINT_NUMBERS: readonly PointNumber[] = [4, 5, 6, 8, 9, 10]

export type RulesError =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'STALE_ROLL'
  | 'INVALID_DICE'

export type Result<T> = { ok: true; state: T } | { ok: false; error: RulesError }

export function other(side: Side): Side {
  return side === 'player' ? 'bot' : 'player'
}

export function isPointNumber(n: number): n is PointNumber {
  return (POINT_NUMBERS as readonly number[]).includes(n)
}

export function createMatch(firstShooter: Side = 'player', totalRounds = ROUNDS_PER_MATCH): MatchState {
  return {
    phase: 'comeOut',
    point: null,
    shooter: firstShooter,
    roundIndex: 0,
    totalRounds,
    scores: { player: 0, bot: 0 },
    lastDice: null,
    lastRoll: null,
    rollId: 1,
    rollsThisRound: 0,
    rounds: [],
    firstShooter,
  }
}

/** Classify a total for the given phase. Pure helper used by the engine and the UI. */
export function classify(total: number, point: PointNumber | null): RollKind {
  if (point === null) {
    if (total === 7 || total === 11) return 'natural'
    if (total === 2 || total === 3 || total === 12) return 'craps'
    return 'pointSet'
  }
  if (total === point) return 'pointMade'
  if (total === 7) return 'sevenOut'
  return 'noDecision'
}

function validDie(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 6
}

/**
 * Apply one roll. `by` is who pressed roll; `rollId` must equal state.rollId.
 * Resolves the roll exactly once and awards the round when it is decided.
 */
export function applyRoll(state: MatchState, dice: DicePair, by: Side, rollId: number): Result<MatchState> {
  if (state.phase !== 'comeOut' && state.phase !== 'point') return { ok: false, error: 'WRONG_PHASE' }
  if (by !== state.shooter) return { ok: false, error: 'NOT_YOUR_TURN' }
  if (rollId !== state.rollId) return { ok: false, error: 'STALE_ROLL' }
  if (!Array.isArray(dice) || dice.length !== 2 || !validDie(dice[0]) || !validDie(dice[1])) {
    return { ok: false, error: 'INVALID_DICE' }
  }

  const total = dice[0] + dice[1]
  const kind = classify(total, state.point)
  const roll: RollRecord = { rollId, round: state.roundIndex + 1, shooter: state.shooter, dice, total, kind }
  const rollsThisRound = state.rollsThisRound + 1
  const base = { ...state, lastDice: dice, lastRoll: roll, rollId: state.rollId + 1, rollsThisRound }

  if (kind === 'pointSet') {
    return { ok: true, state: { ...base, phase: 'point', point: total as PointNumber } }
  }
  if (kind === 'noDecision') {
    return { ok: true, state: base }
  }

  const shooterWins = kind === 'natural' || kind === 'pointMade'
  const winner = shooterWins ? state.shooter : other(state.shooter)
  const result: RoundResult = {
    round: state.roundIndex + 1,
    shooter: state.shooter,
    winner,
    kind,
    point: state.point,
    rolls: rollsThisRound,
  }
  const rounds = [...state.rounds, result]
  const scores = { ...state.scores, [winner]: state.scores[winner] + ROUND_WIN_SCORE }
  const phase: Phase = rounds.length >= state.totalRounds ? 'matchEnd' : 'roundEnd'
  return { ok: true, state: { ...base, phase, scores, rounds } }
}

/** Move from a resolved round to the next come-out with the shooter rotated. */
export function nextRound(state: MatchState): Result<MatchState> {
  if (state.phase !== 'roundEnd') return { ok: false, error: 'WRONG_PHASE' }
  return {
    ok: true,
    state: {
      ...state,
      phase: 'comeOut',
      point: null,
      shooter: other(state.shooter),
      roundIndex: state.roundIndex + 1,
      rollsThisRound: 0,
    },
  }
}

export type MatchOutcome = { winner: Side | null; draw: boolean; scores: Record<Side, number> }

export function matchOutcome(state: MatchState): MatchOutcome | null {
  if (state.phase !== 'matchEnd') return null
  const { player, bot } = state.scores
  if (player === bot) return { winner: null, draw: true, scores: { player, bot } }
  return { winner: player > bot ? 'player' : 'bot', draw: false, scores: { player, bot } }
}

/** Last resolved round, if the state is sitting on a round/match end. */
export function lastRound(state: MatchState): RoundResult | null {
  return state.rounds.length ? state.rounds[state.rounds.length - 1] : null
}

export function canRoll(state: MatchState, side: Side): boolean {
  return (state.phase === 'comeOut' || state.phase === 'point') && state.shooter === side
}
