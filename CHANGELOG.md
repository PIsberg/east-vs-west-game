# Changelog

## The Big Overhaul (July 2026, PR #13)

The largest update since release — 21 improvement passes, every one verified headlessly before merging.

### New gameplay
- **Flank capture posts**: two smaller objectives on the top/bottom lanes (+12% income each) alongside the center flag (+50%); the CPU fights for them, and a counterweight keeps triple-holds from snowballing.
- **Gunboat**: a naval gun platform stationed on rivers and channels via a placement click; dry-land clicks are refused free of charge. CPUs deploy pickets too.
- **Challenges**: six preset missions on the splash screen — handicaps, time limits and unit restrictions — with permanent completion badges.

### Visuals
- Full 3D model roster (16 unit types) from CC0/CC-BY packs, quantized to under 2MB total.
- Detail pass on Artillery, Tesla and Bunker; team flags on structures and boats.
- Each map has its own atmosphere: desert dust haze, urban smog, tropical island skies; urban lane markings.
- Camera locked to the front 180°, with on-screen scroll/zoom buttons.

### Tactics & UI
- Tactical minimap: live unit dots, terrain, capture rings, the camera's viewport, and click-to-jump.
- Spawn hotkeys (1–0), P to pause, unit stat tooltips, weather forecast chip, capture ownership pips, master volume slider.

### Endgame & meta
- Victory screen with per-team economy level, MVP unit, a score-over-time chart, and an instant Rematch button.
- Victory fanfare and defeat sting; battle popups for breakthroughs and kill bounties.
- Recent battles panel on the splash (match history persists).

### Performance & accessibility
- FX quality mode with weak-GPU auto-detection (~2.75× fps on low-end renderers).
- Shared prop geometries (−34% GPU geometry count); models quantized 46%.
- Colorblind-assist toggle: East reads as amber across rings, minimap and indicators.

### Fixes
- Transport unload duplication, airdropped-paratrooper accounting, and a capture-income snowball — all found by the automated verification that gated every change.
