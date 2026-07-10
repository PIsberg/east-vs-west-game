# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build
```

No test runner or linter is configured — verify changes manually in the browser.

Note: `vite.config.ts` sets `base: '/east-vs-west-game/'` for GitHub Pages deployment (live at https://pisberg.github.io/east-vs-west-game/).

## Environment

The AI commentary feature requires a Gemini API key. Set in `.env.local`:
```
GEMINI_API_KEY=your_key_here
```
Vite exposes this as `process.env.API_KEY` inside the app (see `vite.config.ts`). The game runs fine without it — only commentary is affected.

## Architecture

**East vs West 3D** is a lane-defense (tug-of-war) strategy game. Game logic runs at 60 FPS in a mutable ref loop, completely decoupled from React's render cycle. First team to 100 points wins; units score by reaching the far edge.

There is also an `architecture.md` at the repo root with a longer prose overview — note it is partially stale (it describes a `/src` directory that doesn't exist; files live at the repo root).

### Dual-state pattern (critical to understand)

- **`useRef` (high-frequency)**: Unit positions, projectiles, particles, terrain — mutated directly in the game loop, never trigger React re-renders.
- **`useState` (low-frequency)**: Score, money, spawn queue, UI overlays, map selection, CPU toggle — only updated when React HUD re-renders are actually needed.

This split is intentional. Never move hot-path game data into React state.

### Component responsibilities

| File | Role |
|------|------|
| `App.tsx` | HUD layout, keyboard shortcuts, spawn request validation, map/side/mode selection, CPU level, lane selector, pause/speed, AI commentary trigger |
| `components/GameCanvas.tsx` | **Game engine** — `requestAnimationFrame` loop, all unit AI, combat, spawning, collision, per-map terrain generation, CPU opponent AI, capture point, stats |
| `components/GameScene.tsx` | **Pure renderer** — maps game-state arrays to R3F/Three.js meshes; instanced particles/projectiles, bloom, day/night, camera shake, map-specific visuals |
| `components/ClickableGroup.tsx` | R3F click-target helper |
| `services/ai.ts` | Gemini API call for battlefield commentary |
| `services/audio.ts` | Web Audio API procedural sound effects (singleton `soundService`) |
| `utils/spatialHash.ts` | Grid-based spatial hash for O(1) projectile→unit collision lookup |
| `types.ts` | All shared enums/interfaces (`Team`, `UnitType`, `MapType`, `Unit`, `Projectile`, `GameState`, `Flyover`, etc.) |
| `constants.ts` | All game-balance tuning: `UNIT_CONFIG`, costs, speeds, damage, money rates, `WIN_SCORE` |

### Game logic flow

1. `App.tsx` validates affordability and pushes to `spawnQueue` (React state).
2. `GameCanvas` consumes `spawnQueue` each frame, spawns units into `unitsRef`.
3. The `tick()` loop updates refs → passes snapshot to `onGameStateChange` → React HUD re-renders.
4. `GameScene` receives the snapshot and renders 3D meshes via R3F.

### CPU opponent

`GameCanvas.tsx` contains a side-agnostic AI commander (search `// CPU AI`), configured via `cpuTeam` + `cpuDifficulty` props (side and easy/normal/hard chosen on the splash screen; difficulty scales spawn cadence, special-tactic frequency, and an income bonus — see `CPU_DIFFICULTY`). It runs inside `tick()` on a spawn-interval timer that speeds up when losing. Each cycle it does threat analysis of the foe's units (air/armor/infantry/mine counts), builds a weighted priority map of affordable counter-units, and occasionally fires special tactics (missile strike at enemy clusters, airborne drops behind lines, defensive minefields). When adding a unit type, consider adding it to the CPU's counter-pick/composition weights so the computer player uses it.

### Other gameplay systems (all in `GameCanvas.tsx`)

Weather cycle (rain/snow/fog/storm with combat penalties + lightning strikes), mid-map capture point (+50% income to holder), veterancy (kills → up to 3 ranks: +damage/+HP/+reload), lane-biased spawning (`SpawnLane`), two win modes (`GameMode`: 100 points or base HP), pause/2× speed (ticks per frame), engineer mine-defusal, and per-team built/lost stats shown on the victory screen.

### Rendering performance

Regular particles and projectiles render through two `InstancedMesh`es updated imperatively in `useFrame` (`InstancedParticles`/`InstancedProjectiles` in `GameScene.tsx`); only rare special particles (beams, bolts, text, decals, corpses, missiles) are individual React components. Keep new high-count effects in the instanced path or flag them via `isSpecialParticle`.

### Map system

`MapType` in `types.ts` defines four maps: `COUNTRYSIDE`, `URBAN`, `DESERT`, `ARCHIPELAGO`. The map is chosen in `App.tsx` pre-game. Terrain layout per map is generated procedurally in `GameCanvas.tsx` (branching on `mapType`), and `GameScene.tsx` branches on `mapType` for visuals (ground/accent colors, river vs. channel rendering). A new map needs: enum value, terrain generation branch in `GameCanvas`, visual branch in `GameScene`, and a menu entry in `App.tsx`.

### Coordinate system

The world is a 2D plane (`x`, `y` = 0–800 × 0–450, see `CANVAS_WIDTH`/`CANVAS_HEIGHT`). `x = 400` is the midpoint; West spawns left, East spawns right. Units with `isFlying: true` in `UNIT_CONFIG` are excluded from ground collision and only targetable by anti-air. 3D visuals are a projection layer on top of this 2D simulation.

Terrain modifies combat: hills grant `HILL_RANGE_BONUS`/`HILL_RELOAD_BONUS`, cover (trees/rocks) reduces incoming damage, rivers slow infantry and penalize range; vehicles must cross via bridges.

### Adding a new unit type

1. Add the enum value to `UnitType` in `types.ts`.
2. Add a config entry to `UNIT_CONFIG` in `constants.ts`.
3. Add spawn/AI handling in `GameCanvas.tsx` (search for how an existing similar unit is handled).
4. Add a button in `App.tsx` `renderUnitButtons()`.
5. Optionally add it to the CPU AI weights in `GameCanvas.tsx` so East's computer player can use it.
