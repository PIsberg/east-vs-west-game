# Game loop

The mutable sim runs in one `requestAnimationFrame` loop, decoupled from
React's render cycle, and hands a snapshot out to the HUD once per frame.

## The tick loop

`tick()` in `components/GameCanvas.tsx` is the heartbeat, running at
`GAME_TEMPO` (1.25) sim ticks per frame. Tune pacing via `GAME_TEMPO`, never
by scaling `UNIT_CONFIG` speeds — those are tuned relative to each other.

Fractional ticks carry across frames, so the sim plays ~25% faster than
one-tick-per-frame with relative balance untouched. Each tick: consume the
spawn queue → move/target/fire every unit → resolve projectiles
([[game-loop#The single projectile resolver]]) → run the occupiable-buildings pass
([[map-system#Occupiable buildings]]) → snapshot state out via
`onGameStateChange`. The loop never touches `useState` directly — see
[[dual-state#The useRef/useState split]].

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
