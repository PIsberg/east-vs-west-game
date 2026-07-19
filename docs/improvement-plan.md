# East vs West 3D — Improvement Plan & Specs

Plans and specs for sections 1–4 of the Strategic Improvement Report. Section 5
(network multiplayer) was out of scope when this was written, but has since shipped
as online 1v1 — see `spec.md`/`plan.md` at the repo root.

Every spec below respects the house rules: game data lives in refs mutated by `tick()` in
`GameCanvas.tsx`, React state only for HUD-frequency changes, tuning in `constants.ts`,
high-count visuals on the instanced paths, `npx tsc --noEmit` before commit, and the balance
harness (`scripts/balance-harness.cjs`) before/after anything that touches combat math.

**Suggested build order** (dependencies + risk):

| Order | Feature | Size | Depends on |
|-------|---------|------|------------|
| 1 | 3.1 Adaptive battle march | S | — |
| 2 | 3.2 Spatial audio (panner approach) | S | — |
| 3 | 4.1 CPU commander personalities | M | — |
| 4 | 1.3 Selected-unit active abilities | M | — |
| 5 | 2.1a Knockdown obstacles | S | — |
| 6 | 2.1c Occupiable rubble | S | — |
| 7 | 2.2a Shell-shock post-processing | M | — |
| 8 | 1.1 Fog of War & LOS | L | — (gates 2.2b) |
| 9 | 2.1b Craters & ground deformation | M | — |
| 10 | 1.2 Faction asymmetry | L | harness per-faction support |
| 11 | 2.2b Night missions & headlights | M | Fog of War |
| 12 | 4.2 Grand campaign metagame | XL | personalities (nice), challenges plumbing |

---

## 1. Advanced Gameplay & Tactical Depth

### 1.1 Fog of War & Line of Sight

**Goal.** Per-team visibility so scouting matters and long-range fires need spotting.

**Design decisions.**
- **Grid, not geometry.** The sim is a 2D 800×450 plane; visibility is a coarse grid ref
  (`fogRef`), one `Uint8Array(80 × 45)` per team (10 px cells). Cell states: `0` hidden,
  `1` explored (terrain remembered, units not shown), `2` visible.
- **Vision is a stat.** Add `vision` to `UNIT_CONFIG` (defaults: foot ≈ 110, vehicles ≈ 140,
  JEEP ≈ 200, DRONE ≈ 240, SNIPER ≈ 180, BUNKER/GUNBOAT ≈ 170). Hill bonus reuses
  `HILL_RANGE_BONUS` semantics (`isOnHill` → ×1.3). Own half of the map is always ≥ explored;
  each team's spawn edge strip is permanently visible.
- **LOS blockers (v1 = cheap).** Smoke zones (`smokesRef`) and forest clusters mark blocker
  cells; a blocker cell caps vision *through* it (simple: units inside smoke/forest are visible
  only within point-blank range, mirroring the existing `smokeBlocked` rule — no raycasting in
  v1). Full Bresenham LOS between cells is a v2 flag.
- **CPU stays omniscient in v1.** The CPU threat-analysis pass reads all units today; making it
  honor fog is a separate, careful change (and easy-CPU-honors-fog is the natural v2: it makes
  easy *feel* fair). Document this in the UI tooltip.
- **Fog is optional.** Splash toggle (`ewv-fow` in localStorage prefs), default ON for new
  players is risky — default OFF for one release, then flip.

**Sim changes (`GameCanvas.tsx`).**
- Recompute the grid every 6 ticks (not per tick): clear team layer to explored-mask, stamp a
  disc per unit (`vision` radius). O(units × discCells) is trivially cheap at this resolution.
- **Targeting:** the standard-targeting block and both projectile loops skip enemies whose cell
  isn't `visible` to the shooter's team. Exception: garrison return fire and point-blank
  (< 60 px) contacts are always valid, so an invisible unit that walks into your line still
  gets shot.
