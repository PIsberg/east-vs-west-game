// Deterministic PRNG for the simulation (online lockstep + replay).
//
// The whole netcode design rests on one invariant: given the same match seed
// and the same tick-stamped inputs, two machines compute bit-identical sim
// state. Every random draw that can touch sim state (units, terrain, money,
// weather, combat rolls) must come from a seeded stream — never Math.random,
// which stays legal ONLY for cosmetics (particles, decals, camera shake).
//
// Two kinds of stream, and the distinction matters:
// - The per-match sim stream (mulberry32(deriveSeed(seed, DOMAIN_SIM))) is
//   consumed strictly inside the tick/command path, where execution order is
//   deterministic. Never draw from it in a React render or effect that can
//   re-run.
// - Mount-time randomness (terrain layout, CPU persona) uses its own stream
//   derived from the seed with a distinct domain label. Re-evaluating it
//   (React re-render, StrictMode double-effect) yields the same values and
//   leaves the sim stream untouched.

export type Rng = () => number;

// Tiny, fast, well-distributed 32-bit PRNG. Not cryptographic — it seeds a
// battlefield, not a keypair.
export const mulberry32 = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Independent sub-seed for a labelled domain, so terrain / persona / sim
// streams derived from one match seed don't mirror each other.
export const deriveSeed = (seed: number, domain: number): number =>
  (Math.imul(seed ^ domain, 0x9e3779b1) ^ Math.imul(seed >>> 16, 0x85ebca77)) >>> 0;

// Entropy for local (non-networked) matches — the one sanctioned Math.random
// at the seed boundary. Online play replaces this with the host's seed.
export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;

// Domain labels (arbitrary but fixed — changing one is a replay-format break)
export const DOMAIN_SIM = 1;
export const DOMAIN_TERRAIN = 2;
export const DOMAIN_PERSONA = 3;
export const DOMAIN_WEATHER0 = 4;
