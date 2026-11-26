import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_RELEASE_MS, DuelController } from '../src/online/DuelController'
import type { DuelView, LoggedRoll, Seat } from '../src/online/protocol'
import { replay } from '../src/online/replay'
import type { DicePair } from '../src/game/rng'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const P0 = { id: 1, name: 'A' }
const P1 = { id: 2, name: 'B' }

function view(me: Seat | null, firstSeat: Seat, rolls: [Seat, DicePair][]): DuelView {
  const log: LoggedRoll[] = rolls.map(([seat, dice]) => ({ seat, dice, at: 0 }))
  const { current } = replay(firstSeat, log)
  return {
    id: 'game1',
    status: current.phase === 'matchEnd' ? 'over' : 'active',
    players: [P0, P1],
    me,
    firstSeat,
    log,
    match: current,
    yourTurn: false,
    deadline: null,
    result: null,
    rematchId: null,
    link: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

const land = (c: DuelController) => {
  const r = c.getView().rolling
  if (r) c.finishRoll(r.rollId)
}

describe('DuelController', () => {
  it('first load snaps to the current state without animating', () => {
    const c = new DuelController()
    c.update(view(0, 0, [[0, [3, 3]]]))
    expect(c.getView().rolling).toBeNull()
    expect(c.getView().match.point).toBe(6)
    expect(c.inSync()).toBe(true)
  })

  it('new rolls from a poll are animated with the server dice, then committed', () => {
    const c = new DuelController()
    c.update(view(1, 0, []))
    c.update(view(1, 0, [[0, [3, 3]]]))
    const v = c.getView()
    // seat 0 is the opponent for viewer seat 1 -> drawn as 'bot'
    expect(v.rolling).toMatchObject({ by: 'bot', dice: [3, 3], rollId: 1 })
    expect(c.inSync()).toBe(false)
    land(c)
    expect(c.getView().match.point).toBe(6)
    expect(c.inSync()).toBe(true)
  })

  it('viewer seat 1 sees own score as player', () => {
    const c = new DuelController()
    c.update(view(1, 1, [[1, [5, 6]]])) // seat 1 natural
    const s = c.getView().match
    expect(s.scores.player + s.scores.bot).toBe(100)
    expect(s.scores.player).toBe(100)
  })

  it('round result is held until "continue"; auto-released if more rolls are pending', () => {
    const c = new DuelController()
    c.update(view(0, 0, []))
    c.update(view(0, 0, [[0, [3, 4]]])) // natural
    land(c)
    expect(c.isHolding()).toBe('roundEnd')
    expect(c.getView().match.phase).toBe('roundEnd')
    expect(c.continueRound()).toBe(true)
    expect(c.getView().match.phase).toBe('comeOut')
    expect(c.getView().match.shooter).toBe('bot')

    // opponent keeps rolling while I look at the result -> auto release
    c.update(view(0, 0, [[0, [3, 4]], [1, [1, 1]], [0, [2, 2]]]))
    land(c) // seat 1 craps -> round 2 to me
    expect(c.isHolding()).toBe('roundEnd')
    vi.advanceTimersByTime(AUTO_RELEASE_MS)
    expect(c.getView().rolling).toMatchObject({ by: 'player', dice: [2, 2] })
  })

  it('a far-behind client jumps to the last roll instead of replaying everything', () => {
    const c = new DuelController()
    c.update(view(0, 0, []))
    const many: [Seat, DicePair][] = [[0, [3, 3]], [0, [1, 2]], [0, [1, 2]], [0, [2, 3]], [0, [5, 6]]]
    c.update(view(0, 0, many))
    expect(c.getView().rolling?.rollId).toBe(5)
  })

  it('stale (shorter) updates are ignored; finishRoll is idempotent', () => {
    const c = new DuelController()
    c.update(view(0, 0, []))
    c.update(view(0, 0, [[0, [3, 3]]]))
    const id = c.getView().rolling!.rollId
    c.update(view(0, 0, []))
    expect(c.getView().rolling?.rollId).toBe(id)
    expect(c.finishRoll(id)).toBe(true)
    expect(c.finishRoll(id)).toBe(false)
  })

  it('safety timer lands a roll if the scene never answers', () => {
    const c = new DuelController({ rollAnimMs: 1000 })
    c.update(view(0, 0, []))
    c.update(view(0, 0, [[0, [3, 3]]]))
    vi.advanceTimersByTime(2200)
    expect(c.getView().rolling).toBeNull()
  })

  it('a finished match loads holding the final state', () => {
    const c = new DuelController()
    c.update(view(0, 0, [[0, [3, 4]], [1, [3, 4]], [0, [6, 6]]]))
    expect(c.isHolding()).toBe('matchEnd')
    expect(c.getView().match.phase).toBe('matchEnd')
    expect(c.getView().match.scores).toEqual({ player: 100, bot: 200 })
  })
})
