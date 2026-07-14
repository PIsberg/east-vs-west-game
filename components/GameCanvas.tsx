import React, { useRef, useEffect, useCallback } from 'react';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  UNIT_CONFIG,
  roundSpeed,
  arcHeight,
  INDIRECT,
  INITIAL_MONEY,
  MONEY_PER_TICK,
  HORIZON_Y,
  MIN_SCALE,
  MAX_SCALE,
  HILL_RANGE_BONUS,
  HILL_RELOAD_BONUS,
  WIN_SCORE,
  BASE_HP,
  INCOME_UPGRADE_BASE_COST,
  INCOME_UPGRADE_BONUS,
  INCOME_UPGRADE_MAX,
  RALLY_COST,
  RALLY_DURATION_MS,
  RALLY_COOLDOWN_MS,
  RALLY_RELOAD_MULT,
  RALLY_SPEED_MULT,
  REPAIR_ZONE,
  REPAIR_PER_TICK,
  REPAIR_COMBAT_LOCKOUT_MS,
  ENGINEER_REPAIR,
  ENGINEER_REPAIR_RANGE,
  isMechanical,
  getFireFx,
  spreadAtRange,
  SUPPRESSION_MS,
  SUPPRESSION_RADIUS,
  SUPPRESSION_SPEED_MULT,
  SUPPRESSION_RELOAD_MULT,
  isSuppressible,
  armorFacingMult,
  AIRBORNE_STICK,
  IMPACT_SHAKE_MIN_DAMAGE,
  getMoveClass,
  CLASS_PROFILE,
  AVOID_LOOKAHEAD,
  AVOID_COMMIT_MS,
  STUCK_SAMPLE_TICKS,
  STUCK_MIN_PROGRESS,
  STUCK_ESCALATE,
  APC_SQUAD,
  APC_DEPLOY_RANGE,
  APC_DEPLOY_HP,
  MILLISECONDS_PER_FRAME,
  BUNKER_BUILD_MS,
  BUNKER_BUILD_START_HP,
  BUNKER_GARRISON_MAX,
  BUNKER_GARRISON_DAMAGE,
  BUNKER_GARRISON_RELOAD,
  BUNKER_GARRISON_RANGE,
  BUNKER_CALL_RANGE
} from '../constants';
import { Team, Unit, UnitState, Projectile, Particle, GameState, GameEvent, UnitType, TerrainObject, Vector2D, Flyover, Missile, MapType, CapturePoint, GameMode, Stance, LaserStrike, SupplyCrate, SmokeZone, RallyState, TeamCommand } from '../types';
import { soundService } from '../services/audio';
import { GameScene, type Marquee } from './GameScene';
import { SpatialHash } from '../utils/spatialHash';
import { useState } from 'react';

export type CpuDifficulty = 'easy' | 'normal' | 'hard';
export type SpawnLane = 'top' | 'mid' | 'bot';

// interval: spawn-cadence multiplier · incomeBonus: extra money per tick · special: tactics-chance multiplier
export const BRIDGE_HP = 320;

// Foot units a Transport can carry
const TRANSPORTABLE = new Set([
  UnitType.SOLDIER, UnitType.SNIPER, UnitType.SPECIAL_FORCES, UnitType.FLAMETHROWER,
  UnitType.MEDIC, UnitType.ENGINEER, UnitType.MORTAR, UnitType.AIRBORNE,
]);

// Foot units that man a bunker's firing slits. The engineer is deliberately not
// one of them: he is the only unit that can repair the bunker (and the armor
// around it), and a bunker standing next to him would otherwise swallow him the
// moment he was told to hold.
const GARRISONS = (t: UnitType) => TRANSPORTABLE.has(t) && t !== UnitType.ENGINEER;

// Foot units that can dig in while holding position
const ENTRENCHABLE = new Set([
  UnitType.SOLDIER, UnitType.SNIPER, UnitType.SPECIAL_FORCES, UnitType.FLAMETHROWER,
  UnitType.MEDIC, UnitType.ENGINEER, UnitType.MORTAR, UnitType.AIRBORNE,
]);

// interval: spawn cadence · incomeBonus: economy edge · special: strike frequency
// counterSmart: chance per cycle it reads your army and counter-picks
// commands: how eagerly it buys economy upgrades / sounds the rally (0 = never)
// stanceIQ: dynamically switches its army stance (regroup when weak, push when strong)
const CPU_DIFFICULTY: Record<CpuDifficulty, { interval: number, incomeBonus: number, special: number, counterSmart: number, commands: number, stanceIQ: boolean }> = {
  easy:   { interval: 1.9,  incomeBonus: 0,    special: 0.3, counterSmart: 0.3, commands: 0,   stanceIQ: false },
  normal: { interval: 1.0,  incomeBonus: 0.05, special: 1.0, counterSmart: 0.8, commands: 0.7, stanceIQ: false },
  hard:   { interval: 0.62, incomeBonus: 0.15, special: 1.5, counterSmart: 1.0, commands: 1.2, stanceIQ: true },
};

// Tactical minimap: a Canvas-2D overview drawn straight from the engine refs at
// ~7fps. Terrain (river, bridges, hills, buildings), smoke, the capture point and
// every fielded unit as a team-colored dot; air units render as a small cross.
const AIR_TYPES = new Set([UnitType.HELICOPTER, UnitType.FIGHTER, UnitType.DRONE, UnitType.GUNSHIP]);

// Imperative camera controls handed up by GameScene (buttons + minimap viewport)
export type CamApi = {
  zoom: (f: number) => void;
  pan: (dx: number) => void;
  reset: () => void;
  state: () => { dist: number, tx: number, tz: number } | null;
  panTo: (x: number) => void;
};

const MiniMap: React.FC<{
  unitsRef: React.MutableRefObject<Unit[]>;
  terrainRef: React.MutableRefObject<TerrainObject[]>;
  smokesRef: React.MutableRefObject<SmokeZone[]>;
  captureRef: React.MutableRefObject<CapturePoint>;
  flankCapsRef: React.MutableRefObject<CapturePoint[]>;
  camApiRef: React.MutableRefObject<CamApi | null>;
  compact?: boolean;
  cb?: boolean;
}> = ({ unitsRef, terrainRef, smokesRef, captureRef, flankCapsRef, camApiRef, compact, cb }) => {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const W = compact ? 104 : 150;
  const H = compact ? 48 : 68;

  useEffect(() => {
    // Battle happens between the horizon and the bottom edge; map that band.
    const Y0 = HORIZON_Y - 10;
    const sx = W / CANVAS_WIDTH;
    const sy = H / (CANVAS_HEIGHT - Y0);
    const mx = (x: number) => x * sx;
    const my = (y: number) => (y - Y0) * sy;

    const draw = () => {
      const ctx = cvRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const eastUi = cb ? '#fbbf24' : '#f87171';
      ctx.fillStyle = 'rgba(28, 37, 26, 0.92)';
      ctx.fillRect(0, 0, W, H);

      for (const t of terrainRef.current) {
        if (t.type === 'river') {
          ctx.fillStyle = '#27546b';
          ctx.fillRect(mx(t.x - (t.width ?? 40) / 2), my(t.y - (t.height ?? 22) / 2),
            Math.max(1.5, (t.width ?? 40) * sx), Math.max(1.5, (t.height ?? 22) * sy));
        } else if (t.type === 'hill') {
          ctx.fillStyle = 'rgba(96, 88, 60, 0.5)';
          ctx.beginPath();
          ctx.arc(mx(t.x), my(t.y), Math.max(1.5, t.size * sx * 0.55), 0, Math.PI * 2);
          ctx.fill();
        } else if (t.type === 'building') {
          ctx.fillStyle = 'rgba(120, 113, 108, 0.55)';
          const s = Math.max(1.5, (t.width ?? t.size) * sx * 0.7);
          ctx.fillRect(mx(t.x) - s / 2, my(t.y) - s / 2, s, s);
        }
      }
      for (const t of terrainRef.current) {
        if (t.type !== 'bridge') continue;
        ctx.fillStyle = '#a8825f';
        ctx.fillRect(mx(t.x - (t.width ?? 85) / 2), my(t.y - (t.height ?? 40) / 2),
          Math.max(2, (t.width ?? 85) * sx), Math.max(2, (t.height ?? 40) * sy));
      }
      for (const s of smokesRef.current) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.3)';
        ctx.beginPath();
        ctx.arc(mx(s.x), my(s.y), Math.max(2, s.radius * sx), 0, Math.PI * 2);
        ctx.fill();
      }

      for (const cap of [captureRef.current, ...flankCapsRef.current]) {
        ctx.strokeStyle = cap.owner === Team.WEST ? '#60a5fa' : cap.owner === Team.EAST ? eastUi : cb ? '#e7e5e4' : '#fbbf24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mx(cap.x), my(cap.y), Math.max(2.5, cap.radius * sx), 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const u of unitsRef.current) {
        if (u.boarded) continue;
        const x = mx(u.position.x), y = my(u.position.y);
        ctx.fillStyle = u.team === Team.WEST ? '#60a5fa' : eastUi;
        if (AIR_TYPES.has(u.type)) {
          ctx.fillRect(x - 1.8, y - 0.6, 3.6, 1.2);
          ctx.fillRect(x - 0.6, y - 1.8, 1.2, 3.6);
        } else {
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
      }

      // Camera viewport bracket: the horizontal span currently on screen.
      // At the default framing (dist ≈ 735) the whole 800-wide field is
      // visible, so span ≈ dist * 1.09 empirically; pan is x-only.
      const cam = camApiRef.current?.state();
      if (cam) {
        const halfSpan = Math.min(CANVAS_WIDTH, cam.dist * 1.09) / 2;
        const x0 = Math.max(0, mx(cam.tx - halfSpan));
        const x1 = Math.min(W, mx(cam.tx + halfSpan));
        if (x1 - x0 < W - 2) { // hide when everything is visible anyway
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, H - 1);
        }
      }
    };

    draw();
    const id = window.setInterval(draw, 150);
    return () => window.clearInterval(id);
  }, [W, H, unitsRef, terrainRef, smokesRef, captureRef, cb]);

  // Click-to-pan: jump the camera to the clicked spot (pan is x-only)
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const worldX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    camApiRef.current?.panTo(worldX);
  };

  return (
    <canvas
      ref={cvRef}
      width={W}
      height={H}
      data-testid="minimap"
      onClick={onClick}
      title="Click to move the camera"
      className="absolute top-2 right-2 z-30 rounded border border-stone-600/80 shadow-lg opacity-90 cursor-pointer"
    />
  );
};

