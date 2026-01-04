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
  type: 'tree' | 'hill' | 'bush' | 'rock' | 'river' | 'bridge';
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
  sourceType?: UnitType; // To track who fired it
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
  weather: 'clear' | 'rain';
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
}

export interface Missile {
  id: string;
  team: Team;
  target: Vector2D;
  current: Vector2D;
  velocity: Vector2D;
}