- **Blind fire:** area weapons (ARTILLERY, MORTAR, all Air Command strikes) may target fogged
  ground but with a spread multiplier `FOW_BLIND_SPREAD = 1.5` folded into `spreadAtRange`.
  Strikes on fogged clusters the CPU "knows about" are unaffected (omniscient CPU, v1).
- **Events/HUD:** `pushEvent` suppresses events sourced in fog (no free intel from the feed).
  `GameState` snapshot filters the enemy unit array by visibility before handing it to React —
  this is the single choke point, so `GameScene`, the minimap and the HUD all inherit fog for
  free. Keep the *unfiltered* list internal for the sim and CPU.

**Rendering (`GameScene.tsx` + `MiniMap`).**
- One 80×45 `DataTexture` (RGBA, alpha = fog density), updated imperatively in `useFrame` from
  the human team's layer, drawn as a single transparent plane just above the ground with
  `LinearFilter` for soft edges. No per-cell meshes, no shader work beyond a stock material.
- Minimap: after drawing dots, composite the same array as a dark overlay; enemy dots only in
  `visible` cells (already true if it draws from the filtered snapshot).

**Debug/testing.** `__ewDebug.fog(team, x, y)` returns the cell state. New smoke test: spawn a
WEST sniper, assert an EAST unit across the map is absent from the filtered `unitList` snapshot
but present after a jeep drives over. Balance harness runs with fog OFF (CPU-vs-CPU is
omniscient anyway) so efficiency baselines stay comparable.

**Risks.** Readability (mitigate: fog never fully black, `explored` keeps terrain);
double-bookkeeping bugs from filtered vs unfiltered unit lists (mitigate: filter in exactly one
place, the snapshot builder).

---

### 1.2 Faction Asymmetry

**Goal.** West = precision/mobility, East = armor/area-denial, without forking the engine.

**Design decisions.**
- **Asymmetry is data, not code paths.** Two tables in `constants.ts`:
  - `FACTION_MODS: Record<Team, Partial<Record<UnitType, StatMods>>>` — multiplier bundles
    (`hp`, `damage`, `speed`, `reload`, `cost`). Applied **once at spawn** inside `spawnUnit`
    when the unit's stats are copied off `UNIT_CONFIG` — never at read sites, so the hundreds
    of `UNIT_CONFIG` reads in the tick stay untouched. Anything that reads live stats off the
    unit (it already does for veterancy) keeps working.
  - `FACTION_ROSTER: Record<Team, UnitType[]>` — exclusives. The report's "Satellite Laser" and
    "napalm saturation" **already exist** (`SATELLITE`, `NAPALM`, `CRUISE`), so v1 asymmetry is
    mostly *gating*, not building: e.g. WEST-only `SATELLITE` + `CRUISE`; EAST-only `NAPALM` +
    `TESLA`; shared everything else. `renderUnitButtons()` filters by roster; `handleSpawnRequest`
    guards hotkeys (same pattern as `infantryOnly`); CPU counter-pick weights filter by roster.
- **Stat flavor v1** (all mild, harness-verified): EAST TANK `hp ×1.15`, WEST wheeled units
  ignore 50 % of the rough-terrain/hill penalty (one multiplier in `CLASS_PROFILE` application,
  keyed off team), EAST ARTILLERY `damage ×1.1, reload ×1.15` (slower but heavier), WEST SNIPER
  `spread ×0.7`.
- **Shield APC is v2.** It's a new mechanic (projectile absorption dome), not a stat tweak.
  Spec sketch: new `UnitType.SHIELD_APC`, dome = team-keyed check in the projectile resolver
  (rounds crossing the dome radius from outside are absorbed until `shieldHp` depletes;
  recharges out of combat via the existing field-repair pattern). Follow the "adding a new unit
  type" checklist. Do not attempt in the same PR as the data tables.
- **Mirror mode stays.** Splash toggle `Classic (mirrored)` vs `Asymmetric` (persisted in
  `ewv-prefs`). Challenges and the balance-harness baseline run mirrored; asymmetric is a mode,
  so old balance data stays valid.

