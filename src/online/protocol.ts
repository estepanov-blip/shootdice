/**
 * Wire protocol shared by the client (src/online, src/ui) and the duel server (server/).
 * Pure types + constants only — no DOM / Workers APIs.
 *
 * Seats: 0 = challenger, 1 = accepter. Inside a MatchState the rules engine names the
 * sides 'player' / 'bot'; online they simply mean seat 0 / seat 1 (see seatSide()).
 * The client flips the state so that the viewer is always drawn as 'player'.
 */
import type { MatchState, Side } from '../game/rules'
import type { DicePair } from '../game/rng'

export type Seat = 0 | 1

export const seatSide = (s: Seat): Side => (s === 0 ? 'player' : 'bot')
export const sideSeat = (s: Side): Seat => (s === 'player' ? 0 : 1)
export const otherSeat = (s: Seat): Seat => (s === 0 ? 1 : 0)

/** Approved for Dog Fight (DEC-01) and reused: 24 h per roll, reminders after 1 h and 12 h. */
export const TIMING = {
  turnTimeoutMs: 24 * 3600_000,
  reminderOffsetsMs: [1 * 3600_000, 12 * 3600_000],
} as const

export interface PlayerInfo {
  id: number
  name: string
  username?: string
  photo?: string
}

export type DuelStatus = 'open' | 'active' | 'over'
export type ResultReason = 'score' | 'surrender' | 'turn_timeout'

export interface LoggedRoll {
  seat: Seat
  dice: DicePair
  at: number
}

export interface DuelResultView {
  /** Winning seat, null = draw (impossible with 3 rounds, kept for safety). */
  winner: Seat | null
  reason: ResultReason
  finalizedAt: number
}

export interface DuelView {
  id: string
  status: DuelStatus
  players: [PlayerInfo, PlayerInfo | null]
  /** Viewer's seat, null for a non-participant. */
  me: Seat | null
  /** Who shot first (coin flip at acceptance). */
  firstSeat: Seat | null
  /** Every roll in order. The client replays it with the same rules engine. */
  log: LoggedRoll[]
  /** Authoritative current state (seat 0 = 'player'), next round already started. */
  match: MatchState | null
  yourTurn: boolean
  /** When the current roll times out (ms epoch). */
  deadline: number | null
  result: DuelResultView | null
  rematchId: string | null
  /** t.me deep link that opens this duel in the Mini App. */
  link: string
  createdAt: number
  updatedAt: number
}

export interface DuelSummary {
  id: string
  status: DuelStatus
  me: Seat
  opponent: PlayerInfo | null
  yourTurn: boolean
  /** [mine, theirs] */
  score: [number, number]
  round: number
  result: 'win' | 'lose' | 'draw' | null
  updatedAt: number
}

export interface LeaderRow {
  id: number
  name: string
  photo?: string
  wins: number
  losses: number
  winRate: number | null
}

export interface MeResponse {
  user: PlayerInfo
  bot: string
  duels: DuelSummary[]
  /** "Чемпион чата" boards; null outside a group chat. */
  boards: { week: LeaderRow[]; all: LeaderRow[]; weekStart: number } | null
}

export interface CreateDuelResponse {
  duel: DuelView
  /** Prepared inline message id for Telegram.WebApp.shareMessage (null if Telegram refused). */
  prepared: string | null
}

export interface RollResponse {
  duel: DuelView
  /** The client's expected roll id was outdated; nothing was rolled. */
  stale: boolean
}

export interface ApiErrorBody {
  error: string
  message: string
}

/** Start (ms) of the UTC week containing ts; weeks start Monday 00:00 UTC. */
export function utcWeekStart(ts: number): number {
  const d = new Date(ts)
  const back = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)
}
