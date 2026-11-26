import { describe, expect, it } from 'vitest'
import type { DicePair, Die } from '../src/game/rng'
import { TIMING, type PlayerInfo } from '../src/online/protocol'
import { flipMatch, forViewer, replay } from '../src/online/replay'
import { addChatEntry, board, type ChatState } from './chat'
import {
  acceptDuel,
  createDuel,
  deadlineOf,
  dueReminders,
  DuelError,
  forfeitDuel,
  markReminders,
  nextReminderAt,
  rematchDuel,
  rollDuel,
  shooterSeat,
  timeoutDuel,
  toSummary,
  toView,
  type DuelRecord,
} from './duel'
import { compose, plan } from './notifications'

const A: PlayerInfo = { id: 1001, name: 'Саня' }
const B: PlayerInfo = { id: 2002, name: 'Кирилл' }
const T0 = 1_800_000_000_000
const pair = (t: number): DicePair => {
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === t) return [a as Die, b as Die]
  throw new Error()
}

function started(coin: 0 | 1 = 0): DuelRecord {
  return acceptDuel(createDuel('abcdefgh', A, T0, 'https://x.test'), B, T0 + 10, null, coin).duel
}

/** Roll a total for whoever is shooting. */
function roll(d: DuelRecord, total: number, now = T0 + 100): DuelRecord {
  const s = shooterSeat(d)!
  const r = rollDuel(d, d.players[s]!.id, d.match!.rollId, pair(total), now)
  expect(r.stale).toBe(false)
  return r.duel
}

describe('duel lifecycle', () => {
  it('open -> accept with coin flip decides the first shooter', () => {
    const d0 = createDuel('abcdefgh', A, T0)
    expect(d0.status).toBe('open')
    const d1 = acceptDuel(d0, B, T0 + 1, 'chat1', 1).duel
    expect(d1.status).toBe('active')
    expect(d1.firstSeat).toBe(1)
    expect(shooterSeat(d1)).toBe(1)
    expect(d1.chatInstance).toBe('chat1')
    expect(d1.turnDueAt).toBe(T0 + 1)
  })

  it('cannot accept own challenge; second accepter is refused; re-accept is idempotent', () => {
    const d0 = createDuel('abcdefgh', A, T0)
    expect(() => acceptDuel(d0, A, T0, null, 0)).toThrow(DuelError)
    const d1 = acceptDuel(d0, B, T0, null, 0).duel
    expect(() => acceptDuel(d1, { id: 3, name: 'X' }, T0, null, 0)).toThrow(/принят/)
    expect(acceptDuel(d1, B, T0, null, 0)).toEqual({ duel: d1, changed: false })
  })

  it('only the shooter can roll; duplicates are stale', () => {
    const d = started(0)
    expect(() => rollDuel(d, B.id, 1, [3, 3], T0)).toThrow(/соперник/)
    expect(() => rollDuel(d, 999, 1, [3, 3], T0)).toThrow(DuelError)
    const r1 = rollDuel(d, A.id, 1, [3, 3], T0) // point 6
    expect(r1.stale).toBe(false)
    const r2 = rollDuel(r1.duel, A.id, 1, [3, 3], T0)
    expect(r2).toEqual({ duel: r1.duel, stale: true })
    expect(r1.duel.log).toHaveLength(1)
  })

  it('a full match: rounds advance automatically, shooter rotates, result by score', () => {
    let d = started(0) // A shoots rounds 1 and 3
    d = roll(d, 7) // A natural -> A +100, round 2 starts, B shoots
    expect(d.match!.phase).toBe('comeOut')
    expect(shooterSeat(d)).toBe(1)
    d = roll(d, 6)
    d = roll(d, 4)
    d = roll(d, 7) // B seven-out -> A +100
    expect(shooterSeat(d)).toBe(0)
    d = roll(d, 12) // A craps -> B +100
    expect(d.status).toBe('over')
    expect(d.result).toMatchObject({ winner: 0, reason: 'score' })
    expect(d.match!.scores).toEqual({ player: 200, bot: 100 })
    expect(() => roll(d, 7)).toThrow()
  })

  it('stored state equals a replay of the log (client and server agree)', () => {
    let d = started(1)
    for (const t of [5, 8, 5, 11, 2, 9, 9]) if (d.status === 'active') d = roll(d, t)
    const r = replay(d.firstSeat!, d.log)
    expect(r.current).toEqual(d.match)
    expect(r.steps).toHaveLength(d.log.length)
  })

  it('surrender gives the game to the other seat', () => {
    const d = forfeitDuel(started(0), B.id, T0 + 5)
    expect(d.result).toMatchObject({ winner: 0, reason: 'surrender' })
    expect(() => forfeitDuel(d, A.id, T0)).toThrow()
  })
})

