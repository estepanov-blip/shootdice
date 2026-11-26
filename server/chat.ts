/**
 * "Чемпион чата": results of games accepted from a group chat. Pure and
 * idempotent by duel id, so a retried settlement never counts a game twice.
 */
import { utcWeekStart, type LeaderRow, type PlayerInfo } from '../src/online/protocol'

export interface ChatEntry {
  duelId: string
  at: number
  a: PlayerInfo
  b: PlayerInfo
  winner: 'a' | 'b' | 'draw'
}

export type ChatState = Record<string, ChatEntry>

export function addChatEntry(c: ChatState, e: ChatEntry): ChatState {
  if (c[e.duelId]) return c
  return { ...c, [e.duelId]: e }
}

export function board(c: ChatState, window: 'week' | 'all', now: number, limit = 20): LeaderRow[] {
  const from = window === 'week' ? utcWeekStart(now) : 0
  const rows = new Map<number, LeaderRow & { draws: number }>()
  const row = (p: PlayerInfo) => {
    const r = rows.get(p.id) ?? { id: p.id, name: p.name, photo: p.photo, wins: 0, losses: 0, draws: 0, winRate: null }
    r.name = p.name
    r.photo = p.photo
    rows.set(p.id, r)
    return r
  }
  for (const e of Object.values(c)) {
    if (e.at < from) continue
    const a = row(e.a)
    const b = row(e.b)
    if (e.winner === 'draw') {
      a.draws++
      b.draws++
    } else if (e.winner === 'a') {
      a.wins++
      b.losses++
    } else {
      b.wins++
      a.losses++
    }
  }
  return [...rows.values()]
    .map(({ draws, ...r }) => {
      const n = r.wins + r.losses + draws
      return { ...r, winRate: n ? r.wins / n : null }
    })
    .sort((x, y) => y.wins - x.wins || (y.winRate ?? 0) - (x.winRate ?? 0) || x.losses - y.losses || x.name.localeCompare(y.name))
    .slice(0, limit)
}
