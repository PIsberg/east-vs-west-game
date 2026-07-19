# Movement model

Every ground unit has a locomotion class (`MOVE_CLASS`/`getMoveClass` in
`constants.ts`: `foot`, `wheeled`, `tracked`). Speeds in `UNIT_CONFIG` are
tuned within a class, never across classes.

Each class's `CLASS_PROFILE` sets hill penalty, river-fording ability, turn
rate, body radius and separation. Three pieces work together in the movement
block of [[game-loop#The tick loop]]: obstacle avoidance, heading smoothing,
and a stuck watchdog.

## Obstacle avoidance

`steerAroundObstacles` scans ahead along the unit's heading; the nearest
blocker in the corridor picks a side (`unit.avoidDir`, committed for
`AVOID_COMMIT_MS`) and the unit slides laterally around it while keeping
forward motion.

Vehicles treat trees/rocks/props as solid; infantry only avoids buildings
(the rest is cover it wants). Tracked hulls plow through vegetation instead of
steering. **Never reintroduce a radial push-away here** — pushing a unit back
along its own heading is what used to wedge tanks against buildings.

## Heading smoothing + stuck watchdog

`unit.vel` is lerped by `profile.steer` for inertia on heavy units and to
kill the per-tick jitter that let a wedged vehicle vibrate in place.

A watchdog samples net progress every `STUCK_SAMPLE_TICKS`; a unit that wants
to move but hasn't gained `STUCK_MIN_PROGRESS` flips its committed side and is
shouldered sideways until free. Regression-tested with a probe counting 3s
"wedged" windows — baseline was 22%, healthy is ≤2%
(`__ewDebug.unitList` exposes `position`/`stuckSamples`/`deployed`).
