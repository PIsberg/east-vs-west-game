# Online 1v1 — Implementation Plan

*How to build what [spec.md](spec.md) describes. Grounded in the current code as of 2026-07-17.*

## Implementation status (updated 2026-07-17)

| Phase | Status | Evidence |
|---|---|---|
| 1 Determinism foundation | **done** | seeded sim RNG + deterministic ids + sim clock + tick-stamped input pipeline; full smoke suite green |
| 2 Verification harness | **done** | `simChecksum()` + `?seed=` + `scripts/e2e/smoke22.cjs` (two independent browsers, ~13k ticks, identical checkpoints) |
| 3 Transport | **done** | `services/net.ts` — PeerJS + BroadcastChannel loopback behind one interface |
| 4 Lockstep scheduler | **done** | `services/lockstep.ts`; gate wired into the GameCanvas loop; timer backstop for backgrounded tabs |
| 5 Lobby + lifecycle | **done** | `services/online.ts` + App splash panel (host/join/ready), config+seed handshake; `smoke23.cjs` plays a full loopback match with cross-wire commands |
| 6 In-match UX | **done (v1)** | ping badge, waiting overlay, disconnect/claim-victory, desync screen, pause/2× locked online, foe panel hidden |
| 7 Hardening | **partial** | checksum exchange + desync surfacing + 10s heartbeat live; TODO: real-internet soak, cross-browser matrix, TURN fallback |

**Playtested 2026-07-18** (scripted human flow: host → share code → join → ready → battle → targeted strike → rage-quit): all steps pass repeatedly. The playtest caught and fixed three real bugs — a lobby-transition race that intermittently desynced matches (stale splash canvas flushing the lockstep scheduler at its own tick count; scheduler now mount-frozen and the canvas swap is atomic), a hotkey leak where typing a room code containing '8' armed a Mine Tank (input/splash/ownership guards added), and silent peer-death going unnoticed (heartbeat added). Desync forensics kept: `__ewDebug.checksumInfo` journal + `scheduler.trace`.

Not yet exercised: real PeerJS/WebRTC path over the internet (loopback covers everything above the transport), reconnection (out of scope v1 per spec), match-history "online" tag.

## 1. Where the codebase stands today

Findings that drive the design (verified against the source, not assumed):

1. **All player intent already flows through serializable queues.** `App.tsx` pushes plain-data objects onto `spawnQueue` (`{team, type, cost, absolutePos, lane…}`), `commandQueue` (`{team, cmd}`) and `orderQueue` (`{ids, order, ability}`); `GameCanvas` consumes them via effects (`GameCanvas.tsx:1302-1404`). Stances, pause and speed arrive as props. **Nothing about a human player's actions is unserializable** — this is 90% of the input pipeline a networked game needs, already built.
2. **The sim is thoroughly nondeterministic today.** `Math.random` appears ~200+ times in `GameCanvas.tsx` alone — terrain generation, weather rolls, combat scatter, drop points, *and* pure FX. `generateId()` (`GameCanvas.tsx:528`) derives entity ids from `Math.random`, and per-unit orders reference units *by id* — so ids themselves must be identical across clients.
3. **Sim timers are wall-clock.** `Date.now()` drives gameplay-relevant state: `suppressedUntil`, `lastHitTime` (repair lockout + hit flash), `buildUntil`, `coverEnterTime`, `spawnTime` (airborne descent window, min-lifetime checks), rally `until`, focus-fire `until`, the weather timer. Two machines ticking at different real-time rates would disagree on all of these.
4. **The loop is frame-coupled but already abstracted over "ticks per frame".** `GAME_TEMPO` fractional ticks per rAF frame, the 2× toggle multiplies, and spectate mode already does wall-clock catch-up ticking — precedent for driving tick count from something other than "one frame elapsed".
5. **Hosting is static** (GitHub Pages, Capacitor for mobile). No backend exists and the spec forbids owning one. Any solution must be browser-to-browser.
6. **Fog of war is already per-team and client-side** (`fogFilterUnits`, per-team `Uint8Array` grids), and rendering/FX are already segregated from sim state by the ref/snapshot architecture. The renderer never feeds back into the sim.

## 2. Architecture decision

### Chosen: deterministic lockstep over a WebRTC data channel

Both clients run the full simulation. Only *inputs* cross the wire, scheduled to execute on an agreed future tick. If both sims are deterministic and consume identical inputs on identical ticks, they stay bit-identical forever — bandwidth is a few bytes per player action, latency tolerance is excellent, and every existing and future gameplay system is "networked for free" as long as it follows the determinism rules.

Why this fits *this* codebase:

