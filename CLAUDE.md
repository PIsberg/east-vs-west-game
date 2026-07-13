# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build
```

Headless e2e suite: `node scripts/e2e/run-all.cjs` against a running dev server (requires `puppeteer-core` on the resolve path and Edge — same setup as the balance harness; see the runner's header for coverage and test-writing gotchas). No unit-test runner or linter is configured.

**Always run `npx tsc --noEmit` before committing.** `vite build` uses esbuild, which strips types without checking them — a missing import or type error passes the build but crashes at runtime (white screen). The codebase typechecks clean; keep it that way.

Note: `vite.config.ts` sets `base: '/east-vs-west-game/'` for GitHub Pages deployment (live at https://pisberg.github.io/east-vs-west-game/).

## Environment

No API keys or environment variables are required.

## Architecture

**East vs West 3D** is a lane-defense (tug-of-war) strategy game inspired by the Commodore Amiga classic *North & South* (Infogrames, 1989). Game logic runs at 60 FPS in a mutable ref loop, completely decoupled from React's render cycle. First team to 100 points wins; units score by reaching the far edge.

There is also an `architecture.md` at the repo root with a longer prose overview — note it is partially stale (it describes a `/src` directory that doesn't exist; files live at the repo root).

### Dual-state pattern (critical to understand)

- **`useRef` (high-frequency)**: Unit positions, projectiles, particles, terrain — mutated directly in the game loop, never trigger React re-renders.
- **`useState` (low-frequency)**: Score, money, spawn queue, UI overlays, map selection, CPU toggle — only updated when React HUD re-renders are actually needed.

This split is intentional. Never move hot-path game data into React state.

### Component responsibilities

| File | Role |
|------|------|
| `App.tsx` | HUD layout, keyboard shortcuts, spawn request validation, map/side/mode selection, CPU level, lane selector, pause/speed |
| `components/GameCanvas.tsx` | **Game engine** — `requestAnimationFrame` loop, all unit AI, combat, spawning, collision, per-map terrain generation, CPU opponent AI, capture point, stats |
| `components/GameScene.tsx` | **Pure renderer** — maps game-state arrays to R3F/Three.js meshes; instanced particles/projectiles, bloom, a gentle noon↔late-afternoon light cycle (no night — it made the field unreadable; `getDayFactor` floors at 0.65), camera shake, map-specific visuals |
| `components/ClickableGroup.tsx` | R3F click-target helper |
| `services/audio.ts` | Web Audio API procedural sound effects + looping battle-march music (singleton `soundService`); master mute and music toggles persisted to localStorage (`ewv-muted`/`ewv-music`) |
| `utils/spatialHash.ts` | Grid-based spatial hash for O(1) projectile→unit collision lookup |
| `types.ts` | All shared enums/interfaces (`Team`, `UnitType`, `MapType`, `Unit`, `Projectile`, `GameState`, `Flyover`, etc.) |
| `constants.ts` | All game-balance tuning: `UNIT_CONFIG`, costs, speeds, damage, money rates, `WIN_SCORE` |

### Game logic flow

1. `App.tsx` validates affordability and pushes to `spawnQueue` (React state).
2. `GameCanvas` consumes `spawnQueue` each frame, spawns units into `unitsRef`.
3. The `tick()` loop updates refs → passes snapshot to `onGameStateChange` → React HUD re-renders.
4. `GameScene` receives the snapshot and renders 3D meshes via R3F.

### CPU opponent

`GameCanvas.tsx` contains a side-agnostic AI commander (search `// CPU AI`), configured via `cpuTeam` + `cpuDifficulty` props (side and easy/normal/hard chosen on the splash screen; difficulty scales spawn cadence, special-tactic frequency, income bonus, `counterSmart` (chance per cycle to read the foe's composition and counter-pick — easy mostly builds blind from the general pool), `commands` (economy-upgrade/rally eagerness — easy never uses them), and `stanceIQ` (hard only: dynamically switches its army stance — retreats to regroup when badly outmatched, holds when slightly weaker, advances when stronger; the stances-prop sync effect preserves CPU-steered stances) — see `CPU_DIFFICULTY`). It runs inside `tick()` on a spawn-interval timer that speeds up when losing. Each cycle it does threat analysis of the foe's units (air/armor/infantry/mine counts), builds a weighted priority map of affordable counter-units, and occasionally fires special tactics (missile strike at enemy clusters, airborne drops behind lines, defensive minefields). When adding a unit type, consider adding it to the CPU's counter-pick/composition weights so the computer player uses it.

