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
import { Team, Unit, UnitState, Projectile, Particle, GameState, UnitType, TerrainObject, Vector2D, Flyover, Missile, MapType } from '../types';
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
  cpuEnabled: boolean;
  mapType: MapType;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  onGameStateChange,
  spawnQueue,
  clearSpawnQueue,
  onCanvasClick,
  targetingInfo,
  cpuEnabled,
  mapType,
}) => {
  const requestRef = useRef<number>(0);
  const [gameOver, setGameOver] = useState<Team | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const terrainRef = useRef<TerrainObject[]>([]);
  const flyoversRef = useRef<Flyover[]>([]);
  const terraformRef = useRef<TerrainObject[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const flashOpacity = useRef(0);
  const weatherRef = useRef<'clear' | 'rain' | 'snow' | 'fog' | 'storm'>('clear');
  const weatherTimerRef = useRef(Date.now() + 10000);
  const cpuTimerRef = useRef(0);
  const cpuEnabledRef = useRef(cpuEnabled);

  useEffect(() => { cpuEnabledRef.current = cpuEnabled; }, [cpuEnabled]);

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
    const gid = generateId;
    const t: TerrainObject[] = [];

    // Helper: add a river channel, return its segments
    const addChannel = (cx: number, amp: number, freq: number, phase: number, width = 52): TerrainObject[] => {
      const segs: TerrainObject[] = [];
      for (let y = -400; y < CANVAS_HEIGHT + 400; y += 20) {
        const x = cx + Math.sin(y * freq + phase) * amp;
        const s: TerrainObject = { id: gid(), x, y, type: 'river', size: 0, width, height: 22 };
        t.push(s); segs.push(s);
      }
      return segs;
    };

    // Helper: add a bridge snapped to channel at bridgeY
    const addBridge = (segs: TerrainObject[], by: number, w = 85): void => {
      const seg = segs.reduce((a, b) => Math.abs(a.y - by) < Math.abs(b.y - by) ? a : b);
      t.push({ id: gid(), x: seg.x, y: by, type: 'bridge', size: 0, width: w, height: 40 });
    };

    // Helper: try placing a terrain object with rejection sampling
    const avoidCheck = (x: number, y: number, size: number, riverSegs: TerrainObject[], rBuf: number) => {
      if (t.some(o => {
        if (o.type === 'bridge' && Math.abs(o.x - x) < 55 && Math.abs(o.y - y) < 40) return true;
        if (o.type === 'hill' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < size + o.size + 20) return true;
        if (o.type === 'building' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < size + (o.size || 0) + 18) return true;
        return false;
      })) return true;
      return riverSegs.some(s => Math.abs(s.y - y) < rBuf && Math.abs(s.x - x) < rBuf);
    };

    const placeHills = (n: number, xMin: number, xMax: number, rSegs: TerrainObject[], rBuf = 90) => {
      for (let i = 0; i < n * 4; i++) {
        if (t.filter(o => o.type === 'hill').length >= n + (mapType === MapType.COUNTRYSIDE ? 0 : 0)) break;
        const x = xMin + Math.random() * (xMax - xMin);
        const y = HORIZON_Y + 40 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 80);
        const size = 65 + Math.random() * 45;
        if (!avoidCheck(x, y, size, rSegs, rBuf) && !t.some(o => o.type === 'hill' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < 120))
          t.push({ id: gid(), x, y, type: 'hill', size });
      }
    };

    const placeTrees = (n: number, xMin: number, xMax: number, rSegs: TerrainObject[]) => {
      let placed = 0;
      for (let i = 0; i < n * 5 && placed < n; i++) {
        const x = xMin + Math.random() * (xMax - xMin);
        const y = HORIZON_Y + 20 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 40);
        if (!avoidCheck(x, y, 40, rSegs, 75) && !t.some(o => o.type === 'tree' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < 62))
          { t.push({ id: gid(), x, y, type: 'tree', size: 40 + Math.random() * 28 }); placed++; }
      }
    };

    const placeRocks = (n: number, xMin: number, xMax: number, rSegs: TerrainObject[]) => {
      let placed = 0;
      for (let i = 0; i < n * 5 && placed < n; i++) {
        const x = xMin + Math.random() * (xMax - xMin);
        const y = HORIZON_Y + 10 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 20);
        if (!avoidCheck(x, y, 15, rSegs, 62) && !t.some(o => o.type === 'rock' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < 42))
          { t.push({ id: gid(), x, y, type: 'rock', size: 10 + Math.random() * 18 }); placed++; }
      }
    };

    if (mapType === MapType.COUNTRYSIDE) {
      let rSegs: TerrainObject[] = [];
      if (Math.random() < 0.55) {
        const cx = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 180;
        rSegs = addChannel(cx, 30 + Math.random() * 40, 0.005 + Math.random() * 0.005, Math.random() * Math.PI * 2, 55);
        const span = CANVAS_HEIGHT - HORIZON_Y - 100;
        addBridge(rSegs, HORIZON_Y + 50 + span * 0.35 + (Math.random() - 0.5) * 30);
        addBridge(rSegs, HORIZON_Y + 50 + span * 0.70 + (Math.random() - 0.5) * 30);
      }
      placeHills(6, 100, CANVAS_WIDTH - 100, rSegs);
      placeTrees(18, 55, CANVAS_WIDTH - 55, rSegs);
      placeRocks(24, 40, CANVAS_WIDTH - 40, rSegs);

    } else if (mapType === MapType.URBAN) {
      const wallX = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 24;
      const wallSegs: TerrainObject[] = [];
      for (let y = -400; y < CANVAS_HEIGHT + 400; y += 20) {
        const s: TerrainObject = { id: gid(), x: wallX, y, type: 'river', size: 0, width: 40, height: 22 };
        t.push(s); wallSegs.push(s);
      }
      const span = CANVAS_HEIGHT - HORIZON_Y - 130;
      t.push({ id: gid(), x: wallX, y: HORIZON_Y + 65 + span * 0.28 + (Math.random() - 0.5) * 18, type: 'bridge', size: 0, width: 85, height: 40 });
      t.push({ id: gid(), x: wallX, y: HORIZON_Y + 65 + span * 0.72 + (Math.random() - 0.5) * 18, type: 'bridge', size: 0, width: 85, height: 40 });
      // Buildings both sides
      const placeBuilding = (xMin: number, xMax: number) => {
        for (let attempt = 0; attempt < 10; attempt++) {
          const x = xMin + Math.random() * (xMax - xMin);
          const y = HORIZON_Y + 22 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 44);
          const size = 18 + Math.random() * 24;
          if (!avoidCheck(x, y, size, wallSegs, 30) && !t.some(o => o.type === 'building' && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < size + (o.size || 0) + 65))
            { t.push({ id: gid(), x, y, type: 'building', size, width: size * 2.6, height: size * 2.0 }); return; }
        }
      };
      for (let i = 0; i < 13; i++) placeBuilding(22, wallX - 28);
      for (let i = 0; i < 13; i++) placeBuilding(wallX + 28, CANVAS_WIDTH - 22);
      // Rubble mounds (small hills = elevation bonus)
      placeHills(2, 35, wallX - 50, wallSegs, 40);
      placeHills(2, wallX + 50, CANVAS_WIDTH - 35, wallSegs, 40);

    } else if (mapType === MapType.DESERT) {
      const cx = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * 110;
      const rSegs = addChannel(cx, 20 + Math.random() * 22, 0.004 + Math.random() * 0.003, Math.random() * Math.PI * 2, 48);
      const span = CANVAS_HEIGHT - HORIZON_Y - 100;
      addBridge(rSegs, HORIZON_Y + 50 + span * 0.20 + (Math.random() - 0.5) * 20, 72);
      addBridge(rSegs, HORIZON_Y + 50 + span * 0.55 + (Math.random() - 0.5) * 20, 72);
      addBridge(rSegs, HORIZON_Y + 50 + span * 0.85 + (Math.random() - 0.5) * 20, 72);
      // Sand dunes (bigger hills), no trees
      placeHills(10, 55, CANVAS_WIDTH - 55, rSegs, 95);
      placeRocks(40, 30, CANVAS_WIDTH - 30, rSegs);

    } else if (mapType === MapType.ARCHIPELAGO) {
      // Wide sea straits — nearly straight, prominent channels
      const ch1x = 230 + Math.random() * 30;
      const ch2x = 540 + Math.random() * 30;
      const seaWidth = 120;
      const s1 = addChannel(ch1x, 3 + Math.random() * 4, 0.003, Math.random() * Math.PI * 2, seaWidth);
      const s2 = addChannel(ch2x, 3 + Math.random() * 4, 0.003, Math.random() * Math.PI * 2, seaWidth);
      const span = CANVAS_HEIGHT - HORIZON_Y - 120;
      addBridge(s1, HORIZON_Y + 60 + span * 0.28 + (Math.random() - 0.5) * 18, seaWidth + 10);
      addBridge(s1, HORIZON_Y + 60 + span * 0.72 + (Math.random() - 0.5) * 18, seaWidth + 10);
      addBridge(s2, HORIZON_Y + 60 + span * 0.32 + (Math.random() - 0.5) * 18, seaWidth + 10);
      addBridge(s2, HORIZON_Y + 60 + span * 0.68 + (Math.random() - 0.5) * 18, seaWidth + 10);
      const allR = [...s1, ...s2];
      // Trees and rocks on each island (staying clear of wide channels)
      placeTrees(5, 25, ch1x - seaWidth / 2 - 20, allR);
      placeTrees(7, ch1x + seaWidth / 2 + 20, ch2x - seaWidth / 2 - 20, allR);
      placeTrees(5, ch2x + seaWidth / 2 + 20, CANVAS_WIDTH - 25, allR);
      placeRocks(12, 25, CANVAS_WIDTH - 25, allR);
      placeHills(2, ch1x + seaWidth / 2 + 30, ch2x - seaWidth / 2 - 30, allR);
    }

    terrainRef.current = t;
  }, [mapType]);

  // Optimize: Local frame state to drive R3F, decoupled from App state
  const [frame, setFrame] = useState(0);
  const lastUiUpdateRef = useRef(0);

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

    if ((type === UnitType.AIRSTRIKE || type === UnitType.AIRBORNE || type === UnitType.MISSILE_STRIKE || type === UnitType.NUKE || type === UnitType.GUNSHIP) && options?.absolutePos) {
      const isMissile = type === UnitType.MISSILE_STRIKE || type === UnitType.NUKE;
      const isGunship = type === UnitType.GUNSHIP;
      const flyover: Flyover = {
        id: generateId(),
        team, type,
        targetPos: options.absolutePos,
        currentX: team === Team.WEST ? -250 : CANVAS_WIDTH + 250,
        altitudeY: isMissile ? 35 : (type === UnitType.AIRBORNE ? 45 : 55),
        speed: team === Team.WEST ? (isMissile || isGunship ? 4.5 : 6) : (isMissile || isGunship ? -4.5 : -6),
        dropped: false,
        missileCount: isMissile ? (type === UnitType.NUKE ? 1 : 3) : (isGunship ? 8 : 0),
        health: config.health || 40,
        shotTimer: 0,
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
        const isNuke = !!(m as any).isNuke;
        if (isNuke) soundService.playNukeSound(); else soundService.playExplosionSound();
        const config = UNIT_CONFIG[UnitType.MISSILE_STRIKE] as any; // Default
        const damage = isNuke ? UNIT_CONFIG[UnitType.NUKE].damage : config.damage;
        const radius = isNuke ? UNIT_CONFIG[UnitType.NUKE].radius : config.radius;

        if (isNuke) {
          flashOpacity.current = 1.0;
          // Initial white-hot flash ring
          for (let p = 0; p < 80; p++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 40 + 20;
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x, y: m.target.y },
              velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
              drag: 0.88,
              life: 30 + Math.random() * 20,
              color: p % 2 === 0 ? '#ffffff' : '#fffde7',
              size: 20 + Math.random() * 30
            });
          }
          // Massive lingering mushroom cloud
          for (let p = 0; p < 900; p++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 25 + 8;
            const startDist = Math.random() * 200;
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + Math.cos(angle) * startDist, y: m.target.y + Math.sin(angle) * startDist },
              velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
              drag: 0.95 + Math.random() * 0.03,
              life: 300 + Math.random() * 200,
              color: p % 6 === 0 ? '#ffffff' :
                (p % 5 === 0 ? '#fef08a' :
                  (p % 4 === 0 ? '#1a2e05' :
                    (p % 3 === 0 ? '#365314' :
                      (p % 2 === 0 ? '#4d7c0f' : '#713f12')))),
              size: 40 + Math.random() * 80
            });
          }
          // Burn all trees and bushes caught in the blast
          terrainRef.current.forEach(t => {
            if ((t.type === 'tree' || t.type === 'bush') &&
              Math.sqrt((t.x - m.target.x) ** 2 + (t.y - m.target.y) ** 2) < (radius || 800)) {
              t.state = 'burning';
              t.health = 200;
            }
          });
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

      // Gunship: hover over target and fire 8 shells before leaving
      if (fly.type === UnitType.GUNSHIP) {
        if (!fly.dropped && Math.abs(fly.currentX - fly.targetPos.x) < 80) {
          fly.dropped = true;
          fly.speed = 0;
          fly.shotTimer = 0;
        }
        if (fly.dropped && (fly.missileCount || 0) > 0) {
          fly.shotTimer = (fly.shotTimer || 0) + 1;
          if (fly.shotTimer >= 45) {
            fly.shotTimer = 0;
            const spreadX = (Math.random() - 0.5) * 160;
            const spreadY = (Math.random() - 0.5) * 110;
            const tgt = { x: fly.targetPos.x + spreadX, y: fly.targetPos.y + spreadY };
            missilesRef.current.push({
              id: generateId(), team: fly.team,
              target: tgt, current: { x: fly.currentX, y: fly.altitudeY },
              velocity: { x: (tgt.x - fly.currentX) / 40, y: (tgt.y - fly.altitudeY) / 40 }
            } as any);
            fly.missileCount = (fly.missileCount || 0) - 1;
          }
        }
        if (fly.dropped && (fly.missileCount || 0) <= 0) {
          fly.speed = fly.team === Team.WEST ? 4.5 : -4.5;
        }
      } else if (!fly.dropped && Math.abs(fly.currentX - fly.targetPos.x) < 30) {
        if ((fly.type === UnitType.MISSILE_STRIKE || fly.type === UnitType.NUKE) && fly.missileCount && fly.missileCount > 0) {
          missilesRef.current.push({
            id: generateId(), team: fly.team, target: { x: fly.targetPos.x + (fly.type === UnitType.NUKE ? 0 : (2 - fly.missileCount) * 30), y: fly.targetPos.y },
            current: { x: fly.currentX, y: fly.altitudeY },
            velocity: { x: (fly.targetPos.x - fly.currentX) / 40, y: (fly.targetPos.y - fly.altitudeY) / 40 },
            isNuke: fly.type === UnitType.NUKE
          } as any);
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
        const r = Math.random();
        if (r < 0.28) { weatherRef.current = 'rain';  weatherTimerRef.current = Date.now() + 15000 + Math.random() * 15000; }
        else if (r < 0.44) { weatherRef.current = 'snow';  weatherTimerRef.current = Date.now() + 18000 + Math.random() * 18000; }
        else if (r < 0.56) { weatherRef.current = 'fog';   weatherTimerRef.current = Date.now() + 12000 + Math.random() * 12000; }
        else if (r < 0.65) { weatherRef.current = 'storm'; weatherTimerRef.current = Date.now() + 10000 + Math.random() * 10000; }
        else { weatherTimerRef.current = Date.now() + 22000 + Math.random() * 20000; }
      } else {
        weatherRef.current = 'clear';
        weatherTimerRef.current = Date.now() + 28000 + Math.random() * 28000;
      }
    }

    // Snow particle generation
    if (weatherRef.current === 'snow' && Math.random() < 0.35) {
      particlesRef.current.push({
        id: generateId(),
        position: { x: Math.random() * CANVAS_WIDTH, y: HORIZON_Y },
        velocity: { x: (Math.random() - 0.5) * 0.4, y: 0.45 + Math.random() * 0.55 },
        drag: 0.995,
        life: 200 + Math.random() * 120,
        color: '#e2e8f0',
        size: 2 + Math.random() * 2,
      });
    }

    // Storm lightning strikes — random area damage + flash
    if (weatherRef.current === 'storm' && Math.random() < 0.0012) {
      const lx = 80 + Math.random() * (CANVAS_WIDTH - 160);
      const ly = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
      flashOpacity.current = Math.max(flashOpacity.current, 0.35);
      unitsRef.current.forEach(u => {
        if (Math.sqrt((u.position.x - lx) ** 2 + (u.position.y - ly) ** 2) < 55) {
          u.health -= 25;
          u.lastHitTime = Date.now();
        }
      });
      for (let k = 0; k < 10; k++) {
        particlesRef.current.push({ id: generateId(), position: { x: lx + (Math.random() - 0.5) * 30, y: ly + (Math.random() - 0.5) * 20 }, life: 10, color: '#fde68a', size: 5 + Math.random() * 4 });
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
          soundService.playMineExplosion();
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
              v.lastHitTime = Date.now();
            }
          });
          return;
        }
      }

      const config = UNIT_CONFIG[unit.type] as any;
      const currentScale = getScaleAt(unit.position.y);
      unit.isOnHill = terrainRef.current.some(t => t.type === 'hill' && Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) < t.size * 0.7);
      const isVehicle = unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY ||
        unit.type === UnitType.APC || unit.type === UnitType.ANTI_AIR || unit.type === UnitType.TESLA;

      if (unit.type !== UnitType.BUNKER && (unit.state === UnitState.MOVING || (unit.type === UnitType.ARTILLERY && !unit.isInCover)) && !isDescent) {
        const weatherMovePenalty = config.isFlying
          ? (weatherRef.current === 'storm' ? 0.22 : 1.0)
          : (weatherRef.current === 'rain' ? 0.60 : weatherRef.current === 'snow' ? 0.65 : 1.0);
        let moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed * weatherMovePenalty;

        // Organic lateral drift: two-frequency noise avoids synchronized waves
        const _uid = (unit.id.charCodeAt(0) * 7 + unit.id.charCodeAt(unit.id.length - 1) * 31) % 1000;
        const _phase = (_uid / 1000) * Math.PI * 2;
        let moveY = (Math.sin(time * 0.0018 + _phase) * 0.6 + Math.sin(time * 0.0007 + _phase * 1.9) * 0.35) * 0.18;

        // Suppression: units recently hit slow to a crawl (infantry only)
        const isUnderFire = !config.isFlying && !!unit.lastHitTime && (Date.now() - unit.lastHitTime) < 650;

        if (config.isFlying) {
          unit.isInCover = false; // Force out of cover (Flyers never take cover)
          let target: Unit | null = null;

          // Helicopter Priority: Seek Tesla
          if (unit.type === UnitType.HELICOPTER) {
            target = unitsRef.current.find(o => o.team !== unit.team && o.type === UnitType.TESLA) || null;
          }

          if (!target) {
            let minDist = 600;
            unitsRef.current.forEach(o => { if (o.team !== unit.team && o.type !== UnitType.NAPALM) { const d = Math.sqrt((unit.position.x - o.position.x) ** 2 + (o.position.y - unit.position.y) ** 2); if (d < minDist) { minDist = d; target = o; } } });
          }

          if (target) {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);

            // Set Rotation for Helicopters
            if (unit.type === UnitType.HELICOPTER) {
              unit.rotation = -a; // Invert for 3D logic usually (or check visuals)
            }

            if (unit.type === UnitType.HELICOPTER) {
              // Helicopter Behaviour: maintain range
              const dist = Math.sqrt((target.position.x - unit.position.x) ** 2 + (target.position.y - unit.position.y) ** 2);
              if (dist > config.range * 0.8) {
                moveX = Math.cos(a) * config.speed;
                moveY = Math.sin(a) * config.speed;
              } else {
                // Dynamic Strafing (Orbit/Side-slip)
                // Move perpendicular to target (a + PI/2)
                const strafeAngle = a + Math.PI / 2;
                // Oscillate direction over time (swing back and forth)
                const strafeFactor = Math.sin(time * 0.001 + (parseInt(unit.id, 36) % 100)) * 0.8;

                moveX = Math.cos(strafeAngle) * config.speed * strafeFactor;
                moveY = Math.sin(strafeAngle) * config.speed * strafeFactor;
              }
            } else {
              // Drone / Other: Kamikaze
              moveX = Math.cos(a) * config.speed;
              moveY = Math.sin(a) * config.speed;
            }
          } else {
            // No target, fly forward
            moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed;
            if (unit.type === UnitType.HELICOPTER) unit.rotation = unit.team === Team.WEST ? 0 : Math.PI;
          }
        } else {
          // ── Ground Unit Movement ──────────────────────────────────────────
          let movingToHill = false;
          const hasEnemies = spatialHash.current.query(unit.position.x, unit.position.y, 600).some(u => u.team !== unit.team);

          // MEDIC: seek most-injured ally rather than advancing
          if (unit.type === UnitType.MEDIC) {
            const injured = unitsRef.current.filter(a =>
              a.team === unit.team && a.id !== unit.id &&
              a.health < a.maxHealth * 0.85 && !(UNIT_CONFIG[a.type] as any).isFlying
            );
            if (injured.length > 0) {
              const mostHurt = injured.reduce((a, b) => (a.health / a.maxHealth) < (b.health / b.maxHealth) ? a : b);
              const dx = mostHurt.position.x - unit.position.x;
              const dy = mostHurt.position.y - unit.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 35) { moveX = (dx / dist) * config.speed; moveY = (dy / dist) * config.speed; }
              else { moveX = 0; moveY = 0; }
              movingToHill = true; // skip cover logic
            }
          }

          // FLAMETHROWER: charge aggressively at the nearest enemy, no cover
          if (!movingToHill && unit.type === UnitType.FLAMETHROWER) {
            const nearby = spatialHash.current.query(unit.position.x, unit.position.y, 220);
            const nearEnemy = nearby.find(o =>
              o.team !== unit.team && o.type !== UnitType.NAPALM &&
              o.type !== UnitType.MINE_PERSONAL && o.type !== UnitType.MINE_TANK
            );
            if (nearEnemy) {
              const dx = nearEnemy.position.x - unit.position.x;
              const dy = nearEnemy.position.y - unit.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              moveX = (dx / dist) * config.speed * 1.15;
              moveY = (dy / dist) * config.speed * 1.15;
              movingToHill = true; // skip cover
            }
          }

          // ARTILLERY: stop completely when targets are in range
          if (unit.type === UnitType.ARTILLERY) {
            const artRange = config.range * currentScale;
            const hasArtTarget = spatialHash.current.query(unit.position.x, unit.position.y, artRange)
              .some(o => o.team !== unit.team && o.type !== UnitType.NAPALM);
            if (hasArtTarget) { moveX = 0; moveY = 0; movingToHill = true; }
            else { moveX *= 0.3; } // Slow crawl when no targets yet
          }

          // Hill seeking — forward-biased (don't retreat to hills behind you)
          if (!movingToHill && !unit.isOnHill && hasEnemies) {
            const fwdBias = unit.team === Team.WEST ? unit.position.x - 20 : unit.position.x + 20;
            const hill = terrainRef.current.find(t => {
              if (t.type !== 'hill') return false;
              if (Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) > 220) return false;
              // Must be forward or lateral — no retreating for hills
              if (unit.team === Team.WEST ? t.x < fwdBias : t.x > fwdBias) return false;
              return !unitsRef.current.some(o =>
                o.team === unit.team && o.id !== unit.id &&
                Math.sqrt((o.position.x - t.x) ** 2 + (o.position.y - t.y) ** 2) < t.size * 0.6
              );
            });
            if (hill) {
              const a = Math.atan2(hill.y - unit.position.y, hill.x - unit.position.x);
              moveX = Math.cos(a) * config.speed;
              moveY = Math.sin(a) * config.speed;
              movingToHill = true;
            }
          }

          // On-hill behaviour
          if (unit.isOnHill && hasEnemies && !movingToHill) {
            // Sniper digs in on hill if enemies are in range
            if (unit.type === UnitType.SNIPER) {
              const inRange = spatialHash.current.query(unit.position.x, unit.position.y, config.range * currentScale)
                .some(o => o.team !== unit.team);
              if (inRange) { moveX = 0; moveY = 0; movingToHill = true; }
            } else {
              moveX *= 0.5; moveY *= 0.5; // others slow down / dig in
            }
          }

          // Suppression: infantry slows to a near-stop when recently hit
          if (isUnderFire && !isVehicle && !movingToHill) {
            moveX *= 0.22;
            moveY *= 0.22;
          }

          // Cover / obstacle logic
          if (!movingToHill && !unit.isOnHill) {
            if (!isVehicle) {
              // Sniper holds in cover when enemies are in range
              if (unit.type === UnitType.SNIPER && unit.isInCover) {
                const inRange = spatialHash.current.query(unit.position.x, unit.position.y, config.range * currentScale)
                  .some(o => o.team !== unit.team);
                if (inRange) { moveX = 0; moveY = 0; }
              }

              if (unit.isInCover && unit.coverEnterTime) {
                if (Date.now() - unit.coverEnterTime > (unit.coverDuration || 8000)) {
                  unit.isInCover = false;
                  unit.lastCoverId = terrainRef.current.find(t =>
                    Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) < 60
                  )?.id;
                  unit.coverEnterTime = undefined;
                } else {
                  moveX = 0; moveY = 0;
                }
              } else {
                // Under fire: search wider radius and allow retreating to cover
                const coverBackBias = isUnderFire ? 60 : 30;
                const coverSearchRadius = isUnderFire ? 240 : 175;
                const cover = terrainRef.current.find(t => {
                  if (t.type !== 'tree' && t.type !== 'rock') return false;
                  if (t.id === unit.lastCoverId) return false;
                  if (unit.team === Team.WEST ? t.x < unit.position.x - coverBackBias : t.x > unit.position.x + coverBackBias) return false;
                  const dist = Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2);
                  if (dist > coverSearchRadius) return false;
                  return !unitsRef.current.some(o =>
                    o.team === unit.team && o.id !== unit.id &&
                    Math.sqrt((o.position.x - t.x) ** 2 + (o.position.y - t.y) ** 2) < 28
                  );
                });
                if (cover) {
                  const dist = Math.sqrt((cover.x - unit.position.x) ** 2 + (cover.y - unit.position.y) ** 2);
                  if (dist > 25) {
                    const a = Math.atan2(cover.y - unit.position.y, cover.x - unit.position.x);
                    moveX = (moveX * 0.35) + (Math.cos(a) * config.speed * 0.65);
                    moveY = (moveY * 0.35) + (Math.sin(a) * config.speed * 0.65);
                  } else {
                    moveX = 0; moveY = 0;
                    unit.isInCover = true;
                    unit.coverEnterTime = Date.now();
                    unit.coverDuration = isUnderFire
                      ? 2500 + Math.random() * 3500
                      : 4500 + Math.random() * 9000;
                  }
                }
              }
            } else {
              // Vehicles steer around trees and rocks
              terrainRef.current.forEach(t => {
                if (t.type === 'tree' || t.type === 'rock') {
                  const dist = Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2);
                  const avoidDist = t.type === 'tree' ? 38 : 28;
                  if (dist < avoidDist) {
                    const dx = unit.position.x - t.x;
                    const dy = unit.position.y - t.y;
                    moveX += (dx / dist) * 2;
                    moveY += (dy / dist) * 2;
                  }
                }
              });
            }

            // All ground units steer around buildings
            if (!config.isFlying) {
              terrainRef.current.forEach(bld => {
                if (bld.type !== 'building') return;
                const hw = ((bld.width || bld.size * 2.6) / 2) + 22;
                const hd = ((bld.height || bld.size * 2.0) / 2) + 22;
                const dx = unit.position.x - bld.x;
                const dy = unit.position.y - bld.y;
                if (Math.abs(dx) < hw && Math.abs(dy) < hd) {
                  const overlapX = hw - Math.abs(dx);
                  const overlapY = hd - Math.abs(dy);
                  if (overlapX < overlapY) {
                    moveX += Math.sign(dx || 1) * overlapX * 0.35;
                  } else {
                    moveY += Math.sign(dy || 1) * overlapY * 0.35;
                  }
                }
              });
            }
          }
        }

        // Separation force — single tuned system, replaces old dual-system
        if (!unit.isInCover) {
          const sepRadius = isVehicle ? 58 : 32;
          const sepStr = isVehicle ? 0.065 : 0.09;
          spatialHash.current.queryCallback(unit.position.x, unit.position.y, sepRadius, (other) => {
            if (other.id !== unit.id && other.team === unit.team && !(UNIT_CONFIG[other.type] as any).isFlying) {
              const dx = unit.position.x - other.position.x;
              const dy = unit.position.y - other.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < sepRadius && dist > 0.1) {
                const push = (sepRadius - dist) * sepStr;
                moveX += (dx / dist) * push;
                moveY += (dy / dist) * push;
              }
            }
          });
        }

        // River / Bridge Interactions — supports multiple channels (archipelago)
        if (!unit.isInCover && !config.isFlying) {
          // Find the next uncrossed channel: for West, smallest-x channel ahead; for East, largest-x behind
          const channelSegsAtY = terrainRef.current.filter(t =>
            t.type === 'river' && t.width && Math.abs(t.y - unit.position.y) < 18
          );
          // Deduplicate into distinct channels (segments within 100px X are same channel)
          const channels: TerrainObject[] = [];
          for (const seg of channelSegsAtY) {
            if (!channels.some(c => Math.abs(c.x - seg.x) < 100)) channels.push(seg);
          }
          // Pick the relevant channel (first uncrossed in direction of travel)
          const river = unit.team === Team.WEST
            ? channels.filter(c => c.x > unit.position.x - c.width! / 2).sort((a, b) => a.x - b.x)[0] ?? null
            : channels.filter(c => c.x < unit.position.x + c.width! / 2).sort((a, b) => b.x - a.x)[0] ?? null;

          if (river && river.width) {
            const riverLeft = river.x - river.width / 2;
            const riverRight = river.x + river.width / 2;
            if (unit.position.x + 5 > riverLeft && unit.position.x - 5 < riverRight) {
              const onBridge = terrainRef.current.some(b =>
                b.type === 'bridge' &&
                Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
                Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10
              );
              if (!onBridge) {
                const crossNeeded = (unit.team === Team.WEST && unit.position.x < river.x) || (unit.team === Team.EAST && unit.position.x > river.x);
                if (crossNeeded) {
                  let nearestBridge: TerrainObject | null = null;
                  let minBridgeDist = 10000;
                  terrainRef.current.forEach(b => {
                    if (b.type === 'bridge' && Math.abs(b.x - river.x) < river.width! / 2 + 30) {
                      const d = Math.abs(unit.position.y - b.y);
                      if (d < minBridgeDist) { minBridgeDist = d; nearestBridge = b; }
                    }
                  });
                  if (nearestBridge) {
                    const bridge = nearestBridge as TerrainObject;
                    const dy = bridge.y - unit.position.y;
                    moveY += (dy / Math.abs(dy || 1)) * config.speed * 1.0;
                    if (Math.abs(dy) > 10) {
                      moveX = 0;
                      if (Math.abs(unit.position.x - river.x) < river.width! / 2 + 10)
                        moveX = (unit.team === Team.WEST ? -1 : 1) * 1.5;
                    } else {
                      moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed;
                    }
                  } else {
                    moveX = 0;
                  }
                }
              }
            }
          }
        }

        unit.position.x += moveX; unit.position.y += moveY;
        unit.position.y = Math.max(HORIZON_Y + 10, Math.min(CANVAS_HEIGHT - 10, unit.position.y));

        // Hard building collision — push unit out of any building it overlaps
        if (!config.isFlying) {
          terrainRef.current.forEach(bld => {
            if (bld.type !== 'building') return;
            const hw = ((bld.width || bld.size * 2.6) / 2) + 6;
            const hd = ((bld.height || bld.size * 2.0) / 2) + 6;
            const dx = unit.position.x - bld.x;
            const dy = unit.position.y - bld.y;
            if (Math.abs(dx) < hw && Math.abs(dy) < hd) {
              const overlapX = hw - Math.abs(dx);
              const overlapY = hd - Math.abs(dy);
              if (overlapX < overlapY) {
                unit.position.x += Math.sign(dx || 1) * overlapX;
              } else {
                unit.position.y += Math.sign(dy || 1) * overlapY;
              }
            }
          });
        }
      }

      if (!isDescent && unit.attackCooldown <= 0) {
        // Water Penalty Check
        // Re-find river (efficient enough as terrain array is small)
        const inWater = !config.isFlying && terrainRef.current.some(r => {
          if (r.type !== 'river' || !r.width || Math.abs(r.y - unit.position.y) > 18) return false;
          if (unit.position.x < r.x - r.width / 2 || unit.position.x > r.x + r.width / 2) return false;
          return !terrainRef.current.some(b =>
            b.type === 'bridge' &&
            Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
            Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10
          );
        });

        const fogPenalty = weatherRef.current === 'fog' ? 0.45 : weatherRef.current === 'storm' ? 0.70 : 1.0;
        const range = (unit.isOnHill ? config.range * HILL_RANGE_BONUS : (inWater ? config.range * 0.4 : config.range)) * currentScale * fogPenalty;
        const vetMult = 1 + 0.1 * (unit.veterancy || 0);

        if (unit.type === UnitType.ANTI_AIR) {
          // AA targets Drones AND Descending Paratroopers
          let target = unitsRef.current.find(u => {
            if (u.team === unit.team) return false;
            const isAirTarget = u.type === UnitType.HELICOPTER || u.type === UnitType.DRONE || (u.type === UnitType.AIRBORNE && (Date.now() - (u.spawnTime || 0) < 3000));
            return isAirTarget && Math.sqrt((u.position.x - unit.position.x) ** 2 + (u.position.y - unit.position.y) ** 2) < range;
          });

          if (!target) {
            // Check flyovers (Airstrikes/Missiles)
            const fly = flyoversRef.current.find(f => f.team !== unit.team && Math.sqrt((f.currentX - unit.position.x) ** 2 + (f.altitudeY - unit.position.y) ** 2) < range);
            if (fly) {
              const a = Math.atan2(fly.altitudeY - unit.position.y, fly.currentX - unit.position.x);
              projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: config.damage * vetMult, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type, sourceUnitId: unit.id, isMissile: true });
              unit.attackCooldown = config.attackSpeed; soundService.playRocketSound();
            }
          } else {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
            projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: config.damage * vetMult, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type, sourceUnitId: unit.id, isMissile: true });
            unit.attackCooldown = config.attackSpeed; soundService.playRocketSound();
          }
        } else {
          // Standard Targeting (Ground)
          // Optimized Targeting
          const potentialTargets = spatialHash.current.query(unit.position.x, unit.position.y, range);

          let target = null;

          if (unit.type === UnitType.FLAMETHROWER) {
            // AoE instant fire — damages all enemies in short range, ignores cover
            const victims = spatialHash.current.query(unit.position.x, unit.position.y, range);
            let fired = false;
            victims.forEach(v => {
              if (v.team !== unit.team && v.type !== UnitType.NAPALM && v.type !== UnitType.MINE_PERSONAL && v.type !== UnitType.MINE_TANK) {
                const dist = Math.sqrt((v.position.x - unit.position.x) ** 2 + (v.position.y - unit.position.y) ** 2);
                if (dist < range) {
                  v.health -= config.damage * vetMult;
                  v.lastHitTime = Date.now();
                  v.lastAttackerId = unit.id;
                  fired = true;
                  for (let fp = 0; fp < 3; fp++) {
                    particlesRef.current.push({
                      id: generateId(),
                      position: { x: v.position.x + (Math.random() - 0.5) * 12, y: v.position.y + (Math.random() - 0.5) * 8 },
                      velocity: { x: (Math.random() - 0.5) * 2, y: -Math.random() * 1.8 },
                      drag: 0.88,
                      life: 16 + Math.random() * 10,
                      color: Math.random() > 0.4 ? '#f97316' : '#fbbf24',
                      size: 3 + Math.random() * 5
                    });
                  }
                }
              }
            });
            if (fired) { soundService.playFlameSound(); unit.attackCooldown = config.attackSpeed; }
          } else if (unit.type === UnitType.MEDIC) {
            // Heal nearest low-HP friendly instead of attacking
            const friends = spatialHash.current.query(unit.position.x, unit.position.y, range)
              .filter(f => f.team === unit.team && f.id !== unit.id && f.health < f.maxHealth);
            if (friends.length > 0) {
              const healTarget = friends.reduce((a, b) => (a.health / a.maxHealth) < (b.health / b.maxHealth) ? a : b);
              const healAmount = (config as any).healAmount || 8;
              healTarget.health = Math.min(healTarget.maxHealth, healTarget.health + healAmount);
              particlesRef.current.push({
                id: generateId(),
                position: { x: healTarget.position.x, y: healTarget.position.y - 6 },
                velocity: { x: (Math.random() - 0.5) * 0.5, y: -0.7 },
                drag: 0.94,
                life: 28,
                color: '#4ade80',
                size: 6
              });
              soundService.playHealSound();
              unit.attackCooldown = config.attackSpeed;
            }
          } else if (unit.type === UnitType.TESLA) {
            // Tesla Targeting: STRICTLY Infantry Only
            target = potentialTargets.find(o =>
              o.team !== unit.team &&
              (o.type === UnitType.SOLDIER || o.type === UnitType.SNIPER || o.type === UnitType.RAMBO || o.type === UnitType.AIRBORNE) &&
              Math.sqrt((o.position.x - unit.position.x) ** 2 + (o.position.y - unit.position.y) ** 2) < range
            );
            // No fallback - completely ignores vehicles

            // Burst Logic
            if (target) {
              if (unit.attackCooldown <= 0 || (unit.burstCount || 0) > 0) {
                if (unit.attackCooldown <= 0) unit.burstCount = 5; // Start Burst

                if ((unit.burstCount || 0) > 0) {
                  // Fire Lightning
                  // Instant Hit
                  target.health -= config.damage * vetMult;
                  target.lastHitTime = Date.now();
                  target.lastAttackerId = unit.id;
                  soundService.playZapSound();

                  // Visual Lightning (Blue Beam)
                  particlesRef.current.push({
                    id: generateId(),
                    position: { x: unit.position.x, y: unit.position.y - 10 },
                    velocity: { x: 0, y: 0 },
                    life: 5,
                    color: '#0ea5e9',
                    size: 2,
                    targetPos: { x: target.position.x, y: target.position.y }
                  });
                  // Add Sparks at target
                  particlesRef.current.push({ id: generateId(), position: { ...target.position }, life: 10, color: '#bae6fd', size: 6 });

                  unit.burstCount = (unit.burstCount || 0) - 1;
                  unit.attackCooldown = unit.burstCount > 0 ? 5 : config.attackSpeed;
                }
              }
              // If waiting for cooldown, do nothing
            }
          } else {
            // Standard Unit Targeting

            // Helicopter Priority Target: Tesla
            if (unit.type === UnitType.HELICOPTER) {
              target = potentialTargets.find(o => o.team !== unit.team && o.type === UnitType.TESLA && Math.sqrt((o.position.x - unit.position.x) ** 2 + (o.position.y - unit.position.y) ** 2) < range);
            }

            // Primary pass: ground targets (all unit types)
            if (!target) {
              target = potentialTargets.find(o => {
                if (o.team === unit.team || o.type === UnitType.NAPALM || o.type === UnitType.MINE_PERSONAL || o.type === UnitType.MINE_TANK) return false;
                if ((UNIT_CONFIG[o.type] as any).isFlying) return false; // ground pass only
                const oLife = Date.now() - (o.spawnTime || 0);
                if (o.type === UnitType.AIRBORNE && oLife < 3000 && unit.type !== UnitType.HELICOPTER) return false;
                return Math.sqrt((o.position.x - unit.position.x) ** 2 + ((o.position.y - unit.position.y) * 2) ** 2) < range;
              }) || null;
            }

            // Secondary pass: air targets — only infantry, snipers, and helicopters can engage air
            // Tanks and Artillery are strictly ground-only weapons
            if (!target) {
              const canEngageAir = unit.type === UnitType.SOLDIER || unit.type === UnitType.RAMBO ||
                unit.type === UnitType.SNIPER || unit.type === UnitType.HELICOPTER;
              if (canEngageAir) {
                target = potentialTargets.find(o => {
                  if (o.team === unit.team) return false;
                  if (!(UNIT_CONFIG[o.type] as any).isFlying) return false;
                  return Math.sqrt((o.position.x - unit.position.x) ** 2 + (o.position.y - unit.position.y) ** 2) < range;
                }) || null;
              }
            }

            if (target) {
              const targetIsAir = !!(UNIT_CONFIG[target.type] as any).isFlying;

              // Sniper Accuracy Check
              if (unit.type === UnitType.SNIPER) {
                if (Math.random() > 0.7) { // 30% Miss Chance
                  const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x) + (Math.random() - 0.5) * 0.5;
                  projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * PROJECTILE_SPEED, y: Math.sin(a) * PROJECTILE_SPEED }, damage: 0, maxRange: range, distanceTraveled: 0, targetType: targetIsAir ? 'air' : 'ground', sourceType: unit.type, sourceUnitId: unit.id });
                  unit.attackCooldown = config.attackSpeed; soundService.playSniperShot();
                  return;
                }
              }

              const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
              let spread = 0;
              if (unit.type === UnitType.ARTILLERY) {
                spread = (Math.random() - 0.5) * 0.55;
              }
              const isMissile = unit.type === UnitType.HELICOPTER;

              projectilesRef.current.push({
                id: generateId(),
                team: unit.team,
                position: { ...unit.position },
                velocity: { x: Math.cos(a + spread) * PROJECTILE_SPEED, y: Math.sin(a + spread) * PROJECTILE_SPEED },
                damage: config.damage * vetMult,
                maxRange: range * (unit.type === UnitType.ARTILLERY ? 1.5 : 1.0),
                distanceTraveled: 0,
                targetType: targetIsAir ? 'air' : 'ground',
                explosionRadius: config.explosionRadius,
                sourceType: unit.type,
                sourceUnitId: unit.id,
                isMissile
              });
              unit.attackCooldown = Math.floor(config.attackSpeed * (unit.isOnHill ? HILL_RELOAD_BONUS : 1.0));
              if (unit.type === UnitType.TANK || unit.type === UnitType.APC || unit.type === UnitType.BUNKER) soundService.playHeavyShot();
              else if (unit.type === UnitType.ARTILLERY) soundService.playArtilleryFire();
              else if (unit.type === UnitType.SNIPER) soundService.playSniperShot();
              else if (unit.type === UnitType.HELICOPTER) soundService.playRocketSound();
              else soundService.playRifleShot();
            }
          }
        }
      }

      unit.attackCooldown = Math.max(0, unit.attackCooldown - 1);

      if ((unit.team === Team.WEST && unit.position.x > CANVAS_WIDTH) || (unit.team === Team.EAST && unit.position.x < 0)) {
        scoreRef.current[unit.team] += unit.type === UnitType.TANK ? 3 : 1;

        // Dollar Sign Animation
        particlesRef.current.push({
          id: generateId(),
          position: { x: unit.position.x, y: unit.position.y },
          velocity: { x: 0, y: 0.5 }, // Float up
          life: 90,
          color: '#22c55e', // Green for money
          size: 8, // Scale for 3D text
          text: '$'
        });

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

          let damage = p.damage;
          // AA is the hard counter to air — 4× vs helicopter, 2× vs drone
          if (p.sourceType === UnitType.ANTI_AIR) {
            if (target.type === UnitType.HELICOPTER) damage *= 4;
            else if (target.type === UnitType.DRONE) damage *= 2;
          }
          // Small arms (soldiers, rambo) are 30% effective against aircraft
          if ((UNIT_CONFIG[target.type] as any).isFlying &&
            (p.sourceType === UnitType.SOLDIER || p.sourceType === UnitType.RAMBO)) {
            damage *= 0.3;
          }

          target.health -= damage;
          target.lastHitTime = Date.now();
          if (p.sourceUnitId) target.lastAttackerId = p.sourceUnitId;
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
          // Artillery / Heavy Weapon Scorch Mark
          if (p.sourceType === UnitType.ARTILLERY || p.sourceType === UnitType.MISSILE_STRIKE) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: p.position.x, y: p.position.y },
              life: 600, // 10 seconds
              color: '#292524', // Stone 800 - dark scorch
              size: p.explosionRadius * 1.5,
              isGroundDecal: true
            });
          }

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
      // Kill Reward: Award 40% of unit cost to enemy
      const reward = Math.floor(((UNIT_CONFIG[u.type] as any).cost || 0) * 0.4);
      if (reward > 0) {
        const killerTeam = u.team === Team.WEST ? Team.EAST : Team.WEST;
        moneyRef.current[killerTeam] += reward;
      }

      if (u.type === UnitType.APC) {
        // APC disgorges 3 soldiers on death
        soundService.playLargeExplosion();
        const soldierCfg = UNIT_CONFIG[UnitType.SOLDIER];
        for (let si = 0; si < 3; si++) {
          unitsRef.current.push({
            id: generateId(), team: u.team, type: UnitType.SOLDIER,
            position: { x: u.position.x + (si - 1) * 16, y: u.position.y + (Math.random() - 0.5) * 20 },
            state: UnitState.MOVING, health: soldierCfg.health, maxHealth: soldierCfg.health,
            attackCooldown: 0, targetId: null, width: soldierCfg.width, height: soldierCfg.height,
            spawnTime: Date.now(), isInCover: false
          });
        }
        for (let k = 0; k < 15; k++) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: u.position.x + (Math.random() - 0.5) * 40, y: u.position.y + (Math.random() - 0.5) * 30 },
            life: 45, color: k % 2 === 0 ? '#ef4444' : '#f97316', size: 8 + Math.random() * 10
          });
        }
      } else if (u.type === UnitType.TANK || u.type === UnitType.ARTILLERY) {
        soundService.playLargeExplosion();
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

    // Veterancy: credit kills and promote survivors
    deadUnits.forEach(u => {
      if (!u.lastAttackerId) return;
      const killer = unitsRef.current.find(k => k.id === u.lastAttackerId && k.health > 0);
      if (!killer) return;
      killer.kills = (killer.kills || 0) + 1;
      const newVet = killer.kills >= 12 ? 3 : killer.kills >= 7 ? 2 : killer.kills >= 3 ? 1 : 0;
      if (newVet > (killer.veterancy || 0)) {
        killer.veterancy = newVet;
        const bonus = 1 + 0.1 * newVet;
        killer.maxHealth = Math.floor((UNIT_CONFIG[killer.type] as any).health * bonus);
        killer.health = Math.min(killer.health + 18, killer.maxHealth);
        particlesRef.current.push({
          id: generateId(),
          position: { x: killer.position.x, y: killer.position.y - 16 },
          velocity: { x: 0, y: -0.45 },
          drag: 0.97,
          life: 100,
          color: '#fbbf24',
          size: 9,
          text: '★'.repeat(newVet),
        });
      }
    });

    unitsRef.current = unitsRef.current.filter(u => u.health > 0);

    // CPU AI — strategic East commander
    if (cpuEnabledRef.current) {
      cpuTimerRef.current += 1;

      // Battlefield snapshot (computed every frame for adaptive timing)
      const eastActive = unitsRef.current.filter(u => u.team === Team.EAST && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM);
      const westActive = unitsRef.current.filter(u => u.team === Team.WEST && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM);
      const scoreDiff = scoreRef.current[Team.EAST] - scoreRef.current[Team.WEST]; // + = East winning

      // Adaptive spawn rate: faster when losing or outnumbered
      const isUnderPressure = eastActive.length < westActive.length - 2 || scoreDiff < -12;
      const spawnInterval = isUnderPressure ? 88 : 145;

      if (cpuTimerRef.current >= spawnInterval) {
        cpuTimerRef.current = 0;
        const money = moneyRef.current[Team.EAST];

        // --- Threat analysis ---
        const westUnits = unitsRef.current.filter(u => u.team === Team.WEST);
        const airThreats    = westUnits.filter(u => u.type === UnitType.HELICOPTER || u.type === UnitType.DRONE).length;
        const armorThreats  = westUnits.filter(u => u.type === UnitType.TANK || u.type === UnitType.APC).length;
        const infThreats    = westUnits.filter(u => u.type === UnitType.SOLDIER || u.type === UnitType.RAMBO || u.type === UnitType.AIRBORNE || u.type === UnitType.FLAMETHROWER).length;
        const westFrontX    = westUnits.length > 0 ? Math.max(...westUnits.map(u => u.position.x)) : 0;

        const eastHasAA     = eastActive.some(u => u.type === UnitType.ANTI_AIR);
        const eastHasMedic  = eastActive.some(u => u.type === UnitType.MEDIC);
        const eastHasTesla  = eastActive.some(u => u.type === UnitType.TESLA);
        const eastInfCount  = eastActive.filter(u => u.type === UnitType.SOLDIER || u.type === UnitType.RAMBO).length;

        // Helper: add weight only if affordable
        const can = (t: UnitType) => money >= (UNIT_CONFIG[t] as any).cost;
        const prio: Partial<Record<UnitType, number>> = {};
        const add = (t: UnitType, w: number) => { if (can(t)) prio[t] = (prio[t] || 0) + w; };

        // --- Counter-picks (emergency priority) ---
        if (airThreats >= 2 && !eastHasAA)  add(UnitType.ANTI_AIR, 10);
        else if (airThreats >= 1 && !eastHasAA) add(UnitType.ANTI_AIR, 5);
        if (armorThreats >= 3)               { add(UnitType.ARTILLERY, 6); add(UnitType.HELICOPTER, 4); }
        else if (armorThreats >= 1)          add(UnitType.ARTILLERY, 3);
        if (infThreats >= 6 && !eastHasTesla) add(UnitType.TESLA, 7);
        else if (infThreats >= 4)            { add(UnitType.FLAMETHROWER, 4); add(UnitType.TESLA, 3); }
        else if (infThreats >= 2)            add(UnitType.FLAMETHROWER, 2);

        // --- Support ---
        if (!eastHasMedic && eastInfCount >= 3) add(UnitType.MEDIC, 5);

        // --- General composition ---
        add(UnitType.TANK, 3);
        add(UnitType.SOLDIER, 3);
        add(UnitType.SNIPER, 2);
        add(UnitType.HELICOPTER, 2);
        add(UnitType.APC, 2);
        add(UnitType.ARTILLERY, 1);
        add(UnitType.ANTI_AIR, 1);
        add(UnitType.DRONE, 1);
        add(UnitType.RAMBO, 1);
        add(UnitType.FLAMETHROWER, 1);

        // --- Special tactics (override normal spawn with a chance) ---
        let specialSpawned = false;

        // Missile strike at enemy cluster
        if (!specialSpawned && can(UnitType.MISSILE_STRIKE) && westUnits.length >= 6 && Math.random() < 0.25) {
          const cx = westUnits.reduce((s, u) => s + u.position.x, 0) / westUnits.length;
          const cy = westUnits.reduce((s, u) => s + u.position.y, 0) / westUnits.length;
          spawnUnit(Team.EAST, UnitType.MISSILE_STRIKE, { absolutePos: { x: cx, y: cy } });
          moneyRef.current[Team.EAST] -= (UNIT_CONFIG[UnitType.MISSILE_STRIKE] as any).cost;
          specialSpawned = true;
        }

        // Airborne drop behind West lines when enemy is pushing deep
        if (!specialSpawned && can(UnitType.AIRBORNE) && westFrontX > 450 && Math.random() < 0.2) {
          const dropX = 80 + Math.random() * 120;
          const dropY = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
          spawnUnit(Team.EAST, UnitType.AIRBORNE, { absolutePos: { x: dropX, y: dropY } });
          moneyRef.current[Team.EAST] -= (UNIT_CONFIG[UnitType.AIRBORNE] as any).cost;
          specialSpawned = true;
        }

        // Tank mines when armor is a threat
        if (!specialSpawned && can(UnitType.MINE_TANK) && armorThreats >= 2 && Math.random() < 0.3) {
          const mineX = Math.min(Math.max(westFrontX + 50, 530), 720);
          const mineY = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
          spawnUnit(Team.EAST, UnitType.MINE_TANK, { absolutePos: { x: mineX, y: mineY } });
          moneyRef.current[Team.EAST] -= (UNIT_CONFIG[UnitType.MINE_TANK] as any).cost;
          specialSpawned = true;
        }

        if (!specialSpawned) {
          // Build weighted pool
          const pool: UnitType[] = [];
          for (const [type, weight] of Object.entries(prio) as [UnitType, number][]) {
            for (let w = 0; w < weight; w++) pool.push(type as UnitType);
          }

          // Saving strategy: if pool is all cheap filler and a valuable unit is 40% away, skip
          const bigTargets: UnitType[] = [UnitType.TANK, UnitType.TESLA, UnitType.HELICOPTER, UnitType.ANTI_AIR, UnitType.ARTILLERY];
          const savingFor = bigTargets.find(t => !can(t) && (UNIT_CONFIG[t] as any).cost <= money * 1.5);
          if (savingFor && pool.every(t => (UNIT_CONFIG[t] as any).cost < 70)) {
            // Skip this tick to save up
          } else {
            // Fallback if nothing prioritised: pick random affordable non-special
            if (pool.length === 0) {
              const noAiTypes = new Set([UnitType.AIRSTRIKE, UnitType.NUKE, UnitType.GUNSHIP, UnitType.NAPALM,
                                         UnitType.MISSILE_STRIKE, UnitType.AIRBORNE, UnitType.MINE_PERSONAL, UnitType.MINE_TANK]);
              const affordable = (Object.keys(UNIT_CONFIG) as UnitType[]).filter(t => {
                const cost = (UNIT_CONFIG[t] as any).cost;
                return cost > 0 && cost <= money && !noAiTypes.has(t);
              });
              if (affordable.length > 0) pool.push(...affordable);
            }

            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * pool.length)];
              const cost = (UNIT_CONFIG[chosen] as any).cost;
              if (chosen === UnitType.SOLDIER) {
                const soldierCfg = UNIT_CONFIG[UnitType.SOLDIER];
                const sqId = generateId();
                for (let si = 0; si < 3; si++) {
                  unitsRef.current.push({
                    id: generateId(), team: Team.EAST, type: UnitType.SOLDIER,
                    position: { x: CANVAS_WIDTH - 30, y: HORIZON_Y + 50 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 100) },
                    state: UnitState.MOVING, health: soldierCfg.health, maxHealth: soldierCfg.health,
                    attackCooldown: 0, targetId: null, width: soldierCfg.width, height: soldierCfg.height,
                    spawnTime: Date.now(), isInCover: false, squadId: sqId
                  });
                }
              } else {
                spawnUnit(Team.EAST, chosen);
              }
              moneyRef.current[Team.EAST] = Math.max(0, moneyRef.current[Team.EAST] - cost);
            }
          }
        }
      }
    }

    // UI Update Strategy:
    // 1. Force R3F re-render locally 60fps (for smooth movement)
    setFrame(f => f + 1);

    // 2. Throttle App/UI updates to 10fps (for score/money/performance)
    if (Date.now() - lastUiUpdateRef.current > 100) {
      onGameStateChange({ units: unitsRef.current, projectiles: projectilesRef.current, particles: particlesRef.current, score: scoreRef.current, money: moneyRef.current, weather: weatherRef.current });
      lastUiUpdateRef.current = Date.now();
    }
  }, [spawnQueue, clearSpawnQueue, onGameStateChange, spawnUnit]);

  // Stable Loop references
  const updateRef = useRef(update);
  updateRef.current = update;
  const gameOverRef = useRef(gameOver);
  gameOverRef.current = gameOver;

  // Game Loop - Stable Identity
  const tick = useCallback(() => {
    if (!gameOverRef.current) {
      try {
        updateRef.current();
      } catch (e) {
        console.error("Game Loop Error:", e);
      }
      requestRef.current = requestAnimationFrame(tick);
    }
  }, []);

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
        mapType={mapType}
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