- The input-queue architecture (finding 1) **is** a lockstep input pipeline; we only add "stamp each entry with an execution tick and mirror it to the peer".
- The state surface is enormous and mutated in place everywhere (units, terrain objects, buildings, bridges, craters, wrecks, smokes, fog grids, air ops, CTF flags…). Snapshot-based sync would need serializers + appliers for *all* of it, maintained forever, with every new feature paying a wire-schema tax. Lockstep needs none of that.
- The costs of lockstep (determinism refactor) are one-time and mechanical; the costs of state sync are permanent and grow with the game.

### Rejected alternatives

- **Host-authoritative state snapshots** (host sims, guest renders snapshots + sends inputs): avoids determinism entirely, but requires serializing the full mutable state surface at 10–20 Hz, an interpolation layer for the guest, and a permanent two-codepath split (host-sim vs guest-ghost) through GameCanvas — the single biggest file in the repo. Also gives the guest ~RTT of extra input lag that the host doesn't have. More code, worse feel, ongoing tax.
- **Server-authoritative**: no server exists and spec G2 forbids owning one. Dead on arrival.
- **Hybrid (lockstep + host state-transfer on desync)**: the recovery path needs the full serializer anyway. Deferred — v1 treats desync as match-void (spec §4.5); if telemetry shows desyncs actually happen, build the resync path then.

### Transport: PeerJS (WebRTC DataChannel) behind a tiny transport interface

- **PeerJS** gives WebRTC + free cloud signaling (the public PeerServer) + room-code-like peer ids, with zero infrastructure. STUN via defaults; TURN deferred (spec F7).
- Wrap it in `services/net.ts` behind a ~5-method interface (`host(code)`, `join(code)`, `send(msg)`, `onMessage`, `onClose`) so the implementation is swappable:
  - `LoopbackTransport` via `BroadcastChannel` — two tabs on one machine, no network, used by e2e tests and local development.
  - `PeerJsTransport` — production.
- One **reliable, ordered** data channel for everything (lockstep requires reliable delivery of inputs; game messages are tiny, head-of-line blocking is irrelevant at this rate). Config messages and tick bundles share the channel with a `type` field.

## 3. Work plan

Phases are ordered so each lands independently and keeps `main` shippable. Phase 1+2 are pure refactors validated by the existing harnesses; nothing network-visible ships until Phase 5.

### Phase 1 — Determinism foundation (the real work)

Everything gameplay-affecting becomes a pure function of `(seed, tick, inputs)`.

**1a. Sim RNG.** Add a tiny seeded PRNG (mulberry32, ~10 lines) to `utils/` — `simRng` owned by GameCanvas, seeded from match config (local play seeds it from entropy, so solo behavior stays varied). Classify every `Math.random` in `GameCanvas.tsx`:
- **Sim** (→ `simRng()`): terrain/building/prop generation, bridge placement, weather roll + hold durations, combat spread/scatter, drop-point sampling, supply-drop timing/type/position, lightning strike position *and its damage*, CPU persona pick, anything that touches unit/terrain/economy state.
- **FX** (stays `Math.random`): particle velocity/life/color/size jitter, decals, camera shake — anything writing only to `particlesRef`/visuals. The renderer (`GameScene.tsx`) is untouched — all its randomness/`Date.now` is cosmetic by construction (finding 6).

Rule of thumb during the sweep: *if the value ever reaches a `Unit`, `Projectile`, `TerrainObject`, money, score or a ref the tick reads back, it's sim.* When in doubt, sim — a wasted PRNG draw is harmless as long as both clients draw it (which they do, running the same code).

**1b. Deterministic ids.** Replace `generateId()`'s `Math.random` base with a per-match monotonic counter (`ev-<n>`) for *sim entities* (units, projectiles, terrain objects, mines, smokes…). Particles/events can keep random ids (never referenced cross-client) — but simplest is one counter for everything; ids are only compared for equality, and a shared counter can't collide.