### Balance testing

`node scripts/balance-harness.cjs` runs CPU-vs-CPU matches headlessly against the dev server (one per map) and prints per-unit kill-value-per-dollar efficiency. It uses hidden URL params (`?spectate&map=X&speed=N&mode=basehp`) and the `window.__ewDebug` telemetry hook in `GameCanvas.tsx`. Spectator mode uses wall-clock catch-up ticking so low-fps headless runs still simulate at full speed. When changing unit stats in `constants.ts`, run a round before and after; healthy efficiency band is roughly 0.5–1.5 (Anti-Air runs hotter by design — hard counters trade up).

### Other gameplay systems (all in `GameCanvas.tsx`)

Weather cycle (rain/snow/fog/storm with combat penalties + lightning strikes; the NEXT weather is pre-rolled into `nextWeatherRef` and surfaced as `GameState.weatherNext` so the HUD forecasts it), capture points — the mid-map flag (+50% income) plus two flank posts (`flankCapsRef`, +12% each, placed point-symmetric about mid-field; normal/hard CPUs bias spawn lanes toward posts they don't hold; a capture-income counterweight returns 40% of the bonus gap to the side holding fewer points, or triple-holds snowball), veterancy (kills → up to 3 ranks: +damage/+HP/+reload), lane-biased spawning (`SpawnLane`), two win modes (`GameMode`: 100 points or base HP), pause/2× speed (ticks per frame), engineer mine-defusal, and per-team built/lost stats shown on the victory screen. A battle-event feed (`eventsRef`/`pushEvent` in `GameCanvas.tsx`, rendered in `App.tsx` via `GameState.events`) reports high-value kills (cost ≥ 100), bridge state changes, supply-drop claims, capture-point flips, and nuke launches; menu prefs persist in localStorage (`ewv-prefs`). Smoke screens (`UnitType.SMOKE`, `smokesRef`): a targeted strike that blocks ground targeting into/out of the cloud beyond point-blank range for ~13s (see `smokeBlocked` in the tick; air units are immune; the CPU drops smoke on the foe's artillery/sniper/mortar cluster to blind it — never on its own push, which would blind itself). Entrenchment (`ENTRENCHABLE`, `unit.isEntrenched`): foot units stationary under 'hold' orders for ~6s take 45% less direct fire until they move (explosives via `ignoresCover` bypass it); foxhole visuals render in `GameScene.tsx`. Battlefield props (`TerrainObject` types `crate`/`barrel`, ~8 per map): broken by any blast that calls `damageBridges` or by vehicles driving over them (`breakProp`); barrels deal a small neutral AoE (no chaining); debris despawns after ~12s (health doubles as the timer). Vehicles also drop faint tread-mark decals (`Particle.isSkid` + `rot`, throttled per vehicle, global cap 60, rendered as two low-opacity strips). Team commands (`runCommand` in `GameCanvas.tsx`, `commandQueue` prop mirrors `spawnQueue`): economy upgrades (3 levels × +25% income, cost 250/500/750) and the rally horn ($150, +45% reload speed & +25% move speed for 8s, 50s cooldown) — both surfaced in `GameState.incomeLevel`/`GameState.rally` for the HUD (a prominent command bar centered under the canvas, `renderCommandBar` in `App.tsx`, one group per human team), and the CPU buys them at the start of its spawn cycle (before the `money` snapshot so affordability stays accurate). Field repairs: units within `REPAIR_ZONE` of their own edge heal `REPAIR_PER_TICK` when not hit for `REPAIR_COMBAT_LOCKOUT_MS`. The engineer is the mobile version of that: besides defusing mines and rebuilding bridges he welds any damaged friendly *machine* (`isMechanical` in `constants.ts` — every vehicle plus Bunker/Gunboat; aircraft excluded) for `ENGINEER_REPAIR` HP per action within `ENGINEER_REPAIR_RANGE`, anywhere on the map and under fire. His job priority is mine → bridge → machine, and hurt machines are scored by distance weighted by remaining HP, so a dying tank outranks a scratched jeep standing closer. **The chosen job is cached on `unit.jobX/jobY`**: the scans run only on `isSearchTick`, but he must steer toward the job on *every* tick — steering only on search ticks let the advance stance push him back toward the enemy in between, so he could never close on a job that lay behind him. He is exempt from bunker garrisoning (`GARRISONS()` = `TRANSPORTABLE` minus the engineer) — the one unit that can repair the bunker used to walk in and man a slit instead. Riding: the **Jeep is a one-seat taxi** running the same board/unload code as the Transport (`capacity` in `UNIT_CONFIG`, so the block keys off `unit.type`), which is how a 0.5-speed engineer gets forward; an engineer already on a job (`unit.jobX` set) refuses the lift so a passing jeep can't abduct him mid-weld. Per-unit orders (`Unit.orders`, resolved as `unit.orders ?? stancesRef.current[team]` in movement + entrenchment): clicking your own unit selects it plus its squad (`squadId`); a second click on the same unit within 400ms selects all units of that type (`lastUnitClickRef` in `handleUnitClick`, which calls `onSelectUnits`); App shows a floating order panel that pushes `{ids, order}` onto the `orderQueue` prop (`null` order clears the override); selection rings + order dots render in `GameScene` via `selectedIds`/`unit.orders`.

