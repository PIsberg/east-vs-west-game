import { UnitType } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;

export const HORIZON_Y = 100;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.0;

export const FPS = 60;
export const MILLISECONDS_PER_FRAME = 1000 / FPS;

export const WIN_SCORE = 100;
export const BASE_HP = 50; // Base HP mode: breakthroughs damage the defender's base instead of scoring

export const UNIT_CONFIG = {
  [UnitType.TANK]: {
    cost: 110,
    health: 240,
    damage: 95,
    speed: 0.62,
    range: 220,
    attackSpeed: 90,
    width: 40,
    height: 25,
    colorWest: '#1d4ed8',
    colorEast: '#b91c1c',
  },
  [UnitType.SOLDIER]: {
    cost: 25,
    health: 20,
    damage: 10,
    bazookaDamage: 25,
    speed: 0.55,
    range: 140,
    attackSpeed: 55,
    width: 16,
    height: 16,
    colorWest: '#3b82f6',
    colorEast: '#ef4444',
  },
  [UnitType.ARTILLERY]: {
    cost: 80,
    health: 45,
    damage: 38,
    explosionRadius: 65,
    speed: 0.22,
    deployDistance: 80,
    range: 700,
    attackSpeed: 460,
    width: 35,
    height: 30,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.SPECIAL_FORCES]: {
    cost: 150,
    health: 80,
    damage: 20,
    speed: 0.72,
    range: 180,
    attackSpeed: 20,
    width: 24,
    height: 24,
    colorWest: '#2563eb',
    colorEast: '#dc2626',
  },
  [UnitType.HELICOPTER]: {
    cost: 155,
    health: 100,
    damage: 35,
    speed: 1.6,
    range: 250,
    attackSpeed: 22,
    width: 45,
    height: 20,
    colorWest: '#0e7490', // Cyan-ish
    colorEast: '#be123c', // Rose
    isFlying: true,
  },
  [UnitType.SNIPER]: {
    cost: 90,
    health: 20,
    damage: 95,
    speed: 0.35,
    range: 350,
    attackSpeed: 180,
    width: 16,
    height: 16,
    colorWest: '#15803d', // Green (Camo)
    colorEast: '#991b1b',
  },
  [UnitType.AIRBORNE]: {
    cost: 70,
    health: 28,
    damage: 16,
    speed: 0.6,
    range: 160,
    attackSpeed: 48,
    width: 18,
    height: 18,
    colorWest: '#60a5fa',
    colorEast: '#f87171',
  },
  [UnitType.AIRSTRIKE]: {
    cost: 100,
    health: 40,
    damage: 0,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#f97316',
    colorEast: '#f97316',
  },
  [UnitType.SMOKE]: {
    cost: 70,
    health: 1,
    damage: 0,
    radius: 72,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#9ca3af',
    colorEast: '#9ca3af',
  },
  [UnitType.MISSILE_STRIKE]: {
    cost: 125,
    health: 40,
    damage: 240,
    radius: 65,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#334155',
    colorEast: '#334155',
  },
  [UnitType.NAPALM]: {
    cost: 0,
    health: 300,
    damage: 1.2,
    radius: 100,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#f97316',
    colorEast: '#f97316',
  },
  [UnitType.MINE_PERSONAL]: {
    cost: 20,
    health: 1,
    damage: 70,
    speed: 0,
    triggerRadius: 20,
    explosionRadius: 42,
    width: 10,
    height: 10,
    colorWest: '#1d4ed8',
    colorEast: '#b91c1c',
  },
  [UnitType.MINE_TANK]: {
    cost: 45,
    health: 1,
    speed: 0,
    damage: 180,
    triggerRadius: 25,
    explosionRadius: 55,
    width: 14,
    height: 14,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.DRONE]: {
    cost: 45,
    health: 25,
    damage: 35,
    speed: 2.2,
    range: 30,
    attackSpeed: 45,
    width: 16,
    height: 16,
    colorWest: '#6366f1',
    colorEast: '#f43f5e',
    isFlying: true
  },
  [UnitType.ANTI_AIR]: {
    cost: 80,
    health: 55,
    damage: 60,
    speed: 0.58,
    range: 400,
    attackSpeed: 50,
    width: 30,
    height: 20,
    colorWest: '#0f766e',
    colorEast: '#991b1b',
  },
  [UnitType.GUNBOAT]: {
    cost: 145,
    health: 170,
    damage: 30,
    speed: 0, // anchored on water — a river-borne gun platform
    range: 260,
    attackSpeed: 75,
    width: 34,
    height: 16,
    colorWest: '#155e75',
    colorEast: '#7f1d1d',
  },
  [UnitType.TESLA]: {
    cost: 165,
    health: 165,
    damage: 110,
    speed: 0.44,
    range: 150,
    attackSpeed: 200,
    width: 32,
    height: 24,
    colorWest: '#0ea5e9', // Sky Blue
    colorEast: '#6366f1', // Indigo
  },
  [UnitType.NUKE]: {
    cost: 2500,
    health: 40,
    damage: 1000,
    radius: 3000,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#65a30d',
    colorEast: '#65a30d',
  },
  [UnitType.FLAMETHROWER]: {
    cost: 70,
    health: 32,
    damage: 8,
    speed: 0.44,
    range: 88,
    attackSpeed: 10,
    width: 18,
    height: 18,
    colorWest: '#c2410c',
    colorEast: '#991b1b',
  },
  [UnitType.MEDIC]: {
    cost: 45,
    health: 22,
    damage: 0,
    healAmount: 9,
    speed: 0.58,
    range: 90,
    attackSpeed: 42,
    width: 16,
    height: 16,
    colorWest: '#15803d',
    colorEast: '#b91c1c',
  },
  [UnitType.ENGINEER]: {
    cost: 55,
    health: 28,
    damage: 0,
    speed: 0.5,
    range: 80, // mine detection radius
    attackSpeed: 80, // disarm time
    width: 16,
    height: 16,
    colorWest: '#ca8a04',
    colorEast: '#b45309',
  },
  [UnitType.APC]: {
    cost: 95,
    health: 150,
    damage: 24,
    speed: 0.80,
    range: 165,
    attackSpeed: 52,
    width: 44,
    height: 26,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.BUNKER]: {
    cost: 155,
    health: 360,
    damage: 28,
    speed: 0,
    range: 260,
    attackSpeed: 36,
    width: 32,
    height: 32,
    colorWest: '#374151',
    colorEast: '#374151',
  },
  [UnitType.GUNSHIP]: {
    cost: 225,
    health: 100,
    damage: 45,
    radius: 75,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#1e293b',
    colorEast: '#1e293b',
  },
  [UnitType.MORTAR]: {
    cost: 75,
    health: 24,
    damage: 26,
    explosionRadius: 40,
    speed: 0.34,
    range: 320,
    attackSpeed: 240,
    width: 16,
    height: 16,
    colorWest: '#365314',
    colorEast: '#7f1d1d',
  },
  [UnitType.JEEP]: {
    cost: 60,
    health: 70,
    damage: 8,
    speed: 1.15,
    range: 150,
    attackSpeed: 14,
    capacity: 1, // one seat: the fastest way to get an engineer (or any foot unit) forward

    width: 32,
    height: 20,
    colorWest: '#1d4ed8',
    colorEast: '#b91c1c',
  },
  [UnitType.TRANSPORT]: {
    cost: 70,
    health: 160,
    damage: 0,
    speed: 0.90,
    range: 0,
    attackSpeed: 0,
    capacity: 6,
    width: 38,
    height: 24,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.SATELLITE]: {
    // Was $350 / radius 48: the priciest non-nuke strike with the SMALLEST
    // footprint (cruise 90, napalm 100), so it killed fewer units than a $100
    // napalm run — measured at 0.39 value-per-dollar against every other
    // strike's 0.75-1.31. Widened the beam (area x2) and cut the price.
    cost: 260,
    health: 0,
    damage: 3.5, // per tick while the beam is active
    radius: 68,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#7dd3fc',
    colorEast: '#7dd3fc',
  },
  [UnitType.CRUISE]: {
    cost: 200,
    health: 0,
    damage: 300,
    radius: 90,
    speed: 0,
    range: 0,
    attackSpeed: 0,
    width: 0,
    height: 0,
    colorWest: '#334155',
    colorEast: '#334155',
  },
  [UnitType.FIGHTER]: {
    cost: 140,
    health: 70,
    damage: 30,
    speed: 2.6,
    range: 200,
    attackSpeed: 30,
    width: 40,
    height: 18,
    colorWest: '#0e7490',
    colorEast: '#be123c',
    isFlying: true,
  },
};

