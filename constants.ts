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
    // Paratroopers land alone behind the enemy line and were dying to a man
    // (100% losses, 0.36-0.48 kill-value/$ — the worst in the game). At 28 HP a
    // trooper cost twice a rifleman and was barely tougher than one, so the drop
    // was a way to donate money. Elite now: double a rifleman's HP and damage for
    // roughly double his price, which is what "airborne" is supposed to buy.
    cost: 70,
    health: 40,
    damage: 20,
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

// Rounds used to be stepped by TWO loops in the same tick, so their real speed
// was always double this number. Unifying the loops into one resolver halved
// every time-of-flight, so the base doubles to keep flight times where they were.
export const PROJECTILE_SPEED = 12;
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

// ── Firing signatures ───────────────────────────────────────────────────────
// What actually leaves the barrel. Every gun used to emit the same orange cone,
// so a tank's main gun read like a rifle. Now the weight of a shot is in the
// muzzle: heavy bores blow smoke, kick dust off the ground and shove the
// camera; automatics spit brass; the sniper barely disturbs the air (a wisp of
// dust is the only tell). Counts are per shot — keep them small, every one of
// these is an instanced particle and fast weapons fire many times a second.
export interface FireFx {
  flash: number;        // muzzle-flash scale
  flashColor?: string;  // default is the hot orange of burning propellant
  smoke: number;        // puffs shoved out of the bore
  dust: number;         // ground kicked up by the muzzle blast
  brass: number;        // ejected casings
  sparks: number;       // burning propellant flecks
  shake: number;        // camera kick
  recoil: number;       // how far the whole weapon rocks back (GameScene)
}

export const FIRE_FX: Partial<Record<UnitType, FireFx>> = {
  // Heavy bores: the shot is an event
  [UnitType.ARTILLERY]: { flash: 7, smoke: 7, dust: 9, brass: 0, sparks: 5, shake: 3.4, recoil: 5 },
  [UnitType.TANK]:      { flash: 4, smoke: 5, dust: 6, brass: 0, sparks: 4, shake: 2.0, recoil: 4 },
  [UnitType.GUNBOAT]:   { flash: 3.4, smoke: 4, dust: 0, brass: 0, sparks: 3, shake: 1.4, recoil: 3 },
  [UnitType.MORTAR]:    { flash: 1.6, smoke: 5, dust: 3, brass: 0, sparks: 2, shake: 0.6, recoil: 2 },
  [UnitType.BUNKER]:    { flash: 2.2, smoke: 2, dust: 1, brass: 2, sparks: 2, shake: 0.7, recoil: 1.5 },
  // Automatics: brass, not thunder
  [UnitType.ANTI_AIR]:  { flash: 2.2, flashColor: '#fde68a', smoke: 1, dust: 0, brass: 4, sparks: 3, shake: 0.4, recoil: 1 },
  [UnitType.APC]:       { flash: 1.8, smoke: 1, dust: 0, brass: 3, sparks: 2, shake: 0.3, recoil: 1 },
  [UnitType.JEEP]:      { flash: 1.3, smoke: 0, dust: 0, brass: 3, sparks: 1, shake: 0.15, recoil: 0.8 },
  [UnitType.SPECIAL_FORCES]: { flash: 1.5, smoke: 0, dust: 0, brass: 4, sparks: 2, shake: 0.15, recoil: 0.8 },
  [UnitType.SOLDIER]:   { flash: 1, smoke: 0, dust: 0, brass: 2, sparks: 1, shake: 0, recoil: 0.6 },
  // The sniper's tell is dust lifted off the ground, not a flash
  [UnitType.SNIPER]:    { flash: 1.5, flashColor: '#fff7ed', smoke: 1, dust: 3, brass: 1, sparks: 0, shake: 0.25, recoil: 1.2 },
  // Aircraft: nothing to kick dust off, and rockets leave their own trail
  [UnitType.HELICOPTER]: { flash: 2, smoke: 1, dust: 0, brass: 0, sparks: 2, shake: 0.35, recoil: 1 },
  [UnitType.FIGHTER]:   { flash: 2, smoke: 1, dust: 0, brass: 0, sparks: 2, shake: 0.3, recoil: 1 },
};
export const DEFAULT_FIRE_FX: FireFx = { flash: 1, smoke: 0, dust: 0, brass: 1, sparks: 1, shake: 0, recoil: 0.5 };
export const getFireFx = (t: UnitType): FireFx => FIRE_FX[t] ?? DEFAULT_FIRE_FX;