### Gunboat, minimap, challenges, meta systems

- **Gunboat** (`UnitType.GUNBOAT`): a speed-0 anchor unit (Bunker pattern) placed by targeting click; `spawnUnit` validates the click lands on a river segment and can **veto a spawn by returning false** — the spawn-queue effect only deducts cost on success. CPUs station up to two as special-tactic "pickets". GLB model with a team pennant overlay (its textured materials resist tinting).
- **Minimap** (`MiniMap` in GameCanvas.tsx): Canvas-2D, redraws from engine refs every 150ms — terrain, smoke, capture rings, team unit dots (air = cross), the camera's viewport bracket (via the camera API's `state()`), and click-to-pan (`panTo(x)`).
- **Challenges** (`CHALLENGES` in App.tsx): preset missions with modifiers — `moneyMult` (handicap applies at GameCanvas MOUNT, so `startChallenge` bumps `gameKey`), `maxDurSec` (win duration checked in `onChallengeWon`), `infantryOnly` (guard in `handleSpawnRequest` + disabled buttons). Completions persist in `ewv-challenges`; badges render on the splash. New missions are new array entries.
- **Match history** (`ewv-history`, written in the gameOver effect) feeds the splash's Recent Battles panel; the same effect records challenge completions and closes the score timeline (`scoreHistoryRef` → `TimelineGraph` on the victory screen).
- **Colorblind assist** (`cb` prop, `ewv-cb`): East's identity color becomes amber at the UI seams — module-level `CB_MODE` is set synchronously in the GameScene body and the Canvas remounts via its `key` so tinted GLB clones re-evaluate; neutral capture rings shift white under the mode.
- **Camera API** (`onCameraApi` from GameScene): `zoom/pan/reset/state/panTo`, also exposed as `window.__ewCam`. Test hooks live on `window.__ewDebug` (note: `unitList` and `typeStats` are snapshot properties, not functions; `winTeam('WEST'|'EAST')` force-ends a match through the real gameOver path — needed because non-spectate play is frame-locked and headless runs at ~1x realtime regardless of `?speed=`).

### Mobile / compact layout

