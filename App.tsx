import React, { useState, useCallback, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { Team, GameState, UnitType } from './types';
import { UNIT_CONFIG, INITIAL_MONEY, HORIZON_Y } from './constants';
import { Sword, Shield, Bot, User, Truck, Target, Zap, FileText, Wind, MapPin, RotateCcw, Flame, Crosshair, CircleDashed, Radio, ShieldAlert, Skull, Plane } from 'lucide-react';
import { getBattleCommentary } from './services/ai';

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

const App: React.FC = () => {
  const [gameKey, setGameKey] = useState(0);
  const [spawnQueue, setSpawnQueue] = useState<{ team: Team, type: UnitType, cost?: number, offset?: { x: number, y: number }, absolutePos?: { x: number, y: number }, squadId?: string }[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    units: [], projectiles: [], particles: [],
    score: { [Team.WEST]: 0, [Team.EAST]: 0 },
    money: { [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY }
  });
  const [commentary, setCommentary] = useState<string>("");
  const [loadingCommentary, setLoadingCommentary] = useState(false);
  const [targetingInfo, setTargetingInfo] = useState<{ team: Team, type: UnitType } | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const resetGame = () => {
    setGameKey(prev => prev + 1);
    setGameState({ units: [], projectiles: [], particles: [], score: { [Team.WEST]: 0, [Team.EAST]: 0 }, money: { [Team.WEST]: INITIAL_MONEY, [Team.EAST]: INITIAL_MONEY } });
    setCommentary(""); setSpawnQueue([]); setTargetingInfo(null);
  };

  const handleSpawnRequest = (team: Team, type: UnitType) => {
    const cost = UNIT_CONFIG[type].cost;
    if (gameState.money[team] >= cost) {
      if ([UnitType.AIRBORNE, UnitType.AIRSTRIKE, UnitType.MISSILE_STRIKE, UnitType.MINE_PERSONAL, UnitType.MINE_TANK, UnitType.NUKE].includes(type)) setTargetingInfo({ team, type });
      else processSpawn(team, type);
    }
  };

  const processSpawn = (team: Team, type: UnitType, absolutePos?: { x: number, y: number }) => {
    const cost = UNIT_CONFIG[type].cost;
    const squadId = Math.random().toString(36).substr(2, 5);
    if (type === UnitType.SOLDIER) {
      const squad = Array.from({ length: 6 }, (_, i) => ({
        team, type, squadId,
        cost: i === 0 ? cost : 0, // Assign full cost to the first unit
        offset: { x: (i % 2 === 0 ? -15 : 15) + (Math.random() * 10 - 5), y: (Math.floor(i / 2) * 25 - 25) + (Math.random() * 10 - 5) }
      }));
      setSpawnQueue(prev => [...prev, ...squad]);
    } else setSpawnQueue(prev => [...prev, { team, type, cost, absolutePos, squadId: type === UnitType.AIRBORNE ? squadId : undefined }]);
    // Removed local money deduction; GameCanvas handles it via moneyRef
  };

  const handleCanvasClick = (x: number, y: number) => {
    if (targetingInfo) {
      // In 3D, any click returned by onCanvasClick is a valid ground position (x, z).
      // We accept it directly to allow spawning anywhere on the map.
      if (targetingInfo.type === UnitType.NUKE) {
        // Enforce Enemy Side Only
        const isWest = targetingInfo.team === Team.WEST;
        // West(Left) attacking East(Right), East(Right) attacking West(Left)
        // West Territory < 400, East Territory > 400
        // West can only target > 400, East can only target < 400
        if (isWest && x < 400) return;
        if (!isWest && x > 400) return;
      }
      processSpawn(targetingInfo.team, targetingInfo.type, { x, y });
      setTargetingInfo(null);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Unit Order (Top to Bottom as rendered)
      const unitOrder = [
        UnitType.SOLDIER, UnitType.RAMBO, UnitType.MINE_PERSONAL, // Infantry
        UnitType.TANK, UnitType.ARTILLERY, UnitType.ANTI_AIR, UnitType.DRONE, UnitType.MINE_TANK, // Vehicles
        UnitType.AIRBORNE, UnitType.AIRSTRIKE, UnitType.MISSILE_STRIKE, UnitType.NUKE // Airstrikes
      ];

      // West: 1-0 (indexes 0-9), and we'll add '-' and '=' for 11th/12th if needed.
      // We'll map 1..0, -, = to indexes 0..11.
      const westKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

      // East: F12 down to F1. F12=Top(0), F11=1...
      const eastKeys = ['F12', 'F11', 'F10', 'F9', 'F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];

      // Check West
      const westIndex = westKeys.indexOf(e.key);
      if (westIndex !== -1 && westIndex < unitOrder.length) {
        handleSpawnRequest(Team.WEST, unitOrder[westIndex]);
      }

      // Check East
      const eastIndex = eastKeys.indexOf(e.key);
      if (eastIndex !== -1 && eastIndex < unitOrder.length) {
        e.preventDefault(); // F-keys often have browser defaults
        handleSpawnRequest(Team.EAST, unitOrder[eastIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.money]); // Dep on money for validation inside handleSpawnRequest? 
  // Actually handleSpawnRequest uses state, so we need to be careful with closure stale state or dependency.
  // handleSpawnRequest depends on gameState.money.
  // Better to use ref for money or include handleSpawnRequest in dep array and wrap it in useCallback?
  // Or just rely on re-binding event listener on render (simple). 
  // Given handleSpawnRequest is NOT wrapped in useCallback currently, it changes every render.
  // So [handleSpawnRequest] works.


  const renderUnitButtons = (team: Team) => {
    const isWest = team === Team.WEST;
    const colorClass = isWest ? "blue" : "red";
    const money = gameState.money[team];

    const UNIT_COUNTERS: Record<UnitType, React.ReactNode[]> = {
      [UnitType.SOLDIER]: [<User size={8} key="u" />],
      [UnitType.RAMBO]: [<User size={8} key="u" />, <Shield size={8} key="s" />],
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
    };

    const renderGroup = (title: string, units: any[]) => (
      <div className="flex flex-col gap-1">
        <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider text-center border-b border-stone-800 pb-0.5 mb-0.5">{title}</div>
        {units.map(({ type, label, icon, special }) => (
          <button
            key={type}
            className={`group ${targetingInfo?.team === team && targetingInfo.type === type ? 'bg-amber-600 animate-pulse' : special ? (isWest ? 'bg-indigo-700' : 'bg-rose-700') : `bg-${colorClass}-800`} hover:opacity-100 text-white p-1.5 rounded-lg shadow transition-all active:scale-95 flex flex-col items-center border border-white/10 disabled:opacity-30 relative overflow-visible`}
            onClick={() => handleSpawnRequest(team, type)}
            disabled={money < UNIT_CONFIG[type].cost}
          >
            {icon}
            <span className="font-bold text-[7px] uppercase leading-none mt-0.5">{label}</span>
            <span className="text-[9px] opacity-70 leading-none">${UNIT_CONFIG[type].cost}</span>

            {/* Tooltip Popup */}
            <div className={`hidden group-hover:flex absolute top-1/2 -translate-y-1/2 ${isWest ? 'left-full ml-2' : 'right-full mr-2'} bg-stone-950 border border-stone-600 p-2 rounded shadow-2xl z-[100] flex-col gap-1 w-max pointer-events-none items-center`}>
              <div className="text-[8px] font-bold text-stone-500 uppercase whitespace-nowrap">Effective Vs</div>
              <div className="flex gap-2 text-stone-300">
                {UNIT_COUNTERS[type as UnitType]}
              </div>
            </div>
          </button>
        ))}
      </div>
    );

    return (
      <div className={`flex flex-col gap-3 ${isWest ? "mr-4" : "ml-4"}`}>
        {renderGroup("Infantry", [
          { type: UnitType.SOLDIER, label: "SQUAD", icon: <SquadIcon size={16} /> },
          { type: UnitType.SNIPER, label: "SNIPER", icon: <SniperIcon size={16} /> },
          { type: UnitType.RAMBO, label: "RAMBO", icon: <BandanaIcon size={16} />, special: true },
          { type: UnitType.MINE_PERSONAL, label: "P.MINE", icon: <PersonalMineIcon size={14} /> },
        ])}
        {renderGroup("Vehicles", [
          { type: UnitType.TANK, label: "TANK", icon: <TankIcon size={16} /> },
          { type: UnitType.ARTILLERY, label: "ARTILLERY", icon: <ArtilleryIcon size={16} /> },
          { type: UnitType.HELICOPTER, label: "HELI", icon: <HelicopterIcon size={16} /> },
          { type: UnitType.ANTI_AIR, label: "ANTI-AIR", icon: <AntiAirIcon size={16} /> },
          { type: UnitType.DRONE, label: "DRONE", icon: <Radio size={16} /> },
          { type: UnitType.MINE_TANK, label: "T.MINE", icon: <TankMineIcon size={16} /> }
        ])}
        {renderGroup("Airstrikes", [
          { type: UnitType.AIRBORNE, label: "DROP", icon: <ParachuteIcon size={16} /> },
          { type: UnitType.AIRSTRIKE, label: "NAPALM", icon: <Flame size={16} /> },
          { type: UnitType.MISSILE_STRIKE, label: "MISSILE", icon: <Crosshair size={16} /> },
          { type: UnitType.NUKE, label: "NUKE", icon: <Skull size={16} />, special: true },
        ])}
      </div>
    );
  };



  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4 font-serif overflow-hidden">
      {/* Splash Screen Overlay */}
      {showSplash && (
        <div className="fixed inset-0 bg-stone-900/90 z-[9999] flex items-center justify-center animate-[fadeOut_0.5s_ease-out_1.5s_forwards] pointer-events-none">
          <img
            src="splash.jpg"
            alt="East vs West"
            className="w-full h-full object-contain md:object-cover"
          />
        </div>
      )}

      <div className="w-full max-w-4xl flex justify-between items-center mb-3 bg-stone-800 p-3 rounded-lg shadow-lg border border-stone-600">
        <div className="flex items-center gap-3 text-blue-400"><Shield className="w-6 h-6" /><div><h2 className="text-lg font-bold uppercase">West</h2><p className="text-xs">Score: {gameState.score[Team.WEST]}</p><p className="text-amber-400 font-mono text-[10px]">${Math.floor(gameState.money[Team.WEST])}</p></div></div>
        <div className="text-center flex flex-col items-center"><h1 className="text-xl font-black tracking-widest text-amber-500 uppercase italic">East vs West 3D</h1><button onClick={resetGame} className="flex items-center gap-1 text-[9px] text-stone-400 hover:text-white uppercase font-bold tracking-tighter"><RotateCcw size={10} />Reset</button></div>
        <div className="flex items-center gap-3 text-red-400 text-right"><div><h2 className="text-lg font-bold uppercase">East</h2><p className="text-xs">Score: {gameState.score[Team.EAST]}</p><p className="text-amber-400 font-mono text-[10px]">${Math.floor(gameState.money[Team.EAST])}</p></div><Sword className="w-6 h-6" /></div>
      </div>
      <div className="relative flex items-center justify-center">
        {renderUnitButtons(Team.WEST)}
        <div className="relative"><GameCanvas key={gameKey} onGameStateChange={useCallback((s: GameState) => setGameState(s), [])} spawnQueue={spawnQueue} clearSpawnQueue={useCallback(() => setSpawnQueue([]), [])} onCanvasClick={handleCanvasClick} targetingInfo={targetingInfo} /></div>
        {renderUnitButtons(Team.EAST)}
      </div>
      <div className="w-full max-w-5xl mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-stone-800 p-3 rounded-lg border border-stone-600 shadow-xl text-[10px Leading-snug]">

        {/* Column 1: Core Mechanics */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-500 font-bold border-b border-stone-700 pb-1"><Target size={14} /><h3>MISSION OBJECTIVES</h3></div>
          <ul className="text-stone-400 space-y-1 list-disc pl-3">
            <li><strong className="text-white">Victory:</strong> First team to <span className="text-amber-400">100 Points</span> wins.</li>
            <li><strong className="text-white">Scoring:</strong> Units reaching enemy edge score points (Tank: 3, Others: 1).</li>
            <li><strong className="text-white">Resources:</strong> Money generates automatically over time.</li>
            <li><strong className="text-white">Terrain:</strong> Hills provide <span className="text-amber-400">1.3x Range</span> and <span className="text-amber-400">20% Faster Reload</span>.</li>
            <li><strong className="text-white">Cover:</strong> Trees & Hills provide <span className="text-amber-400">Protection</span>. Units will hide behind trees.</li>
            <li><strong className="text-white">Refund:</strong> Units that reach enemy lines refund their <span className="text-green-400">Full Cost</span>.</li>
          </ul>
        </div>

        {/* Column 2: Unit Intel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-400 font-bold border-b border-stone-700 pb-1"><FileText size={14} /><h3>UNIT INTEL</h3></div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-stone-400">
            <div><strong className="text-white">Squad:</strong> Cheap, general purpose.</div>
            <div><strong className="text-white">Tank:</strong> High HP, heavy damage.</div>
            <div><strong className="text-white">MLRS:</strong> Long range, Light Splash.</div>
            <div><strong className="text-white">Rambo:</strong> Rapid fire hero unit.</div>
            <div><strong className="text-white">AA Unit:</strong> <span className="text-red-400">Essential</span> vs Drones & Air.</div>
            <div><strong className="text-white">Drone:</strong> Flying Bomb. Immune to Ground Fire.</div>
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
          </ul>

          <div className="pt-1 border-t border-stone-700">
            <button onClick={async () => { setLoadingCommentary(true); const t = await getBattleCommentary(gameState.score[Team.WEST], gameState.score[Team.EAST], gameState.units.filter(u => u.team === Team.WEST).length, gameState.units.filter(u => u.team === Team.EAST).length); setCommentary(t); setLoadingCommentary(false); }} disabled={loadingCommentary} className="w-full py-1 bg-stone-700 hover:bg-stone-600 rounded border border-stone-600 uppercase font-black flex items-center justify-center gap-2 text-[10px]">
              <Bot size={12} /> {loadingCommentary ? "ANALYZING BATTLEFIELD..." : "REQUEST AI SITREP"}
            </button>
            {commentary && <p className="mt-1 italic text-amber-200 text-center leading-tight">"{commentary}"</p>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
