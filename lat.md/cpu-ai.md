# CPU opponent

A side-agnostic AI commander in `components/GameCanvas.tsx` (search `// CPU
AI`), configured via `cpuTeam` + `cpuDifficulty` props. Runs inside
[[game-loop#The tick loop]] on a spawn-interval timer that speeds up when
losing.

Each cycle it threat-analyzes the foe's units (air/armor/infantry/mine
counts), builds a weighted priority map of affordable counters, and
occasionally fires a special tactic (missile strike, airborne drop,
minefield, or an airstrike on a garrisoned strongpoint). A new unit type
should be added to this weight map, or the computer never uses it.

## Difficulty vs personality

Two orthogonal tables: difficulty is *competence*, personality is *taste*.
They compose — a persona biases what gets built, difficulty governs whether
the reads behind it are correct.

`CPU_DIFFICULTY` sets spawn cadence, special-tactic frequency, income bonus,
`counterSmart` (chance to read composition and counter-pick), `commands`
(economy/rally eagerness), and `stanceIQ` (hard only — retreat when badly
outmatched, hold when slightly weaker, advance when stronger).

`CPU_PERSONALITY` (`CpuPersonaId`: balanced/ivan/anna/kenji/frederick)
multiplies the counter-pick weight map (floored at 0.3 — a specialist
under-invests, never blinds itself), scales tactic rolls and command
eagerness, breaks stance ties by doctrine (never overriding a retreat), and
`bunker` gates a persona-only bunker-pour. Picked on the splash, persisted in
`ewv-prefs`; `'random'` resolves once per mount. `__ewDebug.cpuPersona`
exposes the resolved value.