`App.tsx` derives `compact` from `window.innerHeight < 520` (mobile landscape): slim header (no title, tight gaps), scrollable side unit panels, single-line command-bar buttons, a compact splash menu, and the field manual hidden behind a header **Manual** toggle (`showManual`, defaults on for desktop). Portrait mobile (`innerWidth < 700 && portrait`) shows a full-screen rotate prompt. Canvas sizing is measured, not estimated: `App.tsx` holds refs on the header, both side panels and the command bar, computes the exact space between them (a `ResizeObserver` + resize/orientation listeners re-run it) and passes `viewW`/`viewH` to `GameCanvas`, which uses them verbatim (its internal window-based compute is only a fallback when those props are absent). The battlefield therefore fills the gap between the toolbars on any screen — height-limited on phones, width-limited on desktop. With the manual open on desktop the page simply scrolls; the play area keeps the viewport.

### Rendering performance

Regular particles and projectiles render through two `InstancedMesh`es updated imperatively in `useFrame` (`InstancedParticles`/`InstancedProjectiles` in `GameScene.tsx`); only rare special particles (beams, bolts, corpses, missiles) are individual React components. Keep new high-count effects in the instanced path or flag them via `isSpecialParticle`.

Two more instanced paths carry everything that scales with battle size — as loose meshes they each cost a draw call plus a fresh geometry and material on every mount:
- `InstancedDecals` — scorch decals, crater rims and vehicle tread marks (the highest-count objects on a busy field).
- `InstancedUnitOverlays` — team ring, health bar and the shadow blob under aircraft. Four draw calls for the whole army instead of ~4 per unit. Note these read `units`/`terrain` directly each frame, so a unit's overlay is positioned from `unit.position`, not from its React tree.

Three has no per-instance opacity: `withInstanceAlpha(material)` patches the shader to multiply in an `aAlpha` instanced attribute, and `useAlphaGeometry` allocates it. Use those when a new instanced effect needs to fade.

Floating bounty text ("+$110") is a **cached canvas-texture sprite** (`bountyMaterial`), not drei's `<Text>`: troika allocated a geometry and a texture per popup and never freed them.

**Cloned GLBs must dispose their skeleton.** A clone gets its own `Skeleton`, and a skeleton allocates a bone texture on the GPU. Clones are mounted through `<primitive>`, which R3F deliberately never disposes — so every unit that died used to leave its bone textures behind (~8 per spawn; 1,400+ GPU textures inside 40 seconds, which is what made long matches degrade). `useTintedClone` now disposes the skeleton on unmount. Geometry and materials are shared with the template and must *not* be disposed there.

**The model pack's tint rules are name-based and every GLB ships one atlas material** (`PaletteMaterial001`). Rules naming `Swat`/`Main`/`DarkGreen` matched nothing, so units rendered untinted — both sides identical. Tint rules now use `'*'` (match every material); `tintedMaterial` caches the result so all units of a side share one material.

**The soldier GLB is unarmed** — its clips are named `Idle_Gun`/`Run` but the mesh is only body/head/legs/feet. `InfantryModel` bolts a shared low-poly rifle onto the `Wrist.R` bone. The armature bakes a large scale into its bones, so anything parented to one inherits it: cancel the bone's world scale (`RIFLE_LENGTH / boneScale`) or the rifle renders hundreds of units long.

**Merging the soldier's meshes**: the GLB is four skinned meshes over ~11 primitives. Primitives *within* a mesh share its skin and can be merged safely (`soldierTemplate`, 11 → 4 draw calls). Merging across the four meshes is **not** safe — each skin bakes its own node scale into its inverse bind matrices (feet 0.26, legs 0.50, head 0.18), so binding them to one skeleton tears the model apart. The merge is guarded: bone indices must stay in range or it falls back to the unmerged meshes.

