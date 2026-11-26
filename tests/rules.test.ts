import { describe, expect, it } from 'vitest'
import {
  applyRoll,
  canRoll,
  classify,
  createMatch,
  matchOutcome,
  nextRound,
  ROUND_WIN_SCORE,
  type MatchState,
  type PointNumber,
} from '../src/game/rules'
import type { DicePair, Die } from '../src/game/rng'

const ALL_PAIRS: DicePair[] = []
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ALL_PAIRS.push([a as Die, b as Die])

function pairFor(total: number): DicePair {
  const p = ALL_PAIRS.find(([a, b]) => a + b === total)
  if (!p) throw new Error(`no pair for ${total}`)
  return p
}

function roll(s: MatchState, total: number): MatchState {
  const r = applyRoll(s, pairFor(total), s.shooter, s.rollId)
  if (!r.ok) throw new Error(r.error)
  return r.state
}

function inPoint(point: PointNumber): MatchState {
  return roll(createMatch('player'), point)
}

describe('all 36 dice pairs on come-out', () => {
  it.each(ALL_PAIRS.map((p) => [p[0], p[1]] as const))('%i + %i', (a, b) => {
    const s = createMatch('player')
    const r = applyRoll(s, [a as Die, b as Die], 'player', s.rollId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const total = a + b
    expect(r.state.lastDice).toEqual([a, b])
    expect(r.state.lastRoll?.total).toBe(total)
    if (total === 7 || total === 11) {
      expect(r.state.lastRoll?.kind).toBe('natural')
      expect(r.state.scores).toEqual({ player: ROUND_WIN_SCORE, bot: 0 })
      expect(r.state.phase).toBe('roundEnd')
    } else if (total === 2 || total === 3 || total === 12) {
      expect(r.state.lastRoll?.kind).toBe('craps')
      expect(r.state.scores).toEqual({ player: 0, bot: ROUND_WIN_SCORE })
      expect(r.state.phase).toBe('roundEnd')
    } else {
      expect(r.state.lastRoll?.kind).toBe('pointSet')
      expect(r.state.phase).toBe('point')
      expect(r.state.point).toBe(total)
      expect(r.state.scores).toEqual({ player: 0, bot: 0 })
    }
  })

  it('distribution of the 36 pairs matches craps math', () => {
    const counts = { natural: 0, craps: 0, pointSet: 0 }
    for (const [a, b] of ALL_PAIRS) counts[classify(a + b, null) as keyof typeof counts]++
    expect(counts).toEqual({ natural: 8, craps: 4, pointSet: 24 })
  })
})

describe('come-out totals', () => {
  it.each([7, 11])('%i is a natural: shooter wins', (t) => {
    expect(classify(t, null)).toBe('natural')
  })
  it.each([2, 3, 12])('%i is craps: shooter loses', (t) => {
    expect(classify(t, null)).toBe('craps')
  })
  it.each([4, 5, 6, 8, 9, 10])('%i sets the point', (t) => {
    expect(classify(t, null)).toBe('pointSet')
  })
  it('bot shooter natural gives the bot the round', () => {
    const s = roll(createMatch('bot'), 11)
    expect(s.scores).toEqual({ player: 0, bot: 100 })
    expect(s.rounds[0]).toMatchObject({ winner: 'bot', shooter: 'bot', kind: 'natural' })
  })
  it('bot shooter craps gives the player the round (opposite side)', () => {
    const s = roll(createMatch('bot'), 2)
    expect(s.scores).toEqual({ player: 100, bot: 0 })
  })
})

describe('point phase', () => {
  const points: PointNumber[] = [4, 5, 6, 8, 9, 10]

  it.each(points)('point %i: repeating it wins for the shooter', (p) => {
    const s = roll(inPoint(p), p)
    expect(s.lastRoll?.kind).toBe('pointMade')
    expect(s.phase).toBe('roundEnd')
    expect(s.scores).toEqual({ player: 100, bot: 0 })
    expect(s.rounds[0]).toMatchObject({ point: p, rolls: 2, winner: 'player' })
  })

  it.each(points)('point %i: 7 loses for the shooter', (p) => {
    const s = roll(inPoint(p), 7)
    expect(s.lastRoll?.kind).toBe('sevenOut')
    expect(s.scores).toEqual({ player: 0, bot: 100 })
  })

  it.each(points)('point %i: every other total is neutral and keeps the point', (p) => {
    for (let t = 2; t <= 12; t++) {
      if (t === p || t === 7) continue
      const s = roll(inPoint(p), t)
      expect(s.phase).toBe('point')
      expect(s.point).toBe(p)
      expect(s.lastRoll?.kind).toBe('noDecision')
      expect(s.scores).toEqual({ player: 0, bot: 0 })
    }
  })

  it('point persists across many neutral rolls', () => {
    let s = inPoint(9)
    for (const t of [2, 3, 11, 12, 4, 10, 6, 8, 5]) s = roll(s, t)
    expect(s.point).toBe(9)
    expect(s.rollsThisRound).toBe(10)
    s = roll(s, 9)
    expect(s.rounds[0]).toMatchObject({ winner: 'player', rolls: 11, point: 9 })
  })

  it('2, 3, 11, 12 are neutral once a point is set', () => {
    for (const t of [2, 3, 11, 12]) expect(classify(t, 6)).toBe('noDecision')
  })
})

describe('invalid transitions', () => {
  it('rejects a roll when the round is over', () => {
    const s = roll(createMatch(), 7)
    expect(applyRoll(s, [3, 4], 'player', s.rollId)).toEqual({ ok: false, error: 'WRONG_PHASE' })
    expect(applyRoll(s, [3, 4], 'bot', s.rollId)).toEqual({ ok: false, error: 'WRONG_PHASE' })
  })
  it('rejects a roll from the non-shooter', () => {
    const s = createMatch('player')
    expect(applyRoll(s, [3, 4], 'bot', s.rollId)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' })
  })
  it('rejects invalid dice', () => {
    const s = createMatch()
    expect(applyRoll(s, [0, 4] as unknown as DicePair, 'player', 1).ok).toBe(false)
    expect(applyRoll(s, [7, 1] as unknown as DicePair, 'player', 1).ok).toBe(false)
    expect(applyRoll(s, [2.5, 1] as unknown as DicePair, 'player', 1).ok).toBe(false)
  })
  it('nextRound only from roundEnd', () => {
    expect(nextRound(createMatch())).toEqual({ ok: false, error: 'WRONG_PHASE' })
    expect(nextRound(inPoint(6))).toEqual({ ok: false, error: 'WRONG_PHASE' })
  })
  it('does not mutate the input state', () => {
    const s = createMatch()
    const snapshot = JSON.stringify(s)
    applyRoll(s, [3, 4], 'player', s.rollId)
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('duplicate clicks', () => {
  it('the same rollId cannot be scored twice', () => {
    const s0 = createMatch()
    const r1 = applyRoll(s0, [5, 6], 'player', s0.rollId)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const again = applyRoll(r1.state, [5, 6], 'player', s0.rollId)
    expect(again.ok).toBe(false)
    expect(r1.state.scores.player).toBe(100)
  })
  it('a stale rollId in point phase is rejected', () => {
    const s = inPoint(8)
    expect(applyRoll(s, [4, 4], 'player', s.rollId - 1)).toEqual({ ok: false, error: 'STALE_ROLL' })
    expect(applyRoll(s, [4, 4], 'player', s.rollId + 5)).toEqual({ ok: false, error: 'STALE_ROLL' })
  })
})

describe('rounds and match', () => {
  it('shooter rotates after each resolved round', () => {
    let s = roll(createMatch('player'), 7)
    expect(canRoll(s, 'player')).toBe(false)
    let n = nextRound(s)
    if (!n.ok) throw new Error()
    s = n.state
    expect(s.shooter).toBe('bot')
    expect(s.phase).toBe('comeOut')
    expect(s.point).toBeNull()
    s = roll(s, 6)
    s = roll(s, 7)
    n = nextRound(s)
    if (!n.ok) throw new Error()
    expect(n.state.shooter).toBe('player')
    expect(n.state.roundIndex).toBe(2)
  })

  it('point is cleared between rounds', () => {
    let s = roll(inPoint(5), 5)
    const n = nextRound(s)
    if (!n.ok) throw new Error()
    s = n.state
    expect(s.point).toBeNull()
    expect(s.rollsThisRound).toBe(0)
  })

  it('three resolved rounds complete the match', () => {
    let s = roll(createMatch('player'), 7) // player +100
    s = (nextRound(s) as { ok: true; state: MatchState }).state
    s = roll(s, 11) // bot shooter natural, bot +100
    s = (nextRound(s) as { ok: true; state: MatchState }).state
    s = roll(s, 4)
    s = roll(s, 4) // player makes point
    expect(s.phase).toBe('matchEnd')
    expect(s.rounds).toHaveLength(3)
    expect(s.scores).toEqual({ player: 200, bot: 100 })
    expect(matchOutcome(s)).toEqual({ winner: 'player', draw: false, scores: { player: 200, bot: 100 } })
    expect(nextRound(s).ok).toBe(false)
    expect(applyRoll(s, [1, 1], 'bot', s.rollId).ok).toBe(false)
  })

  it('bot can win the match', () => {
    let s = roll(createMatch('player'), 2) // bot +100
    s = (nextRound(s) as { ok: true; state: MatchState }).state
    s = roll(s, 7) // bot natural
    s = (nextRound(s) as { ok: true; state: MatchState }).state
    s = roll(s, 3) // bot +100
    expect(matchOutcome(s)?.winner).toBe('bot')
    expect(s.scores).toEqual({ player: 0, bot: 300 })
  })

  it('equal scores are reported as a draw (even-length matches)', () => {
    let s = roll(createMatch('player', 2), 7) // player
    s = (nextRound(s) as { ok: true; state: MatchState }).state
    s = roll(s, 7) // bot
    expect(s.phase).toBe('matchEnd')
    expect(matchOutcome(s)).toEqual({ winner: null, draw: true, scores: { player: 100, bot: 100 } })
  })

  it('outcome is null before the match ends', () => {
    expect(matchOutcome(createMatch())).toBeNull()
  })

  it('a fresh match resets everything', () => {
    const s = createMatch('player')
    expect(s).toMatchObject({ phase: 'comeOut', point: null, roundIndex: 0, rollId: 1, scores: { player: 0, bot: 0 } })
    expect(s.rounds).toEqual([])
    expect(s.lastDice).toBeNull()
  })
})
