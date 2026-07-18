# Online 1v1 — Specification

*What networked play is, from the player's point of view. The technical plan lives in [plan.md](plan.md).*

Date: 2026-07-17 · Status: proposed

## 1. Overview

Two players play a standard East vs West match against each other over the internet — one as WEST, one as EAST — from the existing web build (GitHub Pages) with no accounts, no dedicated server and no install. One player hosts and shares a short room code; the other joins with it. The match plays exactly like a local hotseat match: same maps, same units, same rules, same pacing.

## 2. Goals

- **G1** — 1v1 human-vs-human over the internet on the existing static deployment.
- **G2** — Zero infrastructure owned by us beyond a signaling broker (free tier). Game traffic is peer-to-peer.
- **G3** — The in-match experience is indistinguishable from local play at typical home latencies (< 150 ms RTT): no rubber-banding, no unit teleporting, full 60 fps rendering.
- **G4** — Both simulations stay perfectly in sync for the whole match; if they ever diverge it is detected and surfaced honestly, never played out silently.

## 3. Non-goals (v1)

- More than 2 players, online spectators, or online co-op vs CPU.
- Matchmaking, rankings, accounts, chat. Players exchange the room code out-of-band (Discord, SMS…).
- Reconnection into a running match after a dropped connection (v2 candidate).
- Grand Campaign or Challenges over the network — Skirmish only.
- Anti-cheat beyond honesty by construction (see §8).
- Cross-build play: both players must be on the same deployed version (enforced, see §7).

## 4. Player experience

### 4.1 Entry (splash screen)

A new **Online** section on the splash menu alongside the existing mode options:

- **Host game** — creates a room, shows a short room code (e.g. `EW-7K3F`) with a copy button. Host then waits on a lobby panel.
- **Join game** — input for the code, then connects to the host's lobby.

### 4.2 Lobby

- The **host** owns all match settings: map, win mode (points / base HP / CTF), asymmetry (Classic/Asymmetric), fog of war, and which side (WEST/EAST) the host plays. The guest sees the settings live (read-only) and gets the other side.
- Both players press **Ready**; the match starts on a short 3-2-1 countdown once both are ready.
- Either player can leave the lobby; the other is returned to a waiting/entry state with a message.

### 4.3 In match

- Each player controls exactly one team with the normal UI: spawn buttons, hotkeys, team commands, stances, per-unit orders, abilities, targeted strikes. The opponent's inputs simply appear as enemy actions, like playing the CPU.
- **Latency indicator** in the header (ping in ms, colored good/ok/bad).
- **Input feel**: a small fixed input delay (~100 ms) applies to *both* players' commands equally. Spawning and orders feel "on click" — the delay is below perception for this game's pace (units already take seconds to matter).
- **Stall handling**: if the opponent's data stops arriving, the sim freezes for both (never runs ahead) behind a "Waiting for opponent…" overlay with a seconds counter.
- **Pause**: either player may pause; the pause banner names who paused. Either player may resume. (No pause-abuse guard in v1 — this is friendly play.)
- **Game speed**: the 2× toggle is disabled in online matches (both sims must agree on pacing; v1 keeps it simple).
- **Fog of war**: if enabled by the host, each player sees through their *own* team's eyes, like single-player fog.

### 4.4 Match end

- Normal victory/defeat screen with the existing stats, timeline and event feed on both sides — each player sees it from their own perspective.
- **Rematch** button: offers a rematch to the opponent; if both accept, a new match starts with the same settings and a fresh seed.
- Match history (`ewv-history`) records online matches with an "online" tag and the opponent label.

### 4.5 Failure cases (must be honest, never silent)

