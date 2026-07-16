import { MapType, Team, UnitType } from './types';
import type { CpuPersonaId } from './components/GameCanvas';

// ─────────────────────────────────────────────────────────────────────────────
// Grand Campaign — a North & South-style strategic board wrapping the battles.
// Everything here is pure data-in/data-out: App owns the React screens and the
// battle handoff; this module owns the rules. No engine changes ride on it —
// battles are launched through the same props challenges already use.
// The player is always WEST in v1; the enemy is ONE commander for the whole
// campaign (losing to "Anna" all war long is the narrative).
// ─────────────────────────────────────────────────────────────────────────────

export type TerritoryBonus = 'income' | 'harbor' | 'silo' | 'airbase';

export interface Territory {
  id: string;
  name: string;
  terrain: MapType;
  adjacent: string[];
  bonus?: TerritoryBonus;
  capital?: Team;
  x: number; // board layout, percent
  y: number;
}

export interface CampaignArmy {
  id: string;
  team: Team;
  strength: number; // 1..MAX_STRENGTH; hits 0 = destroyed
  territory: string;
}

export interface CampaignState {
  turn: number;                        // full rounds completed
  owner: Record<string, Team | null>;
  armies: CampaignArmy[];
  enemyPersona: CpuPersonaId;
  // A battle waiting to be fought: set by a move onto contested ground,
  // consumed by applyBattleResult after the 3D battle resolves.
  pendingBattle: { territory: string; attacker: Team; from: string; armyId: string } | null;
  log: string[];
}

export const MAX_STRENGTH = 6;

export const TERRITORIES: Territory[] = [
  { id: 'w-cap', name: 'Fort Columbia', terrain: MapType.COUNTRYSIDE, adjacent: ['w-fields', 'w-harbor'], capital: Team.WEST, x: 7, y: 46 },
  { id: 'w-fields', name: 'Greenline Fields', terrain: MapType.COUNTRYSIDE, adjacent: ['w-cap', 'w-harbor', 'w-ridge', 'w-oil'], x: 21, y: 28 },
  { id: 'w-harbor', name: 'Port Halsey', terrain: MapType.ARCHIPELAGO, adjacent: ['w-cap', 'w-fields', 'w-oil'], bonus: 'harbor', x: 19, y: 72 },
  { id: 'w-ridge', name: 'Cascade Ridge', terrain: MapType.WINTER, adjacent: ['w-fields', 'mid-north', 'mid-city'], x: 35, y: 16 },
  { id: 'w-oil', name: 'Dustbowl Derricks', terrain: MapType.DESERT, adjacent: ['w-fields', 'w-harbor', 'mid-city', 'mid-air'], bonus: 'income', x: 36, y: 54 },
  { id: 'mid-north', name: 'Frostfang Pass', terrain: MapType.WINTER, adjacent: ['w-ridge', 'mid-city', 'e-silo'], x: 50, y: 10 },
  { id: 'mid-city', name: 'Meridian City', terrain: MapType.URBAN, adjacent: ['w-ridge', 'w-oil', 'mid-north', 'mid-air', 'e-silo', 'e-dunes'], bonus: 'income', x: 50, y: 38 },
  { id: 'mid-air', name: 'Skyline Airbase', terrain: MapType.COUNTRYSIDE, adjacent: ['w-oil', 'mid-city', 'e-dunes', 'e-harbor'], bonus: 'airbase', x: 49, y: 68 },
  { id: 'e-silo', name: 'Site Zero Silo', terrain: MapType.DESERT, adjacent: ['mid-north', 'mid-city', 'e-forest', 'e-dunes'], bonus: 'silo', x: 64, y: 18 },
  { id: 'e-dunes', name: 'Red Dunes', terrain: MapType.DESERT, adjacent: ['mid-city', 'mid-air', 'e-silo', 'e-forest', 'e-fields', 'e-harbor'], x: 65, y: 50 },
  { id: 'e-harbor', name: 'Port Zarya', terrain: MapType.ARCHIPELAGO, adjacent: ['mid-air', 'e-dunes', 'e-fields'], bonus: 'harbor', x: 68, y: 82 },
  { id: 'e-forest', name: 'Taiga Verge', terrain: MapType.WINTER, adjacent: ['e-silo', 'e-dunes', 'e-cap'], x: 80, y: 26 },
  { id: 'e-fields', name: 'Collective Farms', terrain: MapType.COUNTRYSIDE, adjacent: ['e-dunes', 'e-harbor', 'e-cap'], bonus: 'income', x: 82, y: 64 },
  { id: 'e-cap', name: 'Kreml Bastion', terrain: MapType.URBAN, adjacent: ['e-forest', 'e-fields'], capital: Team.EAST, x: 93, y: 45 },
];

export const territory = (id: string): Territory => TERRITORIES.find(t => t.id === id)!;

