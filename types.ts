export enum Team {
  WEST = 'WEST',
  EAST = 'EAST',
}

export enum UnitType {
  TANK = 'TANK',
  SOLDIER = 'SOLDIER',
  ARTILLERY = 'ARTILLERY',
  RAMBO = 'RAMBO',
  AIRBORNE = 'AIRBORNE',
  AIRSTRIKE = 'AIRSTRIKE',
  MISSILE_STRIKE = 'MISSILE_STRIKE',
  NAPALM = 'NAPALM',
  MINE_PERSONAL = 'MINE_PERSONAL',
  MINE_TANK = 'MINE_TANK',
  DRONE = 'DRONE',
  ANTI_AIR = 'ANTI_AIR',
  NUKE = 'NUKE',
  HELICOPTER = 'HELICOPTER',
  SNIPER = 'SNIPER',
  TESLA = 'TESLA',
  FLAMETHROWER = 'FLAMETHROWER',
  MEDIC = 'MEDIC',
  ENGINEER = 'ENGINEER',
  APC = 'APC',
  BUNKER = 'BUNKER',
  GUNSHIP = 'GUNSHIP',
  MORTAR = 'MORTAR',
  JEEP = 'JEEP',
  FIGHTER = 'FIGHTER',
  SATELLITE = 'SATELLITE',
  CRUISE = 'CRUISE',
  TRANSPORT = 'TRANSPORT',
  SMOKE = 'SMOKE',
}

export enum MapType {
  COUNTRYSIDE = 'COUNTRYSIDE',
  URBAN = 'URBAN',
  DESERT = 'DESERT',
  ARCHIPELAGO = 'ARCHIPELAGO',
}