**Balance process.** Extend `balance-harness.cjs` with `?factions=1` URL param; run the
five-map suite mirrored *and* asymmetric, compare per-unit efficiency AND win-rate by side.
Acceptance: asymmetric side win-rate within 45–55 % over ≥ 20 matches before merging any stat
row.

**Risks.** Every stat row is a balance liability — ship 3–4 rows, not 15. CPU counter-pick
must know the *enemy's* roster (it counters what it sees, so this is nearly free).

---

### 1.3 Selected-Unit Active Abilities

**Goal.** Reward micro: per-unit abilities triggered from the selection order panel.

**Data model.**
- `constants.ts`: `ABILITIES: Partial<Record<UnitType, AbilityDef>>` with
  `{ key, label, hotkey, durationTicks, cooldownTicks, cost? }`.
- `Unit`: add `abilityUntil?: number` (tick when the effect ends) and
  `abilityReadyAt?: number` (tick when it can fire again). Tick-based like `AIR_OPS_*`, so
  pause/2× behave.
- **Plumbing mirrors orders.** App pushes `{ids, ability}` onto the existing `orderQueue`
  channel (widen its item type) — no new prop. `GameCanvas` validates (right type, off
  cooldown, affordable) and stamps the fields. The floating order panel in `App.tsx` grows one
  ability button when the selection contains a capable type; button shows cooldown countdown
  (same `data-testid` badge pattern as `airops-lock`).

**The three launch abilities.**
- **Tank — Overdrive.** For `duration ≈ 6 s`: `speed ×1.4`, firing suppressed (skip the firing
  block while `abilityUntil > tick`). Cooldown ~35 s. Apply the speed multiplier where movement
  is *committed* (same lesson as suppression — the flee/hill branches recompute speed).
- **Sniper — Camouflage.** Not an activated timer but a *state*: while `isInCover` (forest) +
  orders resolve to `hold` + stationary for `CAMO_DELAY_TICKS`, set `unit.camouflaged = true`.
  Targeting skips camouflaged enemies (add the check next to the flyover/smoke exclusions in
  the standard-targeting block *and* both projectile loops must not re-acquire); firing clears
  it for `CAMO_REVEAL_TICKS` — the existing sniper-miss `fireFx` dust already telegraphs the
  hide, which is the counterplay. If Fog of War ships first, camo simply caps the sniper's
  *visibility* radius instead — cheaper and consistent. HUD: faint shimmer ring in
  `GameScene` for the owning player only.
- **Engineer — C4 Charge.** Extends the engineer job system: ability click arms "plant" mode;
  next battlefield click within range of a bridge segment, enemy BUNKER, or occupied building
  sets `jobX/jobY` with `jobKind:'c4'`. On arrival he plants a charge — a mine-like entity
  (`minesRef` sibling, `fuseTicks ≈ 5 s`, visible to both sides, defusable by an enemy
  engineer for symmetry) — then flees. Detonation calls `damageBridges(…, levelsBuildings=true)`
  with `C4_DAMAGE` (≈ 2–3 tank shells) and sets `lastAttackerId` (the artillery lesson: no
  attacker id = no kill credit).

**CPU.** v1: CPU ignores abilities. v2: hard CPU rolls Overdrive on a losing armored push and
C4 on a garrisoned strongpoint (alternative to spending the shared Air Command clock).

**Testing.** Smoke test each: overdrive speed delta via `unitList` sampling, camo target-drop,
C4 bridge-HP delta via `__ewDebug.bridges`. Harness run — camouflage especially can distort
sniper efficiency.

---

## 2. Dynamic Environment & Visual "Juice"

### 2.1 Advanced Destructible Environments

#### a) Knockdown obstacles (trees/bushes under tracks)

