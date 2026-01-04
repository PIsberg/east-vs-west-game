import { UnitType } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 450;

export const HORIZON_Y = 100;
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.0;

export const FPS = 60;
export const MILLISECONDS_PER_FRAME = 1000 / FPS;

export const WIN_SCORE = 100;

export const UNIT_CONFIG = {
  [UnitType.TANK]: {
    cost: 100,
    health: 210, // Buffed to withstand 2 shots (90*2 = 180)
    damage: 90,
    speed: 0.6,
    range: 220,
    attackSpeed: 100,
    width: 40,
    height: 25,
    colorWest: '#1d4ed8',
    colorEast: '#b91c1c',
  },
  [UnitType.SOLDIER]: {
    cost: 25,
    health: 12,
    damage: 8,
    bazookaDamage: 20,
    speed: 0.45,
    range: 140,
    attackSpeed: 60,
    width: 16,
    height: 16,
    colorWest: '#3b82f6',
    colorEast: '#ef4444',
  },
  [UnitType.ARTILLERY]: {
    cost: 55,
    health: 30,
    damage: 25,
    explosionRadius: 60, // Increased from 40
    speed: 0.35, // Was 0. Now moves slowly.
    deployDistance: 80,
    range: 700,
    attackSpeed: 500,
    width: 35,
    height: 30,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.RAMBO]: {
    cost: 70,
    health: 100,
    damage: 25,
    speed: 0.55,
    range: 180,
    attackSpeed: 15,
    width: 24,
    height: 24,
    colorWest: '#2563eb',
    colorEast: '#dc2626',
  },
  [UnitType.HELICOPTER]: {
    cost: 150,
    health: 100, // Nerfed HP
    damage: 25, // Rapid fire
    speed: 1.2,
    range: 250,
    attackSpeed: 25, // Slower fire rate (was 10)
    width: 45,
    height: 20,
    colorWest: '#0e7490', // Cyan-ish
    colorEast: '#be123c', // Rose
    isFlying: true,
  },
  [UnitType.SNIPER]: {
    cost: 80,
    health: 10,
    damage: 80, // High single shot damage
    speed: 0.4, // Slow movement
    range: 350, // Very long range (outranges tanks)
    attackSpeed: 200, // Very slow reload
    width: 16,
    height: 16,
    colorWest: '#15803d', // Green (Camo)
    colorEast: '#991b1b',
  },
  [UnitType.AIRBORNE]: {
    cost: 60,
    health: 15,
    damage: 12,
    speed: 0.5,
    range: 160,
    attackSpeed: 50,
    width: 18,
    height: 18,
    colorWest: '#60a5fa',
    colorEast: '#f87171',
  },
  [UnitType.AIRSTRIKE]: {
    cost: 90,
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
  [UnitType.MISSILE_STRIKE]: {
    cost: 110,
    health: 40,
    damage: 200,
    radius: 60,
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
    cost: 15,
    health: 1,
    damage: 60,
    speed: 0,
    triggerRadius: 20,
    explosionRadius: 40,
    width: 10,
    height: 10,
    colorWest: '#1d4ed8',
    colorEast: '#b91c1c',
  },
  [UnitType.MINE_TANK]: {
    cost: 25,
    health: 1,
    speed: 0,
    damage: 150,
    triggerRadius: 25,
    explosionRadius: 50,
    width: 14,
    height: 14,
    colorWest: '#1e3a8a',
    colorEast: '#7f1d1d',
  },
  [UnitType.DRONE]: {
    cost: 45,
    health: 15,
    damage: 5,
    speed: 1.8,
    range: 30, // Must reach enemy
    attackSpeed: 45,
    width: 16,
    height: 16,
    colorWest: '#6366f1',
    colorEast: '#f43f5e',
    isFlying: true
  },
  [UnitType.ANTI_AIR]: {
    cost: 50,
    health: 40,
    damage: 60, // 1-shot Heli (w/ 2x multiplier), 1-shot Drone
    speed: 0.5,
    range: 400, // Significant range advantage over Heli (250)
    attackSpeed: 50, // Fast Check
    width: 30,
    height: 20,
    colorWest: '#0f766e',
    colorEast: '#991b1b',
  },
  [UnitType.TESLA]: {
    cost: 175, // Expensive
    health: 150, // Tanky
    damage: 110, // 1-shot Rambo (100hp) & Snipers
    speed: 0.55,
    range: 140, // Reduced range (nerfed)
    attackSpeed: 200, // Cooldown between bursts
    width: 32,
    height: 24,
    colorWest: '#0ea5e9', // Sky Blue
    colorEast: '#6366f1', // Indigo
  },
  [UnitType.NUKE]: {
    cost: 1000,
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
  }
};

export const PROJECTILE_SPEED = 6;
export const MONEY_PER_TICK = 0.15;
export const INITIAL_MONEY = 2000;

export const HILL_RANGE_BONUS = 1.3;
export const HILL_RELOAD_BONUS = 0.8;
