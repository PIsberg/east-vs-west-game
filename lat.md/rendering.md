# Rendering performance

Everything that scales with battle size renders through instanced meshes
updated imperatively in `useFrame`, not per-entity React components. GLB unit
models need careful clone/dispose handling to avoid GPU leaks.

`components/GameScene.tsx` is a pure renderer: it maps the game-state arrays
from [[game-loop#The tick loop]] to Three.js meshes. Keep new high-count
effects on the instanced path.

## Instanced particles and projectiles

Regular particles and projectiles render through two `InstancedMesh`es
(`InstancedParticles`/`InstancedProjectiles`). Only rare special particles
(beams, bolts, corpses, missiles) are individual React components, flagged via
`isSpecialParticle`.

Two more instanced paths carry the rest: `InstancedDecals` (scorch marks,
crater rims, tread marks) and `InstancedUnitOverlays` (team ring, health bar,
aircraft shadow) — four draw calls for the whole army instead of one per unit.
These read `units` directly each frame, not React props.

## GLB unit models

Units are cloned per unit with `SkeletonUtils.clone` and recolored through
`useTintedClone`. **A clone must dispose its own `Skeleton` on unmount** — it
allocates a GPU bone texture that `<primitive>` never auto-frees.

Long matches once leaked ~8 bone textures per unit death; `useTintedClone`
now disposes the skeleton, while geometry and materials stay shared with the
template and must NOT be disposed. Tint rules use `'*'` to match the pack's
single atlas material; `tintedMaterial` caches so a side shares one material.
Merging the soldier's four skinned meshes is unsafe (each skin bakes its own
node scale into its bind matrices) and is guarded against out-of-range bones.