GLB unit models (`public/models/*.glb`, CC0/CC-BY — credits in README): loaded via drei `useGLTF` + preload, cloned per unit with `SkeletonUtils.clone`, materials recolored through `useTintedClone(url, TintRule[])`. All foot units share the animated Quaternius soldier via `InfantryModel` — `Swat` material carries the team color, `Grey`/`Black` take a per-role accent (`INFANTRY_ACCENT`), clips keyed off `unit.state` (Run/Idle_Gun/Idle_Gun_Shoot; sniper idles with Idle_Gun_Pointing). `TankModel` keeps Tank_Forward playing-but-paused when stationary (a stopped action reverts skinned tracks to a coiled bind pose). Vehicles/aircraft (jeep, truck=TRANSPORT, apc, antiair, helicopter, fighter, drone) are static GLBs rendered by `StaticModel` — runtime Box3 auto-fit (reliable ONLY for unskinned models; the armature-driven soldier/tank use empirical `SOLDIER_SCALE`/`TANK_SCALE` because their bind-pose boxes lie), `yaw` maps native forward onto +X (Zsky vehicles face +X → yaw 0 via prop where needed; the fighter needed π), and `spinNodes` spins the drone's `Rotor_*` nodes. Muzzle flashes, parachutes, rotor blur discs, passenger pips, flame/heal/defuse effects survive as primitive overlays. Artillery, Tesla and Bunker are static-model emplacements from the Quaternius turret pack — unlike the rest of the pack these ship two named materials (`Light`/`Dark`) rather than one atlas, so they tint through `emplacementTint` instead of a `'*'` rule, and their native forward is `-Z` (hence `yaw={-Math.PI / 2}`). Their primitive overlays survive: artillery recoil + muzzle flash, the tesla's arc/charge FX, and the bunker's build scaffolding, garrison pips, sandbags and flag. The mines still use primitive builds.

FX quality mode: `App.tsx` holds `fx: 'high' | 'low'` (persisted `ewv-fx`, header FX toggle). Low drops shadows, bloom, clouds and pixel-ratio (GameScene `fx` prop; the Canvas remounts via `key={fx}` for a clean shadow-map switch — the camera API re-registers on mount). With no saved preference, App measures the first battle's opening seconds and auto-drops to low under ~24fps (2.75x fps on a software renderer).

Other performance rules: static scene components (`TerrainItem`, `GroundPlane`, `BorderLine`, `Backdrop`, `GroundScatter`, `RiverRenderer`) are `React.memo`ized — keep their props referentially stable (terrain objects mutate in place, so state/health are passed as explicit props for the memo compare). Avoid `pointLight` per entity — use emissive `toneMapped={false}` materials and let bloom sell the glow (only lightning, missiles-in-flight and the capture point keep lights). In the engine, never `splice` inside `forEach` (iterate backwards), use the spatial hash for proximity queries, and throttle O(terrain) searches with `isSearchTick(unit)`.

### Map system

`MapType` in `types.ts` defines four maps: `COUNTRYSIDE`, `URBAN`, `DESERT`, `ARCHIPELAGO`. The map is chosen in `App.tsx` pre-game. Terrain layout per map is generated procedurally in `GameCanvas.tsx` (branching on `mapType`), and `GameScene.tsx` branches on `mapType` for visuals (ground/accent colors, river vs. channel rendering). A new map needs: enum value, terrain generation branch in `GameCanvas`, visual branch in `GameScene`, and a menu entry in `App.tsx`.

### Coordinate system

The world is a 2D plane (`x`, `y` = 0–800 × 0–450, see `CANVAS_WIDTH`/`CANVAS_HEIGHT`). `x = 400` is the midpoint; West spawns left, East spawns right. Units with `isFlying: true` in `UNIT_CONFIG` are excluded from ground collision and only targetable by anti-air. 3D visuals are a projection layer on top of this 2D simulation.

Terrain modifies combat: hills grant `HILL_RANGE_BONUS`/`HILL_RELOAD_BONUS`, cover (trees/rocks) reduces incoming damage, rivers slow infantry and penalize range; vehicles must cross via bridges.

### Selection and camera

