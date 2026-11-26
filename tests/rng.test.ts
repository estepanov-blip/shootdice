import { describe, expect, it } from 'vitest'
import { cryptoRng, rollDice, scriptedRng, seededRng } from '../src/game/rng'

describe('rng', () => {
  it('seeded rng is deterministic', () => {
    const a = seededRng(123)
    const b = seededRng(123)
    const xs = Array.from({ length: 50 }, () => a.int(1, 6))
    const ys = Array.from({ length: 50 }, () => b.int(1, 6))
    expect(xs).toEqual(ys)
  })

  it('crypto rng stays in range and covers all faces roughly uniformly', () => {
    const rng = cryptoRng()
    const counts = [0, 0, 0, 0, 0, 0]
    const N = 60_000
    for (let i = 0; i < N; i++) {
      const v = rng.int(1, 6)
      expect(v >= 1 && v <= 6).toBe(true)
      counts[v - 1]++
    }
    for (const c of counts) expect(Math.abs(c - N / 6)).toBeLessThan(N / 6 * 0.05)
  })

  it('crypto rng rejects biased values (rejection sampling)', () => {
    // first value is in the biased tail (>= floor(2^32/6)*6) and must be skipped
    const values = [0xffffffff, 5]
    let i = 0
    const fake = {
      getRandomValues(arr: Uint32Array) {
        arr[0] = values[i++]
        return arr
      },
    }
    expect(cryptoRng(fake).int(1, 6)).toBe(6)
    expect(i).toBe(2)
  })

  it('crypto rng refuses to fall back silently', () => {
    expect(() => cryptoRng({} as never)).toThrow()
  })

  it('rollDice returns two independent dice', () => {
    expect(rollDice(scriptedRng([2, 5]))).toEqual([2, 5])
  })

  it('seeded dice totals follow the 2d6 distribution', () => {
    const rng = seededRng(99)
    const totals = new Array(13).fill(0)
    const N = 72_000
    for (let i = 0; i < N; i++) {
      const [a, b] = rollDice(rng)
      totals[a + b]++
    }
    const ways = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]
    for (let t = 2; t <= 12; t++) expect(Math.abs(totals[t] - (N * ways[t]) / 36)).toBeLessThan(N * 0.006)
  })
})
