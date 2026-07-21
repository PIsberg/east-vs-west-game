import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameCanvas, CPU_PERSONALITY, CPU_PERSONA_IDS } from './components/GameCanvas';
import type { CpuPersona } from './components/GameCanvas';
import { Team, GameState, UnitType, MapType, GameMode, Stance, TeamCommand } from './types';
import { UNIT_CONFIG, INITIAL_MONEY, HORIZON_Y, BASE_HP, INCOME_UPGRADE_BASE_COST, INCOME_UPGRADE_MAX, RALLY_COST, factionAllowed } from './constants';
import { Sword, Shield, User, Truck, Target, Zap, FileText, Wind, MapPin, RotateCcw, Flame, Crosshair, CircleDashed, Radio, ShieldAlert, Skull, Plane, Heart, Cpu, Building2, Pause, Play, FastForward, Car, PlaneTakeoff, Rocket, Satellite, Bus, Volume2, VolumeX, Music, Cloud, TrendingUp, Megaphone, BookOpen, Sparkles, Ship, Eye } from 'lucide-react';
import { soundService } from './services/audio';
import { OnlineSession, type OnlineSnapshot } from './services/online';
import {
  CampaignState, TERRITORIES, territory, createCampaign, campaignMove, applyBattleResult,
  cpuCampaignTurn, reinforce, campaignWinner, battleSettings, bannedFor, saveCampaign, loadCampaign,
} from './campaign';
import type { TerritoryBonus } from './campaign';

const TankIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h20" />
    <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M6 12V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
    <line x1="12" y1="6" x2="18" y2="2" /> {/* Gun */}
    <circle cx="6" cy="18" r="1.5" />
    <circle cx="12" cy="18" r="1.5" />
    <circle cx="18" cy="18" r="1.5" />
  </svg>
);

const ArtilleryIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="14" width="18" height="6" rx="2" />
    <path d="M5 14v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
    <line x1="8" y1="10" x2="6" y2="4" />
    <line x1="12" y1="10" x2="12" y2="2" />
    <line x1="16" y1="10" x2="18" y2="4" />
    <circle cx="7" cy="17" r="1" />
    <circle cx="17" cy="17" r="1" />
  </svg>
);

const ParachuteIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 14c-4 0-7-4-7-9 0 0 2-2 7-2s7 2 7 2c0 5-3 9-7 9z" />
    <path d="M5 5l-2 8" />
    <path d="M19 5l2 8" />
    <path d="M12 14v8" />
    <path d="M12 22l-3-3" />
    <path d="M12 22l3-3" />
  </svg>
);

const BandanaIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16" /> {/* Headband */}
    <path d="M4 12l2 4h-2l-2-4" /> {/* Ties */}
    <path d="M20 12l-2 4h2l2-4" />
    <circle cx="12" cy="10" r="4" opacity="0.5" /> {/* Head outline faint */}
  </svg>
);

const AntiAirIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Plane */}
    <path d="M2 12h20" strokeWidth="1" />
    <path d="M10 8l2 4 2-4" strokeWidth="1" />
    {/* Forbidden Sign */}
    <circle cx="12" cy="12" r="10" strokeWidth="2" className="text-red-500" />
    <line x1="5" y1="5" x2="19" y2="19" strokeWidth="2" className="text-red-500" />
  </svg>
);

const SquadIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 14h16" strokeWidth="3" /> {/* Stock & Barrel - Thicker */}
    <path d="M6 14v4" strokeWidth="2" /> {/* Grip */}
    <path d="M12 14v4" strokeWidth="2" /> {/* Mag */}
    <path d="M2 14l-2 3" />
  </svg>
);

const PersonalMineIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v4" />
    <path d="M12 16v4" />
    <path d="M4 12h4" />
    <path d="M16 12h4" />
  </svg>
);

const TankMineIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

const HelicopterIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8h20" strokeWidth="2" /> {/* Main Rotor */}
    <path d="M12 8v4" strokeWidth="2" /> {/* Rotor Shaft */}
    <path d="M6 12h12c2 0 3 2 3 5v1H3v-1c0-3 1-5 3-5z" fill="currentColor" fillOpacity="0.2" /> {/* Body */}
    <path d="M12 12v-1" />
    <path d="M14 12h2" />
    <circle cx="20" cy="10" r="3" strokeWidth="1.5" strokeDasharray="2 2" /> {/* Tail Rotor Effect */}
    <path d="M5 18h14" strokeWidth="2" /> {/* Skids */}
  </svg>
);

const SniperIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" strokeWidth="1.5" />
    <line x1="12" y1="4" x2="12" y2="8" strokeWidth="1.5" />
    <line x1="12" y1="16" x2="12" y2="20" strokeWidth="1.5" />
    <line x1="4" y1="12" x2="8" y2="12" strokeWidth="1.5" />
    <line x1="16" y1="12" x2="20" y2="12" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const MortarIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 18L18 6" strokeWidth="3" /> {/* Tube */}
    <path d="M5 20h8" /> {/* Baseplate */}
    <path d="M9 17l-3 4" /> {/* Bipod */}
    <circle cx="19" cy="5" r="1.5" /> {/* Round leaving tube */}
  </svg>
);

const TeslaIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

// Hidden harness params: ?spectate (CPU vs CPU), &map=URBAN, &speed=4, &mode=basehp
const URL_PARAMS = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const SPECTATE = URL_PARAMS.has('spectate');
// One-shot flag set by the victory screen's Rematch button: skip the splash
// and drop straight into a fresh battle with the same settings.
const REMATCH = (() => {
  try {
    if (localStorage.getItem('ewv-rematch')) { localStorage.removeItem('ewv-rematch'); return true; }
  } catch { /* ignore */ }
  return false;
})();
const PARAM_MAP = (URL_PARAMS.get('map') || '').toUpperCase();
// ?seed=12345 pins the deterministic match seed (terrain, weather, combat
// rolls) — the determinism harness runs two instances on one seed and demands
// identical checksums. Undefined = every local match rolls its own.
const PARAM_SEED = URL_PARAMS.has('seed') ? (Number(URL_PARAMS.get('seed')) >>> 0) : undefined;

// Preset challenge missions: fixed settings + optional handicap, completion
// badges persist in ewv-challenges
interface Challenge {
  id: string; name: string; desc: string;
  map: MapType; mode: GameMode; cpu: 'easy' | 'normal' | 'hard';
  moneyMult?: number;    // handicap on the human side's starting funds
  maxDurSec?: number;    // must win within this time
  infantryOnly?: boolean; // human may only buy foot units
}
const CHALLENGES: Challenge[] = [
  { id: 'first-blood', name: 'First Blood', desc: 'Win a battle against an Easy CPU', map: MapType.COUNTRYSIDE, mode: 'points', cpu: 'easy' },
  { id: 'underdog', name: 'Underdog', desc: 'Beat a Normal CPU starting with half the money', map: MapType.URBAN, mode: 'points', cpu: 'normal', moneyMult: 0.5 },
  { id: 'blitzkrieg', name: 'Blitzkrieg', desc: 'Beat a Normal CPU in under 5 minutes', map: MapType.COUNTRYSIDE, mode: 'points', cpu: 'normal', maxDurSec: 300 },
  { id: 'boots-only', name: 'Boots Only', desc: 'Beat a Normal CPU buying only infantry', map: MapType.DESERT, mode: 'points', cpu: 'normal', infantryOnly: true },
  { id: 'iron-wall', name: 'Iron Wall', desc: 'Raze a Hard CPU\'s base before it razes yours', map: MapType.DESERT, mode: 'basehp', cpu: 'hard' },
  { id: 'admiral', name: 'Admiral', desc: 'Win among the islands — gunboats rule the channels', map: MapType.ARCHIPELAGO, mode: 'points', cpu: 'normal' },
];
// Foot units allowed under the Boots Only restriction
const INFANTRY_ALLOWED = new Set([
  UnitType.SOLDIER, UnitType.SNIPER, UnitType.SPECIAL_FORCES, UnitType.FLAMETHROWER,
  UnitType.MEDIC, UnitType.ENGINEER, UnitType.MORTAR, UnitType.MINE_PERSONAL,
]);
// Air-delivered ordnance sharing the Air Command rearm clock (mirrors the engine set)
const AIR_OPS_UI = new Set([
  UnitType.AIRSTRIKE, UnitType.AIRBORNE, UnitType.MISSILE_STRIKE,
  UnitType.CRUISE, UnitType.NUKE, UnitType.GUNSHIP,
]);

// Number-row hotkeys spawn for the player's side (badge shown in the tooltip)
const SPAWN_HOTKEYS: Record<string, UnitType> = {
  '1': UnitType.SOLDIER, '2': UnitType.SNIPER, '3': UnitType.FLAMETHROWER, '4': UnitType.MEDIC,
  '5': UnitType.MORTAR, '6': UnitType.JEEP, '7': UnitType.TANK, '8': UnitType.APC,
  '9': UnitType.HELICOPTER, '0': UnitType.ANTI_AIR,
};
const HOTKEY_OF: Partial<Record<UnitType, string>> =
  Object.fromEntries(Object.entries(SPAWN_HOTKEYS).map(([k, t]) => [t, k]));
// pointer: coarse = the PRIMARY input is a finger — a mouse-first laptop with a touchscreen still reads as fine/click
const HAS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const PARAM_SPEED = Math.max(1, Math.min(8, Number(URL_PARAMS.get('speed')) || (SPECTATE ? 4 : 1)));

// Last-used menu choices survive reloads (URL params still win)
const SAVED_PREFS: { playerSide?: string, cpuLevel?: string, gameMode?: string, mapType?: string, cpuPersona?: string } = (() => {
  try { return JSON.parse(localStorage.getItem('ewv-prefs') || '{}') || {}; } catch { return {}; }
})();