export const createCampaign = (persona: CpuPersonaId): CampaignState => {
  const owner: Record<string, Team | null> = {};
  for (const t of TERRITORIES) {
    owner[t.id] = t.id.startsWith('w-') ? Team.WEST : t.id.startsWith('e-') ? Team.EAST : null;
  }
  return {
    turn: 0,
    owner,
    armies: [
      { id: 'wa1', team: Team.WEST, strength: 2, territory: 'w-cap' },
      { id: 'wa2', team: Team.WEST, strength: 3, territory: 'w-fields' },
      { id: 'wa3', team: Team.WEST, strength: 3, territory: 'w-oil' },
      { id: 'ea1', team: Team.EAST, strength: 2, territory: 'e-cap' },
      { id: 'ea2', team: Team.EAST, strength: 3, territory: 'e-forest' },
      { id: 'ea3', team: Team.EAST, strength: 3, territory: 'e-dunes' },
    ],
    enemyPersona: persona,
    pendingBattle: null,
    log: ['War is declared. Take Kreml Bastion — or break every army they field.'],
  };
};

const clone = (s: CampaignState): CampaignState => ({
  ...s,
  owner: { ...s.owner },
  armies: s.armies.map(a => ({ ...a })),
  log: [...s.log],
});

const pushLog = (s: CampaignState, line: string) => {
  s.log.push(line);
  if (s.log.length > 8) s.log.shift();
};

export const armyAt = (s: CampaignState, id: string, team?: Team): CampaignArmy | undefined =>
  s.armies.find(a => a.territory === id && (team === undefined || a.team === team));

// A side's win: hold the enemy capital, or the enemy has no armies left.
export const campaignWinner = (s: CampaignState): Team | null => {
  if (s.owner['e-cap'] === Team.WEST || !s.armies.some(a => a.team === Team.EAST)) return Team.WEST;
  if (s.owner['w-cap'] === Team.EAST || !s.armies.some(a => a.team === Team.WEST)) return Team.EAST;
  return null;
};

// Move an army one step. Contested ground (enemy army there, or enemy-owned
// territory) arms a pendingBattle instead of resolving — the 3D battle decides.
export const campaignMove = (state: CampaignState, armyId: string, toId: string): CampaignState => {
  const s = clone(state);
  const army = s.armies.find(a => a.id === armyId);
  if (!army || s.pendingBattle) return state;
  const from = army.territory;
  if (!territory(from).adjacent.includes(toId)) return state;
  const foe = army.team === Team.WEST ? Team.EAST : Team.WEST;
  const contested = s.owner[toId] === foe || !!armyAt(s, toId, foe);
  army.territory = toId;
  if (contested) {
    s.pendingBattle = { territory: toId, attacker: army.team, from, armyId };
    pushLog(s, `${army.team === Team.WEST ? 'Your' : 'Enemy'} forces assault ${territory(toId).name}.`);
  } else {
    if (s.owner[toId] !== army.team) pushLog(s, `${army.team === Team.WEST ? 'You take' : 'The enemy takes'} ${territory(toId).name} unopposed.`);
    s.owner[toId] = army.team;
  }
  return s;
};

// The 3D battle came back: settle ground, bleed the loser, retreat or destroy.
export const applyBattleResult = (state: CampaignState, winner: Team): CampaignState => {
  const s = clone(state);
  const pb = s.pendingBattle;
  if (!pb) return state;
  s.pendingBattle = null;
  const attacker = s.armies.find(a => a.id === pb.armyId);
  const defender = s.armies.find(a => a.team !== pb.attacker && a.territory === pb.territory);
  const tName = territory(pb.territory).name;
  if (winner === pb.attacker) {
    s.owner[pb.territory] = pb.attacker;
    if (defender) {
      defender.strength -= 1;
      // The beaten garrison falls back to adjacent friendly ground, or dies in place
      const refuge = territory(pb.territory).adjacent.find(id =>
        s.owner[id] === defender.team && !armyAt(s, id, pb.attacker));
      if (defender.strength <= 0 || !refuge) {
        s.armies = s.armies.filter(a => a.id !== defender.id);
        pushLog(s, `${tName} falls — the defenders are wiped out.`);
      } else {
        defender.territory = refuge;
        pushLog(s, `${tName} falls; the defenders retreat to ${territory(refuge).name}.`);
      }
    } else {
      pushLog(s, `${tName} falls.`);
    }
  } else if (attacker) {
    attacker.strength -= 1;
    attacker.territory = pb.from; // the assault came from friendly ground
    if (attacker.strength <= 0) {
      s.armies = s.armies.filter(a => a.id !== attacker.id);
      pushLog(s, `The assault on ${tName} is annihilated.`);
    } else {
      pushLog(s, `The assault on ${tName} is thrown back.`);
    }
  }
  return s;
};

