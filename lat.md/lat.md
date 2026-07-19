Concept map for East vs West 3D, managed by
[lat.md](https://www.npmjs.com/package/lat.md): source code is anchored to
these definitions via `// @lat:` comments and `[[wiki-links]]`. Run `lat
check` after touching tagged code to catch drift, `lat search` to find the
relevant section. For the full narrative writeup see `CLAUDE.md` at the repo
root — these files are the linked map, not a replacement for it.

## Sections

The concepts below each anchor to one or more symbols in source.

- [[dual-state]] — the useRef/useState split (hot-path sim data vs. HUD state)
- [[game-loop]] — the tick loop, GAME_TEMPO, the single projectile resolver
- [[online-play]] — lockstep netcode: determinism, transport, scheduler, lobby
- [[cpu-ai]] — the CPU commander: difficulty vs. personality
- [[movement]] — locomotion classes, obstacle avoidance, the stuck watchdog
- [[rendering]] — instanced particles/decals/overlays, GLB model handling
- [[map-system]] — MapType, terrain generation, occupiable buildings, bunkers
