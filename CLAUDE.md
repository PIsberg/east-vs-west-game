# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build (outputs to dist/)
npm run preview    # Preview production build
```

No test runner is configured — verify changes manually in the browser.

## Environment

The AI commentary feature requires a Gemini API key. Copy `.env.local` and set:
```
GEMINI_API_KEY=your_key_here
```
Vite exposes this as `process.env.API_KEY` inside the app (see `vite.config.ts`).

## Architecture

**East vs West 3D** is a lane-defense strategy game. Game logic runs at 60 FPS in a mutable ref loop, completely decoupled from React's render cycle.

### Dual-state pattern (critical to understand)

- **`useRef` (high-frequency)**: Unit positions, projectiles, particles, terrain — mutated directly in the game loop, never trigger React re-renders.
- **`useState` (low-frequency)**: Score, money, spawn queue, UI overlays — only updated when React HUD re-renders are actually needed.

This split is intentional. Never move hot-path game data into React state.

### Component responsibilities

| File | Role |
|------|------|
| `App.tsx` | HUD layout, keyboard shortcuts, spawn request validation, AI commentary trigger |
| `components/GameCanvas.tsx` | **Game engine** — `requestAnimationFrame` loop, all unit AI, combat, spawning, collision |
| `components/GameScene.tsx` | **Pure renderer** — maps game-state arrays to R3F/Three.js meshes |
| `components/ClickableGroup.tsx` | R3F click-target helper |
| `services/ai.ts` | Gemini API call for battlefield commentary |
| `services/audio.ts` | Web Audio API procedural sound effects (singleton `soundService`) |
| `utils/spatialHash.ts` | Grid-based spatial hash for O(1) projectile→unit collision lookup |
| `types.ts` | All shared interfaces (`Unit`, `Projectile`, `GameState`, `Flyover`, etc.) |
| `constants.ts` | All game-balance tuning: `UNIT_CONFIG`, costs, speeds, damage, money rates |

### Game logic flow

1. `App.tsx` validates affordability and pushes to `spawnQueue` (React state).
2. `GameCanvas` consumes `spawnQueue` each frame, spawns units into `unitsRef`.
3. The `tick()` loop updates refs → passes snapshot to `onGameStateChange` → React HUD re-renders.
4. `GameScene` receives the snapshot and renders 3D meshes via R3F.

### Coordinate system

The world is a 2D plane (`x`, `y` = 0–800 × 0–450). `x = 400` is the midpoint; West spawns left, East spawns right. Units with `isFlying: true` in `UNIT_CONFIG` are excluded from ground collision and only targetable by anti-air. 3D visuals are a projection layer on top of this 2D simulation.

### Adding a new unit type

1. Add the enum value to `UnitType` in `types.ts`.
2. Add a config entry to `UNIT_CONFIG` in `constants.ts`.
3. Add spawn/AI handling in `GameCanvas.tsx` (search for how an existing similar unit is handled).
4. Add a button in `App.tsx` `renderUnitButtons()`.
