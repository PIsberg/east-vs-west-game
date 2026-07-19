# East vs West 3D — Architecture

> **This file is a pointer, not the documentation.** The prose overview that
> used to live here had gone stale (it described a `/src` layout that never
> existed, phantom components, and "planned" optimizations that shipped long
> ago). Rather than maintain a third narrative that drifts again, the sources
> of truth are now:
>
> - **`CLAUDE.md`** (repo root) — the full, current architecture narrative:
>   the dual-state pattern, every component's role, the game loop, combat
>   resolution, the CPU AI, online multiplayer, rendering rules, and each
>   gameplay/strategic system. Start here.
> - **`lat.md/`** — a [lat.md](https://www.npmjs.com/package/lat.md) concept
>   graph: one short markdown file per major system, cross-linked with
>   `[[wiki-links]]` and anchored into the source via `// @lat:` comments.
>   Run `lat check` to verify those anchors still resolve after a code change;
>   `lat search <query>` finds the section relevant to a task.

## Quick orientation

- **Game loop** lives in `components/GameCanvas.tsx` (`tick()`), decoupled
  from React and running at `GAME_TEMPO` sim ticks per frame. See
  [[lat.md/game-loop]] and `CLAUDE.md` § *Game logic flow*.
- **Rendering** is a pure projection layer in `components/GameScene.tsx`
  (R3F/Three.js), mapping the 2D sim (`x` 0–800, `y` 0–450) into 3D. See
  [[lat.md/rendering]].
- **Files live at the repo root**, not under `/src`: `App.tsx`,
  `components/`, `services/`, `utils/`, `constants.ts`, `types.ts`,
  `campaign.ts`.