export enum UnitState {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  ATTACKING = 'ATTACKING',
  DYING = 'DYING',
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface TerrainObject {
  id: string;
  x: number;
  y: number;
  type: 'tree' | 'hill' | 'bush' | 'rock' | 'river' | 'bridge' | 'building' | 'crate' | 'barrel';
  size: number;
  width?: number;
  height?: number;
  state?: 'normal' | 'burning' | 'burnt' | 'broken';
  health?: number; // Burn time or durability
}

export interface Unit {
  id: string;
  team: Team;
  type: UnitType;
  position: Vector2D;
  state: UnitState;
  health: number;
  maxHealth: number;
  attackCooldown: number;
  targetId: string | null;
  width: number;
  height: number;
  spawnTime?: number;
  rotation?: number; // Visual rotation (radians)
  // Cover Logic
  coverId?: string | null; // ID of tree/rock
  coverType?: 'tree' | 'rock';
  isInCover?: boolean;
  coverEnterTime?: number;
  coverDuration?: number; // How long to stay
  lastCoverId?: string | null; // Don't reuse same cover immediately
  burstCount?: number; // For burst fire units (Tesla)
  isOnHill?: boolean;
  squadId?: string;
  planeAltitudeAtDrop?: number;
  lastHitTime?: number; // For hit flash visual
  kills?: number;
  veterancy?: number; // 0=none 1=★ 2=★★ 3=★★★
  lastAttackerId?: string;
  passengers?: Unit[]; // Transport cargo (units removed from the field while riding)
  boarded?: boolean;   // True while riding in a transport
  entrench?: number;      // ticks spent stationary under 'hold' orders
  isEntrenched?: boolean; // dug in: reduced incoming direct fire until the unit moves
  orders?: Stance;        // per-unit order override; undefined = follow the team stance
}

export interface Projectile {
  id: string;
  team: Team;
  position: Vector2D;
  velocity: Vector2D;
  damage: number;
  isBazooka?: boolean;
  explosionRadius?: number;
  isHeavy?: boolean;
  maxRange: number;
  distanceTraveled: number;
  targetType?: 'ground' | 'air';
  sourceType?: UnitType;
  sourceUnitId?: string;
  isMissile?: boolean;
}

export interface Particle {
  id: string;
  position: Vector2D;
  life: number;
  color: string;
  size: number;
  velocity?: Vector2D; // For dynamic movement
  drag?: number;      // For friction/slowdown
  targetPos?: Vector2D; // For Lightning beams
  isGroundDecal?: boolean;
  isSkid?: boolean; // Faint vehicle tread marks; rot gives the travel direction
  rot?: number;     // Ground-plane orientation (radians) for directional decals
  isBolt?: boolean; // Vertical sky-to-ground lightning bolt
  isCorpse?: boolean; // Fallen infantry body / burnt vehicle wreck
  isShockwave?: boolean; // Expanding ground ring; size = max radius, life counts 18..0
  alt?: number;    // Explicit render altitude (world Y); overrides the legacy life-based height
  altVel?: number; // Altitude change per tick (rising smoke, falling snow)
  text?: string; // For floating text (e.g. Dollar Sign)
}

export interface GameEvent {
  id: string;
  time: number; // Date.now() when emitted — the feed fades entries by age
  kind: 'kill' | 'bridge' | 'crate' | 'capture' | 'strike' | 'command';
  team?: Team; // team the event concerns (colors the feed line); undefined = neutral
  text: string;
}

export interface GameState {
  units: Unit[];
  projectiles: Projectile[];
  particles: Particle[];
  score: {
    [Team.WEST]: number;
    [Team.EAST]: number;
  };
  money: {
    [Team.WEST]: number;
    [Team.EAST]: number;
  };
  weather: 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
  // Pre-rolled forecast: what rolls in next and when (epoch ms)
  weatherNext?: { type: 'clear' | 'rain' | 'snow' | 'fog' | 'storm', at: number };
  events?: GameEvent[];
  captureOwner?: Team | null;
  incomeLevel?: { [Team.WEST]: number; [Team.EAST]: number };
  rally?: { [Team.WEST]: RallyState; [Team.EAST]: RallyState };
  baseHP?: {
    [Team.WEST]: number;
    [Team.EAST]: number;
  };
}

export type GameMode = 'points' | 'basehp';

// Team command buffs (Date.now() timestamps)
export interface RallyState {
  until: number;   // rally buff active while now < until
  readyAt: number; // next activation allowed when now >= readyAt
}

export type TeamCommand = 'rally' | 'income';

export type Stance = 'advance' | 'hold' | 'retreat';

export interface CapturePoint {
  x: number;
  y: number;
  radius: number;
  owner: Team | null;
  progress: number; // -max..+max, positive = West capturing
}

export interface Flyover {
  id: string;
  team: Team;
  type: UnitType;
  targetPos: Vector2D;
  currentX: number;
  altitudeY: number;
  speed: number;
  dropped: boolean;
  canisterY?: number;
  canisterVelocityY?: number;
  missileCount?: number;
  health: number;
  shotTimer?: number; // For gunship burst-fire timing
}

export interface Missile {
  id: string;
  team: Team;
  target: Vector2D;
  current: Vector2D;
  velocity: Vector2D;
  isCruise?: boolean;      // sea-launched: enters from the bottom edge, flies low
  customDamage?: number;
  customRadius?: number;
}

export interface SupplyCrate {
  id: string;
  x: number;
  y: number;
  alt: number; // descending under a parachute while > 0
  type: 'cash' | 'squad' | 'medkit';
  life: number; // ticks remaining once landed before it despawns
}

export interface SmokeZone {
  id: string;
  team: Team;
  x: number;
  y: number;
  life: number;    // ticks remaining
  maxLife: number;
  radius: number;  // targeting through the cloud is blocked beyond point-blank range
}

export interface LaserStrike {
  id: string;
  team: Team;
  x: number;
  y: number;
  life: number;    // ticks remaining
  maxLife: number; // designator phase = first DESIGNATE_TICKS of maxLife
  radius: number;
}