Smallest of the three; mostly plumbing that exists. The stuck watchdog already lets vehicles
crush *props*; extend crushing to vegetation for `tracked` class (and TANK specifically) on
*contact during normal driving*, not only when wedged:
- In the movement block, when a tracked vehicle's body circle overlaps a `tree`/`bush`
  `TerrainObject`, call `breakProp`-style conversion: object → `debris` state, splinter/leaf
  burst on the instanced particle path, despawn timer via the health-as-timer idiom (~12 s),
  and it drops out of the cover-seek candidate list and `steerAroundObstacles` solids
  immediately (both key off type/state — verify, don't assume).
- **Gameplay consequence is automatic**: cover options are permanently reduced. Add a
  `pushEvent` only if a unit was actually using that cover (else it's feed spam).
- Rocks stay solid — vehicles keep steering around them; a battlefield with nothing solid
  breaks the movement-model tuning (wedge-probe regression: re-run the movement probe, healthy
  ≤ 2 % wedged windows).

#### b) Craters & ground deformation

Split gameplay from cosmetics — they have different costs.
- **Gameplay (cheap, do first):** big blasts (NUKE, CRUISE, MISSILE_STRIKE, artillery direct
  splash ≥ threshold) spawn a `TerrainObject` type `'crater'` (cap ~12, evict oldest — the
  `WRECK_MAX` pattern). Effects ride existing systems: wheeled/tracked units inside take a
  `CRATER_SLOW` speed multiplier (movement block, where speed is committed); infantry inside
  gets `CRATER_COVER` (+30 %) via the existing cover-damage path (craters join the cover-seek
  candidates). Craters are *not* solid — no `steerAroundObstacles` entry, or columns jam on
  their own artillery.
- **Cosmetics (bounded):** do **not** displace the ground mesh per-vertex in v1 — `GroundPlane`
  is memoized and shared, and CPU re-uploads of an 800×450-scale geometry per blast fight the
  perf rules. Instead: a rim ring + darkened bowl on `InstancedDecals` (crater rims already
  render there) with a larger, deeper-looking normal-mapped decal sprite. v2 option: one
  static `DataTexture` displacement map (64×36) sampled in `GroundPlane`'s vertex shader via
  `onBeforeCompile`, updated at most once per blast — flagged behind `fx: 'high'`.

#### c) Occupiable rubble

Today a collapsed occupiable house becomes permanent, *non*-occupiable `burnt` rubble. Change
the terminal state:
- On collapse, the house keeps `occupiable`, sets `isRubble: true`, `capacity` →
  `ceil(capacity/2)`, structural HP → `RUBBLE_HP` (low — one shell dislodges it), and **loses
  defensive fire** (the volley block skips rubble; report's "no gun slits").
- Cover value inside rubble: `RUBBLE_COVER = 0.5` vs the building's 0.6 — garrison damage
  reduction constant keyed off `isRubble`.
- Rubble at 0 HP collapses *again* into today's final `burnt` state (spill via the shared
  `spillGarrison`, no survivors bonus) — so strongpoints degrade in two steps and eventually
  die for good.
- Rendering: the existing rubble model + a low neutral/team flag stub; occupancy label
  unchanged. The `itemOccupant`/`itemGarrison` memo props already carry re-render.
- CPU: the strongpoint-airstrike tactic already targets garrisoned buildings; rubble qualifies
  automatically if the tactic keys off `occupant` (verify).

**Testing.** Extend the smoke that covers the building lifecycle: collapse → assert
`__ewDebug.buildings` shows `isRubble`, re-garrison, second collapse → `burnt`.

---

### 2.2 Screen Post-Processing & Shell Shock; Night

#### a) Shell-shock effect

- **Trigger:** in `GameCanvas`, when a blast with damage ≥ `SHOCK_DAMAGE_MIN` (nuke, cruise,
  missile strike, heavy artillery splash) lands within `SHOCK_CAM_RANGE` of the camera's
  ground focus (the camera API's `state()` exposes framing — the nuke punch-in already reads
  it), set `shock = {until, strength}` on the `GameState` snapshot.
- **Visuals (`GameScene.tsx`):** the bloom `EffectComposer` gains two conditional passes when
  `fx === 'high'` — radial blur (god-rays-style radial blur or ChromaticAberration + Vignette
  from `postprocessing`, whichever ships in the installed version — check before speccing the
  exact pass) and a saturation drop (HueSaturation pass), both eased out over ~2 s from
  `shock.strength`. Passes are *mounted always, weighted by uniform* — mounting/unmounting
  composer passes mid-battle causes hitches.
- **Audio:** `soundService.shellShock(strength)` — a 3–4 kHz sine "ring" with slow decay +
  a temporary lowpass duck on the music/gun buses (needs the bus split from §3.2; if built
  before it, duck the master gain instead). Respect the mute/music toggles.
- Nuke already has the cinematic punch-in; shell shock composes with it (the punch-in
  guarantees the nuke lands "near the camera", so a nuke always rings).

#### b) Night missions & headlights

**Constraint from history:** night was tried and removed — it made the field unreadable
(`getDayFactor` floors at 0.65 for a reason). So night is **opt-in, never rolled**: a
challenge modifier / map variant chosen on the splash, not a weather state.
- **Readability plan:** ambient floor ~0.35 (not black), stronger rim/moon light, tracer and
  muzzle-flash emissives already read well in the dark (they're `toneMapped={false}`).
- **Gameplay:** vision −50 % — this is literally a fog-of-war multiplier, so **night ships
  after §1.1** and reuses it (`NIGHT_VISION_MULT = 0.5` on the `vision` stat). Without FoW,
  night is cosmetic only.
- **Light budget (hard rule: no per-entity pointLights):** max `HEADLIGHT_MAX = 6` real
  `SpotLight`s, assigned each frame to the vehicles nearest the camera focus; every other
  vehicle gets a fake cone (transparent additive cone mesh on an instanced or pooled path).
  Bunker searchlights: 1 spotlight each, slow sweep, and units inside a light cone lose any
  camo/fog concealment (a cone-vs-position check in the visibility stamp — cheap).
- Shadows off for headlights regardless of fx mode. Auto-fx-drop measurement (first-seconds
  fps) already protects low-end machines; verify night doesn't trip it on a mid machine.

---

## 3. Procedural Audio & Music

### 3.1 Dynamic / Adaptive Battle March

All inside `services/audio.ts` (`soundService`), driven by one new public method.

- **API:** `soundService.setMusicIntensity(level: 0 | 1 | 2, tension: boolean)` — called from
  the existing UI-tick snapshot path in `GameCanvas` (NOT every sim tick), computed from:
  units-currently-firing count (> 15 → level 2), any active `rally` → level 2 for its
  duration, otherwise units-in-combat > 4 → level 1, else 0. `tension = baseHP < 35 %` (basehp
  mode) or `score ≥ 90 both sides` (points mode).
- **Structure:** the march becomes layered buses over one shared clock/scheduler —
  `percussion` (always), `snare+bass` (level ≥ 1), `brass fanfare + overdriven synth lead`
  (level 2). Layers are *always scheduled*, gated by per-layer GainNodes with ~1-bar ramps
  (`linearRampToValueAtTime`) so transitions land musically, never mid-note pops.
- **Tempo:** ramp the scheduler BPM +10 % at level 2 — only at pattern boundaries (re-derive
  the next bar's start time from the current one; never retime scheduled notes).
- **Tension mode:** swap the note tables to the minor-key variants and add a pulsing low synth
  pad. Table swap also lands at a bar boundary.
- **Hysteresis:** require the computed level to hold for ~3 s before switching down (up is
  instant) — otherwise the music flaps on every skirmish edge.
- Persisted music toggle (`ewv-music`) unaffected — intensity mutes with it.

**Testing.** Manual + one smoke assertion that `setMusicIntensity` is invoked (spy via a
`__ewDebug.music` counter) when a big firefight is staged; audio itself stays ear-verified.

### 3.2 3D Spatial Audio

**Recommendation: do NOT rebuild on `THREE.PositionalAudio`.** `soundService` is a singleton
Web Audio graph detached from the scene; moving every effect into R3F components couples audio
to renderer lifecycle (and unit meshes are cloned/disposed constantly). Same result, far
cheaper, with two nodes:

- **Bus split (prerequisite, shared with §2.2a):** master → `musicBus`, `sfxHighBus` (gun
  cracks, clicks, barks), `sfxLowBus` (engines, artillery, blasts). ~1 h refactor, every later
  feature wants it.
- **Panning:** `soundService.playAt(name, x)` — each positional effect routes through a
  pooled `StereoPannerNode`, `pan = clamp((x - camFocusX) / 400, -0.8, 0.8)`. Camera focus
  comes from a `getCamState` callback registered by `GameCanvas` (it already holds the camera
  API for the minimap bracket) — do not read `window.__ewCam` from the service (test hook, not
  an internal contract). Helicopter/fighter flyovers update their pan over the sound's
  lifetime (store the panner with the loop handle).
- **Distance gain:** attenuate by camera zoom + distance from focus: far-off skirmishes get
  quiet; high-frequency bus additionally runs through one shared lowpass whose cutoff maps
  from camera distance (~18 kHz zoomed-in → ~2.5 kHz zoomed-out), while `sfxLowBus` passes
  full — zoomed out you hear the war's rumble, zoomed in the rifle bolts. One BiquadFilter
  total, updated on the UI tick.
- **Call-site change is mechanical:** firing/impact/explosion call sites in `GameCanvas` pass
  the event `x` (they all have it). Non-positional UI sounds (button clicks, victory sting)
  keep the plain path.

---

## 4. Skirmish AI Personalities & Metagame

### 4.1 CPU Commander Personalities

**Design.** Personality is a second, orthogonal table beside `CPU_DIFFICULTY` — difficulty
sets *competence* (cadence, counterSmart, stanceIQ, income), personality sets *taste*. The CPU
commander code is already side-agnostic and weight-driven, so personalities are data.

```
CPU_PERSONALITY: Record<PersonaId, {
  name, blurb, portrait,           // splash UI
  unitBias: Partial<Record<UnitType, number>>,  // multiplies counter-pick/composition weights
  tacticBias: { missile, airborne, mines, airstrike, smoke, gunboat },  // per-cycle roll mults
  commandBias: number,             // economy/rally eagerness multiplier
  stanceBias?: Stance,             // tie-break preference when stanceIQ deliberates
  bunkerBias: number,              // defensive-structure appetite
}>
```

- **Ivan (Armor):** `unitBias` TANK/APC/JEEP ×2, ANTI_AIR ×0.6; early `commandBias` ×1.5;
  `stanceBias: advance`.
- **Anna (Air):** DRONE/HELICOPTER/FIGHTER/GUNSHIP ×2; `tacticBias` airstrike/missile ×1.8 —
  she rolls a strike nearly every cycle the shared Air Command clock is ready (the
  `airReady` gate already prevents waste); ANTI_AIR ×1.2 (she knows the mirror threat).
- **Kenji (Stealth):** SNIPER/SPECIAL_FORCES ×2, smoke/mines/airborne ×2, `stanceBias: hold`
  (entrenchment synergy); missile ×0.5.
- **Frederick (Turtle):** BUNKER ×2.5 + `bunkerBias` high, GUNBOAT pickets ×2,
  ARTILLERY/MORTAR ×1.8, `stanceBias: hold`, advances only via the existing losing-side
  cadence pressure.

**Integration points (all in the `// CPU AI` block):** multiply `unitBias` into the weighted
priority map *after* counter-pick logic (a personality biases, never blinds — counterSmart
still answers an air rush with AA); multiply `tacticBias` into each special-tactic roll;
`commandBias` into the buy-commands step. Clamp final weights so no bias zeroes out a
hard-counter. Hard difficulty keeps `stanceIQ` authority; `stanceBias` only breaks ties.

**UI.** Splash: when CPU is on, a commander card row (name, one-line doctrine blurb, difficulty
stars unchanged). "Random" default. Persist in `ewv-prefs`. Victory screen names the defeated
commander. `__ewDebug.cpuPersona` exposes the active persona for probes.

**Testing.** Harness matrix: each persona vs the current default AI, hard difficulty, 2 maps,
≥ 10 matches — acceptance: every persona wins 30–70 % (distinct but not degenerate). One smoke:
force Frederick, assert ≥ 1 bunker exists by tick N via `typeStats`.

### 4.2 Grand Campaign Metagame

**Goal.** A North & South-style strategic board wrapping the existing battles. **Zero engine
changes** — the campaign is App-level React screens plus the existing challenge plumbing
(`startChallenge`-style `gameKey` remount, modifier props, `onChallengeWon` result handling).

**Phase 1 — playable loop.**
- **Board data (`campaign.ts`):** 14 territories as a hand-authored graph:
  `{ id, name, terrain: MapType, adjacent: id[], bonus?: 'income'|'harbor'|'silo'|'airbase',
  capital?: Team }`. Layout rendered as a stylized SVG/absolute-positioned map screen in
  `App.tsx` (a new top-level screen state beside splash/game) — no Three.js needed.
- **State:** `{ owner: Team|null, armies: {team, strength}[] }` per territory + whose turn +
  campaign difficulty/persona. Persisted `ewv-campaign` (the `ewv-history` pattern); one save
  slot v1.
- **Turn loop:** player moves one army token to an adjacent territory (tap-to-select,
  tap-to-move), then the CPU moves via a simple heuristic (defend capital > take undefended
  bonus > mass toward the front). Two armies collide → battle.
- **Battle handoff:** launch `GameCanvas` with: `map` = territory terrain, `moneyMult` from
  strength ratio (attacker at 3-vs-2 strength gets ×1.15 — the challenge handicap mechanism,
  applied at mount), mode = basehp (attacker must break the defense), CPU persona = the enemy
  commander (a campaign has ONE enemy commander — losing to "Anna" all campaign is the
  narrative). Winner takes the territory; loser's army strength −1 (destroyed at 0). Result
  written back in the `gameOver` effect handoff (`onChallengeWon` generalized to
  `onBattleResult`).
- **Victory:** hold the enemy capital, or eliminate all enemy armies.

**Phase 2 — resources & unlocks.**
- Income: +1 army-strength point per N held territories per turn, spent to reinforce.
- Bonus territories gate the roster *in battles*: no `harbor` → GUNBOAT button disabled; no
  `silo` → NUKE disabled; no `airbase` → Air Command strikes locked (the `handleSpawnRequest`
  guard + disabled-button pattern from `infantryOnly`, generalized to a `bannedUnits: UnitType[]`
  prop). This makes territory choice tactical, with zero engine work.

**Phase 3 — texture (optional).** Weather persistence per region, multi-army stacks, campaign
events, second save slot.

**Testing.** Campaign logic is pure data-in/data-out — extract turn resolution into
`campaign.ts` as pure functions and cover with a small node test script (no runner configured;
a `scripts/campaign-check.cjs` assertion script matches house style). One e2e smoke: start
campaign → force a battle → `winTeam('WEST')` → assert territory flipped and `ewv-campaign`
persisted.

**Risks.** Scope. Phase 1 alone is the size of the occupiable-buildings feature. Guard rails:
no engine changes allowed in campaign PRs; if a battle needs a new knob, it must arrive as a
generic prop (like `bannedUnits`) usable by challenges too.

---

## Cross-cutting notes

- **Every combat-touching feature** (FoW, asymmetry, abilities, craters, rubble) gets a
  before/after `balance-harness.cjs` run; movement-touching ones (knockdown, craters) also
  re-run the wedge probe (healthy ≤ 2 %).
- **Every feature adds its `__ewDebug` surface** in the same PR — that's what keeps the
  headless e2e suite able to cover it.
- **localStorage keys** stay in the `ewv-*` namespace: `ewv-fow`, `ewv-campaign`, persona in
  `ewv-prefs`.
- **`npx tsc --noEmit` gates every commit** (esbuild won't catch type errors; white-screen
  risk).
- New tuning constants all land in `constants.ts` next to their families (`FOW_*`, `FACTION_*`,
  `ABILITY_*`/`C4_*`, `CRATER_*`, `RUBBLE_*`, `SHOCK_*`, `NIGHT_*`, `HEADLIGHT_MAX`,
  `CPU_PERSONALITY`).