export const PROJECTILE_SPEED = 6;
export const MONEY_PER_TICK = 0.15;
// 2000 bought a ~20-unit opening all-in whose winner snowballed the match
export const INITIAL_MONEY = 1200;

export const HILL_RANGE_BONUS = 1.3;
export const HILL_RELOAD_BONUS = 0.8;

// Team commands
export const INCOME_UPGRADE_BASE_COST = 250; // level N costs N * base
export const INCOME_UPGRADE_BONUS = 0.25;    // +25% income per level
export const INCOME_UPGRADE_MAX = 3;
export const RALLY_COST = 150;
export const RALLY_DURATION_MS = 8000;
export const RALLY_COOLDOWN_MS = 50000;      // measured from activation
export const RALLY_RELOAD_MULT = 1.45;       // cooldowns tick 45% faster
export const RALLY_SPEED_MULT = 1.25;

// Field repairs: units near their own edge patch up slowly when not under fire
export const REPAIR_ZONE = 90;               // distance from own edge
export const REPAIR_PER_TICK = 0.06;         // ~3.6 HP/s
export const REPAIR_COMBAT_LOCKOUT_MS = 2500;

// Engineer field repairs: he is the only way to put HP back into armor out in
// the field (the edge-zone trickle above means dragging a hurt tank all the way
// home). Works under fire and anywhere on the map — that is what you pay for.
export const ENGINEER_REPAIR = 12;           // HP per repair action (~9 HP/s at his 80-tick cadence)
export const ENGINEER_REPAIR_RANGE = 70;     // must be alongside the machine
// A machine is anything with an engine or poured out of concrete: every vehicle,
// plus the two emplacements. Aircraft are excluded — he cannot reach them.
export const isMechanical = (t: UnitType): boolean =>
  MOVE_CLASS[t] !== undefined || t === UnitType.BUNKER || t === UnitType.GUNBOAT;

