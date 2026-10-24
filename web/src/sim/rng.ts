// A small seeded pseudo-random generator (mulberry32) for the browser simulations.
// It is NOT the same generator as Python's random.Random, so a seed here never reproduces
// a result from the Python engine. Simulations say so wherever they show a seed.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller: a normally distributed number with mean 0 and standard deviation 1. */
export function gaussian(rng: Rng): number {
  let u = 0
  while (u === 0) u = rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function randomMatrix(rows: number, cols: number, rng: Rng, scale = 1): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => gaussian(rng) * scale))
}
