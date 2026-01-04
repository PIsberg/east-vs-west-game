import React, { useRef, useEffect, useCallback } from 'react';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  UNIT_CONFIG,
  PROJECTILE_SPEED,
  INITIAL_MONEY,
  MONEY_PER_TICK,
  HORIZON_Y,
  MIN_SCALE,
  MAX_SCALE,
  HILL_RANGE_BONUS,
  HILL_RELOAD_BONUS,
  WIN_SCORE
} from '../constants';
import { Team, Unit, UnitState, Projectile, Particle, GameState, UnitType, TerrainObject, Vector2D, Flyover, Missile } from '../types';
import { soundService } from '../services/audio';
import { GameScene } from './GameScene';
import { SpatialHash } from '../utils/spatialHash';
import { useState } from 'react';

interface GameCanvasProps {
  onGameStateChange: (state: GameState) => void;
  spawnQueue: { team: Team, type: UnitType, cost?: number, offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string }[];
  clearSpawnQueue: () => void;
  onCanvasClick: (x: number, y: number) => void;
  targetingInfo: { team: Team, type: UnitType } | null;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  onGameStateChange,
  spawnQueue,
  clearSpawnQueue,
  onCanvasClick,
  targetingInfo
}) => {
  const requestRef = useRef<number>(0);
  const [gameOver, setGameOver] = useState<Team | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const terrainRef = useRef<TerrainObject[]>([]);
  const flyoversRef = useRef<Flyover[]>([]);
  const terraformRef = useRef<TerrainObject[]>([]); // To store new terrain features like craters if we want? Or just particles.
  const missilesRef = useRef<Missile[]>([]);
  const flashOpacity = useRef(0); // For nuke flash
  const weatherRef = useRef<'clear' | 'rain'>('clear');
  const weatherTimerRef = useRef(Date.now() + 10000); // First rain check in 10s

  // Debug Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        weatherRef.current = weatherRef.current === 'clear' ? 'rain' : 'clear';
        weatherTimerRef.current = Date.now() + 20000; // Lock state for 20s
        console.log("Debug: Weather toggled to", weatherRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // START FRESH: Avoid Strict Mode duplication by using a local array initially
    // and overwriting terrainRef.current at the end.
    const generatedTerrain: TerrainObject[] = [];

    // 1. Generate River (50% Chance) - DO THIS FIRST
    const hasRiver = Math.random() < 0.5;
    let riverSegments: TerrainObject[] = [];
    if (hasRiver) {
      const centerX = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 200;
      const amplitude = 30 + Math.random() * 40;
      const frequency = 0.005 + Math.random() * 0.005;
      const phase = Math.random() * Math.PI * 2;

      // River Segments (Curved) - Extended far off-screen
      for (let y = -400; y < CANVAS_HEIGHT + 400; y += 20) {
        const x = centerX + Math.sin(y * frequency + phase) * amplitude;
        const segment = {
          id: generateId(),
          x: x,
          y: y,
          type: 'river' as const, // Explicit cast
          size: 0,
          width: 55,
          height: 22
        };
        generatedTerrain.push(segment);
        riverSegments.push(segment);
      }

      // Bridge Generation (Always 2)
      for (let i = 0; i < 2; i++) {
        const bridgeY = HORIZON_Y + 50 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 100);
        const bridgeX = centerX + Math.sin(bridgeY * frequency + phase) * amplitude;
        generatedTerrain.push({
          id: generateId(),
          x: bridgeX,
          y: bridgeY,
          type: 'bridge',
          size: 0,
          width: 85,
          height: 40
        });
      }
    }

    // Use generatedTerrain for subsequent checks, NOT terrainRef.current
    const newTerrain: TerrainObject[] = [...generatedTerrain];

    // 2. Place hills strategically (Spread Out & Avoid River)
    const MIN_DIST_BETWEEN_HILLS = 120;
    const RIVER_BUFFER = 80;

    for (let i = 0; i < 6; i++) { // Try to place up to 6 hills
      let x = 100 + Math.random() * (CANVAS_WIDTH - 200);
      let y = HORIZON_Y + 40 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 80);
      const size = 70 + Math.random() * 40;

      // Check River Collision (Stronger Buffer)
      let overlap = false;
      if (hasRiver) {
        for (const seg of riverSegments) {
          if (Math.abs(seg.y - y) < size + RIVER_BUFFER && Math.abs(seg.x - x) < size + RIVER_BUFFER) {
            overlap = true; break;
          }
        }
      }

      // Check Distance to other Hills (Spread)
      if (!overlap) {
        for (const t of newTerrain) {
          if (t.type === 'hill') {
            const dist = Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2);
            if (dist < MIN_DIST_BETWEEN_HILLS) { overlap = true; break; }
          }
        }
      }

      if (!overlap) {
        newTerrain.push({ id: generateId(), x, y, type: 'hill', size });
      } else {
        // Don't retry infinitely to avoid loops, just skip if crowded
      }
    }

    // 3. Trees (Spread & Avoid Hill/River/Bridge)
    const MIN_DIST_BETWEEN_TREES = 60;
    for (let i = 0; i < 25; i++) { // Try more trees, but rejection will filter them
      let x = 60 + Math.random() * (CANVAS_WIDTH - 120);
      let y = HORIZON_Y + 20 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 40);

      let overlap = false;
      // Hill & Bridge Collision
      for (const t of newTerrain) {
        if (t.type === 'hill') {
          const dist = Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2);
          if (dist < t.size) { overlap = true; break; }
        }
        if (t.type === 'bridge') {
          // Simple box check or radius check for bridge (Width 85, Height 40)
          if (Math.abs(t.x - x) < 50 && Math.abs(t.y - y) < 30) {
            overlap = true; break;
          }
        }
      }
      // River Collision
      if (hasRiver && !overlap) {
        for (const seg of riverSegments) {
          if (Math.abs(seg.y - y) < RIVER_BUFFER && Math.abs(seg.x - x) < RIVER_BUFFER) {
            overlap = true; break;
          }
        }
      }
      // Tree Spreading (vs Trees)
      if (!overlap) {
        for (const t of newTerrain) {
          if (t.type === 'tree') {
            const dist = Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2);
            if (dist < MIN_DIST_BETWEEN_TREES) { overlap = true; break; }
          }
        }
      }

      if (!overlap) {
        newTerrain.push({ id: generateId(), x, y, type: 'tree', size: 40 + Math.random() * 30 });
      }
    }

    // 4. Rocks (Spread & Avoid River/Bridge)
    const MIN_DIST_BETWEEN_ROCKS = 40;
    for (let i = 0; i < 30; i++) {
      let x = 40 + Math.random() * (CANVAS_WIDTH - 80);
      let y = HORIZON_Y + 10 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 20);

      let overlap = newTerrain.some(t => {
        // Basic obj collision with trees/rocks/hills
        if (Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2) < t.size + 20) return true;
        // Strict Bridge collision
        if (t.type === 'bridge' && Math.abs(t.x - x) < 50 && Math.abs(t.y - y) < 30) return true;
        return false;
      });

      // River Collision
      if (hasRiver && !overlap) {
        for (const seg of riverSegments) {
          if (Math.abs(seg.y - y) < RIVER_BUFFER - 20 && Math.abs(seg.x - x) < RIVER_BUFFER - 20) { // Rocks can be slightly closer than trees
            overlap = true; break;
          }
        }
      }

      // Rock Spreading (vs other Rocks)
      if (!overlap) {
        for (const t of newTerrain) {
          if (t.type === 'rock') {
            const dist = Math.sqrt((t.x - x) ** 2 + (t.y - y) ** 2);
            if (dist < MIN_DIST_BETWEEN_ROCKS) { overlap = true; break; }
          }
        }
      }

      if (!overlap) {
        newTerrain.push({ id: generateId(), x, y, type: 'rock', size: 10 + Math.random() * 15 });
      }
    }
    terrainRef.current = newTerrain;
  }, []);

  const unitsRef = useRef<Unit[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef({ [Team.WEST]: 0, [Team.EAST]: 0 });
  const moneyRef = useRef({ [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY });
  const spatialHash = useRef(new SpatialHash(60)); // 60px grid cell

  const getScaleAt = (y: number) => {
    const t = (y - HORIZON_Y) / (CANVAS_HEIGHT - HORIZON_Y);
    return MIN_SCALE + t * (MAX_SCALE - MIN_SCALE);
  };

  const spawnUnit = useCallback((team: Team, type: UnitType, options?: { offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string }) => {
    const config = UNIT_CONFIG[type] as any;

    if ((type === UnitType.AIRSTRIKE || type === UnitType.AIRBORNE || type === UnitType.MISSILE_STRIKE || type === UnitType.NUKE) && options?.absolutePos) {
      const isMissile = type === UnitType.MISSILE_STRIKE || type === UnitType.NUKE;
      const flyover: Flyover = {
        id: generateId(),
        team, type,
        targetPos: options.absolutePos,
        currentX: team === Team.WEST ? -250 : CANVAS_WIDTH + 250,
        altitudeY: isMissile ? 35 : (type === UnitType.AIRBORNE ? 45 : 55),
        speed: team === Team.WEST ? (isMissile ? 5.0 : 6) : (isMissile ? -5.0 : -6),
        dropped: false,
        missileCount: isMissile ? (type === UnitType.NUKE ? 1 : 3) : 0,
        health: config.health || 40
      };
      flyoversRef.current.push(flyover);
      return;
    }

    let xPos = team === Team.WEST ? 30 : CANVAS_WIDTH - 30;
    let yPos = HORIZON_Y + 50 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 100);

    if (options?.absolutePos) { xPos = options.absolutePos.x; yPos = options.absolutePos.y; }
    else if (options?.offset) { xPos += options.offset.x; yPos += options.offset.y; }

    const newUnit: Unit = {
      id: generateId(), team, type,
      position: { x: xPos, y: yPos },
      state: UnitState.MOVING,
      health: config.health,
      maxHealth: config.health,
      attackCooldown: 0, targetId: null,
      width: config.width, height: config.height,
      spawnTime: Date.now(), isInCover: false,
      squadId: options?.squadId
    };

    unitsRef.current.push(newUnit);
    if (type !== UnitType.NAPALM && type !== UnitType.MINE_PERSONAL && type !== UnitType.MINE_TANK) {
      soundService.playSpawnSound(team === Team.EAST);
    }
  }, []);

  useEffect(() => {
    if (spawnQueue.length > 0) {
      spawnQueue.forEach(req => {
        spawnUnit(req.team, req.type, { offset: req.offset, absolutePos: req.absolutePos, squadId: req.squadId });
        if (req.cost) {
          moneyRef.current[req.team] = Math.max(0, moneyRef.current[req.team] - req.cost);
        }
      });
      clearSpawnQueue();
    }
  }, [spawnQueue, spawnUnit, clearSpawnQueue]);

  const update = useCallback(() => {
    const time = Date.now();
    if (flashOpacity.current > 0) flashOpacity.current -= 0.02; // Flash decay
    // Spawn queue processed in useEffect now to avoid frame-loop race conditions

    moneyRef.current[Team.WEST] += MONEY_PER_TICK;
    moneyRef.current[Team.EAST] += MONEY_PER_TICK;

    // Optimization: Build Spatial Grid
    spatialHash.current.clear();
    unitsRef.current.forEach(u => spatialHash.current.add(u));

    const squadData: Record<string, { sumX: number, sumY: number, count: number }> = {};
    unitsRef.current.forEach(u => {
      if (u.squadId) {
        if (!squadData[u.squadId]) squadData[u.squadId] = { sumX: 0, sumY: 0, count: 0 };
        squadData[u.squadId].sumX += u.position.x;
        squadData[u.squadId].sumY += u.position.y;
        squadData[u.squadId].count++;
      }
    });

    // Projectile Update
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const proj = projectilesRef.current[i];
      const stepX = proj.velocity.x, stepY = proj.velocity.y;
      const stepDist = Math.sqrt(stepX * stepX + stepY * stepY);
      proj.position.x += stepX; proj.position.y += stepY;
      proj.distanceTraveled += stepDist;

      if (proj.distanceTraveled >= proj.maxRange || proj.position.x < 0 || proj.position.x > CANVAS_WIDTH || proj.position.y < (proj.targetType === 'air' ? -50 : HORIZON_Y) || proj.position.y > CANVAS_HEIGHT + 50) {
        projectilesRef.current.splice(i, 1); continue;
      }

      let hit = false;
      if (proj.targetType === 'air') {
        for (const u of unitsRef.current) {
          if (u.team !== proj.team && u.type === UnitType.DRONE) {
            if (Math.sqrt((u.position.x - proj.position.x) ** 2 + (u.position.y - proj.position.y) ** 2) < 18) { u.health -= proj.damage; hit = true; break; }
          }
        }
        if (!hit) {
          for (const fly of flyoversRef.current) {
            if (fly.team !== proj.team && Math.sqrt((fly.currentX - proj.position.x) ** 2 + (fly.altitudeY - proj.position.y) ** 2) < 35) { fly.health -= proj.damage; hit = true; break; }
          }
        }
      } else {
        const candidates = spatialHash.current.query(proj.position.x, proj.position.y, 50); // Query nearby units
        for (const u of candidates) {
          if (u.team !== proj.team && u.type !== UnitType.NAPALM && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK) {
            if (Math.sqrt((u.position.x - proj.position.x) ** 2 + (u.position.y - proj.position.y) ** 2) < (u.width * getScaleAt(u.position.y)) / 1.2) {
              hit = true;
              if (proj.explosionRadius) {
                const victims = spatialHash.current.query(proj.position.x, proj.position.y, proj.explosionRadius!);
                victims.forEach(victim => { if (victim.team !== proj.team && Math.sqrt((victim.position.x - proj.position.x) ** 2 + (victim.position.y - proj.position.y) ** 2) < proj.explosionRadius! * getScaleAt(proj.position.y)) victim.health -= proj.damage; });
              }
              else {
                // Cover Logic
                // Tanks & Artillery ignore cover (Heavy weapons)
                // Others (Infantry) have damage reduced by cover
                const ignoresCover = proj.sourceType === UnitType.TANK || proj.sourceType === UnitType.ARTILLERY || proj.sourceType === UnitType.DRONE || proj.sourceType === UnitType.AIRSTRIKE || proj.sourceType === UnitType.MISSILE_STRIKE || proj.sourceType === UnitType.NUKE;
                const damage = (u.isInCover && !ignoresCover) ? proj.damage * 0.4 : proj.damage;
                u.health -= damage;
              }
              break;
            }
          }
        }
      }
      if (hit) { soundService.playHitSound(); projectilesRef.current.splice(i, 1); }
    }

    // Missile Update
    for (let i = missilesRef.current.length - 1; i >= 0; i--) {
      const m = missilesRef.current[i];
      m.current.x += m.velocity.x; m.current.y += m.velocity.y;
      if (m.current.y >= m.target.y) {
        soundService.playHitSound();
        const config = UNIT_CONFIG[UnitType.MISSILE_STRIKE] as any; // Default
        const isNuke = m.velocity.x === 0 && m.target && (m as any).isNuke; // We need to tag nuke missiles
        const damage = isNuke ? UNIT_CONFIG[UnitType.NUKE].damage : config.damage;
        const radius = isNuke ? UNIT_CONFIG[UnitType.NUKE].radius : config.radius;

        if (isNuke) {
          flashOpacity.current = 1.0; // TRIGGER FLASH (Full White)
          // MASSIVE Swamp Explosion - Lingering Cloud
          for (let p = 0; p < 600; p++) {
            const angle = Math.random() * Math.PI * 2;
            // Higher initial speed to cover the huge 850 radius quickly
            const speed = Math.random() * 15 + 5;
            // Wider start area so it doesn't look like a single point source only
            const startDist = Math.random() * 100;

            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + Math.cos(angle) * startDist, y: m.target.y + Math.sin(angle) * startDist },
              velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
              // Higher drag to make them "hang" in the air like a cloud
              drag: 0.95 + Math.random() * 0.03,
              // Longer life for lingering effect (5+ seconds)
              life: 250 + Math.random() * 150,
              // Darker, murkier swamp colors
              color: p % 5 === 0 ? '#1a2e05' : // Very dark sludge
                (p % 4 === 0 ? '#365314' : // Dark moss
                  (p % 3 === 0 ? '#4d7c0f' : // Swamp green
                    (p % 2 === 0 ? '#3f6212' : '#84cc16'))), // Olive / Lime accent
              size: 30 + Math.random() * 60 // Even bigger particles
            });
          }
        }

        unitsRef.current.forEach(u => {
          if (u.type !== UnitType.NAPALM) {
            // Friendly Fire for Nukes
            if (isNuke || u.team !== m.team) {
              if (Math.sqrt((u.position.x - m.target.x) ** 2 + (u.position.y - m.target.y) ** 2) < (radius || 60)) u.health -= (damage || 200);
            }
          }
        });
        // Explosion particles ( Standard )
        if (!isNuke) {
          for (let p = 0; p < 20; p++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + (Math.random() - 0.5) * 40, y: m.target.y + (Math.random() - 0.5) * 40 },
              life: 40, color: '#f97316', size: 6 + Math.random() * 8
            });
          }
        }
        missilesRef.current.splice(i, 1);
      }
    }

    // Flyover Update (Planes)
    for (let i = flyoversRef.current.length - 1; i >= 0; i--) {
      // ... (Rest of flyover update check if needed, but we are inside update loop)
      const fly = flyoversRef.current[i];
      if (fly.health <= 0) {
        for (let p = 0; p < 12; p++) particlesRef.current.push({ id: generateId(), position: { x: fly.currentX, y: fly.altitudeY }, life: 25, color: '#333', size: 4 });
        flyoversRef.current.splice(i, 1); continue;
      }
      fly.currentX += fly.speed;
      if (!fly.dropped && Math.abs(fly.currentX - fly.targetPos.x) < 30) {
        if ((fly.type === UnitType.MISSILE_STRIKE || fly.type === UnitType.NUKE) && fly.missileCount && fly.missileCount > 0) {
          missilesRef.current.push({
            id: generateId(), team: fly.team, target: { x: fly.targetPos.x + (fly.type === UnitType.NUKE ? 0 : (2 - fly.missileCount) * 30), y: fly.targetPos.y },
            current: { x: fly.currentX, y: fly.altitudeY },
            velocity: { x: (fly.targetPos.x - fly.currentX) / 40, y: (fly.targetPos.y - fly.altitudeY) / 40 },
            isNuke: fly.type === UnitType.NUKE // Tag it
          } as any); // Cast to any to add custom prop
          fly.missileCount--; if (fly.missileCount === 0) fly.dropped = true;
        } else {
          fly.dropped = true;
          if (fly.type === UnitType.AIRSTRIKE) { fly.canisterY = fly.altitudeY; fly.canisterVelocityY = 2; }
          else if (fly.type === UnitType.AIRBORNE) {
            const config = UNIT_CONFIG[UnitType.AIRBORNE];
            for (let j = 0; j < 3; j++) unitsRef.current.push({ id: generateId(), team: fly.team, type: UnitType.AIRBORNE, position: { x: fly.targetPos.x + (j - 1) * 25, y: fly.targetPos.y }, state: UnitState.MOVING, health: config.health, maxHealth: config.health, attackCooldown: 0, targetId: null, width: config.width, height: config.height, spawnTime: Date.now(), planeAltitudeAtDrop: fly.altitudeY });
          }
        }
      }
      if (fly.dropped && fly.canisterY !== undefined) {
        fly.canisterY += fly.canisterVelocityY!; fly.canisterVelocityY! += 0.2;
        if (fly.canisterY >= fly.targetPos.y) { spawnUnit(fly.team, UnitType.NAPALM, { absolutePos: fly.targetPos }); soundService.playHitSound(); fly.canisterY = undefined; }
      }
      if (Math.abs(fly.currentX) > CANVAS_WIDTH + 300) flyoversRef.current.splice(i, 1);
    }

    // Weather Logic
    if (Date.now() > weatherTimerRef.current) {
      if (weatherRef.current === 'clear') {
        // Start Rain (15-30s duration)
        if (Math.random() < 0.3) { // 30% chance to rain after a clear period
          weatherRef.current = 'rain';
          weatherTimerRef.current = Date.now() + 15000 + Math.random() * 15000;
        } else {
          // Stay clear for another 20s
          weatherTimerRef.current = Date.now() + 20000;
        }
      } else {
        // Stop Rain (Clear for 30-60s)
        weatherRef.current = 'clear';
        weatherTimerRef.current = Date.now() + 30000 + Math.random() * 30000;
      }
    }

    // Terrain Logic (Burning & Destruction)
    terrainRef.current.forEach(t => {
      if (t.type === 'tree') {
        // Burning Logic
        if (t.state === 'burning') {
          t.health = (t.health || 0) * 0.99 - 0.1; // Burn down
          if ((t.health || 0) <= 0) {
            t.state = 'burnt';
          }
        }

        // Tank Crushing Logic
        if (t.state !== 'broken' && t.state !== 'burnt') { // Can crush normal or burning trees
          // Find heavy vehicles colliding with tree
          const crusher = unitsRef.current.find(u =>
            (u.type === UnitType.TANK || u.type === UnitType.ARTILLERY) && // Check Types
            Math.abs(u.position.x - t.x) < 20 && Math.abs(u.position.y - t.y) < 20 // Collision box
          );
          if (crusher) {
            t.state = 'broken';
            soundService.playHitSound(); // Crunch sound?
          }
        }
      }
    });

    // Units Logic
    unitsRef.current.forEach(unit => {
      const lifeTime = Date.now() - (unit.spawnTime || 0);
      const isDescent = unit.type === UnitType.AIRBORNE && lifeTime < 3000;
      if (unit.type === UnitType.NAPALM) {
        unit.health--;
        // Napalm Damage Logic
        const burnRadius = 60;
        const burnDamage = 1.0; // Per tick
        unitsRef.current.forEach(other => {
          if (other.team !== unit.team && other.type !== UnitType.AIRBORNE && other.type !== UnitType.NAPALM) {
            const dist = Math.sqrt((other.position.x - unit.position.x) ** 2 + (other.position.y - unit.position.y) ** 2);
            if (dist < burnRadius) {
              other.health -= burnDamage;
            }
          }
        });
        return;
      }

      // Mine Logic
      if (unit.type === UnitType.MINE_PERSONAL || unit.type === UnitType.MINE_TANK) {
        const radius = unit.type === UnitType.MINE_PERSONAL ? 25 : 40;
        const damage = unit.type === UnitType.MINE_PERSONAL ? 50 : 120;
        const nearbyEnemy = unitsRef.current.find(e => e.team !== unit.team && e.type !== UnitType.AIRBORNE && Math.sqrt((e.position.x - unit.position.x) ** 2 + (e.position.y - unit.position.y) ** 2) < radius);

        if (nearbyEnemy) {
          unit.health = 0; // Explode
          soundService.playExplosionSound();
          // Explosion Effect
          for (let k = 0; k < 12; k++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: unit.position.x + (Math.random() - 0.5) * 20, y: unit.position.y + (Math.random() - 0.5) * 20 },
              life: 30, color: '#f97316', size: 5 + Math.random() * 8
            });
          }
          // Deal Damage
          unitsRef.current.forEach(v => {
            const d = Math.sqrt((v.position.x - unit.position.x) ** 2 + (v.position.y - unit.position.y) ** 2);
            if (d < radius * 2) {
              v.health -= damage * (1 - d / (radius * 2)); // Falloff
            }
          });
          return;
        }
      }

      const config = UNIT_CONFIG[unit.type] as any;
      const currentScale = getScaleAt(unit.position.y);
      unit.isOnHill = terrainRef.current.some(t => t.type === 'hill' && Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) < t.size * 0.7);

      if (unit.state === UnitState.MOVING && !isDescent) {
        // Rain Penalty: Ground units move slower
        const rainPenalty = (weatherRef.current === 'rain' && !config.isFlying) ? 0.6 : 1.0;
        let moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed * rainPenalty;
        let moveY = Math.sin(time * 0.004 + parseInt(unit.id, 36)) * 0.3;


        if (config.isFlying) {
          let target: Unit | null = null, minDist = 600;
          unitsRef.current.forEach(o => { if (o.team !== unit.team && o.type !== UnitType.NAPALM) { const d = Math.sqrt((unit.position.x - o.position.x) ** 2 + (o.position.y - unit.position.y) ** 2); if (d < minDist) { minDist = d; target = o; } } });

          if (target) {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
            if (unit.type === UnitType.HELICOPTER) {
              // Helicopter Behaviour: maintain range
              const dist = Math.sqrt((target.position.x - unit.position.x) ** 2 + (target.position.y - unit.position.y) ** 2);
              if (dist > config.range * 0.8) {
                moveX = Math.cos(a) * config.speed;
                moveY = Math.sin(a) * config.speed;
              } else {
                // Hover / slight jitter
                moveX = (Math.random() - 0.5) * 0.5;
                moveY = (Math.random() - 0.5) * 0.5;
              }
            } else {
              // Drone / Other: Kamikaze
              moveX = Math.cos(a) * config.speed;
              moveY = Math.sin(a) * config.speed;
            }
          } else {
            // No target, fly forward
            moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed;
          }
        } else {


          // Ground Units Logic
          let movingToHill = false;

          if (!unit.isOnHill) {
            const hill = terrainRef.current.find(t => {
              if (t.type !== 'hill') return false;
              if (Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) > 220) return false;
              return !unitsRef.current.some(o => o.team === unit.team && o.id !== unit.id && Math.sqrt((o.position.x - t.x) ** 2 + (o.position.y - t.y) ** 2) < t.size * 0.6);
            });

            if (hill) {
              const a = Math.atan2(hill.y - unit.position.y, hill.x - unit.position.x);
              moveX = Math.cos(a) * config.speed;
              moveY = Math.sin(a) * config.speed;
              movingToHill = true;
            }
          } else {
            moveX *= 0.1; moveY *= 0.1; // Slow down on hill
          }

          // If NOT moving to a hill, check for Cover/Obstacles
          if (!movingToHill && !unit.isOnHill) {
            const isVehicle = unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY;

            if (!isVehicle) {
              // Check if already in cover
              if (unit.isInCover && unit.coverEnterTime) {
                if (Date.now() - unit.coverEnterTime > (unit.coverDuration || 8000)) {
                  // Time up
                  unit.isInCover = false;
                  // Mark this cover as "used" so we don't immediately re-enter
                  unit.lastCoverId = terrainRef.current.find(t => Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) < 60)?.id;
                  unit.coverEnterTime = undefined;
                } else {
                  // Stop in cover
                  moveX = 0; moveY = 0;
                }
              } else {
                // Seek Cover
                const cover = terrainRef.current.find(t => {
                  if (t.type !== 'tree' && t.type !== 'rock') return false;
                  if (t.id === unit.lastCoverId) return false;

                  // Forward Bias: Don't retreat too far for cover. Main goal is capture.
                  if (unit.team === Team.WEST ? t.x < unit.position.x - 30 : t.x > unit.position.x + 30) return false;

                  const dist = Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2);
                  if (dist > 180) return false; // Increased range slightly

                  // Occupancy Check
                  return !unitsRef.current.some(o =>
                    o.team === unit.team &&
                    o.id !== unit.id &&
                    Math.sqrt((o.position.x - t.x) ** 2 + (o.position.y - t.y) ** 2) < 30
                  );
                });

                if (cover) {
                  const dist = Math.sqrt((cover.x - unit.position.x) ** 2 + (cover.y - unit.position.y) ** 2);
                  if (dist > 25) {
                    const a = Math.atan2(cover.y - unit.position.y, cover.x - unit.position.x);
                    moveX = (moveX * 0.4) + (Math.cos(a) * config.speed * 0.6);
                    moveY = (moveY * 0.4) + (Math.sin(a) * config.speed * 0.6);
                  } else {
                    moveX = 0; moveY = 0;
                    unit.isInCover = true;
                    unit.coverEnterTime = Date.now();
                    // Shorter duration: 5s - 15s
                    unit.coverDuration = 5000 + Math.random() * 10000;
                  }
                }
              }
            } else {
              // Vehicles Avoid Obstacles
              terrainRef.current.forEach(t => {
                if (t.type === 'tree' || t.type === 'rock') {
                  const dist = Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2);
                  const avoidDist = t.type === 'tree' ? 40 : 30;
                  if (dist < avoidDist) {
                    const dx = unit.position.x - t.x;
                    const dy = unit.position.y - t.y;
                    moveX += (dx / dist) * 2;
                    moveY += (dy / dist) * 2;
                  }
                }
              });
            }
          }
        }

        // Separation Force (Avoid bunching) - Only if NOT in cover
        if (!unit.isInCover) {
          let sepX = 0, sepY = 0;
          let neighbors = 0;
          const neighborsList = spatialHash.current.query(unit.position.x, unit.position.y, 20);

          for (const other of neighborsList) {
            if (other.id !== unit.id && other.team === unit.team && other.state === UnitState.MOVING) {
              const dx = unit.position.x - other.position.x;
              const dy = unit.position.y - other.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              // Personal space radius varies by unit size but approx 15-20
              if (dist < 20 && dist > 0) {
                sepX += dx / dist; // Normalize and weight by closeness? Simple repulsion is fine.
                sepY += dy / dist;
                neighbors++;
              }
            }
          }

          if (neighbors > 0) {
            // Apply separation vector
            moveX += (sepX / neighbors) * 0.5; // Strength of separation
            moveY += (sepY / neighbors) * 0.5;
          }
        }

        // River / Bridge Interactions
        const river = terrainRef.current.find(t => t.type === 'river');
        if (river && river.width && !unit.isInCover) {
          const riverLeft = river.x - river.width / 2;
          const riverRight = river.x + river.width / 2;
          const unitLeft = unit.position.x - 5; // Approx unit width
          const unitRight = unit.position.x + 5;

          // Check if unit is interacting with river (simple X-axis overlap)
          if (unitRight > riverLeft && unitLeft < riverRight) {
            const onBridge = terrainRef.current.some(b =>
              b.type === 'bridge' &&
              Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
              Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10 // Tolerance
            );

            if (!onBridge) {
              if (config.isFlying) {
                // Flying units ignore river
              } else if (unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY || unit.type === UnitType.ANTI_AIR || unit.type === UnitType.MINE_TANK) {
                // Vehicles stopped by river - MUST use bridge
                // Calculate distance to nearest bridge
                let nearestBridge: TerrainObject | null = null;
                let minBridgeDist = 10000;

                // Check cross need
                const crossNeeded = (unit.team === Team.WEST && unit.position.x < river.x) || (unit.team === Team.EAST && unit.position.x > river.x);

                if (crossNeeded) {
                  terrainRef.current.forEach(t => {
                    if (t.type === 'bridge') {
                      const d = Math.abs(unit.position.y - t.y);
                      if (d < minBridgeDist) { minBridgeDist = d; nearestBridge = t; }
                    }
                  });

                  if (nearestBridge) {
                    const bridge = nearestBridge as TerrainObject;
                    const dy = bridge.y - unit.position.y;

                    // Move towards bridge Y
                    moveY += (dy / Math.abs(dy)) * config.speed * 1.0;

                    // BLOCK X movement unless aligned with bridge
                    if (Math.abs(dy) > 15) {
                      moveX = 0; // Stop forward movement, only move Y
                      // Add slight backward push if too close to river bank to avoid clipping
                      if (Math.abs(unit.position.x - river.x) < 30) {
                        moveX = (unit.team === Team.WEST ? -1 : 1) * 0.2;
                      }
                    } else {
                      // Aligned! Cross.
                      moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed;
                    }
                  } else {
                    moveX = 0; // No bridge found (shouldn't happen)
                  }
                }
              } else {
                // Infantry slows down
                moveX *= 0.3;
                moveY *= 0.3;
              }
            }
          }
        }

        unit.position.x += moveX; unit.position.y += moveY;
        unit.position.y = Math.max(HORIZON_Y + 10, Math.min(CANVAS_HEIGHT - 10, unit.position.y));
      }

      if (!isDescent && unit.attackCooldown <= 0) {
        // Water Penalty Check
        // Re-find river (efficient enough as terrain array is small)
        const riverObj = terrainRef.current.find(t => t.type === 'river');
        let inWater = false;
        if (riverObj && !config.isFlying) {
          const riverLeft = riverObj.x - riverObj.width! / 2;
          const riverRight = riverObj.x + riverObj.width! / 2;
          if (unit.position.x > riverLeft && unit.position.x < riverRight) {
            // Check if on bridge
            const onBridge = terrainRef.current.some(b =>
              b.type === 'bridge' &&
              Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
              Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10
            );
            if (!onBridge) inWater = true;
          }
        }

        const range = (unit.isOnHill ? config.range * HILL_RANGE_BONUS : (inWater ? config.range * 0.4 : config.range)) * currentScale;

        if (unit.type === UnitType.ANTI_AIR) {
          // AA targets Drones AND Descending Paratroopers
          let target = unitsRef.current.find(u => {
            if (u.team === unit.team) return false;
            const isAirTarget = u.type === UnitType.DRONE || (u.type === UnitType.AIRBORNE && (Date.now() - (u.spawnTime || 0) < 3000));
            return isAirTarget && Math.sqrt((u.position.x - unit.position.x) ** 2 + (u.position.y - unit.position.y) ** 2) < range;
          });

          if (!target) {
            // Check flyovers (Airstrikes/Missiles)
            const fly = flyoversRef.current.find(f => f.team !== unit.team && Math.sqrt((f.currentX - unit.position.x) ** 2 + (f.altitudeY - unit.position.y) ** 2) < range);
            if (fly) {
              const a = Math.atan2(fly.altitudeY - unit.position.y, fly.currentX - unit.position.x);
              projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: config.damage, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type });
              unit.attackCooldown = config.attackSpeed; soundService.playShootSound();
            }
          } else {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
            projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: config.damage, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type });
            unit.attackCooldown = config.attackSpeed; soundService.playShootSound();
          }
        } else {
          // Standard Targeting (Ground)
          // Optimized Targeting
          const potentialTargets = spatialHash.current.query(unit.position.x, unit.position.y, range);
          let target = potentialTargets.find(o => {
            if (o.team === unit.team || o.type === UnitType.NAPALM || o.type === UnitType.MINE_PERSONAL || o.type === UnitType.MINE_TANK) return false;

            // Drones are hard to hit for standard units, EXCEPT Helicopters
            if (o.type === UnitType.DRONE && unit.type !== UnitType.HELICOPTER) return false;

            // Standard units cannot target descending paratroopers (except Heli/AA)
            const oLife = Date.now() - (o.spawnTime || 0);
            if (o.type === UnitType.AIRBORNE && oLife < 3000 && unit.type !== UnitType.HELICOPTER) return false;

            return Math.sqrt((o.position.x - unit.position.x) ** 2 + ((o.position.y - unit.position.y) * 2) ** 2) < range;
          });
          if (target) {
            // Sniper Accuracy Check
            if (unit.type === UnitType.SNIPER) {
              if (Math.random() > 0.7) { // 30% Miss Chance
                // Miss logic
                const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x) + (Math.random() - 0.5) * 0.5;
                projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: 0, maxRange: range, distanceTraveled: 0, targetType: 'ground', sourceType: unit.type });
                unit.attackCooldown = config.attackSpeed; soundService.playShootSound();
                return;
              }
            }

            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
            // Artillery Spread
            let spread = 0;
            if (unit.type === UnitType.ARTILLERY) {
              spread = (Math.random() - 0.5) * 0.25; // Random spread +/- 0.125 rad (~7 degrees)
            }
            projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a + spread) * PROJECTILE_SPEED, y: Math.sin(a + spread) * PROJECTILE_SPEED }, damage: config.damage, maxRange: range * (unit.type === UnitType.ARTILLERY ? 1.5 : 1.0), distanceTraveled: 0, targetType: 'ground', explosionRadius: config.explosionRadius, sourceType: unit.type });
            unit.attackCooldown = Math.floor(config.attackSpeed * (unit.isOnHill ? HILL_RELOAD_BONUS : 1.0)); soundService.playShootSound();
          }
        }
      }

      unit.attackCooldown = Math.max(0, unit.attackCooldown - 1);

      if ((unit.team === Team.WEST && unit.position.x > CANVAS_WIDTH) || (unit.team === Team.EAST && unit.position.x < 0)) {
        scoreRef.current[unit.team] += unit.type === UnitType.TANK ? 3 : 1;

        // Win Condition Check
        if (scoreRef.current[unit.team] >= WIN_SCORE) {
          setGameOver(unit.team);
        }

        // Refund logic
        const cost = UNIT_CONFIG[unit.type].cost;
        moneyRef.current[unit.team] += cost;
        unit.health = 0;
      }
    });

    // Projectiles Logic
    projectilesRef.current.forEach((p, i) => {
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      p.distanceTraveled += PROJECTILE_SPEED;

      let hit = false;
      let explode = false;

      // Check Max Range
      if (p.distanceTraveled >= p.maxRange) {
        explode = true;
      }

      // Check Collision (Simple Circle)
      if (!explode) {
        const target = unitsRef.current.find(u => {
          if (u.team === p.team) return false;
          // Air vs Ground check
          if (p.targetType === 'air' && !(UNIT_CONFIG[u.type] as any).isFlying && u.type !== UnitType.AIRBORNE) return false;
          if (p.targetType === 'ground' && (UNIT_CONFIG[u.type] as any).isFlying) return false; // Ground missiles don't hit planes randomly usually

          const hitDist = (u.width + u.height) / 4; // Approx radius
          return Math.sqrt((u.position.x - p.position.x) ** 2 + (u.position.y - p.position.y) ** 2) < hitDist;
        });

        if (target) {
          hit = true;
          explode = true;
          target.health -= p.damage;
          // Blood or Sparks
          if (target.type === UnitType.SOLDIER || target.type === UnitType.RAMBO) {
            particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 20, color: '#7f1d1d', size: 5 });
          }
        }
      }

      if (explode) {
        projectilesRef.current.splice(i, 1);
        soundService.playExplosionSound(); // Or hit sound

        // Explosion Effect
        for (let k = 0; k < 5; k++) {
          particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 15, color: '#fbbf24', size: 4 });
        }

        // Area Damage (Explosion Radius)
        if (p.explosionRadius) {
          unitsRef.current.forEach(u => {
            if (u.team !== p.team) {
              const d = Math.sqrt((u.position.x - p.position.x) ** 2 + (u.position.y - p.position.y) ** 2);
              if (d < p.explosionRadius!) {
                u.health -= p.damage * (1 - d / p.explosionRadius!);
              }
            }
          });
        }

        // Tree Ignition Logic
        if (p.explosionRadius || p.isHeavy || p.damage > 30) {
          terrainRef.current.forEach(t => {
            if (t.type === 'tree' && t.state !== 'burnt' && t.state !== 'broken') {
              if (Math.abs(t.x - p.position.x) < 30 && Math.abs(t.y - p.position.y) < 30) {
                if (Math.random() < 0.6) {
                  t.state = 'burning';
                  t.health = 500 + Math.random() * 500;
                }
              }
            }
          });
        }
      }
    });


    particlesRef.current.forEach((p, i) => {
      if (p.velocity) {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        if (p.drag) {
          p.velocity.x *= p.drag;
          p.velocity.y *= p.drag;
        }
      }
      if (--p.life <= 0) particlesRef.current.splice(i, 1);
    });

    // Check for vehicle deaths for explosions
    const deadUnits = unitsRef.current.filter(u => u.health <= 0);
    deadUnits.forEach(u => {
      if (u.type === UnitType.TANK || u.type === UnitType.ARTILLERY) {
        soundService.playExplosionSound();
        for (let k = 0; k < 15; k++) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: u.position.x + (Math.random() - 0.5) * 30, y: u.position.y + (Math.random() - 0.5) * 30 },
            life: 45, color: k % 2 === 0 ? '#ef4444' : '#f97316', size: 8 + Math.random() * 10
          });
        }
      } else if (u.type === UnitType.SOLDIER || u.type === UnitType.RAMBO || u.type === UnitType.AIRBORNE) {
        // Troops Scream & Blood
        soundService.playScreamSound();
        particlesRef.current.push({
          id: generateId(),
          position: { x: u.position.x, y: u.position.y },
          life: 180, // 3 seconds at 60fps
          color: '#7f1d1d', // Dark Red Blood
          size: 12 + Math.random() * 5
        });
      }
    });

    unitsRef.current = unitsRef.current.filter(u => u.health > 0);
    onGameStateChange({ units: unitsRef.current, projectiles: projectilesRef.current, particles: particlesRef.current, score: scoreRef.current, money: moneyRef.current, weather: weatherRef.current });
  }, [spawnQueue, clearSpawnQueue, onGameStateChange, spawnUnit]);

  // Game Loop
  const tick = useCallback(() => {
    // If Game Over, stop updating but keep rendering (frozen state)
    // Or just stop ticking.
    if (!gameOver) {
      update();
      requestRef.current = requestAnimationFrame(tick);
    }
  }, [update, gameOver]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [tick]);

  return (
    <div className="w-[800px] h-[450px] rounded-lg shadow-2xl border-4 border-stone-800 bg-stone-900 overflow-hidden relative">
      <GameScene
        units={unitsRef.current}
        projectiles={projectilesRef.current}
        particles={particlesRef.current}
        terrain={terrainRef.current}
        flyovers={flyoversRef.current}
        missiles={missilesRef.current}
        onCanvasClick={onCanvasClick}
        targetingInfo={targetingInfo}
        weather={weatherRef.current}
      />

      {flashOpacity.current > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'white', opacity: Math.min(1, flashOpacity.current),
          pointerEvents: 'none', zIndex: 100
        }} />
      )}

      {gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 p-12 bg-stone-900 border-2 border-amber-500/50 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-300">
            <h2 className="text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 drop-shadow-lg">
              {gameOver === Team.WEST ? 'VICTORY' : 'DEFEAT'}
            </h2>
            <div className="text-2xl font-bold text-stone-300">
              {gameOver === Team.WEST ? 'West Team' : 'East Team'} Wins!
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black uppercase tracking-wider rounded shadow-lg transition-transform active:scale-95 flex items-center gap-2"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