// How long the muzzle flash stays lit, in ticks — scaled to the weapon's cadence.
// A fixed window (it was 8 ticks for everything) is wrong at both ends: the jeep
// reloads in 14 ticks, so its flash burned for 57% of every cycle and read as a
// constant glow, while artillery's 460-tick cycle reduced its shot to a 1.7%
// blink. Holding the duty cycle at roughly a fifth makes fast weapons strobe and
// heavy ones linger. Recoil rides the same window, so a howitzer heaves where a
// jeep twitches.
export const flashTicks = (t: UnitType): number => {
  const cadence = (UNIT_CONFIG[t] as any)?.attackSpeed ?? 30;
  return Math.max(3, Math.min(14, cadence * 0.22));
};

// How heavy a single shot is, 0 (rifle round) → 1 (tank shell). Derived from the
// unit's own damage so it stays true if the balance numbers move — the whole
// point is that what you see matches what the shot actually does.
export const shotWeight = (t: UnitType): number => {
  const dmg = (UNIT_CONFIG[t] as any)?.damage ?? 10;
  return Math.max(0, Math.min(1, dmg / 70));
};

// ── Rounds in flight ────────────────────────────────────────────────────────
// Every projectile used to be the same 3.4x0.65 streak in one of two colors, so
// a tank shell and a rifle bullet were indistinguishable mid-air. Fat, slow,
// glowing shells now read differently from a supersonic sniper streak.
const ROUND_COLOR: Partial<Record<UnitType, string>> = {
  [UnitType.SNIPER]: '#e0f2fe',     // a pale supersonic streak
  [UnitType.ANTI_AIR]: '#fef08a',   // flak tracer
  [UnitType.ARTILLERY]: '#fb923c',  // a shell you can see coming
  [UnitType.TANK]: '#fdba74',
  [UnitType.MORTAR]: '#fca5a5',
  [UnitType.BUNKER]: '#fdba74',
  [UnitType.GUNBOAT]: '#fdba74',
};
// ── Reach ───────────────────────────────────────────────────────────────────
// Range was the one stat that never showed up in the shot: every round left the
// barrel at the same speed (6) and flew dead flat, so a mortar bomb lobbed 320px
// and a rifle bullet crossing 140px looked identical.
//
// Indirect weapons LOB — the shell climbs and falls, which is the whole reason
// they out-range everything and shoot over cover. Direct-fire guns shoot flat,
// and the longer the reach the faster the round, so a long shot doesn't crawl
// across the field (at a flat speed of 6, a sniper's 350px shot hung in the air
// for a full second).
export const INDIRECT = new Set<UnitType>([UnitType.ARTILLERY, UnitType.MORTAR]);

export const roundSpeed = (t: UnitType): number => {
  if (INDIRECT.has(t)) return PROJECTILE_SPEED * 0.75;   // a lobbed bomb hangs
  const r = (UNIT_CONFIG[t] as any)?.range ?? 200;
  // Floor at 1.0, never below: reach may only ever make a round FASTER. A floor
  // of 0.9 quietly slowed every short-range weapon in the game (the balance run
  // caught soldiers 1.49 -> 1.25 and jeeps 0.93 -> 0.36 off the back of it),
  // which is a stat nerf nobody asked for.
  return PROJECTILE_SPEED * Math.max(1.0, Math.min(1.9, r / 220));
};

// How high a lobbed round climbs: proportional to how far it has to go, capped
// so it never leaves the readable band above the field.
export const arcHeight = (dist: number): number => Math.min(90, 20 + dist * 0.22);

export interface RoundFx { len: number; girth: number; color: string }
export const DEFAULT_ROUND_FX: RoundFx = { len: 3.4, girth: 0.65, color: '#fbbf24' };
export const getRoundFx = (t: UnitType): RoundFx => {
  const w = shotWeight(t);
  return {
    len: 2.6 + w * 3.2,
    girth: 0.5 + w * 1.4,
    color: ROUND_COLOR[t] ?? (w > 0.5 ? '#fdba74' : '#fde68a'),
  };
};

// ── Impacts ─────────────────────────────────────────────────────────────────
// A direct hit used to spawn nothing at all — 240 damage and 6 damage landed
// identically, with only a sound and the red flash to tell you. The impact is
// now scaled by the damage actually dealt (after cover/entrenchment), and
// flavored by what it lands on: steel throws bright sparks and shards, troops
// kick up dust. Counts stay small — every one is an instanced particle.
export const IMPACT_SHAKE_MIN_DAMAGE = 40;   // below this a hit does not move the camera

// One $70 paradrop puts a stick of this many troopers on the ground. Keep it in
// step with the harness cost table (scripts/balance-harness.cjs divides the buy
// price by the stick size) or paratrooper efficiency reads wrong.
export const AIRBORNE_STICK = 4;

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