| Event | Behavior |
|---|---|
| Opponent closes tab / connection lost > 10 s | Overlay: "Opponent disconnected." Remaining player may **Claim victory** (recorded as a win) or **Exit** (no result). |
| Desync detected (see plan §desync) | Match ends for both with an explicit "Simulations diverged" screen — no winner recorded. Diagnostic blob offered for copy/paste into a bug report. |
| Version mismatch on join | Rejected at the door: "Host is on a different game version — both players should hard-refresh." |
| Join code wrong / room gone | Clear error at the join input, no hang. |
| Signaling broker unreachable | Clear error at Host/Join time ("Can't reach matchmaking service"), local play unaffected. |

## 5. Functional requirements

- **F1** — Room create/join via short human-readable code; connection established peer-to-peer (WebRTC data channel), with the broker used only for the handshake.
- **F2** — Host authority over match settings; settings and the map seed transmitted before start so both clients generate an identical battlefield.
- **F3** — All gameplay-affecting player actions are transmitted and applied on the same simulation tick on both clients: unit spawns (incl. targeted strikes with coordinates), team commands, stance changes, per-unit orders and abilities, pause/resume, resign.
- **F4** — The two simulations are bit-identical: same units, same ids, same positions, same RNG outcomes (weather, scatter, drops), for the entire match. Verified continuously by exchanged state checksums.
- **F5** — Rendering, particles, camera, audio and other cosmetics remain fully local and unsynchronized.
- **F6** — A player closing the game mid-match counts as a forfeit prompt on the other side (F-case table above).
- **F7** — Online play works on the production GitHub Pages deployment over typical home NAT (STUN; TURN relay is a stretch goal — without it a small % of NAT pairs can't connect and get a clear error).
- **F8** — Local modes (vs CPU, hotseat, campaign, challenges, spectate) are completely unaffected when not playing online — including zero behavioral drift from the determinism refactor (validated by the balance harness).

## 6. What is synchronized vs local

| Synchronized (identical on both clients) | Local (free to differ) |
|---|---|
| Terrain layout, buildings, bridges, props (from shared seed) | Camera, selection, marquee |
| Units, projectiles, combat resolution, veterancy | Particles, decals, tread marks, muzzle FX |
| Weather rolls and timing | Audio, music intensity, shell shock |
| Economy, income, capture points, supply drops | HUD state, minimap viewport, FX quality |
| Air ops clock, abilities, mines, smokes, wrecks, craters | Fog-of-war *rendering* (each side renders own team's grid) |
| Score, base HP, CTF flags, match end | Event feed rendering (content identical, display local) |

## 7. Compatibility & constraints

- **Same build required.** The connection handshake exchanges a build id; mismatch refuses the match (GitHub Pages means both players are usually on the latest build already — a hard refresh fixes stragglers).
- **Same browser family recommended.** The sim uses floating-point math; identical engines guarantee identical results. Chrome/Edge (both V8) is the tested happy path; a cross-engine match (e.g. Chrome vs Safari) is allowed but flagged in the lobby as "untested — desyncs possible".
- **Backgrounding the tab** throttles the game loop; the opponent sees the "Waiting…" overlay. Acceptable in v1.
- Mobile (Capacitor) builds are not an online target for v1, but nothing in the design precludes them.

## 8. Fairness

Lockstep means each client holds full game state, so a modified client could reveal fog or automate play. This is friendly-code-sharing 1v1 — we accept it. The design still prevents *rule* cheating (illegal spawns, money hacks) from having asymmetric effect: a client that breaks the rules desyncs against the honest peer and the match voids (F4). No competitive integrity claims are made in v1.

## 9. Success criteria

- Two players on ~50 ms home connections complete a full 100-point match with zero desyncs and no perceptible input lag.
- A deliberately-induced desync (dev tool) is caught within 2 s of checksum exchange and ends the match cleanly.
- Disconnect mid-match produces the claim-victory flow on the surviving side within 10 s.
- 20 consecutive CI replay runs of a recorded match produce identical final checksums (determinism regression gate).
- All existing local modes pass the smoke suite unchanged; balance-harness efficiency numbers stay within noise of the pre-refactor baseline.