// Post-match timeline: score (or base HP) per team over the whole battle
const TimelineGraph: React.FC<{ history: { t: number, w: number, e: number }[] }> = ({ history }) => {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const W = 264, H = 72;
  useEffect(() => {
    const ctx = cvRef.current?.getContext('2d');
    if (!ctx || history.length < 2) return;
    ctx.clearRect(0, 0, W, H);
    const maxV = Math.max(1, ...history.map(s => Math.max(s.w, s.e)));
    const maxT = history[history.length - 1].t || 1;
    const px = (t: number) => 4 + (t / maxT) * (W - 8);
    const py = (v: number) => H - 6 - (v / maxV) * (H - 12);
    ctx.strokeStyle = 'rgba(120, 113, 108, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, H - 6);
    ctx.lineTo(W - 4, H - 6);
    ctx.stroke();
    for (const [key, color] of [['w', '#60a5fa'], ['e', '#f87171']] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      history.forEach((s, i) => { const x = px(s.t), y = py(s[key]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }, [history]);
  return <canvas ref={cvRef} width={W} height={H} data-testid="timeline" className="rounded border border-stone-700 bg-stone-950/60" />;
};

interface GameCanvasProps {
  onGameStateChange: (state: GameState) => void;
  spawnQueue: { team: Team, type: UnitType, cost?: number, offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string, lane?: SpawnLane }[];
  clearSpawnQueue: () => void;
  onCanvasClick: (x: number, y: number) => void;
  targetingInfo: { team: Team, type: UnitType } | null;
  cpuTeams: Team[]; // one entry = normal CPU opponent; two = CPU-vs-CPU spectator/balance mode
  cpuDifficulty: CpuDifficulty;
  mapType: MapType;
  paused: boolean;
  gameSpeed: number;
  gameMode: GameMode;
  stances: Record<Team, Stance>;
  commandQueue: { team: Team, cmd: TeamCommand }[];
  clearCommandQueue: () => void;
  // Per-unit orders: null order = clear the override (follow team stance)
  orderQueue: { ids: string[], order: Stance | null }[];
  clearOrderQueue: () => void;
  onSelectUnits?: (team: Team, ids: string[]) => void;
  selectedIds?: string[];
  compact?: boolean; // mobile-landscape layout: slimmer chrome, no 640px floor
  fx?: 'high' | 'low'; // render quality, passed through to GameScene
  cb?: boolean; // colorblind-assist: East reads as amber in UI seams
  // Challenge mode: handicap on the human side's starting money (applied at
  // mount only) and a completion callback when the human wins
  startMoneyMult?: number;
  challengeId?: string | null;
  onChallengeWon?: (id: string, durSec: number) => void;
  // Measured canvas size from App's layout observer. When provided these win
  // over the internal window-based estimate, making the battlefield fit the
  // real space between header, side panels and command bar exactly.
  viewW?: number;
  viewH?: number;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  onGameStateChange,
  spawnQueue,
  clearSpawnQueue,
  onCanvasClick,
  targetingInfo,
  cpuTeams,
  cpuDifficulty,
  mapType,
  paused,
  gameSpeed,
  gameMode,
  stances,
  commandQueue,
  clearCommandQueue,
  orderQueue,
  clearOrderQueue,
  onSelectUnits,
  selectedIds,
  compact,
  fx,
  cb,
  startMoneyMult,
  challengeId,
  onChallengeWon,
  viewW,
  viewH,
}) => {
  const requestRef = useRef<number>(0);
  const [gameOver, setGameOver] = useState<Team | null>(null);

  // Responsive 16:9 viewport — R3F resizes the canvas, clicks stay correct via raycasting
  const [viewSize, setViewSize] = useState({ w: 800, h: 450 });
  useEffect(() => {
    // App measures the real chrome (header/panels/command bar) and passes the
    // exact fit; the window-based estimate below is only a fallback.
    if (viewW && viewH) {
      setViewSize(prev => (prev.w === viewW && prev.h === viewH) ? prev : { w: viewW, h: viewH });
      return;
    }
    const compute = () => {
      const availW = window.innerWidth - (compact ? 200 : 220);
      const availH = window.innerHeight - (compact ? 126 : 285);
      let w = Math.min(availW, availH * (800 / 450));
      w = Math.max(compact ? 300 : 640, Math.min(1440, w));
      setViewSize({ w: Math.round(w), h: Math.round(w * (450 / 800)) });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => { window.removeEventListener('resize', compute); window.removeEventListener('orientationchange', compute); };
  }, [compact, viewW, viewH]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const terrainRef = useRef<TerrainObject[]>([]);
  const flyoversRef = useRef<Flyover[]>([]);
  const terraformRef = useRef<TerrainObject[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const lasersRef = useRef<LaserStrike[]>([]);
  const cratesRef = useRef<SupplyCrate[]>([]);
  const nextCrateTickRef = useRef(1500); // first drop ~25s in
  const smokesRef = useRef<SmokeZone[]>([]);
  const SMOKE_LIFE = 780; // ~13s of concealment
  const ENTRENCH_TICKS = 360; // ~6s stationary under 'hold' orders to dig in
  // Battle-event feed shown in the HUD; new array identity per emit so React sees the change
  const eventsRef = useRef<GameEvent[]>([]);
  const pushEvent = (kind: GameEvent['kind'], text: string, team?: Team) => {
    eventsRef.current = [...eventsRef.current.slice(-7), { id: generateId(), time: Date.now(), kind, text, team }];
  };
  const teamName = (t: Team) => t === Team.WEST ? 'West' : 'East';
  const unitLabel = (t: UnitType) =>
    t === UnitType.ANTI_AIR ? 'Anti-Air' : t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
  const LASER_DESIGNATE = 55; // red targeting beam before the real one fires
  const LASER_LIFE = 235;     // designate + ~3s burn
  const flashOpacity = useRef(0);
  const shakeRef = useRef(0); // camera shake magnitude, decays in GameScene
  const weatherRef = useRef<'clear' | 'rain' | 'snow' | 'fog' | 'storm'>('clear');
  const weatherTimerRef = useRef(Date.now() + 10000);
  // Pre-rolled upcoming weather so the HUD can warn the player ahead of time
  const nextWeatherRef = useRef<'clear' | 'rain' | 'snow' | 'fog' | 'storm'>((() => {
    const r = Math.random();
    return r < 0.28 ? 'rain' : r < 0.44 ? 'snow' : r < 0.56 ? 'fog' : r < 0.65 ? 'storm' : 'clear';
  })());
  const CAPTURE_TICKS = 300; // ~5s of uncontested presence to flip
  const captureRef = useRef<CapturePoint>({
    x: CANVAS_WIDTH / 2,
    y: HORIZON_Y + (CANVAS_HEIGHT - HORIZON_Y) / 2,
    radius: 60,
    owner: null,
    progress: 0,
  });
  // Flank posts: smaller income bonuses on the top/bottom lanes, placed
  // point-symmetric about the center so neither side gets a shorter walk
  const flankCapsRef = useRef<CapturePoint[]>([
    { x: 310, y: HORIZON_Y + 62, radius: 42, owner: null, progress: 0, bonus: 0.12 },
    { x: 490, y: CANVAS_HEIGHT - 62, radius: 42, owner: null, progress: 0, bonus: 0.12 },
  ]);
  const cpuTimerRef = useRef({ [Team.WEST]: 0, [Team.EAST]: 0 });
  const cpuRef = useRef<{ teams: Team[], difficulty: CpuDifficulty }>({ teams: cpuTeams, difficulty: cpuDifficulty });
  const speedRef = useRef<{ paused: boolean, speed: number }>({ paused, speed: gameSpeed });
  const statsRef = useRef({
    [Team.WEST]: { built: 0, lost: 0 },
    [Team.EAST]: { built: 0, lost: 0 },
  });
  // Balance telemetry: per-team, per-unit-type counters (kills, value of kills, losses, spawns)
  const typeStatsRef = useRef<Record<Team, { kills: Record<string, number>, killValue: Record<string, number>, lost: Record<string, number>, spawned: Record<string, number> }>>({
    [Team.WEST]: { kills: {}, killValue: {}, lost: {}, spawned: {} },
    [Team.EAST]: { kills: {}, killValue: {}, lost: {}, spawned: {} },
  });
  const matchStartRef = useRef(Date.now());
  // Score-over-time samples for the victory-screen timeline (one every ~5s)
  const scoreHistoryRef = useRef<{ t: number, w: number, e: number }[]>([]);
  const lastSampleRef = useRef(0);
  const baseHPRef = useRef({ [Team.WEST]: BASE_HP, [Team.EAST]: BASE_HP });
  const gameModeRef = useRef<GameMode>(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  const stancesRef = useRef<Record<Team, Stance>>(stances);
  useEffect(() => {
    // The hard CPU steers its own stance — don't let UI state overwrite it
    const next = { ...stances };
    cpuRef.current.teams.forEach(t => { next[t] = stancesRef.current[t]; });
    stancesRef.current = next;
  }, [stances]);

  // Double-click detection for own-unit selection (expand to all of a type)
  const lastUnitClickRef = useRef<{ id: string, time: number }>({ id: '', time: 0 });

  // Focus fire: clicking an enemy unit makes your side prioritize it for a few seconds
  const focusRef = useRef<Record<Team, { targetId: string | null, until: number }>>({
    [Team.WEST]: { targetId: null, until: 0 },
    [Team.EAST]: { targetId: null, until: 0 },
  });

  // Drag-select: the side you actually command (spectator matches have none)
  const humanTeam = ([Team.WEST, Team.EAST] as Team[]).find(t => !cpuTeams.includes(t)) ?? null;
  const [marquee, setMarquee] = useState<Marquee>(null);
  // Releasing a marquee also lands as a click on open ground, and that click
  // clears the selection we just made. Swallow exactly one click after a drag —
  // a time window is no good, because R3F dispatches the click on the next frame
  // and a slow frame can be hundreds of milliseconds wide. The flag is re-armed
  // by the drag and cleared by the next press, so it can never eat a stray click.
  const swallowClickRef = useRef(false);
  const handleBoxSelect = useCallback((team: Team, ids: string[]) => {
    swallowClickRef.current = true;
    onSelectUnits?.(team, ids);
    if (ids.length) soundService.playSpawnSound(team === Team.EAST);
  }, [onSelectUnits]);
  const handleDragStart = useCallback(() => { swallowClickRef.current = false; }, []);
  const handleCanvasClickGuarded = useCallback((x: number, y: number) => {
    if (swallowClickRef.current) { swallowClickRef.current = false; return; }
    onCanvasClick(x, y);
  }, [onCanvasClick]);

  const handleUnitClick = (clicked: Unit) => {
    // Strike targeting takes priority — drop the strike on the clicked unit
    if (targetingInfo) { onCanvasClick(clicked.position.x, clicked.position.y); return; }
    if (clicked.type === UnitType.MINE_PERSONAL || clicked.type === UnitType.MINE_TANK || clicked.type === UnitType.NAPALM) {
      onCanvasClick(clicked.position.x, clicked.position.y); return;
    }
    // Clicking one of your own units selects it (whole squad for squad-spawned
    // infantry). A quick second click on the same unit expands the selection
    // to every unit of that type on your team.
    if (!cpuTeams.includes(clicked.team)) {
      const now = Date.now();
      const last = lastUnitClickRef.current;
      const isDouble = last.id === clicked.id && now - last.time < 400;
      lastUnitClickRef.current = { id: clicked.id, time: now };

      const selectable = (u: Unit) => u.team === clicked.team && u.health > 0 && !u.boarded &&
        u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM;
      const ids = isDouble
        ? unitsRef.current.filter(u => selectable(u) && u.type === clicked.type).map(u => u.id)
        : unitsRef.current.filter(u => selectable(u) && (u.id === clicked.id || (!!clicked.squadId && u.squadId === clicked.squadId))).map(u => u.id);
      onSelectUnits?.(clicked.team, ids);
      soundService.playSpawnSound(clicked.team === Team.EAST);
      return;
    }
    const focuser = clicked.team === Team.WEST ? Team.EAST : Team.WEST;
    if (cpuTeams.includes(focuser)) return; // can't give orders to the CPU's army
    focusRef.current[focuser] = { targetId: clicked.id, until: Date.now() + 6000 };
    soundService.playHitSound();
  };
  // Latest click handler for the tick closure's test hook (headless runs
  // can't raycast-click 3D unit meshes reliably)
  const handleUnitClickRef = useRef(handleUnitClick);
  handleUnitClickRef.current = handleUnitClick;

  useEffect(() => { cpuRef.current = { teams: cpuTeams, difficulty: cpuDifficulty }; }, [cpuTeams, cpuDifficulty]);
  useEffect(() => { speedRef.current = { paused, speed: gameSpeed }; }, [paused, gameSpeed]);

  // End-of-game audio: fanfare when a human side wins (or in spectate),
  // a somber sting when the CPU takes it. Both stop the battle music.
  useEffect(() => {
    if (!gameOver) return;
    soundService.setRotorLoop(false);
    // Close the timeline with the final standings
    const hp = gameModeRef.current === 'basehp';
    scoreHistoryRef.current.push({
      t: Date.now() - matchStartRef.current,
      w: hp ? baseHPRef.current[Team.WEST] : scoreRef.current[Team.WEST],
      e: hp ? baseHPRef.current[Team.EAST] : scoreRef.current[Team.EAST],
    });
    const humanWon = !cpuRef.current.teams.includes(gameOver);
    if (humanWon || cpuRef.current.teams.length === 2) soundService.playVictorySound();
    else soundService.playDefeatSound();
    if (humanWon && challengeId && cpuRef.current.teams.length === 1) onChallengeWon?.(challengeId, Math.round((Date.now() - matchStartRef.current) / 1000));
    // Record the result for the splash screen's Recent Battles panel
    try {
      const rec = {
        when: Date.now(),
        map: mapType,
        mode: gameModeRef.current,
        winner: gameOver,
        w: hp ? baseHPRef.current[Team.WEST] : scoreRef.current[Team.WEST],
        e: hp ? baseHPRef.current[Team.EAST] : scoreRef.current[Team.EAST],
        dur: Math.round((Date.now() - matchStartRef.current) / 1000),
        spectate: cpuRef.current.teams.length === 2,
      };
      const hist = JSON.parse(localStorage.getItem('ewv-history') || '[]');
      hist.unshift(rec);
      localStorage.setItem('ewv-history', JSON.stringify(hist.slice(0, 10)));
    } catch { /* ignore */ }
  }, [gameOver]);

  // Rotor ambience while any helicopter is fielded (single shared loop)
  useEffect(() => {
    const id = window.setInterval(() => {
      const heliUp = !gameOverRef.current && !speedRef.current.paused &&
        unitsRef.current.some(u => u.type === UnitType.HELICOPTER && !u.boarded);
      soundService.setRotorLoop(heliUp);
    }, 1000);
    return () => { window.clearInterval(id); soundService.setRotorLoop(false); };
  }, []);
  // Latest selection callback for use inside the stale tick closure (debug hook)
  const onSelectUnitsRef = useRef(onSelectUnits);
  useEffect(() => { onSelectUnitsRef.current = onSelectUnits; }, [onSelectUnits]);

  // On-screen camera buttons: GameScene hands us an imperative zoom/pan/reset
  // API; holding a button repeats its action for smooth motion.
  const camApiRef = useRef<CamApi | null>(null);
  const handleCameraApi = useCallback((api: CamApi) => { camApiRef.current = api; }, []);
  const camHoldRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const camHoldStop = () => { if (camHoldRef.current) { clearInterval(camHoldRef.current); camHoldRef.current = null; } };
  const camHoldStart = (fn: () => void, repeat = true) => {
    fn();
    camHoldStop();
    if (repeat) camHoldRef.current = setInterval(fn, 40);
  };

  // Debug Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        weatherRef.current = weatherRef.current === 'clear' ? 'rain' : 'clear';
        weatherTimerRef.current = Date.now() + 20000; // Lock state for 20s
        nextWeatherRef.current = 'clear';
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

    // Battlefield props: a handful of supply crates & fuel barrels scattered
    // over contested ground. Decorative until something breaks them — kept
    // sparse on purpose so they don't clutter the map.
    {
      const riverSegs = t.filter(o => o.type === 'river');
      let placed = 0;
      for (let i = 0; i < 160 && placed < 8; i++) {
        const x = 140 + Math.random() * (CANVAS_WIDTH - 280);
        const y = HORIZON_Y + 25 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 50);
        if (avoidCheck(x, y, 12, riverSegs, 55)) continue;
        if (t.some(o => (o.type === 'crate' || o.type === 'barrel') && Math.sqrt((o.x - x) ** 2 + (o.y - y) ** 2) < 70)) continue;
        const isBarrel = Math.random() < 0.3;
        t.push({ id: gid(), x, y, type: isBarrel ? 'barrel' : 'crate', size: 6 + Math.random() * 4, health: 1 });
        // Crates often sit in pairs — reads as a dropped supply cache
        if (!isBarrel && Math.random() < 0.4) {
          t.push({ id: gid(), x: x + 9 + Math.random() * 4, y: y + (Math.random() - 0.5) * 8, type: 'crate', size: 5 + Math.random() * 3, health: 1 });
        }
        placed++;
      }
    }

    // Bridges are destructible: explosives damage them, engineers repair them
    t.forEach(o => { if (o.type === 'bridge') { o.health = BRIDGE_HP; o.state = 'normal'; } });

    terrainRef.current = t;
  }, [mapType]);

  // Optimize: Local frame state to drive R3F, decoupled from App state
  const [frame, setFrame] = useState(0);
  const lastUiUpdateRef = useRef(0);

  const unitsRef = useRef<Unit[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const scoreRef = useRef({ [Team.WEST]: 0, [Team.EAST]: 0 });
  // Challenge handicap scales the HUMAN sides' opening funds only
  const moneyRef = useRef({
    [Team.WEST]: INITIAL_MONEY * (cpuTeams.includes(Team.WEST) ? 1 : (startMoneyMult ?? 1)),
    [Team.EAST]: INITIAL_MONEY * (cpuTeams.includes(Team.EAST) ? 1 : (startMoneyMult ?? 1)),
  });
  const spatialHash = useRef(new SpatialHash(60)); // 60px grid cell

  // Team commands: economy upgrades (permanent income levels) and the rally
  // horn (short team-wide surge on a long cooldown)
  const incomeLevelRef = useRef({ [Team.WEST]: 0, [Team.EAST]: 0 });
  const rallyRef = useRef<Record<Team, RallyState>>({
    [Team.WEST]: { until: 0, readyAt: 0 },
    [Team.EAST]: { until: 0, readyAt: 0 },
  });

  // Execute a command if affordable/off-cooldown — shared by player & CPU
  const runCommand = (team: Team, cmd: TeamCommand): boolean => {
    if (cmd === 'income') {
      const lvl = incomeLevelRef.current[team];
      const cost = INCOME_UPGRADE_BASE_COST * (lvl + 1);
      if (lvl >= INCOME_UPGRADE_MAX || moneyRef.current[team] < cost) return false;
      moneyRef.current[team] -= cost;
      incomeLevelRef.current[team] = lvl + 1;
      pushEvent('command', `${teamName(team)} economy upgraded to level ${lvl + 1} (+${Math.round(INCOME_UPGRADE_BONUS * (lvl + 1) * 100)}% income)`, team);
      soundService.playHealSound();
      return true;
    }
    const r = rallyRef.current[team];
    const now = Date.now();
    if (now < r.readyAt || moneyRef.current[team] < RALLY_COST) return false;
    moneyRef.current[team] -= RALLY_COST;
    r.until = now + RALLY_DURATION_MS;
    r.readyAt = now + RALLY_COOLDOWN_MS;
    pushEvent('command', `${teamName(team)} sounds the rally horn — all units surge!`, team);
    soundService.playRallySound();
    return true;
  };

  const getScaleAt = (y: number) => {
    const t = (y - HORIZON_Y) / (CANVAS_HEIGHT - HORIZON_Y);
    return MIN_SCALE + t * (MAX_SCALE - MIN_SCALE);
  };

  const spawnUnit = useCallback((team: Team, type: UnitType, options?: { offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string, lane?: SpawnLane }) => {
    const config = UNIT_CONFIG[type] as any;

    // Satellite laser: no delivery vehicle — a designator, then a beam from orbit
    if (type === UnitType.SATELLITE && options?.absolutePos) {
      lasersRef.current.push({
        id: generateId(), team,
        x: options.absolutePos.x, y: options.absolutePos.y,
        life: LASER_LIFE, maxLife: LASER_LIFE,
        radius: (UNIT_CONFIG[UnitType.SATELLITE] as any).radius,
      });
      soundService.playZapSound();
      return;
    }

    // Cruise missile: launched from a ship somewhere off the bottom edge
    if (type === UnitType.CRUISE && options?.absolutePos) {
      const cfg = UNIT_CONFIG[UnitType.CRUISE] as any;
      const startX = options.absolutePos.x + (Math.random() - 0.5) * 220;
      const startY = CANVAS_HEIGHT + 160;
      const flightTicks = 95;
      missilesRef.current.push({
        id: generateId(), team,
        target: { ...options.absolutePos },
        current: { x: startX, y: startY },
        velocity: { x: (options.absolutePos.x - startX) / flightTicks, y: (options.absolutePos.y - startY) / flightTicks },
        isCruise: true,
        customDamage: cfg.damage,
        customRadius: cfg.radius,
      });
      soundService.playRocketSound();
      return;
    }

    if (type === UnitType.SMOKE && options?.absolutePos) {
      const cfg = UNIT_CONFIG[UnitType.SMOKE] as any;
      smokesRef.current.push({
        id: generateId(), team,
        x: options.absolutePos.x, y: options.absolutePos.y,
        life: SMOKE_LIFE, maxLife: SMOKE_LIFE, radius: cfg.radius,
      });
      typeStatsRef.current[team].spawned[UnitType.SMOKE] = (typeStatsRef.current[team].spawned[UnitType.SMOKE] || 0) + 1;
      // Canister pop + initial burst of grey billows
      soundService.playFlameSound();
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * cfg.radius * 0.7;
        particlesRef.current.push({
          id: generateId(),
          position: { x: options.absolutePos.x + Math.cos(a) * d, y: options.absolutePos.y + Math.sin(a) * d },
          velocity: { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.6 },
          drag: 0.96, life: 90 + Math.random() * 60,
          color: Math.random() > 0.5 ? '#d6d3d1' : '#a8a29e',
          size: 10 + Math.random() * 12, alt: 2 + Math.random() * 8, altVel: 0.25,
        });
      }
      return;
    }

    // Gunboat must anchor on open water — reject dry-land clicks (no charge)
    if (type === UnitType.GUNBOAT && options?.absolutePos) {
      const p = options.absolutePos;
      const onWater = terrainRef.current.some(t => t.type === 'river' &&
        Math.abs(p.x - t.x) < (t.width ?? 40) / 2 + 16 &&
        Math.abs(p.y - t.y) < (t.height ?? 22) / 2 + 16);
      if (!onWater) {
        pushEvent('command', `${teamName(team)} gunboat needs open water — deployment aborted`, team);
        return false;
      }
    }

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
      if (type === UnitType.NUKE) pushEvent('strike', `☢ ${teamName(team)} nuclear strike inbound!`, team);
      return;
    }

    let xPos = team === Team.WEST ? 30 : CANVAS_WIDTH - 30;
    // Lane-biased spawn Y: top/mid/bot thirds of the playable band, else anywhere
    const playTop = HORIZON_Y + 50;
    const playH = CANVAS_HEIGHT - HORIZON_Y - 100;
    let yPos =
      options?.lane === 'top' ? playTop + Math.random() * (playH / 3) :
      options?.lane === 'mid' ? playTop + playH / 3 + Math.random() * (playH / 3) :
      options?.lane === 'bot' ? playTop + (2 * playH) / 3 + Math.random() * (playH / 3) :
      playTop + Math.random() * playH;

    if (options?.absolutePos) { xPos = options.absolutePos.x; yPos = options.absolutePos.y; }
    else if (options?.offset) { xPos += options.offset.x; yPos += options.offset.y; }

    // A bunker is poured, not dropped: it spends BUNKER_BUILD_MS as a building
    // site — no guns, and only a fraction of its concrete — so placing one on
    // top of the enemy is a way to lose $155.
    const isBunker = type === UnitType.BUNKER;

    const newUnit: Unit = {
      id: generateId(), team, type,
      position: { x: xPos, y: yPos },
      state: UnitState.MOVING,
      health: isBunker ? config.health * BUNKER_BUILD_START_HP : config.health,
      maxHealth: config.health,
      attackCooldown: 0, targetId: null,
      width: config.width, height: config.height,
      spawnTime: Date.now(), isInCover: false,
      squadId: options?.squadId,
      ...(isBunker ? { buildUntil: Date.now() + BUNKER_BUILD_MS, garrison: 0 } : {}),
    };

    unitsRef.current.push(newUnit);
    if (type !== UnitType.NAPALM && type !== UnitType.MINE_PERSONAL && type !== UnitType.MINE_TANK) {
      soundService.playSpawnSound(team === Team.EAST);
      statsRef.current[team].built++;
    }
    const sp = typeStatsRef.current[team];
    sp.spawned[type] = (sp.spawned[type] || 0) + 1;
  }, []);

  useEffect(() => {
    if (commandQueue.length > 0) {
      commandQueue.forEach(c => runCommand(c.team, c.cmd));
      clearCommandQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandQueue, clearCommandQueue]);

  // Per-unit order overrides from the selection panel
  useEffect(() => {
    if (orderQueue.length > 0) {
      orderQueue.forEach(({ ids, order }) => {
        const idSet = new Set(ids);
        unitsRef.current.forEach(u => {
          if (!idSet.has(u.id)) return;
          if (order === null) delete u.orders;
          else u.orders = order;
        });
      });
      clearOrderQueue();
    }
  }, [orderQueue, clearOrderQueue]);

  useEffect(() => {
    if (spawnQueue.length > 0) {
      spawnQueue.forEach(req => {
        const ok = spawnUnit(req.team, req.type, { offset: req.offset, absolutePos: req.absolutePos, squadId: req.squadId, lane: req.lane });
        if (ok !== false && req.cost) {
          moneyRef.current[req.team] = Math.max(0, moneyRef.current[req.team] - req.cost);
        }
      });
      clearSpawnQueue();
    }
  }, [spawnQueue, spawnUnit, clearSpawnQueue]);

  const tickCountRef = useRef(0);
  // FX telemetry: particles ALIVE decays every tick, so sampling it cannot tell
  // you how big one shot was. These are monotonic counts of what was created.
  const fxStatsRef = useRef({ shots: 0, fireParticles: 0, hits: 0, impactParticles: 0 });

  const update = useCallback(() => {
    const time = Date.now();
    tickCountRef.current++;
    // Staggers O(terrain)/O(units) searches: each unit re-evaluates every 4th tick
    const isSearchTick = (u: Unit) =>
      ((tickCountRef.current + u.id.charCodeAt(0) + u.id.charCodeAt(u.id.length - 1)) & 3) === 0;

    // Break a battlefield prop: crates splinter, barrels cook off with a small
    // neutral blast (damages both teams, never chains into other barrels).
    const breakProp = (p: TerrainObject) => {
      if (p.state === 'broken') return;
      p.state = 'broken';
      p.health = 720; // debris lingers ~12s, then gets swept from the terrain list
      if (p.type === 'barrel') {
        soundService.playMineExplosion();
        spatialHash.current.queryCallback(p.x, p.y, 28, u => {
          if (Math.sqrt((u.position.x - p.x) ** 2 + (u.position.y - p.y) ** 2) < 28 && !(UNIT_CONFIG[u.type] as any).isFlying) {
            u.health -= 16;
            u.lastHitTime = Date.now();
          }
        });
        for (let k = 0; k < 8; k++) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: p.x + (Math.random() - 0.5) * 10, y: p.y + (Math.random() - 0.5) * 8 },
            velocity: { x: (Math.random() - 0.5) * 1.4, y: (Math.random() - 0.5) * 1.4 },
            drag: 0.9, life: 30, color: k % 2 === 0 ? '#f97316' : '#fbbf24',
            size: 5 + Math.random() * 5, alt: 3 + Math.random() * 8, altVel: 0.7,
          });
        }
        particlesRef.current.push({ id: generateId(), position: { x: p.x, y: p.y }, life: 700, color: '#1c1917', size: 14, isGroundDecal: true });
      } else {
        soundService.playCrackSound();
        for (let k = 0; k < 6; k++) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: p.x + (Math.random() - 0.5) * 8, y: p.y + (Math.random() - 0.5) * 6 },
            velocity: { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 1.2 },
            drag: 0.9, life: 24, color: k % 2 === 0 ? '#8a6a3b' : '#5c4326',
            size: 2.5 + Math.random() * 2.5, alt: 3 + Math.random() * 6, altVel: 0.6,
          });
        }
      }
    };

    // Everything that leaves the barrel when a unit shoots, per its FIRE_FX
    // signature (constants.ts). All of it rides the instanced particle path —
    // fast weapons fire many times a second, so nothing here may be a special
    // particle (those cost a React component and a draw call each).
    const fireFx = (unit: Unit, angle: number) => {
      const fx = getFireFx(unit.type);
      fxStatsRef.current.shots++;
      fxStatsRef.current.fireParticles += fx.smoke + fx.dust + fx.brass + fx.sparks;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const mx = unit.position.x + cos * 16;   // roughly at the muzzle
      const my = unit.position.y + sin * 16;

      if (fx.shake > 0) shakeRef.current = Math.max(shakeRef.current, fx.shake);

      // Smoke: shoved out of the bore, slows fast and drifts up
      for (let i = 0; i < fx.smoke; i++) {
        const s = 0.5 + Math.random();
        particlesRef.current.push({
          id: generateId(),
          position: { x: mx + (Math.random() - 0.5) * 6, y: my + (Math.random() - 0.5) * 6 },
          velocity: { x: cos * s + (Math.random() - 0.5) * 0.5, y: sin * s + (Math.random() - 0.5) * 0.5 },
          drag: 0.86,
          life: 24 + Math.random() * 16,
          color: Math.random() < 0.5 ? '#9ca3af' : '#d1d5db',
          size: 3 + Math.random() * 4,
          alt: 9, altVel: 0.22,
        });
      }
      // Dust: the blast slaps the ground and throws a low, wide sheet forward
      for (let i = 0; i < fx.dust; i++) {
        const spread = (Math.random() - 0.5) * 1.1;
        const s = 0.7 + Math.random() * 1.3;
        particlesRef.current.push({
          id: generateId(),
          position: { x: mx, y: my },
          velocity: { x: Math.cos(angle + spread) * s, y: Math.sin(angle + spread) * s },
          drag: 0.88,
          life: 18 + Math.random() * 14,
          color: Math.random() < 0.5 ? '#b9a476' : '#8a7a58',
          size: 2.5 + Math.random() * 3.5,
          alt: 2, altVel: 0.06,
        });
      }
      // Brass: ejected sideways, tumbling down out of the breech
      for (let i = 0; i < fx.brass; i++) {
        const side = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
        const s = 0.4 + Math.random() * 0.5;
        particlesRef.current.push({
          id: generateId(),
          position: { x: unit.position.x, y: unit.position.y },
          velocity: { x: Math.cos(angle + side) * s, y: Math.sin(angle + side) * s },
          drag: 0.93,
          life: 14 + Math.random() * 8,
          color: '#facc15',
          size: 1 + Math.random(),
          alt: 11, altVel: -0.55,   // falls
        });
      }
      // Sparks: burning propellant, straight out of the muzzle and gone
      for (let i = 0; i < fx.sparks; i++) {
        const spread = (Math.random() - 0.5) * 0.7;
        const s = 1.6 + Math.random() * 1.6;
        particlesRef.current.push({
          id: generateId(),
          position: { x: mx, y: my },
          velocity: { x: Math.cos(angle + spread) * s, y: Math.sin(angle + spread) * s },
          drag: 0.8,
          life: 7 + Math.random() * 5,
          color: Math.random() < 0.5 ? '#fed7aa' : '#fb923c',
          size: 1.2 + Math.random() * 1.6,
          alt: 10, altVel: 0,
        });
      }
    };

    // What a round does when it lands. Scaled by the damage ACTUALLY dealt (so a
    // shot soaked by cover lands softer) and flavored by what it hits: steel
    // throws sparks and shards, troops kick up dust. Instanced particles only.
    const impactFx = (x: number, y: number, damage: number, dir: number, onMetal: boolean) => {
      const w = Math.max(0, Math.min(1, damage / 70));   // 0 = rifle round, 1 = shell
      fxStatsRef.current.hits++;
      fxStatsRef.current.impactParticles += (3 + Math.round(w * 11)) + Math.round(w * 5);
      if (damage >= IMPACT_SHAKE_MIN_DAMAGE) {
        shakeRef.current = Math.max(shakeRef.current, 0.5 + w * 2.2);
      }
      // Sparks / dust cone, thrown back along the round's flight
      const back = dir + Math.PI;
      const n = 3 + Math.round(w * 11);
      for (let i = 0; i < n; i++) {
        const a = back + (Math.random() - 0.5) * 1.9;
        const s = (0.8 + Math.random() * 2.2) * (0.6 + w);
        particlesRef.current.push({
          id: generateId(),
          position: { x, y },
          velocity: { x: Math.cos(a) * s, y: Math.sin(a) * s },
          drag: 0.85,
          life: 8 + Math.random() * 10,
          color: onMetal
            ? (Math.random() < 0.6 ? '#fde68a' : '#fb923c')   // hot sparks off armor
            : (Math.random() < 0.6 ? '#a8a29e' : '#78716c'),  // dirt and grit
          size: (1 + Math.random() * 1.8) * (0.7 + w),
          alt: 8, altVel: 0.1,
        });
      }
      // Heavy rounds also tear debris out of what they hit
      const shards = Math.round(w * 5);
      for (let i = 0; i < shards; i++) {
        const a = back + (Math.random() - 0.5) * 2.6;
        const s = 1 + Math.random() * 2;
        particlesRef.current.push({
          id: generateId(),
          position: { x, y },
          velocity: { x: Math.cos(a) * s, y: Math.sin(a) * s },
          drag: 0.9,
          life: 16 + Math.random() * 12,
          color: onMetal ? '#57534e' : '#6b7280',
          size: 1.6 + Math.random() * 2,
          alt: 12, altVel: -0.4,   // arcs down
        });
      }
    };

    // Explosive damage to bridges; collapse blocks crossings until repaired
    const damageBridges = (x: number, y: number, radius: number, dmg: number) => {
      // Props caught in any blast break too
      terrainRef.current.forEach(p => {
        if ((p.type !== 'crate' && p.type !== 'barrel') || p.state === 'broken') return;
        if (Math.abs(p.x - x) < radius + p.size && Math.abs(p.y - y) < radius + p.size) breakProp(p);
      });
      terrainRef.current.forEach(b => {
        if (b.type !== 'bridge' || b.state === 'broken') return;
        if (Math.abs(b.x - x) < radius + (b.width || 60) / 2 && Math.abs(b.y - y) < radius + (b.height || 40) / 2) {
          b.health = (b.health ?? BRIDGE_HP) - dmg;
          if (b.health <= 0) {
            b.state = 'broken';
            b.health = 0;
            pushEvent('bridge', 'Bridge destroyed — vehicles blocked!');
            soundService.playLargeExplosion();
            shakeRef.current = Math.max(shakeRef.current, 7);
            for (let k = 0; k < 14; k++) {
              particlesRef.current.push({
                id: generateId(),
                position: { x: b.x + (Math.random() - 0.5) * (b.width || 60), y: b.y + (Math.random() - 0.5) * (b.height || 40) },
                velocity: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
                drag: 0.9,
                life: 40 + Math.random() * 30,
                color: k % 2 === 0 ? '#78350f' : '#57534e',
                size: 5 + Math.random() * 7,
                alt: 4 + Math.random() * 10,
                altVel: 0.8 + Math.random() * 0.8
              });
            }
          }
        }
      });
    };
    // ── Obstacle avoidance ────────────────────────────────────────────────
    // The old behaviour pushed a unit radially away from whatever it touched,
    // which for a tank driving straight into a wall meant pushing backwards —
    // it stalled nose-first and never went around. Instead each unit scans a
    // short corridor along its heading, picks the *side* with more clearance,
    // and commits to that side for a beat: forward motion is kept, a lateral
    // slide is added, so the unit drives around the obstacle instead of into it.
    const obstacleRadius = (o: TerrainObject) =>
      o.type === 'building' ? Math.max(o.width || o.size * 2.6, o.height || o.size * 2.0) / 2
        : o.type === 'tree' ? 15
        : o.type === 'rock' ? 13
        : o.size * 0.8;

    const steerAroundObstacles = (
      unit: Unit, mx: number, my: number, speed: number, body: number, solidProps: boolean
    ): Vector2D => {
      const mag = Math.hypot(mx, my);
      if (mag < 0.02) return { x: mx, y: my };
      const dirX = mx / mag, dirY = my / mag;
      const look = AVOID_LOOKAHEAD * (speed > 0 ? Math.min(1.4, 0.6 + speed) : 1);

      // Nearest thing sitting in the corridor ahead
      let block: TerrainObject | null = null;
      let blockT = Infinity, blockLat = 0, blockClear = 0;
      for (const o of terrainRef.current) {
        const isSolid = o.type === 'building' ||
          (solidProps && (o.type === 'tree' || o.type === 'rock' ||
            ((o.type === 'crate' || o.type === 'barrel') && o.state !== 'broken')));
        if (!isSolid) continue;
        const dx = o.x - unit.position.x, dy = o.y - unit.position.y;
        const along = dx * dirX + dy * dirY;          // distance ahead
        if (along <= 0 || along > look) continue;
        const lat = dx * -dirY + dy * dirX;           // signed offset from the path
        const clear = obstacleRadius(o) + body;
        if (Math.abs(lat) > clear) continue;          // we already miss it
        if (along < blockT) { block = o; blockT = along; blockLat = lat; blockClear = clear; }
      }
      if (!block) {
        if (unit.avoidUntil && time > unit.avoidUntil) { unit.avoidDir = undefined; unit.avoidId = undefined; }
        return { x: mx, y: my };
      }

      // Which way round? An active commitment wins — re-deciding every tick is
      // exactly how a tank ends up sawing back and forth against a wall. Fresh
      // decisions slide toward the edge we're already nearer.
      const committed = !!unit.avoidDir && !!unit.avoidUntil && time < unit.avoidUntil!;
      let side = committed
        ? unit.avoidDir!
        : (blockLat !== 0 ? -Math.sign(blockLat) : (unit.position.y > CANVAS_HEIGHT / 2 ? -1 : 1));

      // Reject a side that would run us off the field
      const exitY = unit.position.y + (dirX * side) * (blockClear + 10);
      if (exitY < HORIZON_Y + 24 || exitY > CANVAS_HEIGHT - 24) side = -side;

      if (!committed || unit.avoidId !== block.id) {
        unit.avoidDir = side;
        unit.avoidId = block.id;
        unit.avoidUntil = time + AVOID_COMMIT_MS;
      }

      // Urgency: full sidestep when the obstacle is right there, a gentle
      // course correction when it's still at the edge of the scan.
      const urgency = Math.max(0, Math.min(1, 1 - blockT / look));
      const perpX = -dirY * side, perpY = dirX * side;
      const fwd = 1 - 0.5 * urgency;                  // never negative: no reversing into a stall
      const lateral = (0.85 + 0.55 * urgency) * urgency + 0.25;
      return {
        x: (dirX * fwd + perpX * lateral) * mag,
        y: (dirY * fwd + perpY * lateral) * mag,
      };
    };

    // Smoke concealment: targeting into/out of a cloud is blocked beyond
    // point-blank range. Air units fly above the smoke and are unaffected.
    const inSmoke = (x: number, y: number) =>
      smokesRef.current.some(s => (x - s.x) ** 2 + (y - s.y) ** 2 < s.radius * s.radius);
    const smokeBlocked = (shooter: Unit, o: Unit) => {
      if (smokesRef.current.length === 0) return false;
      if ((UNIT_CONFIG[o.type] as any).isFlying || (UNIT_CONFIG[shooter.type] as any).isFlying) return false;
      const d2 = (o.position.x - shooter.position.x) ** 2 + (o.position.y - shooter.position.y) ** 2;
      if (d2 < 55 * 55) return false; // close enough to see through the haze
      return inSmoke(o.position.x, o.position.y) || inSmoke(shooter.position.x, shooter.position.y);
    };

    if (flashOpacity.current > 0) flashOpacity.current -= 0.02; // Flash decay
    // Spawn queue processed in useEffect now to avoid frame-loop race conditions

    moneyRef.current[Team.WEST] += MONEY_PER_TICK * (1 + INCOME_UPGRADE_BONUS * incomeLevelRef.current[Team.WEST]);
    moneyRef.current[Team.EAST] += MONEY_PER_TICK * (1 + INCOME_UPGRADE_BONUS * incomeLevelRef.current[Team.EAST]);

    // Rally status computed once per tick, read in the unit loop
    const rallyOn: Record<Team, boolean> = {
      [Team.WEST]: Date.now() < rallyRef.current[Team.WEST].until,
      [Team.EAST]: Date.now() < rallyRef.current[Team.EAST].until,
    };

    // Underdog rubber-band, two signals:
    // 1. Score/base deficit (+1% income per point behind, cap +40%)
    // 2. Standing-army value deficit (up to +60%) — reacts to a wiped army long
    //    before the score reflects it, which is where snowballs actually start.
    {
      const lead = gameModeRef.current === 'basehp'
        ? baseHPRef.current[Team.WEST] - baseHPRef.current[Team.EAST]
        : scoreRef.current[Team.WEST] - scoreRef.current[Team.EAST];
      let armyValue = { [Team.WEST]: 0, [Team.EAST]: 0 };
      for (const u of unitsRef.current) {
        if (u.type === UnitType.NAPALM || u.type === UnitType.MINE_PERSONAL || u.type === UnitType.MINE_TANK) continue;
        armyValue[u.team] += (UNIT_CONFIG[u.type] as any).cost || 0;
      }
      const armyDeficit = armyValue[Team.WEST] - armyValue[Team.EAST];
      const scoreBonus = Math.min(0.4, Math.abs(lead) * 0.01);
      const armyBonus = Math.min(0.6, Math.max(0, Math.abs(armyDeficit) - 200) / 2000 * 0.6);
      const scoreTrailing = lead > 0 ? Team.EAST : lead < 0 ? Team.WEST : null;
      const armyTrailing = armyDeficit > 0 ? Team.EAST : armyDeficit < 0 ? Team.WEST : null;
      if (scoreTrailing === armyTrailing && scoreTrailing) {
        moneyRef.current[scoreTrailing] += MONEY_PER_TICK * Math.max(scoreBonus, armyBonus);
      } else {
        if (scoreTrailing) moneyRef.current[scoreTrailing] += MONEY_PER_TICK * scoreBonus;
        if (armyTrailing) moneyRef.current[armyTrailing] += MONEY_PER_TICK * armyBonus;
      }
      // 3. Economy-gap counterweight: income upgrades are a rich-get-richer
      //    amplifier, so the side that is behind on upgrade levels gets part
      //    of the difference back (keeps upgrades worthwhile but not a snowball)
      const lvlGap = incomeLevelRef.current[Team.WEST] - incomeLevelRef.current[Team.EAST];
      if (lvlGap !== 0) {
        const behind = lvlGap > 0 ? Team.EAST : Team.WEST;
        moneyRef.current[behind] += MONEY_PER_TICK * INCOME_UPGRADE_BONUS * 0.5 * Math.abs(lvlGap);
      }
    }

    // Capture points: uncontested ground presence flips them; holders earn
    // bonus income (center +50%, flank posts +12% each)
    for (const cap of [captureRef.current, ...flankCapsRef.current]) {
      let westIn = false, eastIn = false;
      for (const u of unitsRef.current) {
        if (u.type === UnitType.MINE_PERSONAL || u.type === UnitType.MINE_TANK || u.type === UnitType.NAPALM) continue;
        if ((UNIT_CONFIG[u.type] as any).isFlying) continue;
        if (Math.sqrt((u.position.x - cap.x) ** 2 + (u.position.y - cap.y) ** 2) < cap.radius) {
          if (u.team === Team.WEST) westIn = true; else eastIn = true;
          if (westIn && eastIn) break;
        }
      }
      if (westIn && !eastIn) cap.progress = Math.min(CAPTURE_TICKS, cap.progress + 1);
      else if (eastIn && !westIn) cap.progress = Math.max(-CAPTURE_TICKS, cap.progress - 1);
      const bonus = cap.bonus ?? 0.5;
      const isCenter = cap === captureRef.current;
      const label = isCenter ? 'the capture point' : 'a flank post';
      if (cap.progress >= CAPTURE_TICKS && cap.owner !== Team.WEST) { cap.owner = Team.WEST; pushEvent('capture', `West holds ${label} (+${Math.round(bonus * 100)}% income)`, Team.WEST); soundService.playSpawnSound(false); }
      else if (cap.progress <= -CAPTURE_TICKS && cap.owner !== Team.EAST) { cap.owner = Team.EAST; pushEvent('capture', `East holds ${label} (+${Math.round(bonus * 100)}% income)`, Team.EAST); soundService.playSpawnSound(true); }
      if (cap.owner) moneyRef.current[cap.owner] += MONEY_PER_TICK * bonus;
    }
    // Capture-income counterweight: like the upgrade rubber-band, the side
    // holding fewer points recovers 40% of the bonus gap — captures stay
    // worth fighting for without letting a triple-hold snowball the game
    {
      const capBonus = (t: Team) => [captureRef.current, ...flankCapsRef.current].reduce((s, c) => s + (c.owner === t ? (c.bonus ?? 0.5) : 0), 0);
      const capGap = capBonus(Team.WEST) - capBonus(Team.EAST);
      if (capGap !== 0) moneyRef.current[capGap > 0 ? Team.EAST : Team.WEST] += MONEY_PER_TICK * Math.abs(capGap) * 0.4;
    }

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

    // NOTE: projectiles used to be stepped and resolved by TWO loops in this same
    // tick — this one and "Projectiles Logic" further down. They disagreed: this
    // one knew about cover and flyovers, that one about the anti-air multipliers,
    // blast falloff and craters. Whichever caught a round first decided which
    // rules it played by, and since this loop ran first it won most collisions —
    // so AA quietly lost its bonus vs drones, small arms hit aircraft at full
    // damage, and shells that struck a unit dealt full damage to the whole blast
    // with no falloff and no crater. Rounds also moved twice per tick. There is
    // now exactly ONE resolver (see "Projectiles Logic"); do not add a second.

    // Missile Update
    for (let i = missilesRef.current.length - 1; i >= 0; i--) {
      const m = missilesRef.current[i];
      m.current.x += m.velocity.x; m.current.y += m.velocity.y;

      // Cruise missiles fly low and leave a heavy exhaust trail
      if (m.isCruise && tickCountRef.current % 2 === 0) {
        particlesRef.current.push({
          id: generateId(),
          position: { x: m.current.x - m.velocity.x * 4, y: m.current.y - m.velocity.y * 4 },
          velocity: { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4 },
          drag: 0.97,
          life: 40 + Math.random() * 30,
          color: Math.random() > 0.5 ? '#d6d3d1' : '#a8a29e',
          size: 5 + Math.random() * 5,
          alt: 22 + Math.random() * 5,
          altVel: 0.2
        });
      }

      const arrived = m.isCruise ? m.current.y <= m.target.y : m.current.y >= m.target.y;
      if (arrived) {
        const isNuke = !!(m as any).isNuke;
        if (isNuke) soundService.playNukeSound(); else soundService.playExplosionSound();
        shakeRef.current = Math.max(shakeRef.current, isNuke ? 30 : m.isCruise ? 14 : 8);
        const config = UNIT_CONFIG[UnitType.MISSILE_STRIKE] as any; // Default
        const damage = m.customDamage ?? (isNuke ? UNIT_CONFIG[UnitType.NUKE].damage : config.damage);
        const radius = m.customRadius ?? (isNuke ? UNIT_CONFIG[UnitType.NUKE].radius : config.radius);

        if (isNuke) {
          flashOpacity.current = 1.0;
          // Expanding ground shockwave
          particlesRef.current.push({ id: generateId(), position: { ...m.target }, life: 18, color: '#fef9c3', size: 320, isShockwave: true });
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
              size: 20 + Math.random() * 30,
              alt: 8 + Math.random() * 20,
              altVel: 0.5
            });
          }
          // Mushroom cloud: hot rising column + spreading dark cap
          for (let p = 0; p < 900; p++) {
            const angle = Math.random() * Math.PI * 2;
            const isColumn = p % 3 === 0;
            const speed = isColumn ? Math.random() * 4 + 1 : Math.random() * 22 + 8;
            const startDist = isColumn ? Math.random() * 45 : Math.random() * 200;
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + Math.cos(angle) * startDist, y: m.target.y + Math.sin(angle) * startDist },
              velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
              drag: 0.95 + Math.random() * 0.03,
              life: 300 + Math.random() * 200,
              color: p % 6 === 0 ? '#ffffff' :
                (p % 5 === 0 ? '#fef08a' :
                  (p % 4 === 0 ? '#292524' :
                    (p % 3 === 0 ? '#57534e' :
                      (p % 2 === 0 ? '#78716c' : '#713f12')))),
              size: 40 + Math.random() * 80,
              alt: 2 + Math.random() * 10,
              altVel: isColumn ? 1.2 + Math.random() * 1.6 : 0.35 + Math.random() * 0.8
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
        // Impact crater decal
        particlesRef.current.push({
          id: generateId(),
          position: { x: m.target.x, y: m.target.y },
          life: isNuke ? 3600 : 900,
          color: '#1c1917',
          size: isNuke ? 170 : m.isCruise ? 72 : 42,
          isGroundDecal: true
        });
        // Bridges in the blast take structural damage (nuke capped to its epicenter)
        damageBridges(m.target.x, m.target.y, Math.min(radius || 60, 300), damage || 200);
        // Explosion particles ( Standard )
        if (!isNuke) {
          particlesRef.current.push({ id: generateId(), position: { ...m.target }, life: 18, color: '#fde68a', size: (radius || 60) * 1.4, isShockwave: true });
          for (let p = 0; p < 20; p++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + (Math.random() - 0.5) * 40, y: m.target.y + (Math.random() - 0.5) * 40 },
              life: 40, color: '#f97316', size: 6 + Math.random() * 8,
              alt: 4 + Math.random() * 14, altVel: 0.7 + Math.random() * 0.7
            });
          }
          // Lingering smoke column
          for (let p = 0; p < 8; p++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: m.target.x + (Math.random() - 0.5) * 24, y: m.target.y + (Math.random() - 0.5) * 24 },
              velocity: { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4 },
              drag: 0.98,
              life: 70 + Math.random() * 60, color: p % 2 === 0 ? '#57534e' : '#44403c', size: 8 + Math.random() * 10,
              alt: 6 + Math.random() * 10, altVel: 0.5 + Math.random() * 0.6
            });
          }
        }
        missilesRef.current.splice(i, 1);
      }
    }

    // Supply drops: a crate parachutes onto the midfield every 25-45s;
    // the first team to get a ground unit next to it claims the reward.
    if (tickCountRef.current >= nextCrateTickRef.current) {
      nextCrateTickRef.current = tickCountRef.current + 1500 + Math.floor(Math.random() * 1200);
      const types: SupplyCrate['type'][] = ['cash', 'cash', 'squad', 'medkit']; // cash slightly more common
      cratesRef.current.push({
        id: generateId(),
        x: 300 + Math.random() * 200,
        y: HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120),
        alt: 230,
        type: types[Math.floor(Math.random() * types.length)],
        life: 1300, // ~22s on the ground before it despawns
      });
    }
    for (let i = cratesRef.current.length - 1; i >= 0; i--) {
      const c = cratesRef.current[i];
      if (c.alt > 0) {
        c.alt = Math.max(0, c.alt - 0.85);
        continue;
      }
      c.life--;
      if (c.life <= 0) { cratesRef.current.splice(i, 1); continue; }

      // Claim check
      const claimer = spatialHash.current.query(c.x, c.y, 34).find(u =>
        u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM &&
        !(UNIT_CONFIG[u.type] as any).isFlying &&
        Math.sqrt((u.position.x - c.x) ** 2 + (u.position.y - c.y) ** 2) < 34
      );
      if (!claimer) continue;

      const team = claimer.team;
      soundService.playSpawnSound(team === Team.EAST);
      pushEvent('crate', `${teamName(team)} claims the supply drop (${c.type === 'cash' ? '+$150' : c.type === 'squad' ? 'veteran squad' : 'field medkit'})`, team);
      if (c.type === 'cash') {
        moneyRef.current[team] += 150;
        particlesRef.current.push({ id: generateId(), position: { x: c.x, y: c.y }, velocity: { x: 0, y: 0.5 }, life: 90, color: '#22c55e', size: 8, text: '+$150' });
      } else if (c.type === 'squad') {
        const cfg = UNIT_CONFIG[UnitType.SOLDIER];
        const sqId = generateId();
        for (let s = 0; s < 3; s++) {
          unitsRef.current.push({
            id: generateId(), team, type: UnitType.SOLDIER,
            position: { x: c.x + (s - 1) * 14, y: Math.max(HORIZON_Y + 12, Math.min(CANVAS_HEIGHT - 12, c.y + (s % 2) * 18 - 9)) },
            state: UnitState.MOVING, health: cfg.health, maxHealth: cfg.health,
            attackCooldown: 0, targetId: null, width: cfg.width, height: cfg.height,
            spawnTime: Date.now(), isInCover: false, squadId: sqId,
            kills: 3, veterancy: 1, // drop-in veterans
          });
          statsRef.current[team].built++;
          typeStatsRef.current[team].spawned[UnitType.SOLDIER] = (typeStatsRef.current[team].spawned[UnitType.SOLDIER] || 0) + 1;
        }
        particlesRef.current.push({ id: generateId(), position: { x: c.x, y: c.y }, velocity: { x: 0, y: 0.5 }, life: 90, color: '#fbbf24', size: 8, text: '★ SQUAD' });
      } else {
        // Medkit: patch up every unit on the claiming team
        unitsRef.current.forEach(u => {
          if (u.team === team && u.health > 0 && u.health < u.maxHealth) {
            u.health = Math.min(u.maxHealth, u.health + 30);
          }
        });
        particlesRef.current.push({ id: generateId(), position: { x: c.x, y: c.y }, velocity: { x: 0, y: 0.5 }, life: 90, color: '#4ade80', size: 8, text: '+MEDKIT' });
      }
      // Claim burst
      for (let k = 0; k < 10; k++) {
        particlesRef.current.push({
          id: generateId(),
          position: { x: c.x + (Math.random() - 0.5) * 16, y: c.y + (Math.random() - 0.5) * 12 },
          velocity: { x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5 },
          drag: 0.92, life: 25, color: '#fbbf24', size: 3 + Math.random() * 3,
          alt: 3, altVel: 0.8
        });
      }
      cratesRef.current.splice(i, 1);
    }

    // Smoke screens: tick down and keep the cloud churning with fresh wisps
    for (let i = smokesRef.current.length - 1; i >= 0; i--) {
      const s = smokesRef.current[i];
      s.life--;
      if (s.life <= 0) { smokesRef.current.splice(i, 1); continue; }
      if (tickCountRef.current % 6 === 0) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * s.radius * 0.8;
        particlesRef.current.push({
          id: generateId(),
          position: { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d },
          velocity: { x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4 },
          drag: 0.97, life: 70 + Math.random() * 50,
          color: Math.random() > 0.5 ? '#d6d3d1' : '#a8a29e',
          size: 8 + Math.random() * 10, alt: 2 + Math.random() * 10, altVel: 0.2,
        });
      }
    }

    // Satellite laser strikes: designator phase, then a sustained burn
    for (let i = lasersRef.current.length - 1; i >= 0; i--) {
      const L = lasersRef.current[i];
      L.life--;
      const active = L.maxLife - L.life > LASER_DESIGNATE;
      if (active) {
        const dmg = (UNIT_CONFIG[UnitType.SATELLITE] as any).damage;
        shakeRef.current = Math.max(shakeRef.current, 1.2);
        spatialHash.current.queryCallback(L.x, L.y, L.radius, u => {
          if (u.team === L.team) return;
          if (Math.sqrt((u.position.x - L.x) ** 2 + (u.position.y - L.y) ** 2) < L.radius) {
            u.health -= dmg;
            u.lastHitTime = Date.now();
          }
        });
        // Embers boiling off the impact zone
        if (tickCountRef.current % 4 === 0) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * L.radius * 0.8;
          particlesRef.current.push({
            id: generateId(),
            position: { x: L.x + Math.cos(a) * d, y: L.y + Math.sin(a) * d },
            velocity: { x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.8 },
            drag: 0.94,
            life: 24 + Math.random() * 16,
            color: Math.random() > 0.4 ? '#e0f2fe' : '#7dd3fc',
            size: 3 + Math.random() * 4,
            alt: 2, altVel: 0.9 + Math.random() * 0.8
          });
        }
        // Ignite vegetation under the beam
        if (tickCountRef.current % 20 === 0) {
          terrainRef.current.forEach(t => {
            if (t.type === 'tree' && t.state !== 'burnt' && t.state !== 'broken' &&
              Math.sqrt((t.x - L.x) ** 2 + (t.y - L.y) ** 2) < L.radius) {
              t.state = 'burning';
              t.health = 300;
            }
          });
          soundService.playZapSound();
        }
      }
      if (L.life <= 0) {
        // Glassed scorch ring left behind
        particlesRef.current.push({
          id: generateId(),
          position: { x: L.x, y: L.y },
          life: 1200,
          color: '#0c0a09',
          size: L.radius * 1.15,
          isGroundDecal: true
        });
        lasersRef.current.splice(i, 1);
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
            // A stick of FOUR, landing as one squad. At three, each trooper cost
            // $23 against a rifleman's $8.30 for only 28 HP — the worst value in
            // the game (0.48 kill-value/$ where a rifleman does 1.46). They also
            // landed as loose individuals; a squadId means they select, and fight,
            // as the unit they are supposed to be.
            const stick = generateId();
            for (let j = 0; j < AIRBORNE_STICK; j++) {
              unitsRef.current.push({
                id: generateId(), team: fly.team, type: UnitType.AIRBORNE,
                position: { x: fly.targetPos.x + (j - (AIRBORNE_STICK - 1) / 2) * 25, y: fly.targetPos.y },
                state: UnitState.MOVING, health: config.health, maxHealth: config.health,
                attackCooldown: 0, targetId: null, width: config.width, height: config.height,
                spawnTime: Date.now(), planeAltitudeAtDrop: fly.altitudeY, squadId: stick,
              });
            }
            // Dropped troops bypass spawnUnit — keep built/spawned telemetry honest
            statsRef.current[fly.team].built += AIRBORNE_STICK;
            const ats = typeStatsRef.current[fly.team];
            ats.spawned[UnitType.AIRBORNE] = (ats.spawned[UnitType.AIRBORNE] || 0) + AIRBORNE_STICK;
          }
        }
      }
      if (fly.dropped && fly.canisterY !== undefined) {
        fly.canisterY += fly.canisterVelocityY!; fly.canisterVelocityY! += 0.2;
        if (fly.canisterY >= fly.targetPos.y) { spawnUnit(fly.team, UnitType.NAPALM, { absolutePos: fly.targetPos }); soundService.playHitSound(); fly.canisterY = undefined; }
      }
      if (Math.abs(fly.currentX) > CANVAS_WIDTH + 300) flyoversRef.current.splice(i, 1);
    }

    // Weather Logic — the NEXT weather is pre-rolled so the HUD can forecast it
    if (Date.now() > weatherTimerRef.current) {
      const incoming = nextWeatherRef.current;
      const wasClear = weatherRef.current === 'clear';
      weatherRef.current = incoming;
      const holdMs =
        incoming === 'rain'  ? 15000 + Math.random() * 15000 :
        incoming === 'snow'  ? 18000 + Math.random() * 18000 :
        incoming === 'fog'   ? 12000 + Math.random() * 12000 :
        incoming === 'storm' ? 10000 + Math.random() * 10000 :
        wasClear ? 22000 + Math.random() * 20000 : 28000 + Math.random() * 28000;
      weatherTimerRef.current = Date.now() + holdMs;
      if (incoming !== 'clear') nextWeatherRef.current = 'clear';
      else {
        const r = Math.random();
        nextWeatherRef.current = r < 0.28 ? 'rain' : r < 0.44 ? 'snow' : r < 0.56 ? 'fog' : r < 0.65 ? 'storm' : 'clear';
      }
    }

    // Snow particle generation (drifts down to ground level)
    if (weatherRef.current === 'snow' && Math.random() < 0.35) {
      particlesRef.current.push({
        id: generateId(),
        position: { x: Math.random() * CANVAS_WIDTH, y: HORIZON_Y },
        velocity: { x: (Math.random() - 0.5) * 0.4, y: 0.45 + Math.random() * 0.55 },
        drag: 0.995,
        life: 200 + Math.random() * 120,
        color: '#e2e8f0',
        size: 2 + Math.random() * 2,
        alt: 60 + Math.random() * 80,
        altVel: -(0.35 + Math.random() * 0.3),
      });
    }

    // Storm lightning strikes — random area damage + flash
    if (weatherRef.current === 'storm' && Math.random() < 0.0012) {
      const lx = 80 + Math.random() * (CANVAS_WIDTH - 160);
      const ly = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
      flashOpacity.current = Math.max(flashOpacity.current, 0.35);
      shakeRef.current = Math.max(shakeRef.current, 3);
      unitsRef.current.forEach(u => {
        if (Math.sqrt((u.position.x - lx) ** 2 + (u.position.y - ly) ** 2) < 55) {
          u.health -= 25;
          u.lastHitTime = Date.now();
        }
      });
      for (let k = 0; k < 10; k++) {
        particlesRef.current.push({ id: generateId(), position: { x: lx + (Math.random() - 0.5) * 30, y: ly + (Math.random() - 0.5) * 20 }, life: 10, color: '#fde68a', size: 5 + Math.random() * 4 });
      }
      // Visible sky-to-ground bolt
      particlesRef.current.push({ id: generateId(), position: { x: lx, y: ly }, life: 12, color: '#e0f2fe', size: 3, isBolt: true });
    }

    // Bridges self-repair very slowly (~1 min to reopen) so a bridge-less
    // stalemate can never lock the game; engineers do the same job in seconds.
    if (tickCountRef.current % 10 === 0) {
      terrainRef.current.forEach(b => {
        if (b.type !== 'bridge' || (b.health ?? BRIDGE_HP) >= BRIDGE_HP) return;
        b.health = Math.min(BRIDGE_HP, (b.health ?? 0) + 0.5);
        if (b.state === 'broken' && b.health >= BRIDGE_HP * 0.5) {
          b.state = 'normal';
          pushEvent('bridge', 'Bridge reopened');
        }
      });
      // Broken prop debris fades from the field after ~12s (health is the timer)
      for (let i = terrainRef.current.length - 1; i >= 0; i--) {
        const p = terrainRef.current[i];
        if ((p.type === 'crate' || p.type === 'barrel') && p.state === 'broken') {
          p.health = (p.health ?? 0) - 10;
          if (p.health <= 0) terrainRef.current.splice(i, 1);
        }
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
        spatialHash.current.queryCallback(unit.position.x, unit.position.y, burnRadius, other => {
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
        const nearbyEnemy = spatialHash.current.query(unit.position.x, unit.position.y, radius)
          .find(e => e.team !== unit.team && e.type !== UnitType.AIRBORNE && e.type !== UnitType.ENGINEER && Math.sqrt((e.position.x - unit.position.x) ** 2 + (e.position.y - unit.position.y) ** 2) < radius);

        if (nearbyEnemy) {
          unit.health = 0; // Explode
          soundService.playMineExplosion();
          shakeRef.current = Math.max(shakeRef.current, unit.type === UnitType.MINE_TANK ? 6 : 4);
          // Explosion Effect
          particlesRef.current.push({ id: generateId(), position: { ...unit.position }, life: 18, color: '#fdba74', size: radius * 1.8, isShockwave: true });
          for (let k = 0; k < 12; k++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: unit.position.x + (Math.random() - 0.5) * 20, y: unit.position.y + (Math.random() - 0.5) * 20 },
              life: 30, color: '#f97316', size: 5 + Math.random() * 8,
              alt: 3 + Math.random() * 10, altVel: 0.6 + Math.random() * 0.6
            });
          }
          // Deal Damage
          unitsRef.current.forEach(v => {
            const d = Math.sqrt((v.position.x - unit.position.x) ** 2 + (v.position.y - unit.position.y) ** 2);
            if (d < radius * 2) {
              v.health -= damage * (1 - d / (radius * 2)); // Falloff
              v.lastHitTime = Date.now();
              if (v.team !== unit.team) v.lastAttackerId = unit.id;
            }
          });
          // Mine crater decal
          particlesRef.current.push({
            id: generateId(),
            position: { ...unit.position },
            life: 600,
            color: '#292524',
            size: radius * 1.2,
            isGroundDecal: true
          });
          damageBridges(unit.position.x, unit.position.y, radius * 1.5, damage);
          return;
        }
      }

      // TRANSPORT / JEEP: board nearby foot soldiers in your own half, unload at
      // the front. The jeep is the same taxi with a single seat — it is the
      // quickest way to get an engineer (speed 0.5) up to the armor that needs him.
      if (unit.type === UnitType.TRANSPORT || unit.type === UnitType.JEEP) {
        unit.passengers = unit.passengers || [];
        const cap = (UNIT_CONFIG[unit.type] as any).capacity || 6;
        const inOwnHalf = unit.team === Team.WEST ? unit.position.x < CANVAS_WIDTH * 0.5 : unit.position.x > CANVAS_WIDTH * 0.5;

        if (unit.passengers.length < cap && inOwnHalf) {
          spatialHash.current.queryCallback(unit.position.x, unit.position.y, 44, o => {
            if (unit.passengers!.length >= cap) return;
            if (o.team !== unit.team || o.boarded || o.health <= 0 || !TRANSPORTABLE.has(o.type)) return;
            if (o.type === UnitType.AIRBORNE && Date.now() - (o.spawnTime || 0) < 3000) return; // still descending
            // An engineer already working a job stays on it — a jeep driving past
            // must not abduct the mechanic mid-weld.
            if (o.type === UnitType.ENGINEER && o.jobX !== undefined) return;
            o.boarded = true;
            o.isInCover = false;
            unit.passengers!.push(o);
          });
        }

        if (unit.passengers.length > 0) {
          const enemyNear = spatialHash.current.query(unit.position.x, unit.position.y, 230)
            .some(o => o.team !== unit.team && o.type !== UnitType.NAPALM && o.type !== UnitType.MINE_PERSONAL && o.type !== UnitType.MINE_TANK);
          const deepEnough = unit.team === Team.WEST ? unit.position.x > CANVAS_WIDTH * 0.62 : unit.position.x < CANVAS_WIDTH * 0.38;
          const badlyHurt = unit.health < unit.maxHealth * 0.4;
          if (enemyNear || deepEnough || badlyHurt) {
            unit.passengers.forEach((p, idx) => {
              p.boarded = false;
              p.state = UnitState.MOVING;
              p.position.x = unit.position.x - (unit.team === Team.WEST ? 1 : -1) * 14 + ((idx % 3) - 1) * 16;
              p.position.y = Math.max(HORIZON_Y + 12, Math.min(CANVAS_HEIGHT - 12, unit.position.y + (Math.floor(idx / 3) - 0.5) * 26));
              // Same-tick board+unload: the original entry is still in the array
              // (boarded entries are only filtered at end of tick) — pushing
              // unconditionally used to duplicate the unit forever.
              if (!unitsRef.current.includes(p)) unitsRef.current.push(p);
            });
            unit.passengers = [];
            soundService.playSpawnSound(unit.team === Team.EAST);
          }
        }
      }

      // BUNKER: cures for a few seconds (no guns, HP still rising), then takes
      // a garrison. Every foot soldier standing at the door under 'hold' orders
      // climbs in and mans a firing slit — more guns, but only up to the number
      // of slits (BUNKER_GARRISON_MAX). Holding is the switch: troops told to
      // advance walk past, so a bunker never swallows an attack.
      if (unit.type === UnitType.BUNKER) {
        if (unit.buildUntil) {
          const cfg = UNIT_CONFIG[UnitType.BUNKER];
          const left = unit.buildUntil - Date.now();
          if (left <= 0) {
            unit.buildUntil = undefined;
            pushEvent('command', `${teamName(unit.team)} bunker is manned and ready`, unit.team);
            soundService.playSpawnSound(unit.team === Team.EAST);
          } else {
            // Concrete sets: HP climbs from BUNKER_BUILD_START_HP to full over the
            // build. Apply the *delta* of the cure each tick rather than nudging
            // toward a target — at a low frame rate a per-tick nudge never catches
            // up, and the bunker finishes half-built. Damage taken meanwhile stays
            // taken; curing adds integrity, it doesn't repair shell holes.
            const done = 1 - left / BUNKER_BUILD_MS;
            const cured = (1 - BUNKER_BUILD_START_HP) * cfg.health * done;
            const applied = unit.buildHp ?? 0;
            if (cured > applied) {
              unit.health = Math.min(unit.maxHealth, unit.health + (cured - applied));
              unit.buildHp = cured;
            }
            if (tickCountRef.current % 12 === 0) {
              particlesRef.current.push({
                id: generateId(),
                position: { x: unit.position.x + (Math.random() - 0.5) * 26, y: unit.position.y + (Math.random() - 0.5) * 18 },
                velocity: { x: 0, y: -0.4 }, drag: 0.94, life: 24, color: '#a8a29e', size: 3 + Math.random() * 3,
                alt: 4 + Math.random() * 6, altVel: 0.4,
              });
            }
          }
        }

        unit.garrison = unit.garrison || 0;
        if (!unit.buildUntil && unit.garrison < BUNKER_GARRISON_MAX) {
          unit.passengers = unit.passengers || [];
          spatialHash.current.queryCallback(unit.position.x, unit.position.y, BUNKER_GARRISON_RANGE, o => {
            if ((unit.garrison || 0) >= BUNKER_GARRISON_MAX) return;
            if (o.team !== unit.team || o.boarded || o.health <= 0 || !GARRISONS(o.type)) return;
            if ((o.orders ?? stancesRef.current[o.team]) !== 'hold') return; // only troops told to dig in man it
            o.boarded = true;
            o.isInCover = false;
            o.isEntrenched = false;
            unit.passengers!.push(o);
            unit.garrison = (unit.garrison || 0) + 1;
            soundService.playSpawnSound(unit.team === Team.EAST);
          });
        }
      }

      // APC: it rides in with a squad and drops the ramp on contact. Waiting
      // for the wreck to spill them meant the squad usually died in the box.
      if (unit.type === UnitType.APC && !unit.deployed) {
        const contact = spatialHash.current.query(unit.position.x, unit.position.y, APC_DEPLOY_RANGE)
          .some(o => o.team !== unit.team && o.type !== UnitType.NAPALM &&
            o.type !== UnitType.MINE_PERSONAL && o.type !== UnitType.MINE_TANK);
        const atTheFront = unit.team === Team.WEST
          ? unit.position.x > CANVAS_WIDTH * 0.55
          : unit.position.x < CANVAS_WIDTH * 0.45;
        const hurt = unit.health < unit.maxHealth * APC_DEPLOY_HP;
        if (contact || atTheFront || hurt) {
          unit.deployed = true;
          const back = unit.team === Team.WEST ? -1 : 1; // troops file out of the rear ramp
          const soldierCfg = UNIT_CONFIG[UnitType.SOLDIER];
          for (let si = 0; si < APC_SQUAD; si++) {
            unitsRef.current.push({
              id: generateId(), team: unit.team, type: UnitType.SOLDIER,
              position: {
                x: unit.position.x + back * (16 + si * 4),
                y: Math.max(HORIZON_Y + 12, Math.min(CANVAS_HEIGHT - 12, unit.position.y + (si - 1) * 16)),
              },
              state: UnitState.MOVING, health: soldierCfg.health, maxHealth: soldierCfg.health,
              attackCooldown: 0, targetId: null, width: soldierCfg.width, height: soldierCfg.height,
              spawnTime: Date.now(), isInCover: false, squadId: unit.id,
            });
            statsRef.current[unit.team].built++;
          }
          soundService.playSpawnSound(unit.team === Team.EAST);
        }
      }

      const config = UNIT_CONFIG[unit.type] as any;
      const currentScale = getScaleAt(unit.position.y);
      if (unit.isOnHill === undefined || isSearchTick(unit)) {
        unit.isOnHill = terrainRef.current.some(t => t.type === 'hill' && Math.sqrt((t.x - unit.position.x) ** 2 + (t.y - unit.position.y) ** 2) < t.size * 0.7);
      }
      const isVehicle = unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY ||
        unit.type === UnitType.APC || unit.type === UnitType.ANTI_AIR || unit.type === UnitType.TESLA ||
        unit.type === UnitType.JEEP || unit.type === UnitType.TRANSPORT;
      const moveClass = getMoveClass(unit.type);
      const profile = CLASS_PROFILE[moveClass];

      // Field repairs: wounded units patch up slowly near their own edge when
      // they haven't been shot at recently — makes Fall Back worth ordering.
      if (!isDescent && unit.health > 0 && unit.health < unit.maxHealth &&
          (!unit.lastHitTime || Date.now() - unit.lastHitTime > REPAIR_COMBAT_LOCKOUT_MS)) {
        const nearOwnEdge = unit.team === Team.WEST ? unit.position.x < REPAIR_ZONE : unit.position.x > CANVAS_WIDTH - REPAIR_ZONE;
        if (nearOwnEdge) {
          unit.health = Math.min(unit.maxHealth, unit.health + REPAIR_PER_TICK);
          if ((tickCountRef.current + unit.id.charCodeAt(0)) % 90 === 0) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: unit.position.x + (Math.random() - 0.5) * 8, y: unit.position.y - 4 },
              velocity: { x: 0, y: -0.5 }, drag: 0.95, life: 26, color: '#4ade80', size: 3,
            });
          }
        }
      }

      // Entrenchment: foot units that sit still under 'hold' orders dig in
      // after a few seconds (reduced direct fire until they move again).
      if (ENTRENCHABLE.has(unit.type) && !unit.boarded && !isDescent && (unit.orders ?? stancesRef.current[unit.team]) === 'hold') {
        unit.entrench = (unit.entrench || 0) + 1;
        if (!unit.isEntrenched && unit.entrench >= ENTRENCH_TICKS) {
          unit.isEntrenched = true;
          // Dirt kicked up as the foxhole is finished
          for (let k = 0; k < 6; k++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: unit.position.x + (Math.random() - 0.5) * 14, y: unit.position.y + (Math.random() - 0.5) * 10 },
              velocity: { x: (Math.random() - 0.5) * 1.0, y: (Math.random() - 0.5) * 1.0 },
              drag: 0.9, life: 22, color: '#78716c', size: 3 + Math.random() * 3,
              alt: 2, altVel: 0.5,
            });
          }
        }
      } else if (unit.entrench || unit.isEntrenched) {
        unit.entrench = 0;
        unit.isEntrenched = false; // orders changed — foxhole abandoned
      }

      // Pinned by incoming fire: he crawls until he gets a moment's peace
      const suppressed = !!unit.suppressedUntil && Date.now() < unit.suppressedUntil;

      if (unit.type !== UnitType.BUNKER && (unit.state === UnitState.MOVING || (unit.type === UnitType.ARTILLERY && !unit.isInCover)) && !isDescent) {
        const weatherMovePenalty = config.isFlying
          ? (weatherRef.current === 'storm' ? 0.22 : 1.0)
          : (weatherRef.current === 'rain' ? 0.60 : weatherRef.current === 'snow' ? 0.65 : 1.0);
        let moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed * weatherMovePenalty;

        // Stance orders: per-unit overrides beat the team-wide setting. Hold
        // stops the advance, retreat pulls back toward your own edge (units
        // still fight, seek cover and keep separation).
        const stance = unit.orders ?? stancesRef.current[unit.team];
        if (stance === 'hold') {
          moveX = 0;
        } else if (stance === 'retreat') {
          const nearOwnEdge = unit.team === Team.WEST ? unit.position.x < 60 : unit.position.x > CANVAS_WIDTH - 60;
          moveX = nearOwnEdge ? 0 : -(unit.team === Team.WEST ? 1 : -1) * config.speed * 0.8 * weatherMovePenalty;
        }

        // Organic lateral drift: two-frequency noise avoids synchronized waves
        const _uid = (unit.id.charCodeAt(0) * 7 + unit.id.charCodeAt(unit.id.length - 1) * 31) % 1000;
        const _phase = (_uid / 1000) * Math.PI * 2;
        let moveY = (Math.sin(time * 0.0018 + _phase) * 0.6 + Math.sin(time * 0.0007 + _phase * 1.9) * 0.35) * 0.18;

        // Infantry told to hold near one of your bunkers walks over and mans it.
        // Holding freezes a unit where it stands, so without this they could
        // never actually reach the door — which is what garrisoning has to mean.
        if (stance === 'hold' && GARRISONS(unit.type) && !unit.boarded) {
          const home = unitsRef.current.find(o =>
            o.type === UnitType.BUNKER && o.team === unit.team && o.health > 0 && !o.buildUntil &&
            (o.garrison || 0) < BUNKER_GARRISON_MAX &&
            Math.hypot(o.position.x - unit.position.x, o.position.y - unit.position.y) < BUNKER_CALL_RANGE);
          if (home) {
            const a = Math.atan2(home.position.y - unit.position.y, home.position.x - unit.position.x);
            moveX = Math.cos(a) * config.speed;
            moveY = Math.sin(a) * config.speed;
          }
        }

        // Suppression: units recently hit slow to a crawl (infantry only)
        const isUnderFire = !config.isFlying && !!unit.lastHitTime && (Date.now() - unit.lastHitTime) < 650;

        if (config.isFlying) {
          unit.isInCover = false; // Force out of cover (Flyers never take cover)
          let target: Unit | null = null;

          // Helicopter Priority: Seek Tesla
          if (unit.type === UnitType.HELICOPTER) {
            target = unitsRef.current.find(o => o.team !== unit.team && o.type === UnitType.TESLA) || null;
          }

          // Fighter: hunt enemy aircraft across the whole map before anything else
          if (unit.type === UnitType.FIGHTER && !target) {
            let minAirDist = 900;
            unitsRef.current.forEach(o => {
              if (o.team === unit.team || !(UNIT_CONFIG[o.type] as any).isFlying) return;
              const d = Math.sqrt((unit.position.x - o.position.x) ** 2 + (unit.position.y - o.position.y) ** 2);
              if (d < minAirDist) { minAirDist = d; target = o; }
            });
          }

          if (!target) {
            let minDist = 600;
            unitsRef.current.forEach(o => { if (o.team !== unit.team && o.type !== UnitType.NAPALM) { const d = Math.sqrt((unit.position.x - o.position.x) ** 2 + (o.position.y - unit.position.y) ** 2); if (d < minDist) { minDist = d; target = o; } } });
          }

          if (target) {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);

            // Set Rotation for Helicopters
            if (unit.type === UnitType.HELICOPTER || unit.type === UnitType.FIGHTER) {
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
            // No target: fly per stance (advance forward, hold hover, retreat back)
            const fwd = (unit.team === Team.WEST ? 1 : -1);
            moveX = stance === 'hold' ? 0 : stance === 'retreat' ? -fwd * config.speed * 0.8 : fwd * config.speed;
            if (unit.type === UnitType.HELICOPTER || unit.type === UnitType.FIGHTER) unit.rotation = unit.team === Team.WEST ? 0 : Math.PI;
          }
        } else {
          // ── Ground Unit Movement ──────────────────────────────────────────
          let movingToHill = false;
          const hasEnemies = spatialHash.current.query(unit.position.x, unit.position.y, 600).some(u => u.team !== unit.team);

          // MEDIC: seek most-injured ally rather than advancing
          if (unit.type === UnitType.MEDIC && isSearchTick(unit)) {
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

          // ENGINEER: walk to the nearest job — mines within 260px, broken
          // bridges from anywhere on the map, and hurt friendly machines within
          // 260px. Jobs compete on `score` (lower wins); `jobDist` stays a real
          // distance because it also decides whether he still has to walk.
          if (!movingToHill && unit.type === UnitType.ENGINEER) {
            // Re-pick the job only on search ticks (the scans are O(units+terrain))...
            if (isSearchTick(unit)) {
              let jobX: number | null = null, jobY = 0, best = Infinity;
              const consider = (x: number, y: number, score: number) => {
                if (score >= best) return;
                best = score; jobX = x; jobY = y;
              };
              for (const m of unitsRef.current) {
                if (m.team === unit.team || (m.type !== UnitType.MINE_PERSONAL && m.type !== UnitType.MINE_TANK)) continue;
                const d = Math.sqrt((m.position.x - unit.position.x) ** 2 + (m.position.y - unit.position.y) ** 2);
                if (d < 260) consider(m.position.x, m.position.y, d);
              }
              for (const b of terrainRef.current) {
                if (b.type !== 'bridge' || (b.health ?? BRIDGE_HP) >= BRIDGE_HP) continue;
                // Fully broken bridges attract engineers map-wide; partial damage only nearby
                const cap = b.state === 'broken' ? 4000 : 300;
                const d = Math.sqrt((b.x - unit.position.x) ** 2 + (b.y - unit.position.y) ** 2);
                if (d < cap) consider(b.x, b.y, d);
              }
              // Hurt friendly machines: scored by distance weighted by how healthy
              // they still are, so a nearly-dead tank outranks a lightly scratched
              // jeep standing closer.
              for (const m of unitsRef.current) {
                if (m.team !== unit.team || m.id === unit.id || !isMechanical(m.type)) continue;
                if (m.health <= 0 || m.health >= m.maxHealth) continue;
                if (m.buildUntil && Date.now() < m.buildUntil) continue;
                const d = Math.sqrt((m.position.x - unit.position.x) ** 2 + (m.position.y - unit.position.y) ** 2);
                if (d < 260) consider(m.position.x, m.position.y, d * (m.health / m.maxHealth));
              }
              if (jobX !== null) { unit.jobX = jobX; unit.jobY = jobY; }
              else { delete unit.jobX; delete unit.jobY; }
            }
            // ...but steer to the job EVERY tick. Steering only on the search tick
            // let the advance stance push him back toward the enemy in between,
            // so he never closed on a job that lay behind him.
            if (unit.jobX !== undefined && unit.jobY !== undefined) {
              const jd = Math.sqrt((unit.jobX - unit.position.x) ** 2 + (unit.jobY - unit.position.y) ** 2);
              if (jd > 45) {
                const a = Math.atan2(unit.jobY - unit.position.y, unit.jobX - unit.position.x);
                moveX = Math.cos(a) * config.speed;
                moveY = Math.sin(a) * config.speed;
              } else {
                moveX = 0; moveY = 0;   // on station: work
              }
              movingToHill = true; // skip cover logic while on the job
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

          // ARTILLERY / MORTAR: stop completely when targets are in range
          if (unit.type === UnitType.ARTILLERY || unit.type === UnitType.MORTAR) {
            const artRange = config.range * currentScale;
            const hasArtTarget = spatialHash.current.query(unit.position.x, unit.position.y, artRange)
              .some(o => o.team !== unit.team && o.type !== UnitType.NAPALM);
            if (hasArtTarget) { moveX = 0; moveY = 0; movingToHill = true; }
            else { moveX *= 0.3; } // Slow crawl when no targets yet
          }

          // Hill seeking — forward-biased (don't retreat to hills behind you)
          if (!movingToHill && !unit.isOnHill && hasEnemies && isSearchTick(unit)) {
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
              // Slopes cost each class differently — wheels bog down, tracks climb
              moveX *= profile.hill * 0.7; moveY *= profile.hill * 0.7;
            }
          } else if (unit.isOnHill) {
            moveX *= profile.hill; moveY *= profile.hill;
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
              } else if (isSearchTick(unit)) {
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
            }
          }

          // Round obstacles rather than grinding into them. Vehicles treat
          // trees, rocks and crates as solid; infantry only has to clear
          // buildings (the rest is cover it wants to reach).
          const steered = steerAroundObstacles(
            unit, moveX, moveY, config.speed, profile.radius, isVehicle
          );
          moveX = steered.x; moveY = steered.y;
        }

        // Separation force — single tuned system, replaces old dual-system
        if (!unit.isInCover) {
          const sepRadius = profile.sepRadius;
          const sepStr = profile.sepStr;
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
                b.type === 'bridge' && b.state !== 'broken' &&
                Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
                Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10
              );
              if (!onBridge) {
                const crossNeeded = (unit.team === Team.WEST && unit.position.x < river.x) || (unit.team === Team.EAST && unit.position.x > river.x);
                if (crossNeeded) {
                  let nearestBridge: TerrainObject | null = null;
                  let minBridgeDist = 10000;
                  terrainRef.current.forEach(b => {
                    if (b.type === 'bridge' && b.state !== 'broken' && Math.abs(b.x - river.x) < river.width! / 2 + 30) {
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
                  } else if (profile.wade > 0) {
                    // Foot units ford the channel — slow, exposed, but they get across
                    moveX = (unit.team === Team.WEST ? 1 : -1) * config.speed * profile.wade;
                  } else {
                    // No crossing for wheels or tracks: pull back onto the bank
                    // and stage on the nearest downed bridge, so the column
                    // waits in a queue an engineer can reach instead of piling
                    // nose-first into the water.
                    let staging: TerrainObject | null = null;
                    let stagingDist = 10000;
                    terrainRef.current.forEach(b => {
                      if (b.type !== 'bridge' || Math.abs(b.x - river.x) > river.width! / 2 + 30) return;
                      const d = Math.abs(unit.position.y - b.y);
                      if (d < stagingDist) { stagingDist = d; staging = b; }
                    });
                    const back = unit.team === Team.WEST ? -1 : 1;
                    moveX = back * config.speed * 0.5; // reverse out of the ford
                    if (staging) {
                      const dy = (staging as TerrainObject).y - unit.position.y;
                      moveY += Math.sign(dy) * Math.min(config.speed, Math.abs(dy) * 0.08);
                    }
                  }
                }
              }
            }
          }
        }

        if (rallyOn[unit.team]) { moveX *= RALLY_SPEED_MULT; moveY *= RALLY_SPEED_MULT; } // rally surge

        // Inertia: a tank leans into a turn, a soldier just turns. Smoothing the
        // heading also kills the tick-to-tick jitter that let a vehicle vibrate
        // in place against an obstacle instead of driving clear of it.
        const intentX = moveX, intentY = moveY;
        const intentMag = Math.hypot(intentX, intentY);
        if (!config.isFlying) {
          const vel = unit.vel || (unit.vel = { x: 0, y: 0 });
          vel.x += (moveX - vel.x) * profile.steer;
          vel.y += (moveY - vel.y) * profile.steer;
          if (Math.abs(vel.x) < 0.005) vel.x = 0;
          if (Math.abs(vel.y) < 0.005) vel.y = 0;
          moveX = vel.x; moveY = vel.y;
        }

        // Suppression bites at the point movement is COMMITTED: the branches above
        // (job-seeking, hill-climbing, fleeing) each recompute moveX/moveY from
        // config.speed and would otherwise walk straight out from under it.
        if (suppressed) { moveX *= SUPPRESSION_SPEED_MULT; moveY *= SUPPRESSION_SPEED_MULT; }

        unit.position.x += moveX; unit.position.y += moveY;
        unit.position.y = Math.max(HORIZON_Y + 10, Math.min(CANVAS_HEIGHT - 10, unit.position.y));

        // Stuck watchdog: a unit that wants to move but has gained no ground for
        // a second is wedged — a building corner, a scrum of friendlies, a prop.
        // Flip the side it's committed to and shoulder it sideways until it's
        // free; vehicles simply crush whatever debris is pinning them.
        if (!config.isFlying) {
          const wantsToMove = intentMag > 0.08;
          if ((tickCountRef.current + unit.id.charCodeAt(0)) % STUCK_SAMPLE_TICKS === 0) {
            const prev = unit.lastProgressPos;
            if (!wantsToMove) {
              unit.stuckSamples = 0;
            } else if (prev) {
              const gained = Math.hypot(unit.position.x - prev.x, unit.position.y - prev.y);
              if (gained < STUCK_MIN_PROGRESS) {
                unit.stuckSamples = (unit.stuckSamples || 0) + 1;
                if (unit.stuckSamples >= STUCK_ESCALATE) {
                  // Whichever way we were going round isn't working — take the
                  // other side, and hold it long enough to actually get there.
                  unit.avoidDir = -(unit.avoidDir ?? 1);
                  unit.avoidId = undefined;
                  unit.avoidUntil = time + AVOID_COMMIT_MS * 2;
                }
              } else {
                unit.stuckSamples = 0;
              }
            }
            unit.lastProgressPos = { x: unit.position.x, y: unit.position.y };
          }

          if (wantsToMove && (unit.stuckSamples || 0) >= STUCK_ESCALATE) {
            const side = unit.avoidDir ?? 1; // stable for the whole sample window
            const iX = intentX / intentMag, iY = intentY / intentMag;
            const shove = Math.min(1.2, 0.45 + 0.2 * ((unit.stuckSamples || 0) - STUCK_ESCALATE));
            unit.position.x += -iY * side * shove;
            unit.position.y += iX * side * shove;
            unit.position.y = Math.max(HORIZON_Y + 10, Math.min(CANVAS_HEIGHT - 10, unit.position.y));
            if (isVehicle) {
              terrainRef.current.forEach(p => {
                if ((p.type !== 'crate' && p.type !== 'barrel') || p.state === 'broken') return;
                if (Math.hypot(p.x - unit.position.x, p.y - unit.position.y) < profile.radius + p.size + 6) breakProp(p);
              });
            }
          }
        }

        // Dust trail behind moving vehicles
        if (isVehicle && (Math.abs(moveX) > 0.05 || Math.abs(moveY) > 0.05) && Math.random() < 0.18) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: unit.position.x - Math.sign(moveX || 1) * 20, y: unit.position.y + (Math.random() - 0.5) * 12 },
            velocity: { x: -moveX * 0.4, y: -moveY * 0.4 },
            drag: 0.9,
            life: 20 + Math.random() * 10,
            color: '#a8a29e',
            size: 3 + Math.random() * 3,
            alt: 2 + Math.random() * 4,
            altVel: 0.25
          });
        }

        // Faint tread marks: throttled per vehicle and globally capped so the
        // ground never fills up with them
        if (isVehicle && (Math.abs(moveX) > 0.05 || Math.abs(moveY) > 0.05)) {
          const stagger = (unit.id.charCodeAt(1) || 0) * 7;
          if ((tickCountRef.current + stagger) % 28 === 0 &&
              particlesRef.current.reduce((n, pp) => n + (pp.isSkid ? 1 : 0), 0) < 60) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: unit.position.x, y: unit.position.y },
              life: 420, color: '#1c1917', size: unit.width * 0.5,
              isSkid: true, rot: Math.atan2(moveY, moveX),
            });
          }

          // Heavy wheels crush crates and set off barrels
          if (isSearchTick(unit)) {
            terrainRef.current.forEach(p => {
              if ((p.type !== 'crate' && p.type !== 'barrel') || p.state === 'broken') return;
              if (Math.abs(p.x - unit.position.x) < unit.width * 0.6 + p.size &&
                  Math.abs(p.y - unit.position.y) < unit.height * 0.6 + p.size) breakProp(p);
            });
          }
        }

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

      // A bunker under construction is a building site, not a gun position
      if (!isDescent && unit.attackCooldown <= 0 && !unit.buildUntil) {
        // Water Penalty Check
        // Re-find river (efficient enough as terrain array is small)
        const inWater = !config.isFlying && terrainRef.current.some(r => {
          if (r.type !== 'river' || !r.width || Math.abs(r.y - unit.position.y) > 18) return false;
          if (unit.position.x < r.x - r.width / 2 || unit.position.x > r.x + r.width / 2) return false;
          return !terrainRef.current.some(b =>
            b.type === 'bridge' && b.state !== 'broken' &&
            Math.abs(unit.position.y - b.y) < (b.height || 30) / 2 &&
            Math.abs(unit.position.x - b.x) < (b.width || 60) / 2 + 10
          );
        });

        const fogPenalty = weatherRef.current === 'fog' ? 0.45 : weatherRef.current === 'storm' ? 0.70 : 1.0;
        const range = (unit.isOnHill ? config.range * HILL_RANGE_BONUS : (inWater ? config.range * 0.4 : config.range)) * currentScale * fogPenalty;
        // Each soldier manning the bunker adds a gun in a slit — capped, so
        // stuffing the whole army in there buys nothing past the fourth man.
        const manned = Math.min(unit.garrison || 0, BUNKER_GARRISON_MAX);
        const vetMult = (1 + 0.1 * (unit.veterancy || 0)) * (1 + BUNKER_GARRISON_DAMAGE * manned);
        const vetReload = (1 - 0.06 * (unit.veterancy || 0)) * (1 - BUNKER_GARRISON_RELOAD * manned); // veterans reload up to 18% faster

        if (unit.type === UnitType.ANTI_AIR) {
          // AA targets Drones AND Descending Paratroopers
          let target = unitsRef.current.find(u => {
            if (u.team === unit.team) return false;
            const isAirTarget = u.type === UnitType.HELICOPTER || u.type === UnitType.DRONE || u.type === UnitType.FIGHTER || (u.type === UnitType.AIRBORNE && (Date.now() - (u.spawnTime || 0) < 3000));
            return isAirTarget && Math.sqrt((u.position.x - unit.position.x) ** 2 + (u.position.y - unit.position.y) ** 2) < range;
          });

          if (!target) {
            // Check flyovers (Airstrikes/Missiles)
            const fly = flyoversRef.current.find(f => f.team !== unit.team && Math.sqrt((f.currentX - unit.position.x) ** 2 + (f.altitudeY - unit.position.y) ** 2) < range);
            if (fly) {
              const a = Math.atan2(fly.altitudeY - unit.position.y, fly.currentX - unit.position.x);
              projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * roundSpeed(unit.type), y: Math.sin(a) * roundSpeed(unit.type) }, damage: config.damage * vetMult, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type, sourceUnitId: unit.id, isMissile: true });
              unit.attackCooldown = Math.round(config.attackSpeed * vetReload); soundService.playRocketSound();
            }
          } else {
            const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
            projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * roundSpeed(unit.type), y: Math.sin(a) * roundSpeed(unit.type) }, damage: config.damage * vetMult, maxRange: range, distanceTraveled: 0, targetType: 'air', sourceType: unit.type, sourceUnitId: unit.id, isMissile: true });
            unit.attackCooldown = Math.round(config.attackSpeed * vetReload); soundService.playRocketSound();
          }
        } else {
          // Standard Targeting (Ground)
          // Optimized Targeting
          const potentialTargets = spatialHash.current.query(unit.position.x, unit.position.y, range);

          let target = null;

          if (unit.type === UnitType.TRANSPORT) {
            // Unarmed — just drives
          } else if (unit.type === UnitType.FLAMETHROWER) {
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
            if (fired) { soundService.playFlameSound(); unit.attackCooldown = Math.round(config.attackSpeed * vetReload); }
          } else if (unit.type === UnitType.ENGINEER) {
            // Defuse the nearest enemy mine in detection range (mines don't trigger on engineers)
            const mine = unitsRef.current.find(m =>
              m.team !== unit.team &&
              (m.type === UnitType.MINE_PERSONAL || m.type === UnitType.MINE_TANK) &&
              Math.sqrt((m.position.x - unit.position.x) ** 2 + (m.position.y - unit.position.y) ** 2) < range
            );
            if (mine) {
              mine.health = 0; // removed without detonating
              soundService.playHitSound();
              for (let dp = 0; dp < 6; dp++) {
                particlesRef.current.push({
                  id: generateId(),
                  position: { x: mine.position.x + (Math.random() - 0.5) * 10, y: mine.position.y + (Math.random() - 0.5) * 10 },
                  velocity: { x: (Math.random() - 0.5) * 1.2, y: -Math.random() * 1.2 },
                  drag: 0.9,
                  life: 22,
                  color: '#4ade80',
                  size: 3 + Math.random() * 2
                });
              }
              unit.attackCooldown = config.attackSpeed;
            } else {
              // No mine in range: repair a damaged/broken bridge instead
              const bridge = terrainRef.current.find(b =>
                b.type === 'bridge' && (b.health ?? BRIDGE_HP) < BRIDGE_HP &&
                Math.sqrt((b.x - unit.position.x) ** 2 + (b.y - unit.position.y) ** 2) < range
              );
              if (bridge) {
                bridge.health = Math.min(BRIDGE_HP, (bridge.health ?? 0) + 55);
                if (bridge.health >= BRIDGE_HP * 0.5 && bridge.state === 'broken') {
                  bridge.state = 'normal'; // usable again at half integrity
                  pushEvent('bridge', `${teamName(unit.team)} engineer repaired the bridge`, unit.team);
                  soundService.playSpawnSound(unit.team === Team.EAST);
                }
                particlesRef.current.push({
                  id: generateId(),
                  position: { x: bridge.x + (Math.random() - 0.5) * 20, y: bridge.y + (Math.random() - 0.5) * 14 },
                  velocity: { x: 0, y: 0 },
                  life: 18,
                  color: '#fbbf24',
                  size: 4,
                  alt: 4, altVel: 0.4
                });
                unit.attackCooldown = Math.round(config.attackSpeed * 0.5);
              } else {
                // No mine, no broken bridge: patch up the most badly damaged
                // machine alongside him. A bunker still curing its build HP is
                // not "damaged" — leave that to the build cure.
                const wrecks = spatialHash.current.query(unit.position.x, unit.position.y, ENGINEER_REPAIR_RANGE)
                  .filter(m => m.team === unit.team && m.id !== unit.id && isMechanical(m.type) &&
                    m.health > 0 && m.health < m.maxHealth &&
                    !(m.buildUntil && Date.now() < m.buildUntil) &&
                    Math.sqrt((m.position.x - unit.position.x) ** 2 + (m.position.y - unit.position.y) ** 2) < ENGINEER_REPAIR_RANGE);
                if (wrecks.length > 0) {
                  const patient = wrecks.reduce((a, b) => (a.health / a.maxHealth) < (b.health / b.maxHealth) ? a : b);
                  patient.health = Math.min(patient.maxHealth, patient.health + ENGINEER_REPAIR);
                  // Welding sparks, so a repair reads at a glance
                  for (let s = 0; s < 3; s++) {
                    particlesRef.current.push({
                      id: generateId(),
                      position: { x: patient.position.x + (Math.random() - 0.5) * 14, y: patient.position.y + (Math.random() - 0.5) * 10 },
                      velocity: { x: (Math.random() - 0.5) * 1.4, y: -Math.random() * 1.1 },
                      drag: 0.9,
                      life: 20,
                      color: '#fbbf24',
                      size: 2 + Math.random() * 2,
                      alt: 5, altVel: 0.35,
                    });
                  }
                  soundService.playHealSound();
                  unit.attackCooldown = config.attackSpeed;
                }
              }
            }
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
              (o.type === UnitType.SOLDIER || o.type === UnitType.SNIPER || o.type === UnitType.SPECIAL_FORCES || o.type === UnitType.AIRBORNE) &&
              !smokeBlocked(unit, o) &&
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
                  unit.attackCooldown = unit.burstCount > 0 ? 5 : Math.round(config.attackSpeed * vetReload);
                }
              }
              // If waiting for cooldown, do nothing
            }
          } else {
            // Standard Unit Targeting

            // Player focus-fire target takes priority when in range and engageable
            const focus = focusRef.current[unit.team];
            if (focus.targetId && Date.now() < focus.until) {
              const ft = unitsRef.current.find(o => o.id === focus.targetId && o.team !== unit.team && o.health > 0);
              if (ft) {
                const ftIsAir = !!(UNIT_CONFIG[ft.type] as any).isFlying;
                const canEngageAirFocus = unit.type === UnitType.SOLDIER || unit.type === UnitType.SPECIAL_FORCES ||
                  unit.type === UnitType.SNIPER || unit.type === UnitType.HELICOPTER || unit.type === UnitType.FIGHTER;
                const fd = Math.sqrt((ft.position.x - unit.position.x) ** 2 + (ft.position.y - unit.position.y) ** 2);
                if ((!ftIsAir || canEngageAirFocus) && fd < range && !smokeBlocked(unit, ft)) target = ft;
              } else {
                focus.targetId = null;
              }
            }

            // Helicopter Priority Target: Tesla
            if (!target && unit.type === UnitType.HELICOPTER) {
              target = potentialTargets.find(o => o.team !== unit.team && o.type === UnitType.TESLA && Math.sqrt((o.position.x - unit.position.x) ** 2 + (o.position.y - unit.position.y) ** 2) < range);
            }

            // Fighter Priority Target: enemy aircraft
            if (!target && unit.type === UnitType.FIGHTER) {
              target = potentialTargets.find(o =>
                o.team !== unit.team && (UNIT_CONFIG[o.type] as any).isFlying &&
                Math.sqrt((o.position.x - unit.position.x) ** 2 + (o.position.y - unit.position.y) ** 2) < range
              ) || null;
            }

            // Primary pass: ground targets (all unit types)
            if (!target) {
              target = potentialTargets.find(o => {
                if (o.team === unit.team || o.type === UnitType.NAPALM || o.type === UnitType.MINE_PERSONAL || o.type === UnitType.MINE_TANK) return false;
                if ((UNIT_CONFIG[o.type] as any).isFlying) return false; // ground pass only
                const oLife = Date.now() - (o.spawnTime || 0);
                if (o.type === UnitType.AIRBORNE && oLife < 3000 && unit.type !== UnitType.HELICOPTER) return false;
                if (smokeBlocked(unit, o)) return false;
                return Math.sqrt((o.position.x - unit.position.x) ** 2 + ((o.position.y - unit.position.y) * 2) ** 2) < range;
              }) || null;
            }

            // Secondary pass: air targets — only infantry, snipers, and helicopters can engage air
            // Tanks and Artillery are strictly ground-only weapons
            if (!target) {
              const canEngageAir = unit.type === UnitType.SOLDIER || unit.type === UnitType.SPECIAL_FORCES ||
                unit.type === UnitType.SNIPER || unit.type === UnitType.HELICOPTER || unit.type === UnitType.FIGHTER;
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
                  projectilesRef.current.push({ id: generateId(), team: unit.team, position: { ...unit.position }, velocity: { x: Math.cos(a) * roundSpeed(unit.type), y: Math.sin(a) * roundSpeed(unit.type) }, damage: 0, maxRange: range, distanceTraveled: 0, targetType: targetIsAir ? 'air' : 'ground', sourceType: unit.type, sourceUnitId: unit.id });
                  unit.attackCooldown = config.attackSpeed; soundService.playSniperShot();
                  fireFx(unit, a);   // a miss still throws dust and gives his hide away
                  return;
                }
              }

              const a = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
              let spread = 0;
              if (unit.type === UnitType.ARTILLERY) {
                spread = (Math.random() - 0.5) * 0.55;
              } else if (unit.type === UnitType.MORTAR) {
                spread = (Math.random() - 0.5) * 0.4;
              }
              const isMissile = unit.type === UnitType.HELICOPTER;
              // Reach shows up in the shot: flat and fast for a long-barrelled
              // direct-fire gun, a slow climbing lob for indirect fire.
              const speed = roundSpeed(unit.type);
              const shotDist = Math.sqrt(
                (target.position.x - unit.position.x) ** 2 + (target.position.y - unit.position.y) ** 2);
              // Rounds wander the further out you shoot, so parking at max range
              // is no longer free — closing the distance buys accuracy.
              spread += spreadAtRange(unit.type, shotDist, range);

              projectilesRef.current.push({
                id: generateId(),
                team: unit.team,
                position: { ...unit.position },
                velocity: { x: Math.cos(a + spread) * speed, y: Math.sin(a + spread) * speed },
                damage: config.damage * vetMult,
                maxRange: range * (unit.type === UnitType.ARTILLERY ? 1.5 : 1.0),
                distanceTraveled: 0,
                targetType: targetIsAir ? 'air' : 'ground',
                explosionRadius: config.explosionRadius,
                sourceType: unit.type,
                sourceUnitId: unit.id,
                isMissile,
                ...(INDIRECT.has(unit.type)
                  ? { flightDist: shotDist, arcH: arcHeight(shotDist) }
                  : {}),
              });
              // A man with rounds cracking past him is slower to work his weapon
              const suppressReload = (unit.suppressedUntil && Date.now() < unit.suppressedUntil) ? SUPPRESSION_RELOAD_MULT : 1;
              unit.attackCooldown = Math.floor(config.attackSpeed * (unit.isOnHill ? HILL_RELOAD_BONUS : 1.0) * vetReload * suppressReload);
              fireFx(unit, a + spread);
              if (unit.type === UnitType.TANK || unit.type === UnitType.APC || unit.type === UnitType.BUNKER || unit.type === UnitType.GUNBOAT) soundService.playHeavyShot();
              else if (unit.type === UnitType.ARTILLERY) soundService.playArtilleryFire();
              else if (unit.type === UnitType.MORTAR) soundService.playMortarThunk();
              else if (unit.type === UnitType.SNIPER) soundService.playSniperShot();
              else if (unit.type === UnitType.HELICOPTER || unit.type === UnitType.FIGHTER) soundService.playRocketSound();
              else if (unit.type === UnitType.DRONE) soundService.playDroneZip();
              else soundService.playRifleShot();
            }
          }
        }
      }

      // Rallied units reload faster (cooldown ticks down 45% quicker)
      unit.attackCooldown = Math.max(0, unit.attackCooldown - (rallyOn[unit.team] ? RALLY_RELOAD_MULT : 1));

      if ((unit.team === Team.WEST && unit.position.x > CANVAS_WIDTH) || (unit.team === Team.EAST && unit.position.x < 0)) {
        const breakthroughValue = unit.type === UnitType.TANK ? 3 : 1;
        if (gameModeRef.current === 'basehp') {
          const defender = unit.team === Team.WEST ? Team.EAST : Team.WEST;
          baseHPRef.current[defender] = Math.max(0, baseHPRef.current[defender] - breakthroughValue);
          if (baseHPRef.current[defender] <= 0 && !gameOverRef.current) setGameOver(unit.team);
        } else {
          scoreRef.current[unit.team] += breakthroughValue;
        }

        // Breakthrough feedback: the points it scored + the 50% refund
        particlesRef.current.push({
          id: generateId(),
          position: { x: unit.position.x, y: unit.position.y },
          velocity: { x: 0, y: 0.55 },
          life: 100,
          color: '#fbbf24',
          size: 9,
          text: gameModeRef.current === 'basehp' ? `-${breakthroughValue} HP` : `+${breakthroughValue}${breakthroughValue > 1 ? ' ★' : ''}`,
        });
        particlesRef.current.push({
          id: generateId(),
          position: { x: unit.position.x, y: unit.position.y + 14 },
          velocity: { x: 0, y: 0.45 },
          life: 80,
          color: '#22c55e',
          size: 6,
          text: `+$${Math.floor(UNIT_CONFIG[unit.type].cost * 0.5)}`,
        });

        // Win Condition Check (points mode)
        if (gameModeRef.current === 'points' && scoreRef.current[unit.team] >= WIN_SCORE) {
          setGameOver(unit.team);
        }

        // Refund logic: 50% of cost — full refunds let the winning side snowball
        const cost = UNIT_CONFIG[unit.type].cost;
        moneyRef.current[unit.team] += Math.floor(cost * 0.5);
        unit.health = 0;
      }
    });

    // Projectiles Logic — the ONE place a round moves and resolves (backwards:
    // loop splices). Everything a shot obeys lives here: cover and foxholes, the
    // anti-air multipliers, blast falloff, craters, bridges.
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const p = projectilesRef.current[i];
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      // Rounds no longer share one speed, so range must be counted from the round's
      // OWN velocity — a constant here would let a fast round out-fly its range.
      p.distanceTraveled += Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2);

      // Suppression: a round that passes CLOSE to a foot soldier pins him, whether
      // or not it connects — a near miss is what suppressing fire is made of. Done
      // on the round's flight rather than at its impact point, because a shot that
      // whistles past and lands 200px behind him should still put his head down.
      spatialHash.current.queryCallback(p.position.x, p.position.y, SUPPRESSION_RADIUS, u => {
        if (u.team === p.team || u.health <= 0 || !isSuppressible(u.type)) return;
        if (Math.sqrt((u.position.x - p.position.x) ** 2 + (u.position.y - p.position.y) ** 2) > SUPPRESSION_RADIUS) return;
        u.suppressedUntil = Date.now() + SUPPRESSION_MS;
      });

      let hit = false;
      let explode = false;

      // Off the map: gone, no bang
      if (p.position.x < 0 || p.position.x > CANVAS_WIDTH ||
        p.position.y < (p.targetType === 'air' ? -50 : HORIZON_Y) || p.position.y > CANVAS_HEIGHT + 50) {
        projectilesRef.current.splice(i, 1);
        continue;
      }

      // Check Max Range
      if (p.distanceTraveled >= p.maxRange) {
        explode = true;
      }

      // Anti-air rounds can also swat a flyover (the strike aircraft themselves)
      if (!explode && p.targetType === 'air') {
        for (const fly of flyoversRef.current) {
          if (fly.team !== p.team &&
            Math.sqrt((fly.currentX - p.position.x) ** 2 + (fly.altitudeY - p.position.y) ** 2) < 35) {
            fly.health -= p.damage;
            hit = true; explode = true;
            break;
          }
        }
      }

      // Check Collision (Simple Circle)
      if (!explode) {
        const target = unitsRef.current.find(u => {
          if (u.team === p.team || u.health <= 0) return false;
          // Mines and burning napalm are terrain, not something you can shoot
          if (u.type === UnitType.NAPALM || u.type === UnitType.MINE_PERSONAL || u.type === UnitType.MINE_TANK) return false;
          // Air vs Ground check
          if (p.targetType === 'air' && !(UNIT_CONFIG[u.type] as any).isFlying && u.type !== UnitType.AIRBORNE) return false;
          if (p.targetType === 'ground' && (UNIT_CONFIG[u.type] as any).isFlying) return false; // Ground missiles don't hit planes randomly usually

          // Perspective-scaled body radius (the old dual-loop code disagreed on
          // this too; this is the more generous of the two, which is what
          // actually governed hit rates in practice).
          const hitDist = u.type === UnitType.DRONE ? 18 : (u.width * getScaleAt(u.position.y)) / 1.2;
          return Math.sqrt((u.position.x - p.position.x) ** 2 + (u.position.y - p.position.y) ** 2) < hitDist;
        });

        if (target) {
          hit = true;
          explode = true;

          // An explosive round does its damage as a blast (with falloff, below) —
          // applying a direct hit as well would double-dip the primary target.
          if (!p.explosionRadius) {
            let damage = p.damage;
            // Cover and foxholes soak a direct hit; heavy/explosive weapons dig you out
            const ignoresCover = p.sourceType === UnitType.TANK || p.sourceType === UnitType.ARTILLERY ||
              p.sourceType === UnitType.DRONE || p.sourceType === UnitType.AIRSTRIKE ||
              p.sourceType === UnitType.MISSILE_STRIKE || p.sourceType === UnitType.NUKE;
            if (!ignoresCover && target.isInCover) damage *= 0.4;
            else if (!ignoresCover && target.isEntrenched) damage *= 0.55;

            // AA is the hard counter to air — 3× vs helicopter, 2× vs drone
            if (p.sourceType === UnitType.ANTI_AIR) {
              if (target.type === UnitType.HELICOPTER) damage *= 3;
              else if (target.type === UnitType.DRONE || target.type === UnitType.FIGHTER) damage *= 2;
            }
            // Small arms (soldiers, special forces) are 30% effective against aircraft
            if ((UNIT_CONFIG[target.type] as any).isFlying &&
              (p.sourceType === UnitType.SOLDIER || p.sourceType === UnitType.SPECIAL_FORCES)) {
              damage *= 0.3;
            }

            // Armor is thick where it faces the enemy. A hit up the back of a tank
            // bites; one on the glacis does not. Ground vehicles and emplacements
            // only — a rifleman has no armor to angle. Stationary machines are
            // taken to face the way their team advances.
            const roundDir = Math.atan2(p.velocity.y, p.velocity.x);
            if (isMechanical(target.type) && !(UNIT_CONFIG[target.type] as any).isFlying) {
              const v = target.vel;
              const moving = v && (Math.abs(v.x) > 0.05 || Math.abs(v.y) > 0.05);
              const facing = moving
                ? Math.atan2(v!.y, v!.x)
                : (target.team === Team.WEST ? 0 : Math.PI);
              damage *= armorFacingMult(roundDir, facing);
            }

            target.health -= damage;
            target.lastHitTime = Date.now();
            if (p.sourceUnitId) target.lastAttackerId = p.sourceUnitId;
            // Blood or Sparks
            if (target.type === UnitType.SOLDIER || target.type === UnitType.SPECIAL_FORCES) {
              particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 20, color: '#7f1d1d', size: 5 });
            }
            // Scaled by the damage that ACTUALLY landed — after cover and after the
            // AA multipliers — so a soaked round visibly lands softer than a clean one.
            impactFx(p.position.x, p.position.y, damage,
              Math.atan2(p.velocity.y, p.velocity.x), isMechanical(target.type));
          }
        }
      }

      if (explode) {
        projectilesRef.current.splice(i, 1);
        // A rifle round is not an explosion — the old dual-loop code played the
        // hit sound from one loop and the blast from the other.
        if (p.explosionRadius) soundService.playExplosionSound();
        else if (hit) soundService.playHitSound();

        // Explosion Effect
        for (let k = 0; k < 5; k++) {
          particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 15, color: '#fbbf24', size: 4, alt: 8 + Math.random() * 8, altVel: 0.4 });
        }
        if (hit && p.damage > 30) {
          particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 40, color: '#57534e', size: 6, alt: 10, altVel: 0.6 });
        }

        // Area Damage (Explosion Radius)
        if (p.explosionRadius) {
          shakeRef.current = Math.max(shakeRef.current, Math.min(5, p.explosionRadius * 0.06));
          particlesRef.current.push({ id: generateId(), position: { x: p.position.x, y: p.position.y }, life: 14, color: '#fdba74', size: p.explosionRadius * 1.2, isShockwave: true });
          damageBridges(p.position.x, p.position.y, p.explosionRadius, p.damage);
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
            if (u.team !== p.team && u.health > 0) {
              const d = Math.sqrt((u.position.x - p.position.x) ** 2 + (u.position.y - p.position.y) ** 2);
              if (d < p.explosionRadius!) {
                u.health -= p.damage * (1 - d / p.explosionRadius!);
                // Attribution matters: without it the blast kills nobody as far as
                // the game is concerned — no veterancy for the gunner, and the
                // stats credit the kill to no one (artillery and mortar showed 0
                // kills in the harness the moment their damage moved to this path).
                u.lastHitTime = Date.now();
                if (p.sourceUnitId) u.lastAttackerId = p.sourceUnitId;
              }
            }
          });
        }

        // Small scorch from heavy direct-fire shells (tank etc.)
        if (!p.explosionRadius && p.damage > 30 && p.targetType !== 'air') {
          particlesRef.current.push({
            id: generateId(),
            position: { x: p.position.x, y: p.position.y },
            life: 300,
            color: '#292524',
            size: 9,
            isGroundDecal: true
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
    }


    // Backwards loop: splicing inside forEach skips elements and is O(n²)
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      if (p.velocity) {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        if (p.drag) {
          p.velocity.x *= p.drag;
          p.velocity.y *= p.drag;
        }
      }
      if (p.altVel !== undefined) {
        p.alt = (p.alt ?? 0) + p.altVel;
        p.altVel *= 0.99;
        if (p.alt < 0) p.alt = 0;
      }
      if (--p.life <= 0) particlesRef.current.splice(i, 1);
    }

    // Check for vehicle deaths for explosions
    const deadUnits = unitsRef.current.filter(u => u.health <= 0);
    deadUnits.forEach(u => {
      // A bunker that falls buries part of its garrison; the rest scramble out
      // of the rubble, hurt.
      if (u.type === UnitType.BUNKER && u.passengers?.length) {
        const survivors = u.passengers.filter(() => Math.random() < 0.6);
        survivors.forEach((p, idx) => {
          p.boarded = false;
          p.health = Math.max(1, Math.floor(p.health * 0.45));
          p.lastHitTime = Date.now();
          p.state = UnitState.MOVING;
          p.position.x = u.position.x + ((idx % 2) === 0 ? -1 : 1) * (14 + idx * 4);
          p.position.y = Math.max(HORIZON_Y + 12, Math.min(CANVAS_HEIGHT - 12, u.position.y + (idx - 1) * 12));
          if (!unitsRef.current.includes(p)) unitsRef.current.push(p);
        });
        // Anyone who didn't make it out counts as a loss
        statsRef.current[u.team].lost += u.passengers.length - survivors.length;
        u.passengers = [];
        u.garrison = 0;
      }

      // Destroyed transports spill their passengers, shaken but alive
      if (u.type === UnitType.TRANSPORT && u.passengers?.length) {
        u.passengers.forEach((p, idx) => {
          p.boarded = false;
          p.health = Math.max(1, Math.floor(p.health * 0.5));
          p.lastHitTime = Date.now();
          p.state = UnitState.MOVING;
          p.position.x = u.position.x + ((idx % 3) - 1) * 18;
          p.position.y = Math.max(HORIZON_Y + 12, Math.min(CANVAS_HEIGHT - 12, u.position.y + (Math.floor(idx / 3) - 0.5) * 26));
          if (!unitsRef.current.includes(p)) unitsRef.current.push(p); // guard against same-tick board duplication
        });
        u.passengers = [];
      }
      if (u.type !== UnitType.NAPALM && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK) {
        // Feed only reports high-value losses so cheap squads don't flood it
        if (((UNIT_CONFIG[u.type] as any).cost || 0) >= 100) {
          pushEvent('kill', `${teamName(u.team)} ${unitLabel(u.type)} destroyed`, u.team);
        }
        statsRef.current[u.team].lost++;
        const ts = typeStatsRef.current[u.team];
        ts.lost[u.type] = (ts.lost[u.type] || 0) + 1;
        // Credit the killer's unit type (attacker may itself have died this tick — units not filtered yet)
        if (u.lastAttackerId) {
          const attacker = unitsRef.current.find(k => k.id === u.lastAttackerId);
          if (attacker && attacker.team !== u.team) {
            const ks = typeStatsRef.current[attacker.team];
            ks.kills[attacker.type] = (ks.kills[attacker.type] || 0) + 1;
            ks.killValue[attacker.type] = (ks.killValue[attacker.type] || 0) + ((UNIT_CONFIG[u.type] as any).cost || 0);
          }
        }
      }
      // Kill Reward: Award 25% of unit cost to enemy (40% snowballed too hard)
      const reward = Math.floor(((UNIT_CONFIG[u.type] as any).cost || 0) * 0.25);
      if (reward > 0) {
        const killerTeam = u.team === Team.WEST ? Team.EAST : Team.WEST;
        moneyRef.current[killerTeam] += reward;
        // Bounty popup at the kill site — only for meaningful rewards so
        // massed squad deaths don't wallpaper the field with text
        if (reward >= 15) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: u.position.x, y: u.position.y },
            velocity: { x: 0, y: 0.5 },
            life: 60,
            color: '#4ade80',
            size: 5,
            text: `+$${reward}`,
          });
        }
      }

      if (u.type === UnitType.APC) {
        // Survivors bail out of the wreck — but only if the squad was still
        // aboard; a deployed APC has already put them on the ground.
        soundService.playLargeExplosion();
        const soldierCfg = UNIT_CONFIG[UnitType.SOLDIER];
        for (let si = 0; si < (u.deployed ? 0 : APC_SQUAD); si++) {
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
      } else if (u.type === UnitType.TANK || u.type === UnitType.ARTILLERY || u.type === UnitType.JEEP) {
        soundService.playLargeExplosion();
        for (let k = 0; k < 15; k++) {
          particlesRef.current.push({
            id: generateId(),
            position: { x: u.position.x + (Math.random() - 0.5) * 30, y: u.position.y + (Math.random() - 0.5) * 30 },
            life: 45, color: k % 2 === 0 ? '#ef4444' : '#f97316', size: 8 + Math.random() * 10,
            alt: 4 + Math.random() * 16, altVel: 0.5 + Math.random() * 0.7
          });
        }
      } else if (u.type === UnitType.SOLDIER || u.type === UnitType.SPECIAL_FORCES || u.type === UnitType.AIRBORNE ||
                 u.type === UnitType.SNIPER || u.type === UnitType.FLAMETHROWER || u.type === UnitType.MEDIC || u.type === UnitType.ENGINEER ||
                 u.type === UnitType.MORTAR) {
        // Troops Scream & Blood (flat pool at ground level)
        soundService.playScreamSound();
        particlesRef.current.push({
          id: generateId(),
          position: { x: u.position.x, y: u.position.y },
          life: 180, // 3 seconds at 60fps
          color: '#7f1d1d', // Dark Red Blood
          size: 12 + Math.random() * 5,
          alt: 0.5
        });
      }

      // Corpse / wreck left on the battlefield
      const cfg = UNIT_CONFIG[u.type] as any;
      const isInfantryDeath = u.type === UnitType.SOLDIER || u.type === UnitType.SPECIAL_FORCES || u.type === UnitType.AIRBORNE ||
        u.type === UnitType.SNIPER || u.type === UnitType.FLAMETHROWER || u.type === UnitType.MEDIC || u.type === UnitType.ENGINEER ||
        u.type === UnitType.MORTAR;
      const isVehicleDeath = u.type === UnitType.TANK || u.type === UnitType.ARTILLERY || u.type === UnitType.APC || u.type === UnitType.JEEP || u.type === UnitType.TRANSPORT;
      if (isInfantryDeath || isVehicleDeath) {
        particlesRef.current.push({
          id: generateId(),
          position: { ...u.position },
          life: isVehicleDeath ? 420 : 240,
          color: isVehicleDeath ? '#1c1917' : (u.team === Team.WEST ? cfg.colorWest : cfg.colorEast),
          size: isVehicleDeath ? 30 : 14,
          isCorpse: true
        });
        // Smoke column rising off the burning wreck
        if (isVehicleDeath) {
          for (let k = 0; k < 10; k++) {
            particlesRef.current.push({
              id: generateId(),
              position: { x: u.position.x + (Math.random() - 0.5) * 16, y: u.position.y + (Math.random() - 0.5) * 12 },
              velocity: { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3 },
              drag: 0.99,
              life: 90 + Math.random() * 160,
              color: k % 3 === 0 ? '#292524' : k % 2 === 0 ? '#44403c' : '#57534e',
              size: 6 + Math.random() * 9,
              alt: 8 + Math.random() * 8,
              altVel: 0.35 + Math.random() * 0.45
            });
          }
        }
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

    unitsRef.current = unitsRef.current.filter(u => u.health > 0 && !u.boarded);

    // CPU AI — strategic commander for either side (or both, in spectator mode)
    for (const ME of cpuRef.current.teams) {
      const FOE = ME === Team.EAST ? Team.WEST : Team.EAST;
      const DIFF = CPU_DIFFICULTY[cpuRef.current.difficulty];

      cpuTimerRef.current[ME] += 1;
      moneyRef.current[ME] += DIFF.incomeBonus; // difficulty economy edge

      // Battlefield snapshot (computed every frame for adaptive timing)
      const myActive = unitsRef.current.filter(u => u.team === ME && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM);
      const foeActive = unitsRef.current.filter(u => u.team === FOE && u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM);
      const scoreDiff = gameModeRef.current === 'basehp'
        ? baseHPRef.current[ME] - baseHPRef.current[FOE]  // + = CPU winning
        : scoreRef.current[ME] - scoreRef.current[FOE];   // + = CPU winning

      // Adaptive spawn rate: faster when losing or outnumbered
      const isUnderPressure = myActive.length < foeActive.length - 2 || scoreDiff < -12;
      const spawnInterval = Math.round((isUnderPressure ? 88 : 145) * DIFF.interval);

      if (cpuTimerRef.current[ME] >= spawnInterval) {
        cpuTimerRef.current[ME] = 0;

        // Hard CPU generalship: read the balance of forces and set the army
        // stance — fall back to regroup (and heal) when badly outmatched,
        // dig in when slightly weaker, push when stronger.
        if (DIFF.stanceIQ) {
          const val = (us: Unit[]) => us.reduce((s, u) => s + ((UNIT_CONFIG[u.type] as any).cost || 0), 0);
          const myVal = val(myActive), foeVal = val(foeActive);
          const desired: Stance = foeVal > 200 && myVal < foeVal * 0.5 ? 'retreat'
            : foeVal > 200 && myVal < foeVal * 0.75 ? 'hold'
            : 'advance';
          if (stancesRef.current[ME] !== desired) {
            stancesRef.current[ME] = desired;
            pushEvent('command', `${teamName(ME)} army ${desired === 'retreat' ? 'falls back to regroup' : desired === 'hold' ? 'digs in' : 'advances'}!`, ME);
          }
        }

        // Team commands come out of the wallet BEFORE unit shopping so the
        // affordability snapshot below stays accurate. `commands` scales how
        // eagerly this difficulty invests (easy never does).
        if (DIFF.commands > 0) {
          const lvl = incomeLevelRef.current[ME];
          if (lvl < INCOME_UPGRADE_MAX &&
              moneyRef.current[ME] > INCOME_UPGRADE_BASE_COST * (lvl + 1) + 350 &&
              Math.random() < 0.3 * DIFF.commands) {
            runCommand(ME, 'income');
          }
          const myGroundCount = myActive.filter(u => !(UNIT_CONFIG[u.type] as any).isFlying).length;
          if (myGroundCount >= 8 && moneyRef.current[ME] > RALLY_COST + 250 && Math.random() < 0.12 * DIFF.special * DIFF.commands) {
            runCommand(ME, 'rally'); // validates its own cooldown
          }
        }

        const money = moneyRef.current[ME];

        // --- Threat analysis ---
        const foeUnits = unitsRef.current.filter(u => u.team === FOE);
        const airThreats    = foeUnits.filter(u => u.type === UnitType.HELICOPTER || u.type === UnitType.DRONE || u.type === UnitType.FIGHTER).length;
        const armorThreats  = foeUnits.filter(u => u.type === UnitType.TANK || u.type === UnitType.APC).length;
        const infThreats    = foeUnits.filter(u => u.type === UnitType.SOLDIER || u.type === UnitType.SPECIAL_FORCES || u.type === UnitType.AIRBORNE || u.type === UnitType.FLAMETHROWER).length;
        // Foe front line: their furthest advance toward the CPU's edge
        const foeFrontX     = foeUnits.length > 0
          ? (FOE === Team.WEST ? Math.max(...foeUnits.map(u => u.position.x)) : Math.min(...foeUnits.map(u => u.position.x)))
          : (FOE === Team.WEST ? 0 : CANVAS_WIDTH);

        const myHasAA     = myActive.some(u => u.type === UnitType.ANTI_AIR);
        const myHasMedic  = myActive.some(u => u.type === UnitType.MEDIC);
        const myHasTesla  = myActive.some(u => u.type === UnitType.TESLA);
        const myInfCount  = myActive.filter(u => u.type === UnitType.SOLDIER || u.type === UnitType.SPECIAL_FORCES).length;

        // Helper: add weight only if affordable
        const can = (t: UnitType) => money >= (UNIT_CONFIG[t] as any).cost;
        const prio: Partial<Record<UnitType, number>> = {};
        const add = (t: UnitType, w: number) => { if (can(t)) prio[t] = (prio[t] || 0) + w; };

        // --- Counter-picks (emergency priority) ---
        // Lower difficulties often fail to read the foe's composition and
        // just build from the general pool below.
        if (Math.random() < DIFF.counterSmart) {
          if (airThreats >= 2 && !myHasAA)  add(UnitType.ANTI_AIR, 10);
          else if (airThreats >= 1 && !myHasAA) add(UnitType.ANTI_AIR, 5);
          if (airThreats >= 2) add(UnitType.FIGHTER, 4);
          if (infThreats >= 4) add(UnitType.MORTAR, 3);
          if (armorThreats >= 3)               { add(UnitType.ARTILLERY, 6); add(UnitType.HELICOPTER, 4); }
          else if (armorThreats >= 1)          add(UnitType.ARTILLERY, 3);
          if (infThreats >= 6 && !myHasTesla) add(UnitType.TESLA, 7);
          else if (infThreats >= 4)            { add(UnitType.FLAMETHROWER, 4); add(UnitType.TESLA, 3); }
          else if (infThreats >= 2)            add(UnitType.FLAMETHROWER, 2);
        }

        // --- Support ---
        if (!myHasMedic && myInfCount >= 3) add(UnitType.MEDIC, 5);
        const foeMines = foeUnits.filter(u => u.type === UnitType.MINE_PERSONAL || u.type === UnitType.MINE_TANK).length;
        if (foeMines >= 2) add(UnitType.ENGINEER, 5);
        else if (foeMines >= 1) add(UnitType.ENGINEER, 2);
        // Broken bridges on my half of the map need an engineer
        const myHasEngineer = myActive.some(u => u.type === UnitType.ENGINEER);
        const brokenBridgesMySide = terrainRef.current.filter(b =>
          b.type === 'bridge' && b.state === 'broken' &&
          (ME === Team.WEST ? b.x < CANVAS_WIDTH / 2 + 60 : b.x > CANVAS_WIDTH / 2 - 60)
        ).length;
        if (brokenBridgesMySide > 0 && !myHasEngineer) add(UnitType.ENGINEER, 6);
        // A banged-up armored column is worth a mechanic: he is the only way to
        // put HP back into a tank without walking it home.
        const myHurtArmor = myActive.filter(u => isMechanical(u.type) && u.health < u.maxHealth * 0.7).length;
        if (myHurtArmor >= 2 && !myHasEngineer) add(UnitType.ENGINEER, 5);
        else if (myHurtArmor >= 1 && !myHasEngineer) add(UnitType.ENGINEER, 2);

        // --- General composition ---
        add(UnitType.TANK, 3);
        add(UnitType.SOLDIER, 3);
        add(UnitType.SNIPER, 2);
        add(UnitType.HELICOPTER, 2);
        add(UnitType.APC, 2);
        add(UnitType.ARTILLERY, 1);
        add(UnitType.ANTI_AIR, 1);
        add(UnitType.DRONE, 1);
        add(UnitType.SPECIAL_FORCES, 1);
        add(UnitType.FLAMETHROWER, 1);
        add(UnitType.JEEP, 2);
        add(UnitType.MORTAR, 1);
        add(UnitType.FIGHTER, 1);
        if (myInfCount >= 4) add(UnitType.TRANSPORT, 2);

        // --- Special tactics (override normal spawn with a chance) ---
        let specialSpawned = false;

        // Smoke blinds the foe's long-range battery: dropped ON their
        // artillery/snipers/mortars, the cloud stops them firing out while my
        // units close the distance. (Never on my own troops — smoke blocks
        // targeting both ways, so that would blind my own push.)
        const foeLongRange = foeUnits.filter(u => u.type === UnitType.ARTILLERY || u.type === UnitType.SNIPER || u.type === UnitType.MORTAR);
        if (!specialSpawned && can(UnitType.SMOKE) && foeLongRange.length >= 2 && smokesRef.current.length < 2 && Math.random() < 0.2 * DIFF.special) {
          const cx = foeLongRange.reduce((s, u) => s + u.position.x, 0) / foeLongRange.length;
          const cy = foeLongRange.reduce((s, u) => s + u.position.y, 0) / foeLongRange.length;
          spawnUnit(ME, UnitType.SMOKE, { absolutePos: { x: cx, y: cy } });
          moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.SMOKE] as any).cost;
          specialSpawned = true;
        }

        // Missile strike at enemy cluster
        if (!specialSpawned && can(UnitType.MISSILE_STRIKE) && foeUnits.length >= 6 && Math.random() < 0.25 * DIFF.special) {
          const cx = foeUnits.reduce((s, u) => s + u.position.x, 0) / foeUnits.length;
          const cy = foeUnits.reduce((s, u) => s + u.position.y, 0) / foeUnits.length;
          spawnUnit(ME, UnitType.MISSILE_STRIKE, { absolutePos: { x: cx, y: cy } });
          moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.MISSILE_STRIKE] as any).cost;
          specialSpawned = true;
        }

        // Cruise missile at a big enemy cluster
        if (!specialSpawned && can(UnitType.CRUISE) && foeUnits.length >= 8 && Math.random() < 0.15 * DIFF.special) {
          const cx = foeUnits.reduce((s, u) => s + u.position.x, 0) / foeUnits.length;
          const cy = foeUnits.reduce((s, u) => s + u.position.y, 0) / foeUnits.length;
          spawnUnit(ME, UnitType.CRUISE, { absolutePos: { x: cx, y: cy } });
          moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.CRUISE] as any).cost;
          specialSpawned = true;
        }

        // Satellite laser on the foe's densest forward position when flush with cash
        if (!specialSpawned && can(UnitType.SATELLITE) && money > 600 && foeUnits.length >= 10 && Math.random() < 0.08 * DIFF.special) {
          const fwd = foeUnits.reduce((a, b) => (ME === Team.EAST ? a.position.x > b.position.x : a.position.x < b.position.x) ? a : b);
          spawnUnit(ME, UnitType.SATELLITE, { absolutePos: { x: fwd.position.x, y: fwd.position.y } });
          moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.SATELLITE] as any).cost;
          specialSpawned = true;
        }

        // Airborne drop behind foe lines when they push deep
        const foePushedDeep = FOE === Team.WEST ? foeFrontX > 450 : foeFrontX < 350;
        // A paradrop is a raid, not a staple. The CPU used to roll for one every
        // cycle (0.2) and sank $6-7k a session into sticks that died to a man —
        // the single biggest hole in its economy. It now raids rarely, and only
        // when the sampling below actually finds a hole to land in.
        if (!specialSpawned && can(UnitType.AIRBORNE) && foePushedDeep && Math.random() < 0.07 * DIFF.special) {
          // Drop into a GAP. This used to pick a blind random spot 80-200px from
          // the foe's edge — i.e. right on top of their spawn, the one place their
          // entire reinforcement stream walks through. The stick landed in the
          // middle of the enemy's production line and died to a man (100% losses).
          // Sample a few candidates behind their front and take the one furthest
          // from their nearest unit.
          const foeAlive = unitsRef.current.filter(u => u.team === FOE && u.health > 0 &&
            u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM);
          let drop = { x: 0, y: 0 }, bestClear = -1;
          for (let s = 0; s < 8; s++) {
            const x = FOE === Team.WEST ? 70 + Math.random() * 210 : CANVAS_WIDTH - 280 + Math.random() * 210;
            const y = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
            let nearest = Infinity;
            for (const u of foeAlive) {
              const d = Math.sqrt((u.position.x - x) ** 2 + (u.position.y - y) ** 2);
              if (d < nearest) nearest = d;
            }
            const clear = Math.min(nearest, 260);   // beyond ~260 it is all equally empty
            if (clear > bestClear) { bestClear = clear; drop = { x, y }; }
          }
          // No hole worth landing in — keep the money. Dropping anyway is how the
          // stick used to end up on top of the enemy's spawn.
          if (bestClear > 130) {
            spawnUnit(ME, UnitType.AIRBORNE, { absolutePos: drop });
            moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.AIRBORNE] as any).cost;
            specialSpawned = true;
          }
        }

        // Naval picket: anchor a gunboat on a river segment to guard crossings
        // (spawnUnit vetoes dry positions, so a failed roll costs nothing)
        if (!specialSpawned && can(UnitType.GUNBOAT) && money > 300 && Math.random() < 0.08 * DIFF.special) {
          const rivers = terrainRef.current.filter(t => t.type === 'river');
          const myBoats = unitsRef.current.filter(u => u.team === ME && u.type === UnitType.GUNBOAT).length;
          if (rivers.length > 0 && myBoats < 2) {
            const seg = rivers[Math.floor(Math.random() * rivers.length)];
            const ok = spawnUnit(ME, UnitType.GUNBOAT, { absolutePos: { x: seg.x, y: seg.y } });
            if (ok !== false) {
              moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.GUNBOAT] as any).cost;
              specialSpawned = true;
            }
          }
        }

        // Tank mines when armor is a threat — laid just ahead of the foe's front line
        if (!specialSpawned && can(UnitType.MINE_TANK) && armorThreats >= 2 && Math.random() < 0.3 * DIFF.special) {
          const mineX = ME === Team.EAST
            ? Math.min(Math.max(foeFrontX + 50, 530), 720)
            : Math.max(Math.min(foeFrontX - 50, 270), 80);
          const mineY = HORIZON_Y + 60 + Math.random() * (CANVAS_HEIGHT - HORIZON_Y - 120);
          spawnUnit(ME, UnitType.MINE_TANK, { absolutePos: { x: mineX, y: mineY } });
          moneyRef.current[ME] -= (UNIT_CONFIG[UnitType.MINE_TANK] as any).cost;
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
                                         UnitType.MISSILE_STRIKE, UnitType.AIRBORNE, UnitType.MINE_PERSONAL, UnitType.MINE_TANK,
                                         UnitType.SATELLITE, UnitType.CRUISE, UnitType.BUNKER, UnitType.SMOKE, UnitType.GUNBOAT]);
              const affordable = (Object.keys(UNIT_CONFIG) as UnitType[]).filter(t => {
                const cost = (UNIT_CONFIG[t] as any).cost;
                return cost > 0 && cost <= money && !noAiTypes.has(t);
              });
              if (affordable.length > 0) pool.push(...affordable);
            }

            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * pool.length)];
              const cost = (UNIT_CONFIG[chosen] as any).cost;
              // Flank pressure (normal/hard): lean spawns toward flank posts
              // the CPU doesn't hold — easy keeps building blind
              let lane: SpawnLane | undefined;
              if (DIFF.commands > 0 && Math.random() < 0.45) {
                const [topCap, botCap] = flankCapsRef.current;
                const wantTop = topCap.owner !== ME;
                const wantBot = botCap.owner !== ME;
                if (wantTop && wantBot) lane = Math.random() < 0.5 ? 'top' : 'bot';
                else if (wantTop) lane = 'top';
                else if (wantBot) lane = 'bot';
              }
              if (chosen === UnitType.SOLDIER) {
                const soldierCfg = UNIT_CONFIG[UnitType.SOLDIER];
                const sqId = generateId();
                const playTop = HORIZON_Y + 50, playH = CANVAS_HEIGHT - HORIZON_Y - 100;
                const laneY =
                  lane === 'top' ? playTop + Math.random() * (playH / 3) :
                  lane === 'bot' ? playTop + (2 * playH) / 3 + Math.random() * (playH / 3) :
                  playTop + Math.random() * playH;
                for (let si = 0; si < 3; si++) {
                  unitsRef.current.push({
                    id: generateId(), team: ME, type: UnitType.SOLDIER,
                    position: { x: ME === Team.WEST ? 30 : CANVAS_WIDTH - 30, y: Math.min(CANVAS_HEIGHT - 20, laneY + si * 12) },
                    state: UnitState.MOVING, health: soldierCfg.health, maxHealth: soldierCfg.health,
                    attackCooldown: 0, targetId: null, width: soldierCfg.width, height: soldierCfg.height,
                    spawnTime: Date.now(), isInCover: false, squadId: sqId
                  });
                  statsRef.current[ME].built++;
                  typeStatsRef.current[ME].spawned[UnitType.SOLDIER] = (typeStatsRef.current[ME].spawned[UnitType.SOLDIER] || 0) + 1;
                }
              } else {
                spawnUnit(ME, chosen, lane ? { lane } : undefined);
              }
              moneyRef.current[ME] = Math.max(0, moneyRef.current[ME] - cost);
            }
          }
        }
      }
    }

    // UI Update Strategy:
    // 1. Force R3F re-render locally 60fps (for smooth movement)
    setFrame(f => f + 1);

    // Timeline sample for the victory-screen graph
    if (Date.now() - lastSampleRef.current > 5000) {
      lastSampleRef.current = Date.now();
      const hp = gameModeRef.current === 'basehp';
      scoreHistoryRef.current.push({
        t: Date.now() - matchStartRef.current,
        w: hp ? baseHPRef.current[Team.WEST] : scoreRef.current[Team.WEST],
        e: hp ? baseHPRef.current[Team.EAST] : scoreRef.current[Team.EAST],
      });
      if (scoreHistoryRef.current.length > 400) scoreHistoryRef.current.shift();
    }

    // 2. Throttle App/UI updates to 10fps (for score/money/performance)
    if (Date.now() - lastUiUpdateRef.current > 100) {
      onGameStateChange({ units: unitsRef.current, projectiles: projectilesRef.current, particles: particlesRef.current, score: scoreRef.current, money: moneyRef.current, weather: weatherRef.current, weatherNext: { type: nextWeatherRef.current, at: weatherTimerRef.current }, events: eventsRef.current, captureOwner: captureRef.current.owner, flankOwners: flankCapsRef.current.map(f => f.owner), incomeLevel: { ...incomeLevelRef.current }, rally: { [Team.WEST]: { ...rallyRef.current[Team.WEST] }, [Team.EAST]: { ...rallyRef.current[Team.EAST] } }, baseHP: baseHPRef.current });
      lastUiUpdateRef.current = Date.now();
      // Balance-telemetry hook for headless harnesses
      (window as any).__ewDebug = {
        elapsedMs: Date.now() - matchStartRef.current,
        score: { ...scoreRef.current },
        baseHP: { ...baseHPRef.current },
        money: { WEST: Math.floor(moneyRef.current[Team.WEST]), EAST: Math.floor(moneyRef.current[Team.EAST]) },
        stats: statsRef.current,
        typeStats: typeStatsRef.current,
        unitCount: {
          WEST: unitsRef.current.filter(u => u.team === Team.WEST).length,
          EAST: unitsRef.current.filter(u => u.team === Team.EAST).length,
        },
        smokes: smokesRef.current.length,
        particles: particlesRef.current.length,   // firing FX ride this array — watch it under sustained fire
        projectiles: projectilesRef.current.length,
        fxStats: { ...fxStatsRef.current },       // monotonic: particles CREATED by fire/impact, per shot and hit
        entrenched: unitsRef.current.filter(u => u.isEntrenched).length,
        suppressed: unitsRef.current.filter(u => u.suppressedUntil && Date.now() < u.suppressedUntil).length,
        incomeLevel: { ...incomeLevelRef.current },
        rallyReadyAt: { WEST: rallyRef.current[Team.WEST].readyAt, EAST: rallyRef.current[Team.EAST].readyAt },
        unitOrders: unitsRef.current.filter(u => u.orders).length,
        selectedCount: (selectedIds ?? []).length,
        // Test hook: select the first n units of the first human team
        selectOwn: (n: number) => {
          const human = [Team.WEST, Team.EAST].find(t => !cpuRef.current.teams.includes(t));
          if (!human) return [];
          const ids = unitsRef.current.filter(u => u.team === human && u.health > 0 && !u.boarded).slice(0, n).map(u => u.id);
          onSelectUnitsRef.current?.(human, ids);
          return ids;
        },
        // Test hook: place a unit directly (skips the click-to-place ray, which is
        // fiddly to drive headlessly). Goes through the real spawn path.
        spawn: (team: 'WEST' | 'EAST', type: string, x?: number, y?: number) => {
          const t = team === 'WEST' ? Team.WEST : Team.EAST;
          const ut = UnitType[type as keyof typeof UnitType];
          if (!ut) return false;
          return spawnUnit(t, ut, x !== undefined && y !== undefined ? { absolutePos: { x, y } } : undefined) !== false;
        },
        // Test hook: end the match immediately (drives the real gameOver path)
        winTeam: (t: 'WEST' | 'EAST') => setGameOver(t === 'WEST' ? Team.WEST : Team.EAST),
        // Test hook: set a team's army stance. Balance probes need a target that
        // holds still — a strike aimed at a walking formation measures the lead,
        // not the ordnance.
        stance: (t: 'WEST' | 'EAST', order: 'advance' | 'hold' | 'retreat') => {
          stancesRef.current[t === 'WEST' ? Team.WEST : Team.EAST] = order;
        },
        // Test hook: wound a team's units to a fraction of max HP, so repair and
        // healing behavior can be probed without staging a firefight to cause it.
        hurt: (t: 'WEST' | 'EAST', frac: number) => {
          const team = t === 'WEST' ? Team.WEST : Team.EAST;
          let n = 0;
          unitsRef.current.forEach(u => {
            if (u.team !== team || u.health <= 0) return;
            u.health = Math.max(1, Math.round(u.maxHealth * frac));
            n++;
          });
          return n;
        },
        // Test hook: simulate clicking a unit (goes through real selection logic)
        clickUnit: (id: string) => {
          const u = unitsRef.current.find(x => x.id === id);
          if (u) handleUnitClickRef.current(u);
          return !!u;
        },
        unitList: unitsRef.current.map(u => ({
          id: u.id, type: u.type, team: u.team, squadId: u.squadId,
          position: { ...u.position }, health: u.health, maxHealth: u.maxHealth, isInCover: !!u.isInCover,
          stuckSamples: u.stuckSamples || 0, deployed: !!u.deployed,
          buildUntil: u.buildUntil, garrison: u.garrison || 0,
          suppressedUntil: u.suppressedUntil,
        })),
        gameOver: gameOverRef.current,
      };
    }
  }, [spawnQueue, clearSpawnQueue, onGameStateChange, spawnUnit, selectedIds]);

  // Stable Loop references
  const updateRef = useRef(update);
  updateRef.current = update;
  const gameOverRef = useRef(gameOver);
  gameOverRef.current = gameOver;

  // Game Loop - Stable Identity
  const lastFrameTimeRef = useRef(0);
  const tick = useCallback(() => {
    if (!gameOverRef.current) {
      try {
        if (!speedRef.current.paused) {
          // Spectator/balance mode: catch up on wall-clock time so low headless
          // frame rates still simulate at the requested speed. Normal play stays
          // strictly frame-locked (speed ticks per rAF).
          let ticks = speedRef.current.speed;
          if (cpuRef.current.teams.length === 2) {
            const now = performance.now();
            const elapsed = lastFrameTimeRef.current ? now - lastFrameTimeRef.current : 16.7;
            lastFrameTimeRef.current = now;
            ticks = Math.min(240, Math.max(1, Math.round((elapsed / 16.7) * speedRef.current.speed)));
          }
          for (let s = 0; s < ticks; s++) {
            updateRef.current();
            if (gameOverRef.current) break;
          }
        }
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
    <div style={{ width: viewSize.w, height: viewSize.h }} className="rounded-lg shadow-2xl border-4 border-stone-800 bg-stone-900 overflow-hidden relative">
      <GameScene
        units={unitsRef.current}
        projectiles={projectilesRef.current}
        particles={particlesRef.current}
        terrain={terrainRef.current}
        flyovers={flyoversRef.current}
        missiles={missilesRef.current}
        lasers={lasersRef.current}
        crates={cratesRef.current}
        smokes={smokesRef.current}
        selectedIds={selectedIds}
        fx={fx}
        onCameraApi={handleCameraApi}
        onCanvasClick={handleCanvasClickGuarded}
        targetingInfo={targetingInfo}
        weather={weatherRef.current}
        mapType={mapType}
        shake={shakeRef}
        capture={captureRef.current}
        flanks={flankCapsRef.current}
        onUnitClick={handleUnitClick}
        selectTeam={humanTeam}
        onBoxSelect={handleBoxSelect}
        onDragStart={handleDragStart}
        onMarquee={setMarquee}
        focusIds={[focusRef.current[Team.WEST], focusRef.current[Team.EAST]]
          .filter(f => f.targetId && Date.now() < f.until)
          .map(f => f.targetId as string)}
      />

      {/* Selection marquee. Client coords, so it is positioned fixed. */}
      {marquee && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
            border: '1px solid #fbbf24',
            background: 'rgba(251, 191, 36, 0.12)',
            pointerEvents: 'none',
            zIndex: 60,
          }}
        />
      )}

      {flashOpacity.current > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'white', opacity: Math.min(1, flashOpacity.current),
          pointerEvents: 'none', zIndex: 100
        }} />
      )}

      {/* Camera controls: tap or hold to scroll and zoom, ⌂ resets the view */}
      <div className="absolute bottom-2 right-2 z-40 flex gap-1 select-none">
        {([
          { icon: '◀', title: 'Scroll left (hold)', act: () => camApiRef.current?.pan(-14), repeat: true },
          { icon: '▶', title: 'Scroll right (hold)', act: () => camApiRef.current?.pan(14), repeat: true },
          { icon: '+', title: 'Zoom in (hold)', act: () => camApiRef.current?.zoom(0.96), repeat: true },
          { icon: '−', title: 'Zoom out (hold)', act: () => camApiRef.current?.zoom(1.045), repeat: true },
          { icon: '⌂', title: 'Reset view', act: () => camApiRef.current?.reset(), repeat: false },
        ] as const).map(b => (
          <button
            key={b.icon}
            title={b.title}
            onPointerDown={(e) => { e.stopPropagation(); camHoldStart(b.act, b.repeat); }}
            onPointerUp={camHoldStop}
            onPointerLeave={camHoldStop}
            onPointerCancel={camHoldStop}
            onContextMenu={(e) => e.preventDefault()}
            className="w-7 h-7 rounded border border-stone-600 bg-stone-900/80 text-stone-300 text-sm leading-none hover:text-white hover:border-stone-400 active:bg-stone-700 transition-colors touch-none"
          >
            {b.icon}
          </button>
        ))}
      </div>

      <MiniMap unitsRef={unitsRef} terrainRef={terrainRef} smokesRef={smokesRef} captureRef={captureRef} flankCapsRef={flankCapsRef} camApiRef={camApiRef} compact={compact} cb={cb} />

      {paused && !gameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none">
          <div className="text-4xl font-black uppercase tracking-widest text-stone-200 drop-shadow-lg">⏸ Paused</div>
        </div>
      )}

      {gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 p-12 bg-stone-900 border-2 border-amber-500/50 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-300">
            <h2 className="text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-amber-600 drop-shadow-lg">
              {cpuTeams.length === 1 ? (gameOver !== cpuTeams[0] ? 'VICTORY' : 'DEFEAT') : (gameOver === Team.WEST ? 'WEST WINS' : 'EAST WINS')}
            </h2>
            <div className="text-2xl font-bold text-stone-300">
              {gameOver === Team.WEST ? 'West Team' : 'East Team'} Wins!
            </div>

            {/* Post-game stats */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm text-stone-300 border border-stone-700 rounded-lg p-4 bg-stone-950/60">
              <div></div>
              <div className="font-bold text-blue-400 text-center uppercase">West</div>
              <div className="font-bold text-red-400 text-center uppercase">East</div>
              <div className="text-stone-500 uppercase text-xs pt-0.5">{gameMode === 'basehp' ? 'Base HP' : 'Score'}</div>
              <div className="text-center font-mono">{gameMode === 'basehp' ? baseHPRef.current[Team.WEST] : scoreRef.current[Team.WEST]}</div>
              <div className="text-center font-mono">{gameMode === 'basehp' ? baseHPRef.current[Team.EAST] : scoreRef.current[Team.EAST]}</div>
              <div className="text-stone-500 uppercase text-xs pt-0.5">Units Built</div>
              <div className="text-center font-mono">{statsRef.current[Team.WEST].built}</div>
              <div className="text-center font-mono">{statsRef.current[Team.EAST].built}</div>
              <div className="text-stone-500 uppercase text-xs pt-0.5">Units Lost</div>
              <div className="text-center font-mono">{statsRef.current[Team.WEST].lost}</div>
              <div className="text-center font-mono">{statsRef.current[Team.EAST].lost}</div>
              <div className="text-stone-500 uppercase text-xs pt-0.5">Economy Lvl</div>
              <div className="text-center font-mono">{incomeLevelRef.current[Team.WEST]}</div>
              <div className="text-center font-mono">{incomeLevelRef.current[Team.EAST]}</div>
              <div className="text-stone-500 uppercase text-xs pt-0.5" title="Unit type with the most kills">MVP Unit</div>
              {[Team.WEST, Team.EAST].map(t => {
                const kills = typeStatsRef.current[t].kills;
                const mvp = Object.entries(kills).sort((a, b) => b[1] - a[1])[0];
                return (
                  <div key={t} className="text-center font-mono text-xs pt-0.5">
                    {mvp ? `${mvp[0].replace('_', ' ')} · ${mvp[1]}` : '—'}
                  </div>
                );
              })}
              <div className="text-stone-500 uppercase text-xs pt-0.5">Duration</div>
              <div className="text-center font-mono col-span-2">{Math.floor((Date.now() - matchStartRef.current) / 60000)}m {Math.floor(((Date.now() - matchStartRef.current) % 60000) / 1000)}s</div>
            </div>

            {/* How the battle unfolded */}
            {scoreHistoryRef.current.length >= 2 && (
              <div className="flex flex-col items-center gap-1">
                <TimelineGraph history={scoreHistoryRef.current} />
                <div className="text-[9px] uppercase tracking-wider text-stone-500">{gameMode === 'basehp' ? 'Base HP' : 'Score'} over time</div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { try { localStorage.setItem('ewv-rematch', '1'); } catch { /* ignore */ } window.location.reload(); }}
                className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-black uppercase tracking-wider rounded shadow-lg transition-transform active:scale-95"
              >
                ⚔ Rematch
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 font-black uppercase tracking-wider rounded shadow-lg transition-transform active:scale-95"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
