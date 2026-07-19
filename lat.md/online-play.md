# Online multiplayer (lockstep netcode)

Two players play a standard match over the internet — one WEST, one EAST —
from the static web build, no accounts, no server. One hosts and shares a
short room code; the other joins.

Full design lives in `spec.md` (player-facing) and `plan.md` (technical,
phase-by-phase status). The sections below anchor that design to code.

## Determinism foundation

Both simulations must reach byte-identical state from the same inputs, so the
sim is fully seeded. Sim code must never call `Math.random()` or `Date.now()`
directly — use the seeded RNG and the sim clock.

`randomSeed()` in `utils/rng.ts` is the one sanctioned `Math.random()`, at the
seed boundary only; online matches replace it with the host's seed.
`deriveSeed()` splits one match seed into independent per-domain streams
(sim/terrain/persona/weather) so they don't mirror each other.

## Transport

`services/net.ts` provides PeerJS (WebRTC) for real matches and
`BroadcastChannel` for same-tab loopback testing, behind one `Transport`
interface.

`NetMsg` is the wire protocol — lobby handshake, ready/ping/resign/bye, and
tick-stamped commands.

## Lockstep scheduler

[[services/lockstep.ts#LockstepScheduler]] batches local and remote input
into fixed-size steps (`stepTicks`) with an input delay (`delaySteps`) so both
sides commit the same tick's commands before simulating it.

Its `ticksAllowed(nextTick)` is the gate wired into [[game-loop#The tick
loop]] — the sim only advances as far as both peers have confirmed. A timer
backstop covers backgrounded tabs, where `requestAnimationFrame` throttles.

## Session / lobby lifecycle

[[services/online.ts#OnlineSession]] owns the lobby → ready → match → in-match
→ end lifecycle, exchanging config and seed during the handshake so both
clients build the identical match.

`host()`/`join()` open the handshake; `setSettings`/`setReady` drive the
lobby; `beginMatch(config)` starts the scheduler; `onMsg` handles the wire
protocol (ping/pong for the latency badge, resign, peer-left).

## Verification

Desync must be detected and surfaced (a desync screen), never played out
silently. Checksums are compared tick-for-tick between two independent
browser instances.

`simChecksum()` + `?seed=` + `scripts/e2e/smoke22.cjs`/`smoke23.cjs` run the
comparison; `window.__ewDebug.checksumInfo` and `scheduler.trace` are the
forensics hooks.
