/**
 * Injectable randomness. Practice uses Web Crypto; tests use a seeded generator.
 * The dice result is always decided here, before any animation starts.
 */
export interface Rng {
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
}

export type Die = 1 | 2 | 3 | 4 | 5 | 6
export type DicePair = readonly [Die, Die]

export function rollDice(rng: Rng): DicePair {
  return [rng.int(1, 6) as Die, rng.int(1, 6) as Die]
}

/** Deterministic PRNG (mulberry32) for tests and replays. Not for fairness-critical use. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { int: (min, max) => min + Math.floor(next() * (max - min + 1)) }
}

/** Plays back a fixed list of values (cycles). Handy for scripted tests. */
export function scriptedRng(values: readonly number[]): Rng {
  let i = 0
  return {
    int: (min, max) => {
      const v = values[i++ % values.length]
      if (v < min || v > max) throw new Error(`scripted value ${v} outside [${min}, ${max}]`)
      return v
    },
  }
}

type CryptoLike = { getRandomValues(array: Uint32Array<ArrayBuffer>): unknown }

/**
 * Unbiased uniform integers from Web Crypto using rejection sampling
 * (no modulo bias). Falls back to an error, never to Math.random.
 */
export function cryptoRng(c: CryptoLike | undefined = globalThis.crypto): Rng {
  if (!c?.getRandomValues) throw new Error('Web Crypto is not available')
  const buf = new Uint32Array(1)
  return {
    int(min, max) {
      const range = max - min + 1
      const limit = Math.floor(0x100000000 / range) * range
      for (;;) {
        c.getRandomValues(buf)
        if (buf[0] < limit) return min + (buf[0] % range)
      }
    },
  }
}
