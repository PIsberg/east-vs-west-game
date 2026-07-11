# East vs West 3D

A real-time tug-of-war strategy game inspired by the classic Commodore Amiga title **[North & South](https://en.wikipedia.org/wiki/North_%26_South_(video_game))** (Infogrames, 1989). Command the West or East team, deploy units, and push to the enemy edge to claim victory! Available online here: https://pisberg.github.io/east-vs-west-game/

Play solo against the computer (**Easy / Normal / Hard** — the hard AI counter-picks your army, invests in its economy and maneuvers its forces), or two-player hotseat on one keyboard. Four battlefields, two win modes (**100 Points** or **Base HP**).

![east-vs-west1-PXL_20260102_152535277](https://github.com/user-attachments/assets/7f40c567-b98a-412a-bc20-ab26f77321eb)

## 🎮 How to Play

### Objective
The first team to reach **100 Points** wins.
- **Tanks** score **3 Points**.
- **All other units** score **1 Point**.
- Points are scored by units reaching the far edge of the map.

### Resources
- **Money** generates automatically over time.
- **Supply Drops**: Every ~30s a crate parachutes onto the midfield — the first team to reach it claims **cash ($150)**, a **veteran squad**, or a **field medkit** (heals your whole army). Crate stripe color shows the prize.
- **Refunds**: Units that successfully reach the enemy edge refund 50% of their deployment cost.

### 🕹️ Controls

#### Mouse
- **Click Unit Buttons** (Left/Right side) to spawn units.
- **Click Terrain**: Inspect terrain or targeting (for airstrikes).
- **Click an Enemy Unit**: Your army focus-fires it for 6 seconds.
- **Orders** (per side): Advance / Hold / Fall Back stances.
- **Troop Control**: Click one of **your own units** to select it (squad-spawned infantry selects as a squad); **double-click to select every unit of that type**. An order panel appears: **⚔ Attack / ⛨ Hold / ⏪ Fall Back / Follow Team**. Per-unit orders override the team stance; a colored dot above each unit shows its personal order. Click open ground or press Esc to deselect.
- **Command bar** (centered under the battlefield): **Economy upgrades** (3 levels, +25% income each — invest early or field units now) and the **Rally Horn** ($150: +45% fire rate & +25% speed for 8 seconds, long cooldown — time it with a push).
- **Field Repairs**: Wounded units heal slowly near their own edge when out of combat — pull damaged veterans back with **Fall Back** instead of feeding kills to the enemy.
- **Battle Feed**: Key events (big-unit kills, bridges, supply drops, capture point, nukes) scroll by in the lower-left corner.
- **Sound & Music**: Toggle SFX mute and the procedural battle-march from the top bar; settings and your menu choices (map, side, CPU level, win mode) are remembered between visits.
- **Mobile**: Play on your phone in **landscape** — the layout switches to a compact battle view (slim header, scrollable unit panels) and the field manual is tucked behind the **Manual** button in the top bar (toggleable on desktop too). Portrait shows a rotate prompt.

#### Keyboard Shortcuts
- **West Team (Left)**: `1` - `0`, `-`, `=`
- **East Team (Right)**: `F12` - `F1`

---

## 🎖️ Units & Strengths

### Infantry
| Unit | Role | Weakness |
| :--- | :--- | :--- |
| **Squad** | Basic grunts. Cheap & swarmable. | Splash damage, Snipers. |
| **Sniper** | **Long Range** specialist. High damage, slow reload. 30% Miss chance. | Swarms, Close combat. |
| **Rambo** | Hero unit. Rapid fire minigun. | Tanks, Artillery. |
| **Flamer** | Short-range cone of fire that ignores cover. | Snipers, anything with range. |
| **Medic** | Heals nearby wounded troops. Unarmed. | Everything that shoots. |
| **P. Mine** | Hidden trap. Explodes on contact. | Engineers, Luck. |
| **Engineer** | Detects & defuses enemy mines, repairs bridges. Unarmed. | Everything that shoots. |
| **Mortar** | Indirect splash fire at long range. Stops to shoot. | Rushes, Snipers. |

### Vehicles
| Unit | Role | Weakness |
| :--- | :--- | :--- |
| **Jeep** | **Fast recon**. Rapid MG, races ahead of the column. | Tanks, Mines. |
| **Truck** | **Troop transport**. Scoops up 6 foot soldiers in your half, delivers them to the front. Unarmed; survivors bail out if it dies. | Everything. |
| **Tank** | **Heavy Armor**. High HP & Damage. The backbone of any push. | Anti-Tank Mines, Air attacks. |
| **Tesla** | Chain-lightning vehicle. Melts infantry, ignores vehicles entirely. | Tanks, Helicopters. |
| **APC** | Armored fighting vehicle; disgorges 3 soldiers when destroyed. | Anti-tank fire. |
| **Artillery** | **Siege Unit**. Massive range & Splash damage. Stationary when firing. | Fast units, Air attacks. |
| **Anti-Air** | **Air Defense**. Essential vs Drones & Helicopters. | Tanks, Infantry. |
| **T. Mine** | Anti-Tank trap. High damage massive explosion. | Infantry (trigger radius). |
| **Bunker** | Static strongpoint placed anywhere on your half. | Artillery, being bypassed. |

### Air Support
| Unit | Role | Note |
| :--- | :--- | :--- |
| **Helicopter** | **Flying Gunship**. Hovers at range. Attacks Ground & Air. | Anti-Air (AA), Fighters. |
| **Fighter** | **Air superiority jet**. Hunts enemy aircraft, strafes ground. | Anti-Air (AA). |
| **Drone** | **Kamikaze**. Flying bomb. Targets specific units. | Anti-Air (AA). |
| **Airstrike** | **Napalm Run**. Burns a wide area over time. | Cooldown/Money. |
| **Paratroopers** | **Deep Strike**. Drop squad behind enemy lines. | Vulnerable while falling. |
| **Missile** | **Precision Strike**. High damage to single point. | - |
| **Smoke** | **Concealment**. Blocks targeting into/out of the cloud (~13s). Counters snipers & artillery. | Close assaults, Air units. |
| **Cruise Missile** | Sea-launched from beyond the map edge. Flies in low, big warhead. | Cost. |
| **Gunship** | Heavy flyover: rakes the target zone with a burst-fire strafing run. | Anti-Air (AA). |
| **Satellite Laser** | Orbital beam: red designator, then a sustained burn that melts a zone. | Cost, telegraphed. |
| **Nuke** | **Mass Destruction**. Huge area damage. Friendly Fire Enabled! | Use with caution! |

---

## 🌍 Terrain & Tactics
- **Entrenchment**: Foot soldiers that hold still under **Hold** orders dig in after ~6 seconds — a foxhole with sandbags appears and they take **45% less direct fire** until they move. Explosive weapons ignore foxholes.

- **Hills**: Units on hills get **+30% Range** and **-20% Reload Time**. Key for artillery.
- **Cover (Trees/Rocks)**: Infantry will automatically seek cover. Reduces incoming damage by **60%**.
- **River**: Slows down infantry. Vehicles MUST use bridges to cross.
- **Bridges are destructible**: Artillery, missiles and mines collapse them — vehicles are blocked until the bridge is repaired (infantry can wade, slowly). A broken bridge shows a bobbing wrench marker: build an **Engineer** and he'll walk there and reopen it in seconds. Left alone, bridges slowly self-repair (~1 minute), so the front never stalls forever.
- **Water Disadvantage**: Units wading in the river (not on bridge) have **-60% Range**.
- **Battlefield wear**: Supply crates splinter and fuel barrels cook off (small blast!) when caught in explosions or crushed by vehicles; tanks and jeeps leave faint tread marks. Debris and marks fade away on their own.

---

## 🕹️ Inspiration

East vs West is a loving nod to **[North & South](https://en.wikipedia.org/wiki/North_%26_South_(video_game))** (Infogrames, 1989), the Amiga/Commodore-era classic based on the *Les Tuniques Bleues* comics: two armies tugging over one front line, battles you can pick up and play in seconds, and a tone that never takes the war too seriously. This project reimagines that spirit as a modern real-time 3D lane battle — with a procedural military march instead of a chiptune, and a nuke button the original never dared to ship.

---

## 🛠️ Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development server:
   ```bash
   npm run dev
   ```

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/PIsberg/east-vs-west-game/badge)](https://scorecard.dev/viewer/?uri=github.com/PIsberg/east-vs-west-game)
