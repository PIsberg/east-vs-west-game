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
  APC = 'APC',
  BUNKER = 'BUNKER',
  GUNSHIP = 'GUNSHIP',
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
  type: 'tree' | 'hill' | 'bush' | 'rock' | 'river' | 'bridge' | 'building';
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
  text?: string; // For floating text (e.g. Dollar Sign)
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
}