Left-drag on the battlefield is the **selection marquee** (`BoxSelect` in `GameScene.tsx` — it lives inside the Canvas because picking projects each unit's field position through the live camera). The camera therefore orbits on **right-drag** (`OrbitControls` `mouseButtons`); touch is unchanged, one finger still orbits. Releasing a marquee also lands as a click on open ground, which would clear the selection you just made — `GameCanvas` swallows exactly one click after a drag (a *flag*, not a time window: R3F dispatches the click on the next frame, and a slow frame is hundreds of ms wide).

Clicking a unit still selects it plus its squad; a second click within 400ms selects all units of that type.

### Bunkers

A bunker is poured, not dropped: `BUNKER_BUILD_MS` (~9s) as a building site with `unit.buildUntil` set — it cannot fire, and its HP cures from `BUNKER_BUILD_START_HP` to full. The cure applies the *delta* of progress each tick (`unit.buildHp`), not a nudge toward a target — a per-tick nudge never catches up at a low frame rate and the bunker finishes half-built.

Infantry told to **hold** within `BUNKER_CALL_RANGE` of a finished friendly bunker walk to it and man it (holding otherwise freezes a unit where it stands, so without this they could never reach the door). Each of up to `BUNKER_GARRISON_MAX` soldiers adds `BUNKER_GARRISON_DAMAGE` damage and `BUNKER_GARRISON_RELOAD` reload speed; they ride in `unit.passengers` and partly survive its destruction.

### Movement model

Every ground unit has a locomotion class (`MOVE_CLASS`/`getMoveClass` in `constants.ts`: `foot`, `wheeled`, `tracked`) whose `CLASS_PROFILE` sets its hill penalty, whether it can ford an unbridged river (`wade: 0` = it can't), its turn rate, body radius and separation. Speeds in `UNIT_CONFIG` are tuned *within* a class, not across classes.

Three pieces work together in the `tick()` movement block of `GameCanvas.tsx`:

1. **`steerAroundObstacles`** — a lookahead scan along the unit's heading. The nearest blocker in the corridor picks a side (`unit.avoidDir`, committed for `AVOID_COMMIT_MS` so the unit doesn't re-decide every tick), and the unit keeps forward motion while sliding laterally around it. Vehicles treat trees/rocks/props as solid; infantry only has to clear buildings, since the rest is cover it wants to reach. **Never reintroduce a radial push-away here** — pushing a unit back along its own heading is exactly what used to wedge tanks against buildings.
2. **Heading smoothing** (`unit.vel`, lerped by `profile.steer`) — inertia for heavy units, and it kills the per-tick jitter that let a wedged vehicle vibrate in place.
3. **The stuck watchdog** — samples net progress every `STUCK_SAMPLE_TICKS`; a unit that wants to move but hasn't gained `STUCK_MIN_PROGRESS` flips its committed side and gets shouldered sideways until it's free (vehicles crush props in the way).

The APC deploys its squad on contact (`APC_DEPLOY_RANGE`/`APC_DEPLOY_HP`, sets `unit.deployed`) rather than only spilling troops from the wreck; the death spill is skipped once `deployed`.

Movement is regression-tested with a probe that samples unit positions over CPU-vs-CPU matches and counts 3-second windows where a vehicle went nowhere ("wedged"). Baseline before the overhaul was 22% of windows; healthy is ≤2%. `window.__ewDebug.unitList` exposes `position`, `health`, `isInCover`, `stuckSamples` and `deployed` for exactly this.

### Adding a new unit type

1. Add the enum value to `UnitType` in `types.ts`.
2. Add a config entry to `UNIT_CONFIG` in `constants.ts` (and a `MOVE_CLASS` entry if it's a vehicle — anything unlisted walks).
3. Add spawn/AI handling in `GameCanvas.tsx` (search for how an existing similar unit is handled).
4. Add a button in `App.tsx` `renderUnitButtons()`.
5. Optionally add it to the CPU AI weights in `GameCanvas.tsx` so East's computer player can use it.