describe('timeouts and reminders', () => {
  it('deadline is 24 h after the roll became due; the shooter loses on timeout', () => {
    const d = roll(started(0), 6, T0 + 1000) // A in point, still A's roll
    expect(deadlineOf(d)).toBe(T0 + 1000 + TIMING.turnTimeoutMs)
    expect(timeoutDuel(d, T0 + 1000 + TIMING.turnTimeoutMs - 1)).toBe(d)
    const t = timeoutDuel(d, T0 + 1000 + TIMING.turnTimeoutMs)
    expect(t.result).toMatchObject({ winner: 1, reason: 'turn_timeout' })
    expect(() => rollDuel(d, A.id, d.match!.rollId, [1, 1], T0 + 1000 + TIMING.turnTimeoutMs)).toThrow(/истекло/)
  })

  it('reminders at 1 h and 12 h, once each, reset by the next roll', () => {
    const d = started(0)
    const due = d.turnDueAt!
    expect(nextReminderAt(d)).toBe(due + 3600_000)
    expect(dueReminders(d, due + 3599_999)).toEqual([])
    expect(dueReminders(d, due + 3600_000)).toEqual([3600_000])
    const m = markReminders(d, [3600_000])
    expect(dueReminders(m, due + 3600_000)).toEqual([])
    expect(nextReminderAt(m)).toBe(due + 12 * 3600_000)
    const after = roll(m, 6, due + 2 * 3600_000)
    expect(nextReminderAt(after)).toBe(due + 3 * 3600_000)
  })
})

describe('rematch', () => {
  it('loser shoots first; both asks land in the same game', () => {
    let d = started(0)
    d = forfeitDuel(d, A.id, T0) // B wins
    const r = rematchDuel(d, A.id, 'newgame1', T0 + 1)
    expect(r.next!.firstSeat).toBe(0)
    expect(r.next!.status).toBe('active')
    const again = rematchDuel(r.prev, B.id, 'other', T0 + 2)
    expect(again).toMatchObject({ next: null, id: 'newgame1' })
    expect(() => rematchDuel(started(0), A.id, 'x', T0)).toThrow()
  })
})

describe('views', () => {
  it('view hides nothing secret and reports yourTurn per viewer', () => {
    const d = started(1)
    const va = toView(d, A.id, 'link')
    const vb = toView(d, B.id, 'link')
    expect(va).toMatchObject({ me: 0, yourTurn: false })
    expect(vb).toMatchObject({ me: 1, yourTurn: true })
    expect(toView(d, 5, 'link').me).toBeNull()
    expect(JSON.stringify(va)).not.toMatch(/seed|rng/i)
  })

  it('summary score is [mine, theirs]', () => {
    const d = roll(started(0), 7)
    expect(toSummary(d, A.id)).toMatchObject({ score: [100, 0], yourTurn: false })
    expect(toSummary(d, B.id)).toMatchObject({ score: [0, 100], yourTurn: true })
  })

  it('viewer flip makes seat 1 the player side', () => {
    const d = roll(started(0), 7)
    const f = forViewer(d.match!, 1)
    expect(f.scores).toEqual({ player: 0, bot: 100 })
    expect(f.shooter).toBe('player')
    expect(f.rounds[0].winner).toBe('bot')
    expect(flipMatch(flipMatch(d.match!))).toEqual(d.match)
  })
})

describe('notifications', () => {
  const offline = (d: DuelRecord): DuelRecord => ({ ...d, lastSeen: {} })

  it('accept notifies the challenger', () => {
    const d0 = createDuel('abcdefgh', A, T0)
    const d1 = acceptDuel(d0, B, T0, null, 0).duel
    const items = plan(d0, d1, { type: 'accept' }, null, T0)
    expect(items).toEqual([{ key: `accept:${A.id}`, kind: 'accept', to: A.id, duelId: 'abcdefgh' }])
    expect(compose(items[0], d1).text).toMatch(/Первый бросок за тобой/)
  })

  it('turn message only when the dice pass to an offline player', () => {
    const d0 = offline(started(0))
    const d1 = roll(d0, 6, T0 + 10 * 60_000) // point: A keeps shooting
    expect(plan(d0, d1, { type: 'roll', userId: A.id }, null, T0 + 10 * 60_000)).toEqual([])
    const d2 = offline(roll(d1, 6, T0 + 11 * 60_000)) // point made -> B shoots
    const items = plan(d1, d2, { type: 'roll', userId: A.id }, null, T0 + 12 * 60_000)
    expect(items.map((i) => [i.kind, i.to])).toEqual([['turn', B.id]])
    expect(compose(items[0], d2).text).toMatch(/Теперь бросаешь ты/)
  })

  it('final message goes to the offline side only', () => {
    const d0 = offline(started(0))
    const d1 = forfeitDuel(d0, A.id, T0 + 999_999)
    const items = plan(d0, d1, { type: 'forfeit', userId: A.id }, null, T0 + 999_999)
    expect(items.map((i) => i.to)).toEqual([B.id])
    expect(compose(items[0], d1).text).toMatch(/Соперник сдаётся/)
  })
})

describe('chat champion board', () => {
  it('counts each game once; week vs all-time windows', () => {
    const now = Date.UTC(2026, 10, 26) // Thursday
    let c: ChatState = {}
    c = addChatEntry(c, { duelId: 'g1', at: now - 20 * 86400_000, a: A, b: B, winner: 'b' })
    c = addChatEntry(c, { duelId: 'g2', at: now - 3600_000, a: A, b: B, winner: 'a' })
    c = addChatEntry(c, { duelId: 'g3', at: now - 7200_000, a: A, b: B, winner: 'a' })
    expect(addChatEntry(c, { duelId: 'g3', at: now, a: A, b: B, winner: 'b' })).toBe(c)
    const week = board(c, 'week', now)
    expect(week.map((r) => [r.name, r.wins, r.losses])).toEqual([['Саня', 2, 0], ['Кирилл', 0, 2]])
    const all = board(c, 'all', now)
    expect(all[0]).toMatchObject({ name: 'Саня', wins: 2, losses: 1 })
    expect(all[1].winRate).toBeCloseTo(1 / 3)
  })
})