// Enemy commander's strategic move: one army, one step. Priorities — take the
// player's capital when it's in reach, grab undefended ground (bonuses first),
// otherwise push the strongest army one BFS step toward the nearest
// player-held territory. Returns the new state (may arm a pendingBattle).
export const cpuCampaignTurn = (state: CampaignState): CampaignState => {
  const s = state;
  if (s.pendingBattle || campaignWinner(s)) return s;
  const cpuArmies = s.armies.filter(a => a.team === Team.EAST);
  // 1. Capital strike
  for (const a of cpuArmies) {
    if (territory(a.territory).adjacent.includes('w-cap')) return campaignMove(s, a.id, 'w-cap');
  }
  // 2. Undefended grabs, bonus ground first
  let best: { armyId: string, to: string, score: number } | null = null;
  for (const a of cpuArmies) {
    for (const to of territory(a.territory).adjacent) {
      if (s.owner[to] === Team.EAST) continue;
      const defended = !!armyAt(s, to, Team.WEST);
      if (defended) continue;
      const score = (territory(to).bonus ? 2 : 1) + (s.owner[to] === Team.WEST ? 1 : 0);
      if (!best || score > best.score) best = { armyId: a.id, to, score };
    }
  }
  if (best) return campaignMove(s, best.armyId, best.to);
  // 3. March the strongest army toward the nearest player territory (BFS step)
  const strongest = cpuArmies.slice().sort((a, b) => b.strength - a.strength)[0];
  if (!strongest) return s;
  const targetSet = new Set(TERRITORIES.filter(t => s.owner[t.id] === Team.WEST).map(t => t.id));
  const prev: Record<string, string | null> = { [strongest.territory]: null };
  const queue = [strongest.territory];
  let found: string | null = null;
  while (queue.length && !found) {
    const cur = queue.shift()!;
    for (const nxt of territory(cur).adjacent) {
      if (nxt in prev) continue;
      prev[nxt] = cur;
      if (targetSet.has(nxt)) { found = nxt; break; }
      queue.push(nxt);
    }
  }
  if (!found) return s;
  let step = found;
  while (prev[step] !== strongest.territory && prev[step] !== null) step = prev[step]!;
  return campaignMove(s, strongest.id, step);
};

// Start-of-round reinforcement: every other round each side adds +1 strength
// to its weakest army (capped) — holding ground doesn't win wars, armies do.
export const reinforce = (state: CampaignState): CampaignState => {
  const s = clone(state);
  s.turn += 1;
  if (s.turn % 2 !== 0) return s;
  for (const team of [Team.WEST, Team.EAST]) {
    const weakest = s.armies.filter(a => a.team === team).sort((a, b) => a.strength - b.strength)[0];
    if (weakest && weakest.strength < MAX_STRENGTH) weakest.strength += 1;
  }
  pushLog(s, 'Fresh conscripts reach both fronts (+1 to each side\'s weakest army).');
  return s;
};

// ── Battle handoff ───────────────────────────────────────────────────────────

// Strength difference sets the opening-funds handicap for BOTH sides
const multFor = (mine: number, theirs: number): number =>
  Math.max(0.75, Math.min(1.5, 1 + 0.12 * (mine - theirs)));

export const battleSettings = (s: CampaignState) => {
  const pb = s.pendingBattle!;
  const t = territory(pb.territory);
  const atk = s.armies.find(a => a.id === pb.armyId);
  const def = s.armies.find(a => a.team !== pb.attacker && a.territory === pb.territory);
  const atkStr = atk?.strength ?? 2;
  const defStr = def?.strength ?? 2; // an armyless territory still has a garrison
  const atkMult = multFor(atkStr, defStr);
  const defMult = multFor(defStr, atkStr);
  return {
    map: t.terrain,
    name: t.name,
    moneyMult: {
      [Team.WEST]: pb.attacker === Team.WEST ? atkMult : defMult,
      [Team.EAST]: pb.attacker === Team.EAST ? atkMult : defMult,
    } as Record<Team, number>,
  };
};

// Territory bonuses gate the battle roster: no harbor → no sea launches, no
// airbase → no air-delivered strikes, no silo → no nuke. (The infantryOnly
// challenge guard, generalized.)
export const bannedFor = (s: CampaignState, team: Team): UnitType[] => {
  const owned = new Set(TERRITORIES.filter(t => s.owner[t.id] === team).map(t => t.bonus));
  const banned: UnitType[] = [];
  if (!owned.has('harbor')) banned.push(UnitType.GUNBOAT, UnitType.CRUISE);
  if (!owned.has('airbase')) banned.push(UnitType.AIRSTRIKE, UnitType.AIRBORNE, UnitType.GUNSHIP, UnitType.MISSILE_STRIKE);
  if (!owned.has('silo')) banned.push(UnitType.NUKE);
  return banned;
};

// ── Persistence (ewv-campaign, one slot) ─────────────────────────────────────

export const saveCampaign = (s: CampaignState | null) => {
  try {
    if (s) localStorage.setItem('ewv-campaign', JSON.stringify(s));
    else localStorage.removeItem('ewv-campaign');
  } catch { /* ignore */ }
};

export const loadCampaign = (): CampaignState | null => {
  try {
    const raw = localStorage.getItem('ewv-campaign');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !s.owner || !Array.isArray(s.armies)) return null;
    return s as CampaignState;
  } catch { return null; }
};
