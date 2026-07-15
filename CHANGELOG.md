# Changelog

## The ground comes alive (July 2026)

- **The battlefield was a flat green slab; now it's a field.** The terrain used to be one solid colour with a scattering of 140 identical dark tufts — read as a painted plane, not ground. It's now planted: denser grass in **three tones** per map so the turf mottles instead of reading flat, blades at **varied heights**, and a scattering of **low faceted bushes** that break the horizon and give the field depth (coloured apart from the grey rock props so they don't read as boulders). The base ground gained gentle **two-tone patches** — sun-catch turf over damp earth — spread across the actual play area instead of half off-map.
- **Every map keeps its character.** Countryside and the islands go lush green; the desert gets sparse dry brush and sun-bleached sand patches, no bushes crowding the dunes; the city streets stay bare rubble. It's all on the instanced-mesh path — the whole meadow is two draw calls — and tuned low and muted so troops still pop against it.

## The Tesla coil forks its lightning (July 2026)

- **The Tesla coil chains now.** Its bolt used to be a five-round burst that dumped its whole charge into one man — 110 damage a shot into a 20-HP rifleman, over and over, while the squad packed in beside him went untouched. A coil is supposed to punish a *crowd*. So the shot now **forks**: it strikes the nearest man for full damage, then arcs to his nearest neighbour, then the next, up to four troops in a chain, each jump weaker than the last. One coil clears a squad instead of executing a single rifleman five times. The arc can walk clear of the coil's own range as it hops the mob, and it still ignores vehicles entirely — this is the answer to an infantry blob, nothing else.
- **You can see it work.** The old single blue beam is now a visible zig-zag: a bright bolt to the first target and a spark of thinner arcs jumping man to man through the pack, so a coil catching a tight formation reads at a glance. Recharges a little faster to match its lighter per-shot punch (verified against the CPU-vs-CPU efficiency harness — it lands squarely in the healthy band, a crowd-control specialist rather than a single-target executioner).

## Orders you can read at a glance (July 2026)

- **Every ordered unit now wears a clear command badge** instead of a tiny coloured dot: a **forward arrow** (green) for attack, a **pause symbol** (amber) for hold, a **back arrow** (red) to fall back. The arrows point the way the unit is headed, so a glance tells you what a selected squad has been told to do.
- **Held infantry hunker down.** Tell troops to hold (or let them dig in) and they drop into a low crouch where they stand, so a defensive line reads as men gone to ground rather than standing around waiting.

## Single-player fills the screen; aircraft get their own shelf (July 2026)

- **The enemy's spawn panel is gone in single-player.** Those buttons were always disabled — you can't build for the CPU — so they were just a dead column eating a third of the width. A spawn panel now shows only for a *human* side: one panel in single-player (two in local 2-player, none when spectating), and the battlefield fills the reclaimed space. That's the difference between the game fitting a phone in landscape and only fitting a tablet or PC.
- **Aircraft have their own button group.** Helicopter, Fighter and Drone moved out of the Vehicles column into a dedicated Aircraft shelf, so the air arm reads at a glance.

## Roster pass — every unit earns its slot, and some fight smarter (July 2026)

An audit of the whole roster: which units felt worth building, and whose behaviour was blunt. Verified against the CPU-vs-CPU efficiency harness (a full pass ended a dead-even W51–E52).

- **Snipers act like snipers.** A marksman now spends his slow, powerful shot on the most valuable soft target in view — an enemy sniper, special-forces trooper, medic, engineer or mortar crew, finishing wounded marks first — instead of whatever rifleman is nearest. Armour is ignored. (1.0 → 1.4.)
- **Artillery and mortars walk the shell onto the crowd.** Indirect fire aims at the densest cluster in range, not the nearest man — the whole point of an area weapon. Artillery's damage was trimmed a touch so the smarter aim didn't make it oppressive.
- **The mortar is worth building.** It was a strictly-worse artillery (half the range, smaller blast, dead-last efficiency). Recast as the infantry's cheap, rapid, river-wading indirect option — spammable forward harassment, distinct from artillery's long-range siege. (0.42 → 0.74.)
- **The flamethrower has a job.** It burns garrisons out of buildings now — the cheap, close-up counterpart to the airstrike — and it's tougher and slightly longer-ranged so it survives the approach. (0.53 → 1.1.)
- **The jeep has teeth.** Its mounted gun was a pea-shooter, so its speed bought nothing but a quick death. Hits hard enough now to be a real fast harasser. (0.44 → 1.0.)
- **Special Forces are elite again** (135/110/28), fixing their bottom-of-the-table pricing. (0.28 → 1.2.)
- **Medics work from the rear.** They stopped charging the firing line and dying without healing anyone — a medic trails the push and only side-steps to casualties level with it or fallen back, and it's a little tougher, so it lives to treat the reserve.
- **Anti-air isn't idle without planes to shoot.** With a clear sky it now depresses its guns and rakes enemy infantry — flak that shreds soft targets but can't punch armour, at short ground range and half damage. Air always takes priority; it's just never a wasted buy against a foe who skipped aircraft. (0.79 → 1.06.)

## Playtest pass — fewer blowouts, smarter CPU, sharper strongpoints (July 2026)

- **A losing CPU regroups instead of dying.** The "fall back and consolidate when outmatched" generalship was hard-only; on normal, a losing computer just kept marching everything into the meatgrinder and got pinned at its own spawn. Normal now pulls back too — conservatively, only once it's clearly losing — so the beaten side holds a line and fights back. Across all four maps the loser's share of the surviving army roughly doubled (15% → 34%) and matches got closer.
- **The CPU cracks strongpoints with airstrikes.** It never used to buy an airstrike at all. Now, when you turtle infantry into a building, it calls one down on the fullest one — the one thing that levels a garrisoned house.
- **Special Forces are finally worth $150.** They were badly overpriced (per dollar a plain soldier out-shot and out-lived them several times over) and sat at the bottom of the efficiency table. Retuned to 135/110/28 — tough, hard-hitting elites that now earn their keep and get fielded.
- **The CPU stops over-smoking.** Smoke was its biggest single expense — more than tanks — and hung a permanent grey haze over the field. It now uses one cloud at a time, only against a real enemy battery: cleaner battlefield, more money for troops.
- **Strongpoints read as objectives.** Every occupiable house now carries a ground marker ring (grey until taken, then the holder's colour), an always-visible occupancy counter, a sandbag barricade at its base, and a flag-raise puff when captured — so a house you can hold stands out from the scenery.
- **URBAN streets open up.** Fewer, better-spaced city blocks leave driveable lanes so armour stops wedging into dead-ends.

## Airstrikes level houses (July 2026)

- **Air power flattens strongpoints.** A house used to shrug off an airstrike entirely — the napalm burned the men around it but never touched the structure. Now an airstrike (either side's) eats the building over its burn, and a missile strike, nuke or cruise hit does the same. It's the answer to a dug-in garrison you can't dislodge with rifles: one canister will bring a house down, occupied **or empty** (so you can also deny a key building before the enemy ever reaches it). Ground fire is unchanged — artillery and small arms still only chew a house that's actually manned.

## Infantry hold the houses (July 2026)

- **Buildings are strongpoints now.** Every map seeds a handful of occupiable houses across the contested middle, and the first team whose line infantry reaches one raises its flag over it. Riflemen, snipers, special forces and paras can garrison; engineers and medics have work to do in the open and walk on past.
- **The house shelters the men and shoots back.** Troops inside leave the field — nothing can touch them directly — while the structure soaks fire on their behalf and the garrison fires out of the windows at the nearest enemy. A floating **5/30** counter shows how full it is; a bigger house holds more (small squad up to a full platoon).
- **A lot of HP, and states on the way down.** Houses carry several tank shells' worth of structure and visibly degrade — intact, then cracked, then burning and coughing smoke — before they **collapse into rubble**. Empty houses stay standing as plain cover; only a manned one can be brought down (by direct fire, splash, or an attacker with nothing else to shoot).
- **Every stage changes hands.** Each time a shell knocks the house down a damage stage the shaken garrison is blown out into the open and the position goes neutral — so the side assaulting it (already at the wall) can rush in and seize it, or the defenders can scramble back before they do. Storm a house and you might take it without ever bringing it down. On the final collapse most of whoever's inside dies in the rubble, so it's still worth burning the enemy out before you push past.

## Bunkers, box-select, and a tank that faces the right way (July 2026)

- **Tanks drove backwards.** The tank model faces −X, but the code assumed +X and gave it no yaw, so both sides rolled into battle with the barrel pointing at their own base (measured: the gun sat 5.1 units *behind* the hull centre relative to the advance). Yawed by π — the gun now leads.
- **Drag-select works** because it now exists: left-drag draws a marquee and selects every unit of yours inside it. Previously left-drag orbited the camera and there was no box-select at all, so "select all your units with the mouse" simply had nothing behind it. The camera now orbits on right-drag; touch is unchanged.
- **Bunkers are built, not dropped.** A bunker spends ~9s as a building site — scaffolded, gunless, and starting at 35% HP while the concrete cures — so placing one on top of the enemy is a way to lose $155.
- **Infantry can man a bunker.** Foot troops told to *hold* near one walk over and climb in: each soldier inside adds +25% damage and 7% faster reload, capped at four (the firing slits run out). If the bunker falls, ~60% of the garrison scrambles out of the rubble at half health; the rest are lost with it.

## Soldiers get rifles; the renderer stops leaking (July 2026)

- **The squad is armed.** The soldier model shipped without a weapon — its animations are named `Idle_Gun`, but there was no gun. Every foot unit now carries a rifle on its right hand, tracked to the wrist bone through the run/aim/fire clips, tinted with the unit's role colour.
- **Rambo looks the part**: a red bandana on his head and a squad machine gun — long barrel, drum magazine, ammo belt — twice the length of a rifleman's weapon. With his 18% height bonus he now reads as the heavy at a glance, not just a soldier who costs $150.
- **Units are actually team-coloured again.** Every model in the pack ships a single atlas material, while the tint rules were still looking for material names (`Swat`, `Main`, `DarkGreen`) that no longer exist — so the tints silently applied to nothing and both sides rendered identically, distinguishable only by the ring on the ground. West now reads blue, East red (amber in colourblind mode).
- **Fixed a GPU memory leak that made long matches degrade.** Each cloned unit model gets its own skeleton, and each skeleton allocates a bone texture that was never freed when the unit died — about 8 textures per spawn, over 1,400 GPU textures inside 40 seconds of battle. Clones now dispose their skeletons. GPU textures stay flat (43–83) where they used to climb without bound.
- **Draw calls down ~30%** at the same unit count (1,240–1,590 → 880–1,110 at ~15 units): the soldier's 11 mesh primitives are merged to 4, and everything that scales with army size — scorch decals, crater rims, tread marks, team rings, health bars, aircraft shadows — moved into instanced meshes with per-instance alpha.
- Bounty popups ("+$110") are cached sprites instead of drei `<Text>`, which allocated a geometry and a texture per popup and leaked both.

## Movement overhaul (July 2026)

- **Units round obstacles instead of grinding into them.** Ground units scan a corridor ahead, pick the side with more room, and commit to it for a beat. The old code pushed a unit radially away from whatever it touched — for a tank nose-first against a building that meant pushing *backwards*, so it stalled and sawed in place. Measured over CPU-vs-CPU matches on all four maps: vehicles spent 22% of their time going nowhere before, 1% after; the worst single wedge fell from 16.5s to 1.5s.
- **A stuck watchdog** samples progress every ~0.4s: a unit that wants to move but hasn't gained ground takes the other way round the obstacle and shoulders sideways until it's free. Vehicles crush the crates and barrels pinning them.
- **Speeds are relative to what a unit actually is.** Every ground unit now belongs to a locomotion class (foot / wheeled / tracked) that decides how it takes hills, whether it can ford a river, and how tightly it turns. Tanks no longer crawl slower than the infantry they escort (0.45 → 0.62); the APC is a proper assault carrier (0.52 → 0.80); crew-served weapons (mortar, artillery) stay slow.
- **Heavy units have inertia** — tracks lean into a turn rather than snapping to a new heading each frame, which is also what stops the frame-to-frame jitter that let a vehicle vibrate against a wall.
- **The APC drops its ramp on contact** (enemy within 240px, or at the front, or badly hurt) instead of only spilling survivors when it explodes. In testing, 14 of 15 APCs put their squad on the ground while still alive; none died with troops aboard.
- **Vehicles stranded at a downed bridge** back out of the ford and stage on the crossing, where an engineer can reach them, instead of piling nose-first into the water.

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
