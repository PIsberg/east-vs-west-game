# Dual-state pattern

Game data splits across two update paths that never mix: mutable refs for
hot-path simulation state, React state only for HUD-frequency changes.

## The useRef/useState split

The ref block at the top of `components/GameCanvas.tsx`'s body holds the
high-frequency sim state; a 60fps loop can't afford React reconciliation per
frame. Never move hot-path game data into React state.

- **`useRef`** (high-frequency): unit positions, projectiles, particles,
  terrain — mutated directly inside [[game-loop#The tick loop]], never
  triggers a re-render (`unitsRef`, `projectilesRef`, `particlesRef`,
  `scoreRef`, ...).
- **`useState`** (low-frequency): score, money, spawn queue, UI overlays, map
  selection, CPU toggle — updated only when the HUD needs to re-render.

See [[game-loop#The tick loop]] for how the two paths connect once per frame,
and [[online-play#Determinism foundation]] for why this ref-based sim state
is exactly what must stay byte-identical across networked peers.