const App: React.FC = () => {
  const [gameKey, setGameKey] = useState(0);
  const [spawnQueue, setSpawnQueue] = useState<{ team: Team, type: UnitType, cost?: number, offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string, lane?: 'top' | 'mid' | 'bot' }[]>([]);
  const [laneChoice, setLaneChoice] = useState<Record<Team, 'random' | 'top' | 'mid' | 'bot'>>({ [Team.WEST]: 'random', [Team.EAST]: 'random' });
  const [commandQueue, setCommandQueue] = useState<{ team: Team, cmd: TeamCommand }[]>([]);
  const [orderQueue, setOrderQueue] = useState<{ ids: string[], order?: Stance | null, ability?: 'overdrive' | 'c4' | 'sell' }[]>([]);
  const [selection, setSelection] = useState<{ team: Team, ids: string[] } | null>(null);
  const [stances, setStances] = useState<Record<Team, Stance>>({ [Team.WEST]: 'advance', [Team.EAST]: 'advance' });
  const [gameState, setGameState] = useState<GameState>({
    units: [], projectiles: [], particles: [],
    score: { [Team.WEST]: 0, [Team.EAST]: 0 },
    money: { [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY },
    weather: 'clear'
  });
  const [weather, setWeather] = useState<'clear' | 'rain' | 'snow' | 'fog' | 'storm'>('clear');
  const [targetingInfo, setTargetingInfo] = useState<{ team: Team, type: UnitType } | null>(null);
  const [showSplash, setShowSplash] = useState(!SPECTATE && !REMATCH);
  const [splashFading, setSplashFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameSpeed, setGameSpeed] = useState<number>(PARAM_SPEED);
  const [muted, setMuted] = useState(() => soundService.isMuted());
  const [musicOn, setMusicOn] = useState(() => soundService.isMusicOn());
  const [playerSidePref, setPlayerSide] = useState<Team>(SAVED_PREFS.playerSide === Team.EAST ? Team.EAST : Team.WEST);
  const [cpuLevel, setCpuLevel] = useState<'off' | 'easy' | 'normal' | 'hard'>(
    SPECTATE ? 'normal' : (['off', 'easy', 'normal', 'hard'].includes(SAVED_PREFS.cpuLevel as string) ? SAVED_PREFS.cpuLevel as 'off' | 'easy' | 'normal' | 'hard' : 'off')
  );
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const fromUrl = URL_PARAMS.get('mode');
    if (fromUrl === 'basehp' || fromUrl === 'points' || fromUrl === 'ctf') return fromUrl;
    return SAVED_PREFS.gameMode === 'basehp' || SAVED_PREFS.gameMode === 'ctf' ? SAVED_PREFS.gameMode : 'points';
  });
  // CPU commander persona. Spectate (the balance harness) pins the by-the-book
  // commander so CPU-vs-CPU efficiency runs stay comparable across sessions.
  const [cpuPersona, setCpuPersona] = useState<CpuPersona>(
    SPECTATE ? 'balanced' :
    (['random', ...CPU_PERSONA_IDS].includes(SAVED_PREFS.cpuPersona as string) ? SAVED_PREFS.cpuPersona as CpuPersona : 'random')
  );
  // Active challenge (null = free play) + persisted completion badges
  const [challenge, setChallenge] = useState<string | null>(null);
  const challengeStartRef = useRef(0);
  const [challengesDone, setChallengesDone] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ewv-challenges') || '[]'); } catch { return []; }
  });
  const activeChallenge = CHALLENGES.find(c => c.id === challenge) ?? null;
  // Recent battle results, written by GameCanvas at game over
  const [history] = useState<{ when: number, map: string, mode: string, winner: string, w: number, e: number, dur: number, spectate?: boolean }[]>(() => {
    try { return JSON.parse(localStorage.getItem('ewv-history') || '[]'); } catch { return []; }
  });
  const [fx, setFx] = useState<'high' | 'low'>(() => {
    try { return localStorage.getItem('ewv-fx') === 'low' ? 'low' : 'high'; } catch { return 'high'; }
  });
  const setFxPersist = (v: 'high' | 'low') => { setFx(v); try { localStorage.setItem('ewv-fx', v); } catch { /* ignore */ } };
  // Fog of war (default off; only meaningful vs the CPU — a shared hotseat
  // screen can't hide anything, and spectate wants the whole field)
  const [fow, setFow] = useState<boolean>(() => {
    try { return localStorage.getItem('ewv-fow') === '1'; } catch { return false; }
  });
  const toggleFow = () => setFow(v => { const n = !v; try { localStorage.setItem('ewv-fow', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  // Doctrine mode: Classic mirrors the sides; Asymmetric applies FACTION_MODS
  // stats and exclusive rosters (West precision, East saturation)
  const [asym, setAsym] = useState<boolean>(() => {
    try { return localStorage.getItem('ewv-asym') === '1'; } catch { return false; }
  });
  const setAsymPersist = (v: boolean) => { setAsym(v); try { localStorage.setItem('ewv-asym', v ? '1' : '0'); } catch { /* ignore */ } };
  // Colorblind-assist: East reads as amber across rings/minimap/pips/flags
  const [cb, setCb] = useState<boolean>(() => {
    try { return localStorage.getItem('ewv-cb') === '1'; } catch { return false; }
  });
  const toggleCb = () => setCb(v => { const n = !v; try { localStorage.setItem('ewv-cb', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const [mapType, setMapType] = useState<MapType>(
    Object.values(MapType).includes(PARAM_MAP as MapType) ? PARAM_MAP as MapType :
    Object.values(MapType).includes(SAVED_PREFS.mapType as MapType) ? SAVED_PREFS.mapType as MapType : MapType.COUNTRYSIDE
  );

  // ── Grand Campaign ─────────────────────────────────────────────────────
  // Board state persists in ewv-campaign (one slot). campaignBattle carries
  // the launched battle's handicaps/roster locks, pre-resolved at launch so a
  // later board change can't leak into a running fight. While it's set, the
  // player is forced to WEST vs a CPU EAST regardless of menu prefs.
  const [campaign, setCampaign] = useState<CampaignState | null>(() => loadCampaign());
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [selectedArmy, setSelectedArmy] = useState<string | null>(null);
  const [campaignBattle, setCampaignBattle] = useState<{
    name: string;
    mult: Record<Team, number>;
    banned: Record<Team, UnitType[]>;
  } | null>(null);
  const [campaignReturn, setCampaignReturn] = useState<Team | null>(null);
  const campaignRef = useRef(campaign); campaignRef.current = campaign;
  const campaignBattleRef = useRef(campaignBattle); campaignBattleRef.current = campaignBattle;
  // Whose assault the running battle settles — decides what the CPU still owes
  const campaignPhaseRef = useRef<'player' | 'cpu'>('player');

  // ── Online 1v1 (lockstep over WebRTC / loopback — services/online.ts) ────
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [online, setOnline] = useState<OnlineSnapshot | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [netWaitMs, setNetWaitMs] = useState(0);   // lockstep hold duration (waiting overlay)
  const [netClaimed, setNetClaimed] = useState(false); // player already claimed the win/loss overlay
  const peerChecksumsRef = useRef<Record<number, number>>({});
  const sessionRef = useRef(session); sessionRef.current = session;

  const beginSession = (s: OnlineSession) => {
    peerChecksumsRef.current = s.peerChecksums; // same object GameCanvas will compare & drain
    setNetClaimed(false);
    setSession(s);
    setOnline({ ...s.snap });
  };
  const startHost = () => beginSession(OnlineSession.host({
    loopback: URL_PARAMS.has('loop'),
    code: URL_PARAMS.get('netcode') ?? undefined, // pinned code for the loopback e2e
  }));
  const startJoin = (code: string) => {
    if (!code.trim()) return;
    beginSession(OnlineSession.join(code.trim().toUpperCase(), { loopback: URL_PARAMS.has('loop') }));
  };
  const endOnline = () => {
    sessionRef.current?.close();
    setSession(null);
    setOnline(null);
    setShowSplash(true);
    setSplashFading(false);
  };

  // Mirror the session's snapshot into React state
  useEffect(() => {
    if (!session) return;
    (window as any).__ewNet = session; // debug/e2e probe surface
    const un = session.subscribe(() => setOnline({ ...session.snap }));
    setOnline({ ...session.snap });
    return () => { un(); if ((window as any).__ewNet === session) delete (window as any).__ewNet; };
  }, [session]);
  useEffect(() => () => sessionRef.current?.close(), []); // tab close / unmount

  // The host's regular menu picks ARE the lobby settings — stream them over
  useEffect(() => {
    session?.setSettings({
      map: mapType, mode: gameMode, asymmetry: asym, fogOfWar: fow,
      hostTeam: playerSidePref === Team.EAST ? 'EAST' : 'WEST',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, mapType, gameMode, asym, fow, playerSidePref]);

  // lobby -> playing: boot the engine on the shared config (fresh mount = the
  // seed, banlists and lockstep all apply cleanly; same pattern as challenges)
  const onlinePrevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    const phase = online?.phase ?? null;
    if (phase === 'playing' && onlinePrevPhaseRef.current !== 'playing' && online?.config) {
      setMapType(online.config.map as MapType);
      setGameMode(online.config.mode as GameMode);
      setPaused(false);
      setGameSpeed(1);
      setChallenge(null);
      setGameKey(k => k + 1);
      if (showSplash) handleStartClick();
    }
    onlinePrevPhaseRef.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.phase]);

  // Hidden e2e/dev params: ?loop&netrole=host&netcode=EW-TEST&netauto drives
  // the whole flow headlessly (loopback transport, auto-host/join, auto-ready)
  const netAutoRef = useRef(false);
  useEffect(() => {
    if (netAutoRef.current || !URL_PARAMS.has('netrole')) return;
    netAutoRef.current = true;
    if (URL_PARAMS.get('netrole') === 'host') startHost();
    else startJoin(URL_PARAMS.get('netcode') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (URL_PARAMS.has('netauto') && online?.phase === 'lobby' && !online.selfReady) sessionRef.current?.setReady(true);
  }, [online?.phase, online?.selfReady]);

  // Lockstep hold poll — drives the "waiting for opponent" overlay
  useEffect(() => {
    if (online?.phase !== 'playing') { setNetWaitMs(0); return; }
    const t = setInterval(() => {
      const ws = sessionRef.current?.scheduler?.waitingSince ?? 0;
      setNetWaitMs(ws ? Date.now() - ws : 0);
    }, 500);
    return () => clearInterval(t);
  }, [online?.phase]);

  const onlinePlaying = !!(online && online.phase === 'playing' && online.config && session);
  const onlineTeam = onlinePlaying ? (session!.localTeam() === 'EAST' ? Team.EAST : Team.WEST) : null;
  const onlineFoe = onlineTeam ? (onlineTeam === Team.WEST ? Team.EAST : Team.WEST) : null;
  // Engine callbacks hoisted out of the JSX: the canvas is mounted
  // conditionally (unmounted during the online lobby), and hooks may not
  // live inside a conditional element.
  const onGameStateChange = useCallback((s: GameState) => setGameState(s), []);
  const clearSpawnQueueCb = useCallback(() => setSpawnQueue([]), []);
  const clearCommandQueueCb = useCallback(() => setCommandQueue([]), []);
  const clearOrderQueueCb = useCallback(() => setOrderQueue([]), []);
  const onSelectUnitsCb = useCallback((team: Team, ids: string[]) => {
    setSelection(ids.length ? { team, ids } : null);
    if (ids.length) {
      setTroopHint(false); // they found it — never nag again
      try { localStorage.setItem('ewv-hint-troopctl', '1'); } catch { /* ignore */ }
    }
  }, []);

  // Effective map/mode for the ENGINE, derived at render time. The phase-flip
  // effect also writes these into menu state, but that lands one commit AFTER
  // the canvas key changes — a guest whose saved menu prefs differed from the
  // host's config would first-mount the match canvas with ITS OWN map/mode.
  // Mount-captured refs (ctf flag grid, opening weather forecast) then never
  // heal, and the sims diverge from tick 1 (found in the field: "diverged at
  // tick 150" on the first real cross-machine match).
  const effMapType = onlinePlaying ? (online!.config!.map as MapType) : mapType;
  const effGameMode = onlinePlaying ? (online!.config!.mode as GameMode) : gameMode;

  const playerSide = campaignBattle ? Team.WEST : (onlineTeam ?? playerSidePref);

  // Remember menu choices for the next visit
  useEffect(() => {
    try { localStorage.setItem('ewv-prefs', JSON.stringify({ playerSide: playerSidePref, cpuLevel, gameMode, mapType, cpuPersona })); } catch { /* ignore */ }
  }, [playerSidePref, cpuLevel, gameMode, mapType, cpuPersona]);

  // Online there is NO CPU side regardless of the saved single-player pref —
  // a guest whose last local game was vs the CPU used to get BOTH panels
  // hidden (its own side computed as "the CPU's").
  const cpuTeam = onlinePlaying ? null
    : campaignBattle ? Team.EAST
    : (cpuLevel === 'off' ? null : (playerSidePref === Team.WEST ? Team.EAST : Team.WEST));
  const cpuTeams = SPECTATE ? [Team.WEST, Team.EAST] : (cpuTeam ? [cpuTeam] : []);
  // A CPU side's spawn panel is all disabled buttons — dead space. Hide it and
  // give the width back to the battlefield, so a single-player game (or a
  // spectated one) fits a phone instead of only a tablet/PC. A human side always
  // keeps its panel.
  // Online, the opponent's panel is dead space exactly like a CPU's — hide it
  const westIsCpu = SPECTATE || cpuTeam === Team.WEST || onlineFoe === Team.WEST;
  const eastIsCpu = SPECTATE || cpuTeam === Team.EAST || onlineFoe === Team.EAST;
  const cycleCpuLevel = () => setCpuLevel(l => l === 'off' ? 'easy' : l === 'easy' ? 'normal' : l === 'normal' ? 'hard' : 'off');

  const [cmdHint, setCmdHint] = useState(false);
  const [troopHint, setTroopHint] = useState(false);

  // Compact layout for mobile landscape (short viewports); portrait phones
  // get a rotate prompt instead of a broken squeeze.
  const [compact, setCompact] = useState(() => window.innerHeight < 520);
  const [isPortraitMobile, setIsPortraitMobile] = useState(() => window.innerWidth < 700 && window.innerHeight > window.innerWidth);
  const [showManual, setShowManual] = useState(() => window.innerHeight >= 520);
  useEffect(() => {
    const onResize = () => {
      setCompact(window.innerHeight < 520);
      setIsPortraitMobile(window.innerWidth < 700 && window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);

  // Fit the battlefield exactly between the toolbars: measure the real
  // header, side unit panels and command bar instead of estimating, and
  // resize whenever any of them changes shape.
  const headerRef = useRef<HTMLDivElement>(null);
  const westPanelRef = useRef<HTMLDivElement>(null);
  const eastPanelRef = useRef<HTMLDivElement>(null);
  const cmdBarRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const compute = () => {
      const headerH = headerRef.current?.getBoundingClientRect().height ?? 60;
      const cmdH = cmdBarRef.current?.getBoundingClientRect().height ?? 0;
      // A hidden (CPU) panel contributes no width — the canvas fills that space.
      const westW = westIsCpu ? 0 : (westPanelRef.current?.getBoundingClientRect().width ?? 100);
      const eastW = eastIsCpu ? 0 : (eastPanelRef.current?.getBoundingClientRect().width ?? 100);
      const padX = compact ? 8 : 32;                  // page container horizontal padding
      const gapX = compact ? 8 : 16;                  // side-panel margins toward the canvas
      const padY = compact ? 8 : 32;
      const headerMb = compact ? 4 : 12;              // header mb-1 / mb-3
      const cmdMt = cmdH > 0 ? (compact ? 4 : 8) : 0; // command bar mt-1 / mt-2
      const availW = Math.min(1600, Math.max(280, window.innerWidth - westW - eastW - gapX - padX));
      const availH = Math.max(158, window.innerHeight - headerH - headerMb - cmdH - cmdMt - padY);
      // Fill the box between the toolbars on BOTH axes when possible: the 3D
      // camera adapts to any aspect, so only clamp to a sane range (16:10 up
      // to ~21:9 cinematic) instead of forcing 16:9 and leaving dead space.
      const AR_MIN = 1.6, AR_MAX = 2.4;
      const ar = availW / availH;
      const next = ar > AR_MAX ? { w: Math.round(availH * AR_MAX), h: Math.round(availH) }
        : ar < AR_MIN ? { w: Math.round(availW), h: Math.round(availW / AR_MIN) }
        : { w: Math.round(availW), h: Math.round(availH) };
      setViewSize(prev => (prev.w === next.w && prev.h === next.h) ? prev : next);
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    const ro = new ResizeObserver(compute);
    [headerRef, westPanelRef, eastPanelRef, cmdBarRef].forEach(r => { if (r.current) ro.observe(r.current); });
    return () => { window.removeEventListener('resize', compute); window.removeEventListener('orientationchange', compute); ro.disconnect(); };
  }, [compact, cpuLevel, playerSide, westIsCpu, eastIsCpu]);

  const handleStartClick = () => {
    soundService.playIntroJingle();
    // Battle music can only start from a user gesture (browser autoplay policy)
    if (soundService.isMusicOn()) setTimeout(() => soundService.startMusic(), 4200);
    setSplashFading(true);
    setTimeout(() => setShowSplash(false), 700);
    // Draw the eye to the command bar for the opening seconds
    setCmdHint(true);
    setTimeout(() => setCmdHint(false), 15000);
    // Teach troop control until the player has used it once (ever)
    try {
      if (!localStorage.getItem('ewv-hint-troopctl')) {
        setTimeout(() => setTroopHint(true), 8000);
        setTimeout(() => setTroopHint(false), 32000);
      }
    } catch { /* ignore */ }
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    soundService.setMuted(m);
  };
  const toggleMusic = () => {
    const on = !musicOn;
    setMusicOn(on);
    soundService.setMusicOn(on);
  };

  // Launch a challenge: apply its settings, remount the engine fresh (the
  // money handicap only applies at mount), and start the battle
  const startChallenge = (c: typeof CHALLENGES[number]) => {
    setMapType(c.map);
    setGameMode(c.mode);
    setCpuLevel(c.cpu);
    setPlayerSide(Team.WEST);
    setChallenge(c.id);
    challengeStartRef.current = Date.now();
    setGameKey(prev => prev + 1);
    handleStartClick();
  };
  // GameCanvas reports a human challenge win back up; timed challenges only
  // count when the win landed inside the limit
  const onChallengeWon = useCallback((id: string, durSec: number) => {
    const c = CHALLENGES.find(ch => ch.id === id);
    if (c?.maxDurSec && durSec > c.maxDurSec) return;
    setChallengesDone(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try { localStorage.setItem('ewv-challenges', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetGame = () => {
    setChallenge(null); // leaving a challenge returns to free play
    setGameKey(prev => prev + 1);
    setGameState({ units: [], projectiles: [], particles: [], score: { [Team.WEST]: 0, [Team.EAST]: 0 }, money: { [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY }, weather: 'clear' }); setWeather('clear');
    setSpawnQueue([]); setCommandQueue([]); setOrderQueue([]); setSelection(null); setTargetingInfo(null); setWeather('clear'); setPaused(false);
  };

  // ── Campaign actions ─────────────────────────────────────────────────────
  // Fight the board state's pending battle: territory terrain picks the map,
  // strength difference sets both sides' opening funds, held bonus territories
  // decide the roster locks. Mode is always basehp — the attacker must break
  // the defense, not out-farm it.
  const launchCampaignBattle = (s: CampaignState) => {
    const settings = battleSettings(s);
    setMapType(settings.map);
    setGameMode('basehp');
    setChallenge(null);
    setCampaignBattle({
      name: settings.name,
      mult: settings.moneyMult,
      banned: { [Team.WEST]: bannedFor(s, Team.WEST), [Team.EAST]: bannedFor(s, Team.EAST) },
    });
    setCampaignOpen(false);
    setCampaignReturn(null);
    setGameKey(prev => prev + 1);
    setGameState({ units: [], projectiles: [], particles: [], score: { [Team.WEST]: 0, [Team.EAST]: 0 }, money: { [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY }, weather: 'clear' }); setWeather('clear');
    setSpawnQueue([]); setCommandQueue([]); setOrderQueue([]); setSelection(null); setTargetingInfo(null); setPaused(false);
    handleStartClick();
  };

  const openCampaign = () => {
    let s = campaignRef.current;
    if (!s || campaignWinner(s)) {
      // New war, new enemy commander — one named persona for the whole campaign
      const personas = CPU_PERSONA_IDS.filter(p => p !== 'balanced');
      s = createCampaign(personas[Math.floor(Math.random() * personas.length)]);
      setCampaign(s); saveCampaign(s);
    }
    // A save quit mid-battle resumes straight into the fight
    if (s.pendingBattle) {
      campaignPhaseRef.current = s.pendingBattle.attacker === Team.WEST ? 'player' : 'cpu';
      launchCampaignBattle(s);
      return;
    }
    setSelectedArmy(null);
    setCampaignOpen(true);
  };

  const abandonCampaign = () => {
    setCampaign(null); saveCampaign(null);
    setCampaignOpen(false);
  };

  // One player move drives the whole round: player → (battle?) → CPU →
  // (battle?) → reinforce. Battles suspend the round; handleCampaignGameOver
  // picks it back up where it stopped.
  const doPlayerCampaignMove = (armyId: string, toId: string) => {
    const cur = campaignRef.current;
    if (!cur || cur.pendingBattle || campaignWinner(cur)) return;
    let s = campaignMove(cur, armyId, toId);
    if (s === cur) return; // not adjacent / not movable
    setSelectedArmy(null);
    if (s.pendingBattle) {
      campaignPhaseRef.current = 'player';
      setCampaign(s); saveCampaign(s);
      launchCampaignBattle(s);
      return;
    }
    s = cpuCampaignTurn(s);
    if (s.pendingBattle) {
      campaignPhaseRef.current = 'cpu';
      setCampaign(s); saveCampaign(s);
      launchCampaignBattle(s);
      return;
    }
    s = reinforce(s);
    setCampaign(s); saveCampaign(s);
  };

  // The 3D battle resolved: settle the board, run whatever the round still
  // owes (CPU move after a player assault, reinforcement at round end), then
  // wait for the player to hit Continue.
  const handleCampaignGameOver = useCallback((winner: Team) => {
    if (!campaignBattleRef.current || !campaignRef.current) return;
    let s = applyBattleResult(campaignRef.current, winner);
    if (!campaignWinner(s)) {
      if (campaignPhaseRef.current === 'player') {
        s = cpuCampaignTurn(s);
        if (s.pendingBattle) campaignPhaseRef.current = 'cpu';
        else s = reinforce(s);
      } else {
        s = reinforce(s);
      }
    }
    setCampaign(s); saveCampaign(s);
    setCampaignReturn(winner);
  }, []);

  const continueCampaign = () => {
    setCampaignReturn(null);
    setCampaignBattle(null);
    const s = campaignRef.current;
    if (s?.pendingBattle && !campaignWinner(s)) {
      launchCampaignBattle(s); // the enemy's counterattack goes straight in
    } else {
      setShowSplash(true); setSplashFading(false);
      setCampaignOpen(true);
    }
  };

  const handleSpawnRequest = (team: Team, type: UnitType) => {
    if (team === cpuTeam) return; // CPU-controlled side is off-limits to the player
    if (activeChallenge?.infantryOnly && team === playerSide && !INFANTRY_ALLOWED.has(type)) return; // Boots Only
    if (!factionAllowed(team, type, asym)) return; // other doctrine's exclusive (also guards hotkeys)
    if (campaignBattle?.banned[team]?.includes(type)) return; // campaign roster lock (hold the harbor/airbase/silo to unlock)
    if (AIR_OPS_UI.has(type) && (gameState.airOpsReadyIn?.[team] ?? 0) > 0) return; // Air Command rearming (also guards hotkeys)
    const cost = UNIT_CONFIG[type].cost;
    if (gameState.money[team] >= cost) {
      if ([UnitType.AIRBORNE, UnitType.AIRSTRIKE, UnitType.MISSILE_STRIKE, UnitType.MINE_PERSONAL, UnitType.MINE_TANK, UnitType.NUKE, UnitType.BUNKER, UnitType.GUNBOAT, UnitType.GUNSHIP, UnitType.SATELLITE, UnitType.CRUISE, UnitType.SMOKE].includes(type)) setTargetingInfo({ team, type });
      else processSpawn(team, type);
    }
  };

  // Auto-detect weak GPUs once: with no saved preference, if the opening
  // seconds of the first battle run under ~24fps, drop to low quality.
  useEffect(() => {
    if (showSplash) return;
    try { if (localStorage.getItem('ewv-fx')) return; } catch { return; }
    let raf = 0;
    let frames = 0;
    let start = 0;
    const loop = () => {
      frames++;
      if (performance.now() - start < 4000) raf = requestAnimationFrame(loop);
      else if (frames / 4 < 24) setFxPersist('low');
    };
    const t = setTimeout(() => { start = performance.now(); raf = requestAnimationFrame(loop); }, 3000);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [showSplash]);

  // Keyboard spawning: number row buys for the player's side. Ref keeps the
  // listener stable while handleSpawnRequest is recreated every render.
  const spawnReqRef = useRef(handleSpawnRequest);
  spawnReqRef.current = handleSpawnRequest;
  useEffect(() => {
    if (showSplash) return; // armed once the battle starts
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      // Match by physical key position (e.code), not the emitted character, so the
      // number-row hotkeys work on AZERTY/QWERTZ and other layouts where the top row
      // emits &é"'(- etc. rather than 1-0. CrazyGames requires layout-agnostic keys.
      if (e.code === 'KeyP') { setPaused(prev => !prev); return; }
      const digit = /^Digit([0-9])$/.exec(e.code)?.[1];
      const type = digit ? SPAWN_HOTKEYS[digit] : undefined;
      if (!type) return;
      spawnReqRef.current(playerSide, type);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSplash, playerSide]);

  const processSpawn = (team: Team, type: UnitType, absolutePos?: { x: number, y: number }) => {
    const cost = UNIT_CONFIG[type].cost;
    const squadId = Math.random().toString(36).substr(2, 5);
    const lane = laneChoice[team] === 'random' ? undefined : laneChoice[team] as 'top' | 'mid' | 'bot';
    if (type === UnitType.SOLDIER) {
      const squad = Array.from({ length: 3 }, (_, i) => ({
        team, type, squadId, lane,
        cost: i === 0 ? cost : 0, // Assign full cost to the first unit
        offset: { x: (i % 2 === 0 ? -8 : 8) + (Math.random() * 4 - 2), y: (Math.floor(i / 2) * 15 - 10) + (Math.random() * 4 - 2) }
      }));
      setSpawnQueue(prev => [...prev, ...squad]);
    } else setSpawnQueue(prev => [...prev, { team, type, cost, absolutePos, lane, squadId: type === UnitType.AIRBORNE ? squadId : undefined }]);
    // Removed local money deduction; GameCanvas handles it via moneyRef
  };

  // Stable identity (recreated only when targeting/lane state changes) so the
  // memoized scene components downstream can skip re-renders.
  const handleCanvasClick = useCallback((x: number, y: number) => {
    if (!targetingInfo) {
      // Clicking open ground drops the current troop selection
      setSelection(null);
    }
    if (targetingInfo) {
      // In 3D, any click returned by onCanvasClick is a valid ground position (x, z).
      // We accept it directly to allow spawning anywhere on the map.
      if (targetingInfo.type === UnitType.NUKE) {
        const isWest = targetingInfo.team === Team.WEST;
        if (isWest && x < 400) return;
        if (!isWest && x > 400) return;
      }
      if (targetingInfo.type === UnitType.BUNKER) {
        // Bunker must be placed on own side
        const isWest = targetingInfo.team === Team.WEST;
        if (isWest && x > 400) return;
        if (!isWest && x < 400) return;
      }
      processSpawn(targetingInfo.team, targetingInfo.type, { x, y });
      setTargetingInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetingInfo, laneChoice]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelection(null); setTargetingInfo(null); return; }
      // Never steal keystrokes from a text field (the online join-code input
      // sits on the splash — typing "EW-B8TL" used to arm a Mine Tank via the
      // '8' hotkey), and nothing spawns before the battle starts.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (showSplash) return;
      // Unit Order (Top to Bottom as rendered)
      const unitOrder = [
        UnitType.SOLDIER, UnitType.SPECIAL_FORCES, UnitType.MINE_PERSONAL, // Infantry
        UnitType.TANK, UnitType.ARTILLERY, UnitType.ANTI_AIR, UnitType.DRONE, UnitType.MINE_TANK, // Vehicles
        UnitType.AIRBORNE, UnitType.AIRSTRIKE, UnitType.MISSILE_STRIKE, UnitType.NUKE // Airstrikes
      ];

      // West: number row 1-0 then -/= (indexes 0..11). Matched by physical position
      // (e.code) so AZERTY/QWERTZ players hit the same keys — see note in onKey above.
      const westCodes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

      // East: F12 down to F1. F12=Top(0), F11=1...
      const eastKeys = ['F12', 'F11', 'F10', 'F9', 'F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];

      // Hotseat convenience keys — but only for sides THIS player commands
      // (never the CPU's army, never the online opponent's). The player's OWN
      // side is excluded here because the number-row quick keys (onKey, above)
      // already own it — without this exclusion a single digit fired both
      // handlers and spawned two different units at once.
      const canCommand = (t: Team) => !cpuTeams.includes(t) && t !== onlineFoe && t !== playerSide;

      // Check West
      const westIndex = westCodes.indexOf(e.code);
      if (westIndex !== -1 && westIndex < unitOrder.length && canCommand(Team.WEST)) {
        handleSpawnRequest(Team.WEST, unitOrder[westIndex]);
      }

      // Check East
      const eastIndex = eastKeys.indexOf(e.code);
      if (eastIndex !== -1 && eastIndex < unitOrder.length && canCommand(Team.EAST)) {
        e.preventDefault(); // F-keys often have browser defaults
        handleSpawnRequest(Team.EAST, unitOrder[eastIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.money, showSplash, onlineFoe, cpuLevel, playerSide]); // Dep on money for validation inside handleSpawnRequest?
  // Actually handleSpawnRequest uses state, so we need to be careful with closure stale state or dependency.
  // handleSpawnRequest depends on gameState.money.
  // Better to use ref for money or include handleSpawnRequest in dep array and wrap it in useCallback?
  // Or just rely on re-binding event listener on render (simple). 
  // Given handleSpawnRequest is NOT wrapped in useCallback currently, it changes every render.
  // So [handleSpawnRequest] works.


  const renderUnitButtons = (team: Team, panelRef?: React.RefObject<HTMLDivElement | null>) => {
    const isWest = team === Team.WEST;
    const colorClass = isWest ? "blue" : "red";
    const money = gameState.money[team];
    // Air Command rearm: all air-delivered strikes share one readiness clock
    const airWait = gameState.airOpsReadyIn?.[team] ?? 0;

    const UNIT_COUNTERS: Record<UnitType, React.ReactNode[]> = {
      [UnitType.SOLDIER]: [<User size={8} key="u" />],
      [UnitType.SPECIAL_FORCES]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.SNIPER]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.MINE_PERSONAL]: [<User size={8} key="u" />],
      [UnitType.TANK]: [<Shield size={8} key="s" />, <User size={8} key="u" />],
      [UnitType.ARTILLERY]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.HELICOPTER]: [<Shield size={8} key="s" />, <Plane size={8} key="p" />],
      [UnitType.ANTI_AIR]: [<Plane size={8} key="p" />, <CircleDashed size={8} key="c" />],
      [UnitType.DRONE]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.MINE_TANK]: [<Shield size={8} key="s" />],
      [UnitType.AIRBORNE]: [<User size={8} key="u" />],
      [UnitType.AIRSTRIKE]: [<User size={8} key="u" />],
      [UnitType.MISSILE_STRIKE]: [<Shield size={8} key="s" />, <User size={8} key="u" />],
      [UnitType.NUKE]: [<Skull size={8} key="k" />],
      [UnitType.NAPALM]: [<User size={8} key="u" />],
      [UnitType.TESLA]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.FLAMETHROWER]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.MEDIC]: [<Heart size={8} key="h" />],
      [UnitType.ENGINEER]: [<PersonalMineIcon size={8} key="m" />, <TankMineIcon size={8} key="t" />],
      [UnitType.MORTAR]: [<User size={8} key="u" />, <CircleDashed size={8} key="c" />],
      [UnitType.JEEP]: [<User size={8} key="u" />],
      [UnitType.FIGHTER]: [<Plane size={8} key="p" />, <Radio size={8} key="r" />],
      [UnitType.SATELLITE]: [<Shield size={8} key="s" />, <User size={8} key="u" />],
      [UnitType.CRUISE]: [<Shield size={8} key="s" />, <Building2 size={8} key="b" />],
      [UnitType.TRANSPORT]: [<User size={8} key="u" />, <FastForward size={8} key="f" />],
      [UnitType.APC]: [<User size={8} key="u" />],
      [UnitType.BUNKER]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.GUNBOAT]: [<User size={8} key="u" />, <Truck size={8} key="t" />],
      [UnitType.GUNSHIP]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
      [UnitType.SMOKE]: [<SniperIcon size={8} key="s" />, <ArtilleryIcon size={8} key="a" />],
    };

    const renderGroup = (title: string, units: { type: UnitType, label: string, icon: React.ReactNode, special?: boolean }[]) => (
      <div className="flex flex-col gap-0.5">
        <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider text-center border-b border-stone-800 pb-0.5">{title}</div>
        <div className="grid grid-cols-2 gap-0.5">
          {units.filter(({ type }) => factionAllowed(team, type, asym)).map(({ type, label, icon, special }) => (
            <button
              key={type}
              title={label}
              className={`group ${targetingInfo?.team === team && targetingInfo.type === type ? 'bg-amber-600 animate-pulse' : special ? (isWest ? 'bg-indigo-700' : 'bg-rose-700') : `bg-${colorClass}-800`} hover:opacity-100 text-white px-0.5 py-1 rounded shadow transition-all active:scale-95 flex flex-col items-center border border-white/10 disabled:opacity-30 relative overflow-visible w-11`}
              onClick={() => handleSpawnRequest(team, type)}
              disabled={money < UNIT_CONFIG[type].cost || cpuTeam === team || (airWait > 0 && AIR_OPS_UI.has(type)) || (activeChallenge?.infantryOnly === true && team === playerSide && !INFANTRY_ALLOWED.has(type)) || (campaignBattle?.banned[team]?.includes(type) ?? false)}
            >
              <span className="[&>svg]:w-[13px] [&>svg]:h-[13px]">{icon}</span>
              <span className="font-bold text-[6px] uppercase leading-none mt-0.5 tracking-tighter">{label}</span>
              <span className="text-[8px] opacity-70 leading-none">${UNIT_CONFIG[type].cost}</span>
              {/* Rearm countdown over locked air ordnance */}
              {airWait > 0 && AIR_OPS_UI.has(type) && (
                <span data-testid="airops-lock" className="absolute inset-0 flex items-center justify-center bg-black/65 rounded text-amber-300 text-[10px] font-bold">
                  {airWait}s
                </span>
              )}

              {/* Tooltip Popup */}
              <div className={`hidden group-hover:flex absolute top-1/2 -translate-y-1/2 ${isWest ? 'left-full ml-2' : 'right-full mr-2'} bg-stone-950 border border-stone-600 p-2 rounded shadow-2xl z-[100] flex-col gap-1 w-max pointer-events-none items-center`}>
                <div className="text-[9px] font-bold text-white uppercase whitespace-nowrap">{label} — ${UNIT_CONFIG[type].cost}</div>
                {(() => {
                  const c = UNIT_CONFIG[type] as any;
                  if (!c.health || !c.damage) return null; // strikes/mines have no combat statline
                  return (
                    <div className="flex gap-2 text-[8px] font-mono text-stone-300 whitespace-nowrap">
                      <span title="Hit points">♥ {c.health}</span>
                      <span title="Damage per shot">⚔ {c.damage}</span>
                      <span title="Range">➶ {c.range}</span>
                      <span title="Speed">» {c.speed >= 1.1 ? 'fast' : c.speed >= 0.5 ? 'med' : 'slow'}</span>
                    </div>
                  );
                })()}
                <div className="text-[8px] font-bold text-stone-500 uppercase whitespace-nowrap">Effective Vs</div>
                <div className="flex gap-2 text-stone-300">
                  {UNIT_COUNTERS[type as UnitType]}
                </div>
                {team === playerSide && HOTKEY_OF[type] && (
                  <div className="text-[8px] text-stone-500 whitespace-nowrap">Hotkey: <span className="text-stone-300 font-mono">{HOTKEY_OF[type]}</span></div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    );

    const laneOptions: { key: 'random' | 'top' | 'mid' | 'bot', label: string }[] = [
      { key: 'random', label: '⤨' }, { key: 'top', label: '▲' }, { key: 'mid', label: '●' }, { key: 'bot', label: '▼' },
    ];
    const stanceOptions: { key: Stance, label: string, title: string, activeColor: string }[] = [
      { key: 'advance', label: '⏩', title: 'Advance — push toward the enemy edge', activeColor: 'border-green-400 bg-green-900/70 text-green-300' },
      { key: 'hold', label: '⏸', title: 'Hold — stop and defend current ground', activeColor: 'border-amber-400 bg-amber-900/70 text-amber-300' },
      { key: 'retreat', label: '⏪', title: 'Fall back — withdraw toward your edge', activeColor: 'border-red-400 bg-red-900/70 text-red-300' },
    ];

    return (
      <div ref={panelRef} className={`flex flex-col gap-1.5 ${isWest ? (compact ? 'mr-1' : 'mr-2') : (compact ? 'ml-1' : 'ml-2')} overflow-y-auto overscroll-contain ${compact ? 'max-h-[calc(100dvh-88px)]' : 'max-h-[calc(100dvh-124px)]'}`}>
        {/* Stance orders */}
        <div className="flex flex-col gap-1">
          <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider text-center border-b border-stone-800 pb-0.5 mb-0.5">Orders</div>
          <div className="flex gap-0.5 justify-center">
            {stanceOptions.map(o => (
              <button
                key={o.key}
                title={o.title}
                onClick={() => setStances(prev => ({ ...prev, [team]: o.key }))}
                disabled={cpuTeam === team}
                className={`w-6 h-6 text-[11px] leading-none rounded border transition-colors disabled:opacity-30 ${stances[team] === o.key ? o.activeColor : 'border-stone-700 text-stone-500 hover:text-white'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {/* Spawn lane selector */}
        <div className="flex flex-col gap-1">
          <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider text-center border-b border-stone-800 pb-0.5 mb-0.5">Lane</div>
          <div className="flex gap-0.5 justify-center">
            {laneOptions.map(o => (
              <button
                key={o.key}
                title={o.key === 'random' ? 'Random lane' : `${o.key} lane`}
                onClick={() => setLaneChoice(prev => ({ ...prev, [team]: o.key }))}
                className={`w-5 h-5 text-[10px] leading-none rounded border transition-colors ${laneChoice[team] === o.key ? 'border-amber-400 bg-amber-900/70 text-amber-300' : 'border-stone-700 text-stone-500 hover:text-white'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {renderGroup("Infantry", [
          { type: UnitType.SOLDIER, label: "SQUAD", icon: <SquadIcon size={16} /> },
          { type: UnitType.SNIPER, label: "SNIPER", icon: <SniperIcon size={16} /> },
          { type: UnitType.SPECIAL_FORCES, label: "SPEC FORCES", icon: <BandanaIcon size={16} />, special: true },
          { type: UnitType.FLAMETHROWER, label: "FLAMER", icon: <Flame size={16} /> },
          { type: UnitType.MEDIC, label: "MEDIC", icon: <Heart size={16} /> },
          { type: UnitType.ENGINEER, label: "ENGINEER", icon: <ShieldAlert size={16} /> },
          { type: UnitType.MORTAR, label: "MORTAR", icon: <MortarIcon size={16} /> },
          { type: UnitType.MINE_PERSONAL, label: "P.MINE", icon: <PersonalMineIcon size={14} /> },
        ])}
        {renderGroup("Vehicles", [
          { type: UnitType.JEEP, label: "JEEP", icon: <Car size={16} /> },
          { type: UnitType.TRANSPORT, label: "TRUCK", icon: <Bus size={16} /> },
          { type: UnitType.TANK, label: "TANK", icon: <TankIcon size={16} /> },
          { type: UnitType.TESLA, label: "TESLA", icon: <TeslaIcon size={16} />, special: true },
          { type: UnitType.APC, label: "APC", icon: <Truck size={16} /> },
          { type: UnitType.ARTILLERY, label: "ARTY", icon: <ArtilleryIcon size={16} /> },
          { type: UnitType.ANTI_AIR, label: "ANTI-AIR", icon: <AntiAirIcon size={16} /> },
          { type: UnitType.MINE_TANK, label: "T.MINE", icon: <TankMineIcon size={16} /> },
          { type: UnitType.BUNKER, label: "BUNKER", icon: <Building2 size={16} /> },
          { type: UnitType.GUNBOAT, label: "GUNBOAT", icon: <Ship size={16} /> }
        ])}
        {renderGroup("Aircraft", [
          { type: UnitType.HELICOPTER, label: "HELI", icon: <HelicopterIcon size={16} /> },
          { type: UnitType.FIGHTER, label: "FIGHTER", icon: <PlaneTakeoff size={16} /> },
          { type: UnitType.DRONE, label: "DRONE", icon: <Radio size={16} /> },
        ])}
        {renderGroup("Airstrikes", [
          { type: UnitType.AIRBORNE, label: "DROP", icon: <ParachuteIcon size={16} /> },
          { type: UnitType.SMOKE, label: "SMOKE", icon: <Cloud size={16} /> },
          { type: UnitType.AIRSTRIKE, label: "NAPALM", icon: <Flame size={16} /> },
          { type: UnitType.MISSILE_STRIKE, label: "MISSILE", icon: <Crosshair size={16} /> },
          { type: UnitType.CRUISE, label: "CRUISE", icon: <Rocket size={16} /> },
          { type: UnitType.GUNSHIP, label: "GUNSHIP", icon: <Plane size={16} />, special: true },
          { type: UnitType.SATELLITE, label: "SAT LASER", icon: <Satellite size={16} />, special: true },
          { type: UnitType.NUKE, label: "NUKE", icon: <Skull size={16} />, special: true },
        ])}
      </div>
    );
  };



  // Commander powers: one prominent group per human-controlled team, centered
  // under the battlefield where they can't be missed.
  const renderCommandBar = () => {
    const humanTeams = SPECTATE ? [] : [Team.WEST, Team.EAST].filter(t => t !== cpuTeam && t !== onlineFoe);
    if (humanTeams.length === 0) return null;
    // Rally timestamps are SIM time — the sim clock freezes on pause and scales
    // with game speed, so wall-clock comparisons would drift the countdowns.
    const now = gameState.simNowMs ?? 0;
    return (
      <div ref={cmdBarRef} className={`flex justify-center ${compact ? 'gap-2 mt-1' : 'gap-4 mt-2'}`}>
        {humanTeams.map(team => {
          const isWest = team === Team.WEST;
          const money = gameState.money[team];
          const lvl = gameState.incomeLevel?.[team] ?? 0;
          const econCost = INCOME_UPGRADE_BASE_COST * (lvl + 1);
          const econMaxed = lvl >= INCOME_UPGRADE_MAX;
          const rally = gameState.rally?.[team];
          const rallyActive = !!rally && now < rally.until;
          const rallyCd = !!rally && now < rally.readyAt && !rallyActive;
          const cdLeft = rally ? Math.ceil((rally.readyAt - now) / 1000) : 0;
          return (
            <div key={team} className={`flex items-center gap-2 bg-stone-800 rounded-lg border shadow-lg ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} ${cmdHint ? 'border-amber-400 animate-pulse' : 'border-stone-600'}`}>
              <div className={`flex flex-col items-center leading-none ${isWest ? 'text-blue-400' : 'text-red-400'}`}>
                <span className="text-[9px] font-black uppercase tracking-widest">{isWest ? 'West' : 'East'}</span>
                <span className="text-[8px] text-stone-500 uppercase tracking-wider mt-0.5">Command</span>
              </div>
              <button
                title={econMaxed ? 'Economy fully upgraded' : `Invest $${econCost}: +25% income for the rest of the match`}
                onClick={() => setCommandQueue(prev => [...prev, { team, cmd: 'income' }])}
                disabled={econMaxed || money < econCost}
                className="flex items-center gap-2 px-3 py-1.5 rounded border border-stone-600 bg-stone-900/60 text-stone-300 hover:text-white hover:border-stone-400 transition-colors active:scale-95 disabled:opacity-30"
              >
                <TrendingUp size={compact ? 14 : 18} className="text-green-400" />
                <span className="flex flex-col items-start leading-none">
                  <span className="text-[10px] font-bold uppercase">Economy <span className="text-amber-400 tracking-tighter">{'●'.repeat(lvl)}{'○'.repeat(INCOME_UPGRADE_MAX - lvl)}</span>{compact && !econMaxed ? ` $${econCost}` : ''}</span>
                  {!compact && <span className="text-[9px] opacity-70 mt-0.5">{econMaxed ? 'Fully upgraded' : `$${econCost} · +25% income`}</span>}
                </span>
              </button>
              <button
                title={rallyActive ? 'Rally active — your army is surging!' : rallyCd ? `Rally horn recharging (${cdLeft}s)` : `$${RALLY_COST}: +45% fire rate & +25% speed for 8s`}
                onClick={() => setCommandQueue(prev => [...prev, { team, cmd: 'rally' }])}
                disabled={rallyActive || rallyCd || money < RALLY_COST}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors active:scale-95 disabled:opacity-40 ${rallyActive ? 'border-amber-400 bg-amber-900/70 text-amber-300 animate-pulse' : 'border-stone-600 bg-stone-900/60 text-stone-300 hover:text-white hover:border-stone-400'}`}
              >
                <Megaphone size={compact ? 14 : 18} className={rallyActive ? 'text-amber-300' : 'text-amber-500'} />
                <span className="flex flex-col items-start leading-none">
                  <span className="text-[10px] font-bold uppercase">{rallyActive ? 'Rallying!' : compact ? (rallyCd ? `Rally ${cdLeft}s` : `Rally $${RALLY_COST}`) : 'Rally Horn'}</span>
                  {!compact && <span className="text-[9px] opacity-70 mt-0.5">{rallyActive ? 'Units surging' : rallyCd ? `Ready in ${cdLeft}s` : `$${RALLY_COST} · 8s surge`}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center font-serif overflow-hidden ${compact ? 'p-1 justify-start' : 'p-4 justify-center'}`}>
      {/* Portrait phones: the battlefield needs landscape */}
      {isPortraitMobile && (
        <div className="fixed inset-0 z-[10000] bg-stone-950/95 flex flex-col items-center justify-center gap-3 text-center p-6">
          <div className="text-5xl animate-pulse">📱↻</div>
          <div className="text-amber-400 font-black uppercase tracking-widest">Rotate your device</div>
          <div className="text-stone-400 text-sm max-w-xs">East vs West plays in landscape — turn your phone sideways for the full battlefield.</div>
        </div>
      )}
      {/* Splash Screen Overlay */}
      {showSplash && (
        <div
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-end cursor-pointer transition-opacity duration-700 overflow-y-auto ${compact ? 'pb-3' : 'pb-16'} ${splashFading ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleStartClick}
        >
          <img
            src="splash.jpg"
            alt="East vs West"
            className="absolute inset-0 w-full h-full object-contain md:object-cover"
          />
          <div className={`relative z-10 flex flex-col items-center select-none ${compact ? 'gap-1.5' : 'gap-4'}`} onClick={e => e.stopPropagation()}>
            {/* Map Selection */}
            <div className={`bg-black/70 backdrop-blur-sm rounded-lg border border-stone-600 mb-1 ${compact ? 'p-1.5' : 'p-3'}`}>
              <p className={`text-stone-400 text-[10px] uppercase tracking-widest text-center ${compact ? 'mb-1' : 'mb-2'}`}>Select Battlefield</p>
              <div className={`grid grid-cols-5 ${compact ? 'gap-1' : 'gap-2'}`}>
                {([
                  { type: MapType.COUNTRYSIDE, label: 'Countryside', desc: 'Rivers & forests', color: 'text-green-400' },
                  { type: MapType.URBAN,       label: 'Urban',       desc: 'City walls & rubble', color: 'text-slate-300' },
                  { type: MapType.DESERT,      label: 'Desert',      desc: 'Dunes & wadis', color: 'text-amber-400' },
                  { type: MapType.ARCHIPELAGO, label: 'Islands',     desc: 'Channels & bridges', color: 'text-cyan-400' },
                  { type: MapType.WINTER,      label: 'Winter',      desc: 'Infantry cross the ice', color: 'text-sky-300' },
                ] as const).map(m => (
                  <button
                    key={m.type}
                    onClick={() => setMapType(m.type)}
                    className={`rounded border text-center transition-all ${compact ? 'px-1.5 py-1' : 'px-3 py-2'} ${mapType === m.type ? 'border-amber-400 bg-amber-900/60' : 'border-stone-600 hover:border-stone-400 bg-black/40'}`}
                  >
                    <div className={`font-bold uppercase ${compact ? 'text-[10px]' : 'text-xs'} ${m.color}`}>{m.label}</div>
                    {!compact && <div className="text-stone-500 text-[9px] mt-0.5">{m.desc}</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Side & CPU Opponent Selection */}
            <div className={`bg-black/70 backdrop-blur-sm rounded-lg border border-stone-600 mb-1 flex items-center ${compact ? 'p-1.5 gap-3' : 'p-3 gap-6'}`}>
              <div>
                <p className={`text-stone-400 text-[10px] uppercase tracking-widest text-center ${compact ? 'mb-1' : 'mb-2'}`}>Play As</p>
                <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
                  <button onClick={() => setPlayerSide(Team.WEST)} className={`rounded border font-bold uppercase text-blue-400 transition-all ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} ${playerSide === Team.WEST ? 'border-amber-400 bg-amber-900/60' : 'border-stone-600 hover:border-stone-400 bg-black/40'}`}>West</button>
                  <button onClick={() => setPlayerSide(Team.EAST)} className={`rounded border font-bold uppercase text-red-400 transition-all ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} ${playerSide === Team.EAST ? 'border-amber-400 bg-amber-900/60' : 'border-stone-600 hover:border-stone-400 bg-black/40'}`}>East</button>
                </div>
              </div>
              <div>
                <p className={`text-stone-400 text-[10px] uppercase tracking-widest text-center ${compact ? 'mb-1' : 'mb-2'}`}>Win Mode</p>
                <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
                  <button onClick={() => setGameMode('points')} title="First to 100 points wins" className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} ${gameMode === 'points' ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}>Points</button>
                  <button onClick={() => setGameMode('basehp')} title={`Breakthroughs damage the enemy base (${BASE_HP} HP)`} className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} ${gameMode === 'basehp' ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}>Base HP</button>
                  <button onClick={() => setGameMode('ctf')} title="Nine neutral flags on the field — stand near one to seize it instantly (it turns your colour). Most flags when the 4-minute clock runs out wins (ties go to overtime)" className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} ${gameMode === 'ctf' ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}>⚑ Flags</button>
                </div>
                <div data-testid="doctrine" className={`flex justify-center ${compact ? 'gap-1 mt-1' : 'gap-2 mt-2'}`}>
                  <button onClick={() => setAsymPersist(false)} title="Both sides field identical armies" className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} ${!asym ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}>Classic</button>
                  <button onClick={() => setAsymPersist(true)} title="West: precision & mobility (satellite laser, cruise, faster wheels). East: armor & saturation (tougher tanks, heavier artillery, napalm airstrike, tesla)" className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} ${asym ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}>Asymmetric</button>
                </div>
              </div>
              <div>
                <p className={`text-stone-400 text-[10px] uppercase tracking-widest text-center ${compact ? 'mb-1' : 'mb-2'}`}>CPU Opponent</p>
                <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
                  {(['off', 'easy', 'normal', 'hard'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setCpuLevel(l)}
                      title={{
                        off: 'No computer opponent — two-player hotseat',
                        easy: 'Slow to act, rarely counters your army, never uses commands',
                        normal: 'Reads your composition, counter-picks and calls strikes',
                        hard: 'Fast and ruthless: perfect counters, economy & rally usage, and battlefield maneuvers',
                      }[l]}
                      className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} ${cpuLevel === l ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}
                    >{l}</button>
                  ))}
                </div>
                {cpuLevel !== 'off' && (
                  <div className="flex justify-center mt-1.5">
                    <button
                      data-testid="fow-toggle"
                      onClick={toggleFow}
                      title="Fog of war: you only see what your units can see — scout before you strike (blind strikes scatter)"
                      className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'} ${fow ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}
                    ><Eye size={10} className="inline mr-1 -mt-0.5" />Fog of War {fow ? 'ON' : 'OFF'}</button>
                  </div>
                )}
                {cpuLevel !== 'off' && (
                  <div data-testid="cpu-persona" className={`flex flex-wrap justify-center ${compact ? 'gap-1 mt-1' : 'gap-1.5 mt-2'}`}>
                    {(['random', ...CPU_PERSONA_IDS] as CpuPersona[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setCpuPersona(p)}
                        title={p === 'random' ? 'A different commander every battle' : CPU_PERSONALITY[p].blurb}
                        className={`rounded border font-bold uppercase transition-all ${compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-1 text-[10px]'} ${cpuPersona === p ? 'border-amber-400 bg-amber-900/60 text-amber-300' : 'border-stone-600 hover:border-stone-400 bg-black/40 text-stone-400'}`}
                      >{p === 'random' ? 'Random' : p === 'balanced' ? 'Staff' : CPU_PERSONALITY[p].name.replace(/[“”]/g, '').split(' ')[0]}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Challenge missions */}
            <div data-testid="challenges" className={`bg-black/70 backdrop-blur-sm rounded-lg border border-stone-600 ${compact ? 'p-1.5' : 'p-2.5'}`}>
              <p className={`text-stone-400 text-[10px] uppercase tracking-widest text-center ${compact ? 'mb-1' : 'mb-1.5'}`}>Challenges</p>
              <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
                {CHALLENGES.map(c => {
                  const done = challengesDone.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => startChallenge(c)}
                      title={c.desc}
                      className={`rounded border text-center transition-all ${compact ? 'px-1.5 py-1' : 'px-3 py-1.5'} ${done ? 'border-green-500/70 bg-green-950/50' : 'border-stone-600 hover:border-amber-400 bg-black/40'}`}
                    >
                      <div className={`font-bold uppercase ${compact ? 'text-[9px]' : 'text-[11px]'} ${done ? 'text-green-400' : 'text-stone-200'}`}>{done ? '✓ ' : ''}{c.name}</div>
                      {!compact && <div className="text-[8px] text-stone-500">{c.desc}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Online 1v1 — peer-to-peer lockstep; a room code is the only handshake */}
            <div data-testid="online-panel" className={`bg-black/70 backdrop-blur-sm rounded-lg border border-sky-800 ${compact ? 'p-1.5' : 'p-2.5'} flex flex-col items-center gap-1.5`}>
              <p className="text-sky-400 text-[10px] uppercase tracking-widest text-center">Online 1v1</p>
              {!online ? (
                <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
                  <button
                    data-testid="host-btn"
                    onClick={startHost}
                    className={`rounded border border-sky-600 hover:border-sky-400 bg-sky-950/60 text-sky-200 font-bold uppercase transition-all ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
                  >Host game</button>
                  <input
                    data-testid="join-input"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') startJoin(joinCode); }}
                    placeholder="EW-XXXX"
                    className={`bg-black/60 border border-stone-600 rounded font-mono text-stone-200 uppercase ${compact ? 'px-1.5 py-1 text-[10px] w-20' : 'px-2 py-1.5 text-xs w-24'}`}
                  />
                  <button
                    data-testid="join-btn"
                    onClick={() => startJoin(joinCode)}
                    disabled={!joinCode.trim()}
                    className={`rounded border border-stone-600 hover:border-sky-400 bg-black/40 text-stone-300 font-bold uppercase transition-all disabled:opacity-30 ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
                  >Join</button>
                </div>
              ) : online.error ? (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-red-400 text-[11px] max-w-sm text-center">{online.error}</span>
                  <button onClick={endOnline} className="rounded border border-stone-600 hover:border-stone-400 px-2 py-1 text-[10px] uppercase font-bold text-stone-300">Back</button>
                </div>
              ) : online.phase === 'connecting' ? (
                <div className="flex flex-col items-center gap-1.5">
                  {online.role === 'host' ? (
                    <>
                      <span className="text-stone-300 text-[11px]">Room code — send it to your opponent:</span>
                      <div className="flex items-center gap-2">
                        <span data-testid="room-code" className="font-mono text-lg text-amber-300 tracking-widest">{online.code}</span>
                        <button
                          onClick={() => { try { navigator.clipboard.writeText(online.code); } catch { /* clipboard may be blocked */ } }}
                          className="rounded border border-stone-600 hover:border-stone-400 px-1.5 py-0.5 text-[9px] uppercase font-bold text-stone-400"
                        >Copy</button>
                      </div>
                      <span className="text-stone-500 text-[10px] animate-pulse">Waiting for opponent to join…</span>
                    </>
                  ) : (
                    <span className="text-stone-400 text-[11px] animate-pulse">Connecting to {online.code}…</span>
                  )}
                  <button onClick={endOnline} className="rounded border border-stone-600 hover:border-stone-400 px-2 py-1 text-[10px] uppercase font-bold text-stone-300">Cancel</button>
                </div>
              ) : online.phase === 'lobby' ? (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-stone-300 text-[11px]">
                    <span className="text-green-400 font-bold">Opponent connected.</span>
                    {' '}{online.settings.map.toLowerCase()} · {online.settings.mode} · {online.settings.asymmetry ? 'asymmetric' : 'classic'} · {online.settings.fogOfWar ? 'fog on' : 'fog off'} · you play <span className={((online.role === 'host') === (online.settings.hostTeam === 'WEST')) ? 'text-blue-400 font-bold' : 'text-red-400 font-bold'}>{(online.role === 'host') === (online.settings.hostTeam === 'WEST') ? 'WEST' : 'EAST'}</span>
                  </span>
                  {online.role === 'host'
                    ? <span className="text-stone-500 text-[10px]">Map, mode and side follow your menu choices above</span>
                    : <span className="text-stone-500 text-[10px]">The host picks map, mode and sides</span>}
                  <div className="flex items-center gap-2">
                    <button
                      data-testid="ready-btn"
                      onClick={() => sessionRef.current?.setReady(!online.selfReady)}
                      className={`rounded border font-bold uppercase px-3 py-1.5 text-xs transition-all ${online.selfReady ? 'border-green-500 bg-green-950/60 text-green-300' : 'border-amber-400 bg-amber-900/60 text-amber-300 animate-pulse'}`}
                    >{online.selfReady ? '✓ Ready' : 'Ready?'}</button>
                    <span className={`text-[10px] uppercase font-bold ${online.peerReady ? 'text-green-400' : 'text-stone-500'}`}>
                      {online.peerReady ? 'Opponent ready' : 'Opponent not ready'}
                    </span>
                    <button onClick={endOnline} className="rounded border border-stone-600 hover:border-stone-400 px-2 py-1 text-[10px] uppercase font-bold text-stone-300">Leave</button>
                  </div>
                </div>
              ) : null}
              {!online && !compact && (
                <span className="text-stone-500 text-[9px] max-w-md text-center">
                  Peer-to-peer over the internet. Host a room, send the code, both press Ready. Same browser family (e.g. Chrome/Edge) recommended.
                </span>
              )}
            </div>
            {/* Grand Campaign: the strategic board wrapping the battles */}
            <button
              data-testid="campaign-btn"
              onClick={openCampaign}
              className={`bg-black/70 backdrop-blur-sm rounded-lg border-2 border-amber-600/70 hover:border-amber-400 hover:bg-amber-950/40 transition-all text-center ${compact ? 'px-3 py-1' : 'px-6 py-2'}`}
            >
              <div className={`font-black uppercase tracking-widest text-amber-300 ${compact ? 'text-[11px]' : 'text-sm'}`}>
                🗺 {campaign && !campaignWinner(campaign) ? `Continue Campaign — Turn ${campaign.turn + 1}` : 'Grand Campaign'}
              </div>
              {!compact && (
                <div className="text-[10px] text-stone-400 normal-case tracking-normal">
                  Conquer a 14-territory front, one real battle at a time — march armies, seize the airbase and silo, take the enemy capital
                </div>
              )}
            </button>
            <button
              className={`bg-amber-600 hover:bg-amber-500 active:scale-95 text-black font-black uppercase tracking-widest rounded border-2 border-amber-400 shadow-2xl animate-pulse transition-all ${compact ? 'px-6 py-1.5 text-sm' : 'px-10 py-3 text-lg'}`}
              onClick={handleStartClick}
            >
              ▶ DEPLOY FORCES
            </button>
            {!compact && <span className="text-stone-400 text-xs tracking-widest uppercase">Click anywhere to start</span>}
            <span className={`text-stone-500 tracking-wide text-center ${compact ? 'text-[8px] max-w-sm' : 'text-[10px] max-w-md'}`}>
              Buy units from the side panels · click <span className="text-stone-300">your</span> units to give Attack/Hold/Fall Back orders (double-click = all of that type) · click <span className="text-stone-300">enemy</span> units to focus fire
            </span>
            {/* Recent battles */}
            {!compact && history.length > 0 && (
              <div data-testid="recent-battles" className="bg-black/70 backdrop-blur-sm rounded-lg border border-stone-700 px-3 py-1.5 flex flex-col gap-0.5 max-w-md">
                <span className="text-[9px] uppercase tracking-widest text-stone-500 text-center">Recent battles</span>
                {history.slice(0, 4).map((h, i) => {
                  const mins = Math.max(1, Math.round((Date.now() - h.when) / 60000));
                  const ago = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
                  return (
                    <span key={i} className="text-[10px] text-stone-400 font-mono whitespace-nowrap">
                      <span className={h.winner === 'WEST' ? 'text-blue-400' : 'text-red-400'}>{h.winner}</span>
                      {` won ${h.w}-${h.e} · ${h.map.toLowerCase()} · ${Math.floor(h.dur / 60)}m${h.dur % 60}s · ${ago}`}
                      {h.spectate ? ' · cpu-vs-cpu' : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={headerRef} className={`w-full max-w-4xl flex justify-between items-center bg-stone-800 rounded-lg shadow-lg border border-stone-600 ${compact ? 'mb-1 p-1.5' : 'mb-3 p-3'}`}>
        <div className="flex items-center gap-3 text-blue-400"><Shield className={compact ? 'w-4 h-4' : 'w-6 h-6'} /><div><h2 className={`font-bold uppercase ${compact ? 'text-xs leading-none' : 'text-lg'}`}>West</h2><p className="text-xs">{gameMode === 'ctf' ? `Flags: ⚑ ${gameState.ctf?.west ?? 0}` : gameMode === 'basehp' ? `Base: ${gameState.baseHP?.[Team.WEST] ?? BASE_HP} HP` : `Score: ${gameState.score[Team.WEST]}`}</p><p className="text-amber-400 font-mono text-[10px]">${Math.floor(gameState.money[Team.WEST])}</p></div></div>
        <div className="text-center flex flex-col items-center">
          {!compact && <h1 className="text-xl font-black tracking-widest text-amber-500 uppercase italic">East vs West 3D</h1>}
          <div className={`flex items-center ${compact ? 'gap-1' : 'gap-4'}`}>
            <button onClick={() => { if (onlinePlaying) { endOnline(); } else { resetGame(); } }} title={onlinePlaying ? 'Leave the online match (forfeits)' : 'Reset the battle'} className="flex items-center gap-1 text-[9px] text-stone-400 hover:text-white uppercase font-bold tracking-tighter"><RotateCcw size={10} />{onlinePlaying ? 'Leave' : 'Reset'}</button>
            <button onClick={() => setPaused(p => !p)} disabled={onlinePlaying} title={onlinePlaying ? 'No pausing online (v1) — both sims must advance together' : undefined} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors disabled:opacity-30 ${paused ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}>{paused ? <Play size={10} /> : <Pause size={10} />}{paused ? 'Resume' : 'Pause'}</button>
            <button onClick={() => setGameSpeed(s => s === 1 ? 2 : 1)} disabled={onlinePlaying} title={onlinePlaying ? 'Speed is locked at 1x online' : undefined} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors disabled:opacity-30 ${gameSpeed === 2 ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><FastForward size={10} />{gameSpeed}x</button>
            {onlinePlaying && (
              <div data-testid="ping-badge" className={`flex items-center gap-1 border px-1.5 py-0.5 rounded ${(online!.pingMs ?? 999) < 80 ? 'border-green-700 text-green-400' : (online!.pingMs ?? 999) < 180 ? 'border-amber-600 text-amber-400' : 'border-red-700 text-red-400'}`} title="Connection to your opponent (round-trip)">
                <Radio size={10} />
                <span className="text-[9px] font-bold">{online!.pingMs != null ? `${online!.pingMs}ms` : '—'}</span>
              </div>
            )}
            <button onClick={toggleMute} title={muted ? 'Unmute all audio' : 'Mute all audio'} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${muted ? 'border-red-500 text-red-400 bg-red-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}>{muted ? <VolumeX size={10} /> : <Volume2 size={10} />}{muted ? 'Muted' : 'Sound'}</button>
            {!compact && !muted && (
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={Math.round(soundService.getVolume() * 100)}
                onChange={e => soundService.setVolume(Number(e.target.value) / 100)}
                title="Master volume"
                className="w-14 h-1 accent-amber-500 cursor-pointer"
              />
            )}
            <button onClick={toggleMusic} title={musicOn ? 'Stop battle music' : 'Play battle music'} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${musicOn ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><Music size={10} />Music</button>
            <button onClick={() => setShowManual(m => !m)} title={showManual ? 'Hide the field manual (objectives & unit intel)' : 'Show the field manual (objectives & unit intel)'} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${showManual ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><BookOpen size={10} />Manual</button>
            <button onClick={cycleCpuLevel} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${cpuLevel !== 'off' ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><Cpu size={10} />CPU {cpuLevel.toUpperCase()}</button>
            <button onClick={() => setFxPersist(fx === 'high' ? 'low' : 'high')} title={fx === 'high' ? 'Switch to low graphics (no shadows/bloom) for weak devices' : 'Switch to full graphics'} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${fx === 'low' ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><Sparkles size={10} />FX {fx.toUpperCase()}</button>
            <button onClick={toggleCb} title={cb ? 'Standard team colors' : 'Colorblind assist: East shows as amber in rings, minimap and indicators'} className={`flex items-center gap-1 text-[9px] uppercase font-bold tracking-tighter border px-1.5 py-0.5 rounded transition-colors ${cb ? 'border-amber-500 text-amber-400 bg-amber-950' : 'border-stone-600 text-stone-400 hover:text-white'}`}><Eye size={10} />CB</button>
            {activeChallenge && !showSplash && (
              <div data-testid="challenge-chip" className="flex items-center gap-1 text-amber-300" title={activeChallenge.desc}>
                <Target size={12} />
                <span className="text-[10px] font-bold uppercase">
                  {activeChallenge.name}
                  {activeChallenge.maxDurSec ? ` ${Math.max(0, activeChallenge.maxDurSec - Math.floor((Date.now() - challengeStartRef.current) / 1000))}s` : ''}
                </span>
              </div>
            )}
            {gameState.weather === 'rain'  && <div className="flex items-center gap-1 text-blue-300 animate-pulse"><Wind size={14} /><span className="text-[10px] font-bold">RAIN</span></div>}
            {gameState.weather === 'snow'  && <div className="flex items-center gap-1 text-slate-200 animate-pulse"><Wind size={14} /><span className="text-[10px] font-bold">SNOW</span></div>}
            {gameState.weather === 'fog'   && <div className="flex items-center gap-1 text-slate-400 animate-pulse"><Wind size={14} /><span className="text-[10px] font-bold">FOG</span></div>}
            {gameState.weather === 'storm' && <div className="flex items-center gap-1 text-yellow-300 animate-pulse"><Zap size={14} /><span className="text-[10px] font-bold">STORM</span></div>}
            {gameState.weather === 'clear' && gameState.weatherNext && gameState.weatherNext.type !== 'clear' && (
              <div className="flex items-center gap-1 text-stone-400" title={`${gameState.weatherNext.type} rolling in — plan around the combat penalties`}>
                <Wind size={14} />
                <span className="text-[10px] font-bold uppercase">{gameState.weatherNext.type} in {Math.max(0, Math.ceil((gameState.weatherNext.at - (gameState.simNowMs ?? 0)) / 1000))}s</span>
              </div>
            )}
            {gameState.weather === 'clear' && !compact && (!gameState.weatherNext || gameState.weatherNext.type === 'clear') && <div className="flex items-center gap-1 opacity-0"><Wind size={14} /><span className="text-[10px] font-bold">CLEAR</span></div>}
            {(gameState.captureOwner || gameState.flankOwners?.some(o => o)) && (
              <div className="flex items-center gap-1" title="Capture points: top flank · center · bottom flank">
                <MapPin size={12} className={gameState.captureOwner === Team.WEST ? 'text-blue-400' : gameState.captureOwner === Team.EAST ? 'text-red-400' : 'text-stone-400'} />
                {[gameState.flankOwners?.[0] ?? null, gameState.captureOwner ?? null, gameState.flankOwners?.[1] ?? null].map((o, i) => (
                  <span key={i} className={`inline-block rounded-full ${i === 1 ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} ${o === Team.WEST ? 'bg-blue-500' : o === Team.EAST ? (cb ? 'bg-amber-400' : 'bg-red-500') : 'bg-stone-600'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-red-400 text-right"><div><h2 className="text-lg font-bold uppercase">East</h2><p className="text-xs">{gameMode === 'ctf' ? `Flags: ⚑ ${gameState.ctf?.east ?? 0}` : gameMode === 'basehp' ? `Base: ${gameState.baseHP?.[Team.EAST] ?? BASE_HP} HP` : `Score: ${gameState.score[Team.EAST]}`}</p><p className="text-amber-400 font-mono text-[10px]">${Math.floor(gameState.money[Team.EAST])}</p></div><Sword className="w-6 h-6" /></div>
      </div>
      <div className="relative flex items-center justify-center">
        {!westIsCpu && renderUnitButtons(Team.WEST, westPanelRef)}
        <div className="relative">
          {/* Online: keyed by the match seed so the canvas swap is ATOMIC with
              the phase flip — the outgoing splash canvas must never render
              even once with the lockstep scheduler attached (see the frozen
              lockstepRef in GameCanvas for why). While a session is PRE-match
              (connecting/lobby) the engine unmounts entirely: the splash
              battle is pointless there, burns CPU the handshake needs, and
              tearing it down mid-WebGL-init at match start raced R3F's event
              hookup into a null-target crash. Element is built unconditionally
              (inline hooks must run every render), mounted conditionally. */}
          {(!online || onlinePlaying) ? <GameCanvas key={onlinePlaying ? `net-${online!.config!.seed}` : gameKey} onGameStateChange={onGameStateChange} spawnQueue={spawnQueue} clearSpawnQueue={clearSpawnQueueCb} onCanvasClick={handleCanvasClick} targetingInfo={targetingInfo} cpuTeams={onlinePlaying ? [] : cpuTeams} cpuDifficulty={cpuLevel === 'off' ? 'normal' : cpuLevel} cpuPersona={campaignBattle && campaign ? campaign.enemyPersona : cpuPersona} fogOfWar={onlinePlaying ? online!.config!.fogOfWar : (fow && cpuTeams.length === 1)} asymmetry={onlinePlaying ? online!.config!.asymmetry : asym} onGameOver={handleCampaignGameOver} moneyMultByTeam={campaignBattle?.mult} bannedUnits={campaignBattle?.banned} mapType={effMapType} paused={onlinePlaying ? false : paused} gameSpeed={onlinePlaying ? 1 : gameSpeed} gameMode={effGameMode} stances={stances} commandQueue={commandQueue} clearCommandQueue={clearCommandQueueCb} orderQueue={orderQueue} clearOrderQueue={clearOrderQueueCb} onSelectUnits={onSelectUnitsCb} selectedIds={selection?.ids} compact={compact} fx={fx} cb={cb} startMoneyMult={CHALLENGES.find(c => c.id === challenge)?.moneyMult} challengeId={challenge} onChallengeWon={onChallengeWon} viewW={viewSize.w} viewH={viewSize.h} matchSeed={onlinePlaying ? online!.config!.seed : PARAM_SEED} lockstep={onlinePlaying ? session!.scheduler ?? undefined : undefined} localTeam={onlineTeam ?? undefined} onNetChecksum={onlinePlaying ? session!.reportChecksum : undefined} peerChecksumsRef={peerChecksumsRef} onDesync={onlinePlaying ? session!.markDesync : undefined} />
          : <div style={{ width: viewSize.w, height: viewSize.h }} className="rounded-lg shadow-2xl border-4 border-stone-800 bg-stone-900" />}
          {/* Online status overlays. Order matters: desync trumps everything
              (the match is void), disconnect next, then the routine hold. */}
          {onlinePlaying && online?.desyncTick != null && (
            <div data-testid="desync-overlay" className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="flex flex-col items-center gap-3 bg-stone-900 border-2 border-red-700 rounded-lg px-8 py-6 max-w-md text-center">
                <span className="text-red-400 font-black uppercase tracking-widest">Simulations diverged</span>
                <span className="text-stone-300 text-sm">The two games disagreed at tick {online.desyncTick} and the match can't fairly continue. No result is recorded — this is a bug worth reporting (seed, tick and build id are in the browser console via __ewDebug).</span>
                <button onClick={endOnline} className="px-6 py-2 bg-stone-700 hover:bg-stone-600 rounded font-bold uppercase text-sm">Back to menu</button>
              </div>
            </div>
          )}
          {onlinePlaying && online?.desyncTick == null && (online?.peerLeft || (online?.resignedBy && online.resignedBy !== online.role)) && !netClaimed && (
            <div data-testid="gone-overlay" className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="flex flex-col items-center gap-3 bg-stone-900 border-2 border-amber-700 rounded-lg px-8 py-6 max-w-md text-center">
                <span className="text-amber-300 font-black uppercase tracking-widest">
                  {online.peerLeft ? 'Opponent disconnected' : 'Opponent resigned'}
                </span>
                <span className="text-stone-300 text-sm">{online.peerLeft ? 'The connection is gone and is not coming back (no reconnection in this version).' : 'They struck their colors.'}</span>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setNetClaimed(true); (window as any).__ewDebug?.winTeam?.(onlineTeam === Team.EAST ? 'EAST' : 'WEST'); }}
                    className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded font-black uppercase text-sm"
                  >Claim victory</button>
                  <button onClick={endOnline} className="px-6 py-2 bg-stone-700 hover:bg-stone-600 rounded font-bold uppercase text-sm">Exit</button>
                </div>
              </div>
            </div>
          )}
          {onlinePlaying && online?.desyncTick == null && !online?.peerLeft && netWaitMs > 600 && (
            <div data-testid="waiting-overlay" className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-stone-950/90 border border-sky-600 rounded-lg px-4 py-2 shadow-2xl">
              <span className="text-sky-300 text-xs font-bold uppercase animate-pulse">Waiting for opponent… {Math.floor(netWaitMs / 1000)}s</span>
            </div>
          )}
          {/* Armed-strike banner: tells the player what to do next (worded for
              their input device) and offers the only cancel path besides Esc */}
          {targetingInfo && (
            <div data-testid="targeting-banner" className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-950/90 border border-amber-500 rounded-lg px-3 py-1.5 shadow-2xl">
              <Crosshair size={13} className="text-amber-400 animate-pulse" />
              <span className="text-[11px] text-amber-200 font-bold uppercase whitespace-nowrap">
                {targetingInfo.type.replace('_', ' ')} armed — {HAS_TOUCH ? 'tap' : 'click'} the battlefield
              </span>
              <button
                onClick={() => setTargetingInfo(null)}
                className="text-[10px] uppercase font-bold border border-stone-500 rounded px-1.5 py-0.5 text-stone-300 hover:text-white hover:border-stone-300 transition-colors"
              >
                ✕ Cancel
              </button>
            </div>
          )}
          {/* One-time tutorial toast for troop control */}
          {/* CTF scoreboard: flag tallies flanking the match clock */}
          {gameMode === 'ctf' && gameState.ctf && (
            <div data-testid="ctf-clock" className="absolute top-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none bg-black/75 border border-amber-500/70 rounded-lg px-3 py-1 text-center shadow-xl">
              <span className="text-blue-400 font-black text-sm">⚑ {gameState.ctf.west}</span>
              <span className={`mx-2 font-mono font-bold text-sm ${gameState.ctf.overtime ? 'text-red-400 animate-pulse' : gameState.ctf.timeLeftSec <= 30 ? 'text-amber-300' : 'text-stone-200'}`}>
                {gameState.ctf.overtime ? 'OVERTIME' : `${Math.floor(gameState.ctf.timeLeftSec / 60)}:${String(gameState.ctf.timeLeftSec % 60).padStart(2, '0')}`}
              </span>
              <span className={`font-black text-sm ${cb ? 'text-amber-400' : 'text-red-400'}`}>{gameState.ctf.east} ⚑</span>
            </div>
          )}
          {troopHint && !selection && !targetingInfo && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none bg-black/75 border border-amber-500/70 rounded-lg px-4 py-2 text-[11px] text-amber-200 shadow-xl text-center leading-snug">
              💡 <strong>Click one of your units</strong> to give it its own orders — Attack, Hold or Fall Back.<br />
              <span className="text-amber-200/70"><strong>Double-click</strong> selects every unit of that type. Esc or a ground click deselects.</span>
            </div>
          )}
          {/* Troop order panel — appears when you click one of your own units */}
          {selection && (() => {
            const liveIds = selection.ids.filter(id => gameState.units.some(u => u.id === id && u.health > 0));
            if (liveIds.length === 0) return null;
            const isWest = selection.team === Team.WEST;
            const issue = (order: Stance | null) => setOrderQueue(prev => [...prev, { ids: liveIds, order }]);
            const issueAbility = (ability: 'overdrive' | 'c4' | 'sell') => setOrderQueue(prev => [...prev, { ids: liveIds, ability }]);
            const btn = 'px-2 py-1 rounded border text-[9px] font-bold uppercase tracking-tight transition-colors active:scale-95';
            // Ability buttons appear when the selection contains a capable type;
            // disabled (with a countdown) while every such unit is on cooldown
            const selUnits = gameState.units.filter(u => liveIds.includes(u.id));
            const tick = gameState.tick ?? 0;
            const abilityState = (type: UnitType) => {
              const capable = selUnits.filter(u => u.type === type);
              if (capable.length === 0) return null;
              const soonest = Math.min(...capable.map(u => u.abilityReadyAt ?? 0));
              return { ready: soonest <= tick, waitSec: Math.max(0, Math.ceil((soonest - tick) / 60)) };
            };
            const od = abilityState(UnitType.TANK);
            const c4 = abilityState(UnitType.ENGINEER);
            const hasBunker = selUnits.some(u => u.type === UnitType.BUNKER);
            return (
              <div className="absolute bottom-[70px] left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-stone-900/95 border border-stone-500 rounded-lg px-2.5 py-1.5 shadow-2xl">
                <span className={`text-[10px] font-black uppercase mr-1 ${isWest ? 'text-blue-400' : 'text-red-400'}`}>
                  {liveIds.length} unit{liveIds.length > 1 ? 's' : ''}
                </span>
                <button onClick={() => issue('advance')} title="Selected troops push toward the enemy edge" className={`${btn} border-green-600 text-green-400 hover:bg-green-900/60`}>⚔ Attack</button>
                <button onClick={() => issue('hold')} title="Selected troops stop and defend (infantry can entrench)" className={`${btn} border-amber-600 text-amber-400 hover:bg-amber-900/60`}>⛨ Hold</button>
                <button onClick={() => issue('retreat')} title="Selected troops withdraw toward your edge (they heal there)" className={`${btn} border-red-600 text-red-400 hover:bg-red-900/60`}>⏪ Fall Back</button>
                {od && (
                  <button data-testid="ability-overdrive" disabled={!od.ready} onClick={() => issueAbility('overdrive')}
                    title="Tank Overdrive: +40% speed for 6s, main gun locked — flank or fall back"
                    className={`${btn} ${od.ready ? 'border-cyan-500 text-cyan-300 hover:bg-cyan-900/60' : 'border-stone-700 text-stone-600'}`}>
                    ⚡ Overdrive{!od.ready && od.waitSec > 0 ? ` ${od.waitSec}s` : ''}</button>
                )}
                {c4 && (
                  <button data-testid="ability-c4" disabled={!c4.ready} onClick={() => issueAbility('c4')}
                    title="Engineer C4: he runs to the nearest enemy bridge, bunker or held strongpoint and sets a 5s demolition charge"
                    className={`${btn} ${c4.ready ? 'border-orange-500 text-orange-300 hover:bg-orange-900/60' : 'border-stone-700 text-stone-600'}`}>
                    💣 C4{!c4.ready && c4.waitSec > 0 ? ` ${c4.waitSec}s` : ''}</button>
                )}
                {hasBunker && (
                  <button data-testid="ability-sell" onClick={() => issueAbility('sell')}
                    title="Decommission the bunker: the crew walks out unharmed and 50% of its cost comes back — regroup instead of holding a dead flank"
                    className={`${btn} border-emerald-600 text-emerald-400 hover:bg-emerald-900/60`}>
                    💰 Sell</button>
                )}
                <button onClick={() => issue(null)} title="Clear their orders — follow the team stance again" className={`${btn} border-stone-600 text-stone-400 hover:text-white`}>Follow Team</button>
                <button onClick={() => setSelection(null)} title="Deselect (Esc)" className={`${btn} border-stone-700 text-stone-500 hover:text-white`}>✕</button>
              </div>
            );
          })()}
          {/* Battle event feed — newest at the bottom, entries fade out after ~8s */}
          <div data-testid="event-feed" className="absolute bottom-2 left-2 z-40 pointer-events-none flex flex-col gap-0.5 max-w-[46%]">
            {(gameState.events ?? []).slice(-5).map(ev => {
              const age = Date.now() - ev.time;
              if (age > 8000) return null;
              const opacity = age > 6000 ? Math.max(0, 1 - (age - 6000) / 2000) : 1;
              const color = ev.team === Team.WEST ? 'text-blue-300' : ev.team === Team.EAST ? 'text-red-300' : 'text-amber-300';
              return (
                <div key={ev.id} style={{ opacity }} className={`text-[9px] leading-tight font-bold ${color} bg-black/60 px-1.5 py-0.5 rounded shadow`}>
                  {ev.text}
                </div>
              );
            })}
          </div>
          {renderCommandBar()}
        </div>
        {!eastIsCpu && renderUnitButtons(Team.EAST, eastPanelRef)}
      </div>
      {showManual && <div className="w-full max-w-5xl mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-stone-800 p-3 rounded-lg border border-stone-600 shadow-xl text-[10px Leading-snug]">

        {/* Column 1: Core Mechanics */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-500 font-bold border-b border-stone-700 pb-1"><Target size={14} /><h3>MISSION OBJECTIVES</h3></div>
          <ul className="text-stone-400 space-y-1 list-disc pl-3">
            {gameMode === 'basehp' ? (
              <li><strong className="text-white">Victory:</strong> Break through to damage the enemy base — first base to <span className="text-amber-400">0 HP</span> loses.</li>
            ) : (
              <li><strong className="text-white">Victory:</strong> First team to <span className="text-amber-400">100 Points</span> wins.</li>
            )}
            <li><strong className="text-white">Scoring:</strong> Units reaching enemy edge {gameMode === 'basehp' ? 'damage the base' : 'score points'} (Tank: 3, Others: 1).</li>
            <li><strong className="text-white">Resources:</strong> Money generates automatically over time.</li>
            <li><strong className="text-white">Terrain:</strong> Hills provide <span className="text-amber-400">1.3x Range</span> and <span className="text-amber-400">20% Faster Reload</span>.</li>
            <li><strong className="text-white">Cover:</strong> Trees & Hills provide <span className="text-amber-400">Protection</span>. Units will hide behind trees.</li>
            <li><strong className="text-white">Veterancy:</strong> Kills promote units (3/7/12 kills = ★/★★/★★★): <span className="text-amber-400">+10% dmg, +6% reload, +HP</span> per rank.</li>
            <li><strong className="text-white">Capture Points:</strong> Hold the center flag uncontested for <span className="text-amber-400">+50% income</span>; the two smaller flank posts add <span className="text-amber-400">+12% each</span>.</li>
            <li><strong className="text-white">Goldmines:</strong> Two <span className="text-amber-400">gold dig sites</span> on the flanks' mirror diagonal pay <span className="text-amber-400">+25% income each</span> while you hold them — worth a detour, worth a fight.</li>
            <li><strong className="text-white">⚑ Flags mode:</strong> Nine flags replace the income points — <span className="text-amber-400">stand on one to take it</span>. Most flags when the <span className="text-amber-400">4-minute clock</span> runs out wins; a tie goes to overtime, first flag lead ends it.</li>
            <li><strong className="text-white">Gunboat:</strong> Station it on a <span className="text-amber-400">river or channel</span> (click open water when placing) — a tough, long-range gun platform that guards crossings.</li>
            <li><strong className="text-white">Shortcuts & Access:</strong> Number keys <span className="text-amber-400">1–0</span> buy your core units, <span className="text-amber-400">P</span> pauses. The <span className="text-amber-400">CB</span> toggle recolors East to amber for colorblind players.</li>
            <li><strong className="text-white">Orders:</strong> Set your army's stance (Advance/Hold/Fall Back). <span className="text-amber-400">Click an enemy unit</span> to focus fire on it.</li>
            <li><strong className="text-white">Troop Control:</strong> <span className="text-amber-400">Click your own unit</span> to select it (squads select together), <span className="text-amber-400">double-click for all of that type</span>, then give Attack/Hold/Fall Back orders that override the team stance. A badge over each unit shows its order — a <span className="text-green-400">forward arrow</span> to attack, an <span className="text-amber-400">amber pause symbol</span> to hold (the troops hunker down where they stand), a <span className="text-red-400">back arrow</span> to fall back. Esc deselects.</li>
            <li><strong className="text-white">Entrench:</strong> Foot soldiers holding still under <span className="text-amber-400">Hold</span> orders dig in after ~6s: <span className="text-amber-400">-45% direct fire damage</span> until they move. Explosives ignore foxholes.</li>
            <li><strong className="text-white">Strongpoints:</strong> Line infantry (riflemen, snipers, special forces, paras) <span className="text-amber-400">occupy buildings</span> — the first team to reach one raises its flag. Men inside are sheltered and fire from the windows; a <span className="text-amber-400">5/30 counter</span> shows how full it is (bigger houses hold more). <span className="text-amber-400">Each damage stage throws the garrison out</span> and leaves the house up for grabs, so an assault can seize it without felling it. If it <span className="text-red-400">collapses</span> most of the garrison dies — so burn the enemy out before you storm past. Rifles and artillery only hurt a <em>manned</em> house, but an <span className="text-amber-400">airstrike, missile or nuke levels any building</span> (occupied or empty) — the way to crack a strongpoint you can't storm.</li>
            <li><strong className="text-white">Economy:</strong> Invest in up to 3 income upgrades (<span className="text-amber-400">+25% each</span>) — units now vs. money later.</li>
            <li><strong className="text-white">Rally Horn:</strong> ${RALLY_COST} for <span className="text-amber-400">+45% fire rate & +25% speed</span> for 8s — time it with your push.</li>
            <li><strong className="text-white">Field Repairs:</strong> Wounded units <span className="text-green-400">heal slowly near your own edge</span> when out of combat — rotate them back instead of losing them.</li>
            <li><strong className="text-white">Bridges:</strong> Explosives <span className="text-red-400">destroy bridges</span> (vehicles blocked, infantry wade). Build an <span className="text-amber-400">Engineer</span> — he walks to the wrench marker and repairs it in seconds. Bridges also self-repair in ~1 min.</li>
                <li><strong className="text-white">Winter ice:</strong> On the Winter map the river is <span className="text-sky-300">frozen</span> — infantry walk across the ice anywhere (slowed, and caught in the open), while vehicles still need the bridges. Gunboats can't anchor in ice.</li>
                <li><strong className="text-white">Air Command:</strong> All air-delivered strikes (airstrike, paradrop, missiles, cruise, gunship, nuke) share one <span className="text-amber-400">rearm clock</span> — after a launch the squadron needs ~22s before the next (60s after a nuke). Locked buttons show the countdown. <span className="text-cyan-300">Anti-Air</span> guns also engage incoming strike aircraft: a downed plane takes its payload with it.</li>
            <li><strong className="text-white">Sell Bunkers:</strong> Click your bunker and hit <span className="text-emerald-400">💰 Sell</span> — the crew walks out unharmed and <span className="text-green-400">50% of the cost</span> comes back. Regroup instead of holding a dead flank.</li>
            <li><strong className="text-white">Refund:</strong> Units that reach enemy lines refund <span className="text-green-400">50% of their cost</span>.</li>
          </ul>
        </div>

        {/* Column 2: Unit Intel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-400 font-bold border-b border-stone-700 pb-1"><FileText size={14} /><h3>UNIT INTEL</h3></div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-stone-400">
            <div><strong className="text-white">Squad:</strong> Cheap, general purpose.</div>
            <div><strong className="text-white">Tank:</strong> High HP, heavy damage.</div>
            <div><strong className="text-white">Artillery:</strong> Long range splash. Stops to fire.</div>
            <div><strong className="text-white">Special Forces:</strong> Rapid fire hero unit.</div>
            <div><strong className="text-white">AA Unit:</strong> <span className="text-red-400">Essential</span> vs Drones & Air.</div>
            <div><strong className="text-white">Drone:</strong> Flying Bomb. Immune to Ground Fire.</div>
            <div><strong className="text-white">Engineer:</strong> Defuses mines, repairs bridges, and <span className="text-amber-400">welds damaged vehicles & bunkers</span> back to health in the field.</div>
          </div>
        </div>

        {/* Column 3: Special Ops & Dispatch */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-500 font-bold border-b border-stone-700 pb-1"><Zap size={14} /><h3>SPECIAL OPERATIONS</h3></div>
          <ul className="text-stone-400 space-y-1 mb-2">
            <li><strong className="text-white">Airstrike:</strong> Napalm run. Burns area.</li>
            <li><strong className="text-white">Missile:</strong> Precision strike. High dmg.</li>
            <li><strong className="text-white">Nuke:</strong> <span className="text-red-500 font-bold">WARNING:</span> Friendly Fire! Enemy Side Target Only.</li>
            <li><strong className="text-white">Airborne:</strong> Drops paratroopers behind lines.</li>
            <li><strong className="text-white">Mines:</strong> Hidden defense. Explodes on contact.</li>
            <li><strong className="text-white">Smoke:</strong> Screens a zone for ~13s — snipers & artillery <span className="text-amber-400">can't target through it</span> (point-blank still works, air sees over it).</li>
            <li><strong className="text-white">Supply Drops:</strong> Crates parachute onto the midfield — <span className="text-amber-400">first unit there claims</span> cash, a veteran squad, or a field medkit.</li>
          </ul>
        </div>

      </div>}

      {/* ── Grand Campaign board ─────────────────────────────────────────── */}
      {campaignOpen && campaign && (() => {
        const s = campaign;
        const winner = campaignWinner(s);
        const persona = CPU_PERSONALITY[s.enemyPersona];
        const sel = selectedArmy ? s.armies.find(a => a.id === selectedArmy) : null;
        const reachable = new Set(sel ? territory(sel.territory).adjacent : []);
        const bonusIcon = (b?: TerritoryBonus) => b === 'harbor' ? '⚓' : b === 'silo' ? '☢' : b === 'airbase' ? '✈' : b === 'income' ? '$' : '';
        const clickTerritory = (tid: string) => {
          if (winner) return;
          if (sel && reachable.has(tid)) { doPlayerCampaignMove(sel.id, tid); return; }
          const own = s.armies.find(a => a.territory === tid && a.team === Team.WEST);
          setSelectedArmy(own ? own.id : null);
        };
        return (
          // z-[10000]: above the splash (z-[9999]) — the board opens from the splash and must cover it
          <div data-testid="campaign-board" className="fixed inset-0 z-[10000] bg-stone-950/[.97] flex flex-col p-3 md:p-5 overflow-auto">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-amber-400 font-black uppercase tracking-widest text-sm md:text-base">Grand Campaign — Turn {s.turn + 1}</h2>
                <p className="text-stone-400 text-[11px]">Enemy commander: <span className="text-red-400 font-bold">{persona.name}</span> — {persona.blurb}</p>
                <p className="text-stone-300 text-[11px] mt-0.5">🎯 <strong className="text-amber-300">Objective:</strong> capture <strong>★ Kreml Bastion</strong> in the far east — or destroy every enemy army.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={abandonCampaign} className="px-2 py-1 rounded border border-red-800 text-red-400 text-[10px] font-bold uppercase hover:bg-red-950">Abandon</button>
                <button onClick={() => setCampaignOpen(false)} className="px-2 py-1 rounded border border-stone-600 text-stone-300 text-[10px] font-bold uppercase hover:border-stone-400">Menu</button>
              </div>
            </div>
            {/* The one thing to do next, said loudly — the old footer hint was invisible */}
            {!winner && (
              <div data-testid="campaign-hint" className={`mb-2 rounded-lg border-2 px-3 py-1.5 text-center text-[12px] md:text-[13px] font-bold tracking-wide ${sel ? 'border-amber-400 bg-amber-950/60 text-amber-200' : 'border-blue-500 bg-blue-950/50 text-blue-200'}`}>
                {sel
                  ? <>Step 2 — MARCH: click a <span className="text-amber-300">glowing territory</span> next to your army. Enemy ground starts a battle ⚔ — neutral ground is taken without a fight.</>
                  : <>Step 1 — YOUR MOVE: click one of your <span className="text-blue-300">pulsing blue ⚔ armies</span> to command it.</>}
              </div>
            )}
            {winner && (
              <div className={`mb-2 rounded border px-3 py-2 text-center font-black uppercase tracking-widest ${winner === Team.WEST ? 'border-blue-500 text-blue-300 bg-blue-950/60' : 'border-red-500 text-red-300 bg-red-950/60'}`}>
                {winner === Team.WEST ? '★ Total victory — the East capitulates! ★' : 'Defeat — the West has fallen.'}
                <button onClick={openCampaign} className="ml-3 px-2 py-0.5 rounded border border-amber-500 text-amber-300 text-[10px] hover:bg-amber-950">New Campaign</button>
              </div>
            )}
            <div className="relative flex-1 min-h-[320px] rounded-lg border border-stone-700 bg-[#141a12]">
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {TERRITORIES.flatMap(t => t.adjacent.filter(a2 => a2 > t.id).map(a2 => {
                  const o = territory(a2);
                  return <line key={`${t.id}-${a2}`} x1={`${t.x}%`} y1={`${t.y}%`} x2={`${o.x}%`} y2={`${o.y}%`} stroke="#3f3f34" strokeWidth={1.5} strokeDasharray="4 3" />;
                }))}
              </svg>
              {TERRITORIES.map(t => {
                const own = s.owner[t.id];
                const army = s.armies.find(a => a.territory === t.id);
                const isSel = sel?.territory === t.id;
                const canGo = !!sel && reachable.has(t.id);
                const ring = own === Team.WEST ? 'border-blue-500' : own === Team.EAST ? 'border-red-500' : 'border-stone-500';
                const bg = own === Team.WEST ? 'bg-blue-950/80' : own === Team.EAST ? 'bg-red-950/80' : 'bg-stone-800/80';
                return (
                  <button
                    key={t.id}
                    data-testid={`terr-${t.id}`}
                    onClick={() => clickTerritory(t.id)}
                    style={{ left: `${t.x}%`, top: `${t.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 ${ring} ${bg} px-1.5 py-1 text-center transition-all min-w-[64px]
                      ${isSel ? 'ring-2 ring-amber-400 scale-110 z-10' : ''} ${canGo ? 'ring-2 ring-amber-300/70 animate-pulse z-10' : ''} hover:scale-105`}
                  >
                    <div className="text-[9px] font-bold text-stone-100 leading-tight whitespace-nowrap">
                      {t.capital ? '★ ' : ''}{t.name} {bonusIcon(t.bonus)}
                    </div>
                    <div className="text-[8px] text-stone-400 uppercase">{t.terrain.toLowerCase()}</div>
                    {army && (
                      <div className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-black ${army.team === Team.WEST ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}
                        ${army.team === Team.WEST && !sel && !winner ? 'animate-pulse ring-2 ring-amber-300/80' : ''}`}>
                        ⚔ {army.strength}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
              <div className="text-[10px] text-stone-400 leading-snug">
                <span className="text-stone-300 font-bold uppercase tracking-wider mr-1.5">Legend:</span>
                <span className="mr-2">⚔ army (its strength)</span>
                <span className="mr-2">★ capital</span>
                <span className="mr-2">⚓ harbor → gunboats & cruise</span>
                <span className="mr-2">✈ airbase → air strikes</span>
                <span className="mr-2">☢ silo → the nuke</span>
                <span>$ extra income</span>
                <div className="text-stone-500 mt-0.5">Hold a bonus territory and its weapons unlock in your battles. Losing a battle costs the army 1 strength — at 0 it's destroyed.</div>
              </div>
              <div className="text-[10px] text-stone-500 max-w-[46%]">
                {s.log.slice(-3).map((l, i) => <div key={i}>• {l}</div>)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Post-battle: settle the board and march on */}
      {campaignBattle && campaignReturn && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/75">
          <div className="bg-stone-900 border border-stone-500 rounded-lg p-5 text-center shadow-2xl max-w-sm">
            <h3 className={`font-black uppercase tracking-widest mb-1 ${campaignReturn === Team.WEST ? 'text-blue-400' : 'text-red-400'}`}>
              {campaignReturn === Team.WEST ? `${campaignBattle.name} is ours!` : `${campaignBattle.name} holds against us.`}
            </h3>
            <p className="text-stone-400 text-[11px] mb-3">The front lines shift. {campaign?.pendingBattle ? 'The enemy counterattacks at once!' : ''}</p>
            <button data-testid="campaign-continue" onClick={continueCampaign} className="px-4 py-2 rounded border-2 border-amber-400 bg-amber-600 text-black font-black uppercase text-xs tracking-widest hover:bg-amber-500">
              {campaign?.pendingBattle ? '⚔ To Battle' : 'Continue Campaign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
