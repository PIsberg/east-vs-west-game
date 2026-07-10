# East vs West 3D

A tug-of-war strategy game inspired by classic lane defense games. Command the West or East team, deploy units, and push to the enemy edge to claim victory! Available online here: https://pisberg.github.io/east-vs-west-game/

![east-vs-west1-PXL_20260102_152535277](https://github.com/user-attachments/assets/7f40c567-b98a-412a-bc20-ab26f77321eb)

## 🎮 How to Play

### Objective
The first team to reach **100 Points** wins.
- **Tanks** score **3 Points**.
- **All other units** score **1 Point**.
- Points are scored by units reaching the far edge of the map.

### Resources
- **Money** generates automatically over time.
- **Refunds**: Units that successfully reach the enemy edge refund 50% of their deployment cost.

### 🕹️ Controls

#### Mouse
- **Click Unit Buttons** (Left/Right side) to spawn units.
- **Click Terrain**: Inspect terrain or targeting (for airstrikes).
- **Click an Enemy Unit**: Your army focus-fires it for 6 seconds.
- **Orders** (per side): Advance / Hold / Fall Back stances.

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
| **P. Mine** | Hidden trap. Explodes on contact. | Engineers, Luck. |
| **Engineer** | Detects & defuses enemy mines, repairs bridges. Unarmed. | Everything that shoots. |
| **Mortar** | Indirect splash fire at long range. Stops to shoot. | Rushes, Snipers. |

### Vehicles
| Unit | Role | Weakness |
| :--- | :--- | :--- |
| **Jeep** | **Fast recon**. Rapid MG, races ahead of the column. | Tanks, Mines. |
| **Tank** | **Heavy Armor**. High HP & Damage. The backbone of any push. | Anti-Tank Mines, Air attacks. |
| **Artillery** | **Siege Unit**. Massive range & Splash damage. Stationary when firing. | Fast units, Air attacks. |
| **Anti-Air** | **Air Defense**. Essential vs Drones & Helicopters. | Tanks, Infantry. |
| **T. Mine** | Anti-Tank trap. High damage massive explosion. | Infantry (trigger radius). |

### Air Support
| Unit | Role | Note |
| :--- | :--- | :--- |
| **Helicopter** | **Flying Gunship**. Hovers at range. Attacks Ground & Air. | Anti-Air (AA), Fighters. |
| **Fighter** | **Air superiority jet**. Hunts enemy aircraft, strafes ground. | Anti-Air (AA). |
| **Drone** | **Kamikaze**. Flying bomb. Targets specific units. | Anti-Air (AA). |
| **Airstrike** | **Napalm Run**. Burns a wide area over time. | Cooldown/Money. |
| **Paratroopers** | **Deep Strike**. Drop squad behind enemy lines. | Vulnerable while falling. |
| **Missile** | **Precision Strike**. High damage to single point. | - |
| **Cruise Missile** | Sea-launched from beyond the map edge. Flies in low, big warhead. | Cost. |
| **Satellite Laser** | Orbital beam: red designator, then a sustained burn that melts a zone. | Cost, telegraphed. |
| **Nuke** | **Mass Destruction**. Huge area damage. Friendly Fire Enabled! | Use with caution! |

---

## 🌍 Terrain & Tactics

- **Hills**: Units on hills get **+30% Range** and **-20% Reload Time**. Key for artillery.
- **Cover (Trees/Rocks)**: Infantry will automatically seek cover. Reduces incoming damage by **60%**.
- **River**: Slows down infantry. Vehicles MUST use bridges to cross.
- **Bridges are destructible**: Artillery, missiles and mines collapse them — vehicles are blocked until an Engineer repairs the bridge (infantry can wade, slowly).
- **Water Disadvantage**: Units wading in the river (not on bridge) have **-60% Range**.

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
