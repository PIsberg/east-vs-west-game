# Map system

`MapType` (`types.ts`) defines five maps — COUNTRYSIDE, URBAN, DESERT,
ARCHIPELAGO, WINTER — chosen pre-game in `App.tsx`. Terrain is generated
procedurally per map; visuals branch on `mapType` again in the renderer.

## Terrain generation

Terrain is built in an `if/else if` chain branching on `mapType` inside
`components/GameCanvas.tsx`, and `GameScene.tsx` branches on `mapType` for
ground/accent colors and river-vs-channel visuals.

**Adding a map** needs all four: an enum value, a terrain-gen branch here, a
visual branch in `GameScene.tsx`, and a menu entry in `App.tsx`.

## Occupiable buildings

Houses seeded into the contested middle band of every map
(`OCCUPIABLE_PER_MAP`) that line infantry can garrison. State lives on the
`TerrainObject` (`occupant`/`garrisonUnits`/`health`/`fireCooldown`), not on a
`Unit`.

The whole lifecycle — capture, defensive fire, damage states, collapse — runs
as one pass in [[game-loop#The tick loop]] after the unit loop and before the
projectile resolver, so garrison-fired rounds resolve the same tick.

## Bunkers and the frozen river

A bunker is poured, not dropped: `BUNKER_BUILD_MS` (~9s) as a building site
that cures HP from a start value to full via the *delta* of progress each
tick — a per-tick nudge toward a target never catches up at low frame rate.

Winter's `TerrainObject.frozen` lets foot units cross the ice anywhere at
`ICE_CROSS_MULT` speed, skipping the wading range penalty; vehicles still need
bridges and gunboats treat ice as dry land.