**1c. Sim clock.** Introduce `simNow()` = `tickCount * SIM_MS_PER_TICK` (SIM_MS_PER_TICK = 1000/60 — one nominal frame per tick, so existing ms constants keep their meaning at 1× speed) and mechanically replace every gameplay `Date.now()` in the tick path and spawn path: `suppressedUntil`, `lastHitTime`, `buildUntil`, `coverEnterTime`, `coverDuration` checks, `spawnTime`, rally/focus `until`, the weather timer (`weatherTimerRef`), airborne descent windows, APC/stuck sampling if wall-clock. Wall-clock survives only for display/telemetry (`matchStartRef` match duration, event feed timestamps, `lastUiUpdateRef`, score-timeline sampling) and for pure-UI paths in App. **Watch for the semantic shift**: under pause, `simNow()` freezes (correct — a paused match shouldn't tick suppression down) and under 2× it runs double-real-time (correct — matches everything else). This actually *fixes* two latent local bugs: bunker builds and rally currently run on wall-clock and ignore pause/speed.
- `GameState.weatherNext.at` and the challenge timer in App currently compare against `Date.now()` — convert those HUD readouts to sim-time deltas shipped in the snapshot.

**1d. Seeded terrain.** The terrain-gen effect takes the match seed; identical seed ⇒ identical battlefield, bridges, strongpoints, props, gold mines, CTF flag spots.

**1e. Input tick-stamping.** Move queue consumption from React effects into the tick: effects currently apply `spawnQueue`/`commandQueue`/`orderQueue` whenever React flushes, i.e. between arbitrary ticks. Add an internal `pendingInputs: Map<tick, NetCommand[]>`; local UI pushes commands stamped for tick `T+delay`, and the tick loop executes exactly the commands stamped for the tick it is running. Stances/pause/speed props join the same channel (as commands) in online mode. Local play uses delay 0 — behavior identical to today, one code path.

**Exit criteria:** `npx tsc --noEmit` clean; full smoke suite green; balance harness within noise of baseline (F8); a `?seed=` URL param produces the same battlefield twice.

### Phase 2 — Determinism verification harness (before any networking)

- **State checksum**: `simChecksum()` — FNV-1a over the sim-relevant state in fixed iteration order: per-unit (id, type, team, x, y float bits, health, rank, flags), projectiles, money, score, base HP, weather, capture owners, building occupancy, RNG cursor, tick. Float bits via a shared `Float64Array`/`Uint32Array` view — never `toFixed`. Exposed as `__ewDebug.checksum()`.
- **Replay recorder** (dev): record `(seed, [tick, command][])` to a downloadable JSON; a `?replay=` mode re-runs it headlessly.
- **e2e determinism test** (extends `scripts/e2e/`): launch two pages on the same seed, drive scripted identical inputs through the real queues, compare checksums every 100 ticks for a few sim-minutes; then a second run asserting run-to-run identity. This test is the tripwire that catches every future "someone used `Math.random` in the tick" regression — it earns its CI seconds forever.

**Exit criteria:** two independent instances hold identical checksums for a full scripted match, repeatedly.

### Phase 3 — Transport + protocol (`services/net.ts`)

Message envelope `{v: PROTOCOL_VERSION, type, ...}`. Types:

| Type | Direction | Payload |
|---|---|---|
| `hello` | join → host | build id (injected at build time via `import.meta.env` + git hash), protocol version |
| `lobby` | host → guest | match settings live view |
| `start` | host → guest | full `MatchConfig`: seed, map, mode, asymmetry, fog, host side, input delay |
| `cmds` | both, every net-step | `{step, commands: NetCommand[]}` — **sent even when empty** (empty bundle = "I have nothing for step N", which is what lets the peer advance) |
| `ack` | both | highest contiguous step received (drives pacing + ping calc) |
| `checksum` | both, every 100 ticks | `{tick, hash}` |
| `pause` / `resume` / `resign` / `rematch` | both | — |
| `bye` | both | clean leave |

`NetCommand` is a tagged union mirroring today's queue entries: `spawn`, `teamCmd`, `order`, `stance`, plus `pause`/`resume`/`resign`. All plain JSON; bandwidth is trivial (spikes ~10 msgs/s of <200 B).

Room codes: `EW-` + 4 chars from an unambiguous alphabet, mapped to a namespaced PeerJS id (`ewv-<code>`). Collision on host = reroll.

### Phase 4 — Lockstep scheduler (`services/lockstep.ts`)

The one genuinely new algorithm. Keep it a pure class, unit-testable without a browser:

- Time is divided into **net-steps** of `STEP_TICKS` ticks (start: 3 ticks ≈ 40 ms of sim). Commands issued during step `N` execute at step `N + INPUT_DELAY_STEPS` (start: 2 → ~80–107 ms command latency; tune by feel).
- The sim may run tick `T` only when both players' command bundles for the step containing `T` have arrived. Otherwise the loop **holds** (renderer keeps drawing; "Waiting for opponent…" after ~600 ms).
- GameCanvas integration is minimal by design: the rAF loop currently computes "how many ticks do I run this frame" from `GAME_TEMPO` — in online mode it instead asks the scheduler `stepper.ticksAllowed(now)`, and feeds `pendingInputs` from the scheduler's confirmed bundles instead of directly from React props. Everything inside the tick is already deterministic after Phase 1.
- Drift pacing: if we're consistently ahead of the peer (their bundles arrive just-in-time), shave the tick rate a few % rather than oscillating between run and stall.
- 2× speed disabled online (spec); pause/resume are commands like any other, so the sims freeze on the same tick.

**Exit criteria:** scheduler unit tests (delayed/bursty/duplicate delivery, stall/resume, pacing) pass in isolation; two loopback tabs play a full match by hand.

### Phase 5 — Lobby + match lifecycle (App.tsx)

- Splash: **Online** panel → Host (create room, show code, settings editor) / Join (code input → read-only settings view). Reuses the existing settings state; host's changes stream via `lobby` msgs.
- Ready/countdown/start: on `start`, App mounts GameCanvas exactly like today, with new props: `net={transport, scheduler}`, `localTeam`, and `matchSeed`. `cpuTeams=[]`, fog keyed to `localTeam`.
- `handleSpawnRequest` & friends: validation (affordability, bans, infantry-only) already runs before enqueue — unchanged; the enqueue path routes through the scheduler in online mode.
- End of match: existing gameOver flow + `online` tag in `ewv-history`; rematch = new seed, same config, both re-mount via `gameKey`.
- Disconnect/desync/version-mismatch overlays per spec §4.5. `bye` vs silent close distinguished by a 10 s timeout.

### Phase 6 — In-match UX polish

Ping badge (from `ack` RTT, EWMA), "Waiting for opponent" overlay with counter, paused-by-name banner, forfeit/claim-victory flow, background-tab warning (rAF throttling → drive the loop from `setTimeout(…, 250)` fallback when `document.hidden` so a backgrounded host doesn't stall the guest more than necessary).

### Phase 7 — Desync handling + hardening

- Compare peer `checksum` msgs (they lag ~RTT; compare at matching ticks, keep a small ring buffer of recent local hashes). On mismatch: freeze, show spec's diverged screen, offer diagnostic copy (both hashes, tick, build id, browser UA, RNG cursor, unit-count summary).
- Soak: scripted 20-minute loopback matches; artificial latency/jitter (transport wrapper with delay injection) at 50/150/300 ms.
- Cross-browser matrix: Chrome↔Chrome, Edge↔Chrome (same engine — expected clean), Firefox↔Chrome (expected risk; measure, then decide whether to gate or allow-with-warning per spec §7).

## 4. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed `Math.random`/`Date.now` in a sim path → desync | High (it's a big sweep) | Phase 2 tripwire e2e in CI; dev-mode assert: during the tick body, patch `Math.random` to increment a counter and `console.warn` on first sim-tick use outside whitelisted FX helpers; checksum catches the rest at runtime |
| Cross-engine float divergence (`Math.sin/cos/atan2/pow` are not spec-fixed) | Medium (same-engine: none; cross-engine: real) | Same-browser-family recommendation (spec §7); measured in Phase 7; if needed later, swap trig call sites to a table/polyfill — deferred, not speculative |
| Two projectile loops / in-place terrain mutation make checksum ordering subtle | Medium | Checksum iterates arrays in index order only, never object-key order; no `Map`/`Set` iteration in sim state |
| PeerJS public broker down or rate-limited | Low | Transport interface makes broker swappable; self-hosting PeerServer is a 10-line node app if ever needed (still no game traffic through it) |
| NAT pairs that need TURN can't connect | Medium (~5–10% of pairs) | Clear error per spec; TURN via a free-tier provider as a fast-follow |
| Tab backgrounding stalls the match | Certain when it happens | `document.hidden` timeout-driven loop (Phase 6) + honest "Waiting…" UI |
| Refactor drifts local balance (spec F8) | Low | Balance harness before/after Phase 1; smoke suite; `?seed` makes any drift reproducible |
| Guest input lag from host-authority temptation | — | Avoided structurally: lockstep is symmetric, both sides have identical delay |

## 5. Testing strategy (summary)

1. **Unit**: lockstep scheduler (pure), PRNG, checksum stability.
2. **Determinism e2e** (CI): two-page loopback, scripted inputs, checksum equality — the permanent regression tripwire.
3. **Existing suites**: full smoke + balance harness after Phase 1 (no-drift gate) and before each merge.
4. **Soak**: long loopback matches under injected latency/jitter/loss-of-focus.
5. **Manual**: real two-machine internet matches (different networks) across the browser matrix; every failure case in spec §4.5 forced at least once.

## 6. Sequencing & effort

| Phase | Size | Depends on |
|---|---|---|
| 1 Determinism foundation | **L** (the sweep is wide but mechanical; 1e is the only structural change) | — |
| 2 Verification harness | M | 1 |
| 3 Transport + protocol | S | — (parallel with 1–2) |
| 4 Lockstep scheduler | M | 2, 3 |
| 5 Lobby + lifecycle | M | 4 |
| 6 UX polish | S | 5 |
| 7 Desync + hardening | M | 5 |

Phases 1–2 are the risk bulk and ship silently (pure refactor). First playable online build lands at end of Phase 5; 6–7 make it honest and durable.
