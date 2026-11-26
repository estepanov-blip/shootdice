import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeController, type PracticeView } from '../src/game/PracticeController'
import { scriptedRng, seededRng } from '../src/game/rng'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Lands whatever is in the air, like the scene would. */
function land(c: PracticeController) {
  const r = c.getView().rolling
  if (r) c.finishRoll(r.rollId)
}

describe('PracticeController', () => {
  it('human roll locks input until the animation lands', () => {
    const c = new PracticeController({ rng: scriptedRng([3, 4]) })
    expect(c.requestRoll('player')).toBe(true)
    expect(c.getView().rolling?.dice).toEqual([3, 4])
    // score not applied yet: animation only displays a predetermined result
    expect(c.getView().match.scores.player).toBe(0)
    expect(c.requestRoll('player')).toBe(false)
    land(c)
    expect(c.getView().rolling).toBeNull()
    expect(c.getView().match.scores.player).toBe(100)
    expect(c.getView().match.lastDice).toEqual([3, 4])
  })

  it('double click and double finish cannot duplicate scores', () => {
    const c = new PracticeController({ rng: scriptedRng([6, 5]) })
    c.requestRoll('player')
    c.requestRoll('player')
    c.requestRoll('player')
    const id = c.getView().rolling!.rollId
    expect(c.finishRoll(id)).toBe(true)
    expect(c.finishRoll(id)).toBe(false)
    vi.advanceTimersByTime(10_000) // safety timer must not re-commit
    expect(c.getView().match.scores).toEqual({ player: 100, bot: 0 })
    expect(c.getView().match.rounds).toHaveLength(1)
  })

  it('dice shown during animation equal the committed result', () => {
    const c = new PracticeController({ rng: seededRng(42) })
    for (let i = 0; i < 30 && c.getView().match.phase !== 'matchEnd'; i++) {
      const v = c.getView()
      if (v.match.phase === 'roundEnd') {
        c.continueRound()
        continue
      }
      if (v.match.shooter === 'bot') vi.advanceTimersByTime(800)
      else c.requestRoll('player')
      const shown = c.getView().rolling!.dice
      land(c)
      expect(c.getView().match.lastDice).toEqual(shown)
    }
  })

  it('player cannot roll on the bot turn', () => {
    const c = new PracticeController({ rng: scriptedRng([1, 1]), firstShooter: 'bot' })
    expect(c.requestRoll('player')).toBe(false)
  })

  it('bot rolls after 800 ms, not before', () => {
    const c = new PracticeController({ rng: scriptedRng([2, 2]), firstShooter: 'bot' })
    vi.advanceTimersByTime(799)
    expect(c.getView().rolling).toBeNull()
    vi.advanceTimersByTime(1)
    expect(c.getView().rolling).toMatchObject({ by: 'bot', dice: [2, 2] })
    land(c)
    expect(c.getView().match.point).toBe(4)
    // keeps shooting in point phase
    vi.advanceTimersByTime(800)
    expect(c.getView().rolling?.by).toBe('bot')
  })

  it('safety timer commits if the scene never reports back', () => {
    const c = new PracticeController({ rng: scriptedRng([5, 6]), rollAnimMs: 1000 })
    c.requestRoll('player')
    vi.advanceTimersByTime(2199)
    expect(c.getView().rolling).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(c.getView().rolling).toBeNull()
    expect(c.getView().match.scores.player).toBe(100)
  })

  it('full three-round match with rotation: player, bot, player', () => {
    // r1 player 7 win; r2 bot 4 then 7 (seven-out -> player); r3 player 2 (craps -> bot)
    const c = new PracticeController({ rng: scriptedRng([3, 4, 2, 2, 3, 4, 1, 1]) })
    const shooters: string[] = []
    shooters.push(c.getView().match.shooter)
    c.requestRoll('player')
    land(c)
    expect(c.getView().match.phase).toBe('roundEnd')
    c.continueRound()
    shooters.push(c.getView().match.shooter)
    vi.advanceTimersByTime(800)
    land(c)
    vi.advanceTimersByTime(800)
    land(c)
    c.continueRound()
    shooters.push(c.getView().match.shooter)
    c.requestRoll('player')
    land(c)
    const m = c.getView().match
    expect(shooters).toEqual(['player', 'bot', 'player'])
    expect(m.phase).toBe('matchEnd')
    expect(m.scores).toEqual({ player: 200, bot: 100 })
    expect(c.hasPendingTimers()).toBe(false)
  })

  it('auto-advance after a resolved round when configured', () => {
    const c = new PracticeController({ rng: scriptedRng([3, 4]), roundEndHoldMs: 2000 })
    c.requestRoll('player')
    land(c)
    vi.advanceTimersByTime(1999)
    expect(c.getView().match.phase).toBe('roundEnd')
    vi.advanceTimersByTime(1)
    expect(c.getView().match.phase).toBe('comeOut')
    expect(c.getView().match.shooter).toBe('bot')
  })

  it('replay resets the match and cancels bot timers', () => {
    const c = new PracticeController({ rng: scriptedRng([3, 4, 2, 2]) })
    c.requestRoll('player')
    land(c)
    c.continueRound() // bot's turn, bot timer armed
    expect(c.hasPendingTimers()).toBe(true)
    const before = c.getView().matchNo
    c.newMatch()
    const v = c.getView()
    expect(v.matchNo).toBe(before + 1)
    expect(v.match).toMatchObject({ phase: 'comeOut', roundIndex: 0, shooter: 'player', scores: { player: 0, bot: 0 } })
    expect(v.rolling).toBeNull()
    expect(c.hasPendingTimers()).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(c.getView().rolling).toBeNull()
  })

  it('replay in the middle of a roll drops the pending roll', () => {
    const c = new PracticeController({ rng: scriptedRng([3, 4]) })
    c.requestRoll('player')
    const id = c.getView().rolling!.rollId
    c.newMatch()
    expect(c.finishRoll(id)).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(c.getView().match.scores).toEqual({ player: 0, bot: 0 })
  })

  it('destroy cancels the bot (leaving the screen)', () => {
    const c = new PracticeController({ rng: scriptedRng([2, 2]), firstShooter: 'bot' })
    const seen: PracticeView[] = []
    c.subscribe((v) => seen.push(v))
    c.destroy()
    vi.advanceTimersByTime(5000)
    expect(seen).toHaveLength(0)
    expect(c.hasPendingTimers()).toBe(false)
  })

  it('pause keeps state, never rerolls, resume commits the same dice', () => {
    const c = new PracticeController({ rng: scriptedRng([4, 4, 6, 6]) })
    c.requestRoll('player')
    c.pause()
    expect(c.finishRoll(c.getView().rolling!.rollId)).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(c.getView().rolling?.dice).toEqual([4, 4])
    expect(c.requestRoll('player')).toBe(false)
    c.resume()
    expect(c.getView().rolling).toBeNull()
    expect(c.getView().match.point).toBe(8)
    expect(c.getView().match.lastDice).toEqual([4, 4])
  })

  it('pause stops the bot, resume reschedules it', () => {
    const c = new PracticeController({ rng: scriptedRng([2, 2]), firstShooter: 'bot' })
    vi.advanceTimersByTime(500)
    c.pause()
    vi.advanceTimersByTime(5000)
    expect(c.getView().rolling).toBeNull()
    c.resume()
    vi.advanceTimersByTime(800)
    expect(c.getView().rolling?.by).toBe('bot')
  })

  it('a long seeded run of matches never breaks invariants', () => {
    const c = new PracticeController({ rng: seededRng(7) })
    for (let match = 0; match < 200; match++) {
      let guard = 0
      while (c.getView().match.phase !== 'matchEnd') {
        if (++guard > 500) throw new Error('match did not end')
        const v = c.getView()
        if (v.match.phase === 'roundEnd') c.continueRound()
        else if (v.match.shooter === 'bot') vi.advanceTimersByTime(800)
        else c.requestRoll('player')
        land(c)
      }
      const m = c.getView().match
      expect(m.rounds).toHaveLength(3)
      expect(m.scores.player + m.scores.bot).toBe(300)
      expect(m.rounds.map((r) => r.shooter)).toEqual(['player', 'bot', 'player'])
      c.newMatch()
    }
  })
})
