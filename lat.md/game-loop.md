# Game loop

The mutable sim runs in one `requestAnimationFrame` loop, decoupled from
React's render cycle, and hands a snapshot out to the HUD once per frame.

## The tick loop

`tick()` in `components/GameCanvas.tsx` is the heartbeat, running at
`GAME_TEMPO` (1.25) sim ticks per frame. Tune pacing via `GAME_TEMPO`, never
by scaling `UNIT_CONFIG` speeds — those are tuned relative to each other.

Fractional ticks carry across frames, so the sim plays ~25% faster than
one-tick-per-frame with relative balance untouched. Each tick: consume the
spawn queue → move/target/fire every unit (breakthroughs score here) →
check match point ([[game-loop#Match point]]) → resolve projectiles
([[game-loop#The single projectile resolver]]) → run the occupiable-buildings pass
([[map-system#Occupiable buildings]]) → snapshot state out via
`onGameStateChange`. The loop never touches `useState` directly — see
[[dual-state#The useRef/useState split]].

## Match point

The first time a side reaches `MATCH_POINT_FRAC` (0.85) of a win, measured
by `winProgress` so points and base-HP modes compare, the tick announces it
and hands the *other* side a free last-stand rally (`LAST_STAND_MS`).

It only extends `rallyRef.until`: no money, no `readyAt`, so every existing
rally multiplier and the HUD's RALLYING chip apply unchanged. `matchPointRef`
holds the sim ms it fired per side (once per side per match, CTF excluded),
and both lockstep peers fire it on the same tick because it reads sim state
only. The march's tension layer keys off it too. Covered by smoke24.

## The single projectile resolver

There is exactly ONE projectile resolver in `tick()` — do not add a second.
Two once existed and disagreed on which rules a round obeyed (cover/flyovers
vs. AA multipliers/blast falloff), so whichever caught a round first decided.

Order inside it: cover/foxhole → AA multipliers → armor facing. Explosive
rounds don't double-dip a direct hit — the blast carries their damage, and
the blast must set `lastAttackerId` or a kill credits nobody (artillery and
mortar then earn no veterancy). Note the tick still contains two *loops* over
`projectilesRef` — pre-existing, both call `impactFx`; worth knowing before
tuning projectile speed or damage.