// ── Locomotion ───────────────────────────────────────────────────────────────
// Every ground unit belongs to a movement class. The class decides how it takes
// terrain (hills, water) and how it handles: tracks turn slowly but shrug off
// slopes, wheels are quick on the flat and bog down on a hill, boots go
// anywhere. Speeds in UNIT_CONFIG are tuned within the class, not against it.
export type MoveClass = 'foot' | 'wheeled' | 'tracked';

export const MOVE_CLASS: Partial<Record<UnitType, MoveClass>> = {
  [UnitType.TANK]: 'tracked',
  [UnitType.APC]: 'tracked',
  [UnitType.ARTILLERY]: 'tracked',
  [UnitType.TESLA]: 'tracked',
  [UnitType.JEEP]: 'wheeled',
  [UnitType.TRANSPORT]: 'wheeled',
  [UnitType.ANTI_AIR]: 'wheeled',
};
// Everything else on the ground walks.
export const getMoveClass = (t: UnitType): MoveClass => MOVE_CLASS[t] ?? 'foot';

export const CLASS_PROFILE: Record<MoveClass, {
  hill: number;     // speed multiplier while climbing a hill
  wade: number;     // speed multiplier fording an unbridged river (0 = can't)
  steer: number;    // heading lerp per tick — low = heavy, wide turns
  radius: number;   // body radius used for obstacle clearance
  sepRadius: number;
  sepStr: number;
}> = {
  foot:    { hill: 0.85, wade: 0.45, steer: 0.55, radius: 9,  sepRadius: 32, sepStr: 0.09 },
  wheeled: { hill: 0.55, wade: 0,    steer: 0.30, radius: 17, sepRadius: 56, sepStr: 0.065 },
  tracked: { hill: 0.75, wade: 0,    steer: 0.20, radius: 21, sepRadius: 60, sepStr: 0.07 },
};

// Obstacle avoidance: units look ahead along their heading, and when something
// blocks the path they commit to rounding it on one side for a while (flip-
// flopping between sides every tick is what pinned tanks against buildings).
export const AVOID_LOOKAHEAD = 74;      // px scanned ahead of a vehicle
export const AVOID_COMMIT_MS = 1100;    // how long a chosen side sticks
export const STUCK_SAMPLE_TICKS = 24;   // progress is sampled this often
export const STUCK_MIN_PROGRESS = 3;    // px of travel expected per sample
export const STUCK_ESCALATE = 2;        // stalled samples before flipping side

// ── Bunkers ──────────────────────────────────────────────────────────────────
// A bunker isn't dropped ready-made: it goes up over a few seconds, and while
// the concrete is curing it can't shoot and isn't at full strength. Place it
// behind the line, or lose it.
export const BUNKER_BUILD_MS = 9000;
export const BUNKER_BUILD_START_HP = 0.35;  // fraction of max HP at the moment it's placed

// Infantry can man it. Each soldier inside adds firepower, but only up to a
// point — the firing slits run out.
export const BUNKER_GARRISON_MAX = 4;
export const BUNKER_GARRISON_DAMAGE = 0.25;  // +25% damage per soldier inside
export const BUNKER_GARRISON_RELOAD = 0.07;  // and 7% faster reload each
export const BUNKER_GARRISON_RANGE = 30;     // how close a soldier must be to climb in
export const BUNKER_CALL_RANGE = 150;        // infantry told to hold within this walk over and man it

// APC: an assault carrier, not a coffin. It puts its squad on the ground the
// moment it makes contact rather than hauling them to their death.
export const APC_SQUAD = 3;
export const APC_DEPLOY_RANGE = 240;    // enemy within this → drop the ramp
export const APC_DEPLOY_HP = 0.55;      // or when it's taken a beating
