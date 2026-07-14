
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows, useTexture, ContactShadows, useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils, mergeBufferGeometries } from 'three-stdlib';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Team, Unit, UnitType, UnitState, Projectile, Particle, TerrainObject, Vector2D, MapType, CapturePoint, LaserStrike, SupplyCrate, SmokeZone } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, HORIZON_Y, UNIT_CONFIG, BUNKER_BUILD_MS, BUNKER_GARRISON_MAX, getFireFx, getRoundFx, DEFAULT_ROUND_FX, flashTicks, HILL_RANGE_BONUS } from '../constants';


interface GameSceneProps {
    units: Unit[];
    projectiles: Projectile[];
    particles: Particle[];
    terrain: TerrainObject[];
    flyovers: any[]; // Using any for now to match the internal logic refs
    missiles: any[];
    lasers?: LaserStrike[];
    crates?: SupplyCrate[];
    smokes?: SmokeZone[];
    selectedIds?: string[];
    // Imperative camera controls for the on-screen zoom/scroll buttons
    onCameraApi?: (api: { zoom: (factor: number) => void; pan: (dx: number) => void; reset: () => void; state: () => { dist: number, tx: number, tz: number } | null; panTo: (x: number) => void }) => void;
    onCanvasClick: (x: number, y: number) => void;
    // Drag-to-select: the human team's units can be boxed with a left-drag
    selectTeam?: Team | null;
    onBoxSelect?: (team: Team, ids: string[]) => void;
    onMarquee?: (m: Marquee) => void;
    onDragStart?: () => void;
    targetingInfo: { team: Team, type: UnitType } | null;
    weather: 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
    fx?: 'high' | 'low'; // low: no shadows/bloom/clouds, dpr 1 — for weak GPUs
    cb?: boolean; // colorblind-assist: East identity color becomes amber
    mapType: MapType;
    shake?: React.MutableRefObject<number>;
    capture?: CapturePoint;
    flanks?: CapturePoint[];
    onUnitClick?: (unit: Unit) => void;
    focusIds?: string[];
}

// Day cycle WITHOUT the night: brightness breathes between full noon (1) and
// a bright late afternoon (0.65) every 4 minutes. Real night made the
// battlefield too dark to read, so the factor never drops below 0.65 —
// night-only touches (building windows light up under 0.35) stay dormant.
const DAY_CYCLE_MS = 240000;
const getDayFactor = () => {
    const t = (Date.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS;
    return 0.825 + 0.175 * Math.sin(t * Math.PI * 2 + Math.PI / 2);
};

// Mid-map capture point: flag + capture-progress ring
const CapturePoint3D = ({ cap, small }: { cap: CapturePoint, small?: boolean }) => {
    const ownerColor = cap.owner === Team.WEST ? '#1d4ed8' : cap.owner === Team.EAST ? eastColor('#b91c1c') : '#a8a29e';
    const leading = cap.progress > 0 ? '#3b82f6' : cap.progress < 0 ? eastColor('#ef4444') : '#a8a29e';
    const pct = Math.min(1, Math.abs(cap.progress) / 300);
    const poleH = small ? 34 : 50;
    return (
        <group position={[cap.x, 0, cap.y]}>
            {/* Zone marker */}
            <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[cap.radius - 3, cap.radius, 32]} />
                <meshBasicMaterial color={ownerColor} transparent opacity={0.5} depthWrite={false} />
            </mesh>
            {/* Capture progress ring */}
            {pct > 0.02 && (
                <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[cap.radius * 0.35, cap.radius * 0.35 + 4, 32, 1, 0, Math.PI * 2 * pct]} />
                    <meshBasicMaterial color={leading} transparent opacity={0.8} depthWrite={false} />
                </mesh>
            )}
            {/* Flag pole */}
            <mesh position={[0, poleH / 2, 0]} castShadow>
                <cylinderGeometry args={[0.8, 0.8, poleH]} />
                <meshStandardMaterial color="#78716c" />
            </mesh>
            {/* Banner */}
            <mesh position={[small ? 4.2 : 6, poleH - 6, 0]} castShadow>
                <boxGeometry args={[small ? 8.4 : 12, small ? 5.6 : 8, 0.5]} />
                <meshStandardMaterial color={ownerColor} />
            </mesh>
            {cap.owner && !small && <pointLight position={[0, 30, 0]} color={ownerColor} distance={70} intensity={1.5} />}
        </group>
    );
};

// Jitters the whole world with an absolute, decaying offset. Absolute offsets
// (not camera deltas) stay compatible with OrbitControls — nothing accumulates.
const ShakeRig = ({ shake, children }: { shake?: React.MutableRefObject<number>, children: React.ReactNode }) => {
    const ref = useRef<THREE.Group>(null!);
    useFrame(() => {
        if (!ref.current) return;
        const mag = shake?.current || 0;
        if (mag > 0.05) {
            ref.current.position.set(
                (Math.random() - 0.5) * mag,
                (Math.random() - 0.5) * mag * 0.4,
                (Math.random() - 0.5) * mag
            );
            if (shake) shake.current = mag * 0.88;
        } else if (ref.current.position.lengthSq() > 0) {
            ref.current.position.set(0, 0, 0);
        }
    });
    return <group ref={ref}>{children}</group>;
};

const RainEffect = () => {
    // Create 1000 rain drops
    const count = 1500;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 1600 + 400; // X: Centered at 400, spread +/- 800
            pos[i * 3 + 1] = Math.random() * 400 + 200;      // Y: Start high
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1200 + 400; // Z: Centered at 400, spread +/- 600
        }
        return pos;
    }, []);

    const rainRef = useRef<THREE.Points>(null!);

    useFrame((state, delta) => {
        if (!rainRef.current) return;
        // Simple physics: move down
        const positions = rainRef.current.geometry.attributes.position.array as Float32Array;
        const speed = 450 * delta;

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 1] -= speed;
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 400 + Math.random() * 200; // Reset to top with variation
            }
        }
        rainRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={rainRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#a5f3fc" size={2} transparent opacity={0.6} sizeAttenuation={false} />
        </points>
    );
};

const SnowEffect = () => {
    const count = 900;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 1600 + 400;
            pos[i * 3 + 1] = Math.random() * 500;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 1200 + 400;
        }
        return pos;
    }, []);
    const snowRef = useRef<THREE.Points>(null!);
    useFrame((_, delta) => {
        if (!snowRef.current) return;
        const p = snowRef.current.geometry.attributes.position.array as Float32Array;
        const speed = 55 * delta;
        for (let i = 0; i < count; i++) {
            p[i * 3]     += Math.sin(Date.now() * 0.001 + i) * 0.15;
            p[i * 3 + 1] -= speed;
            if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 480 + Math.random() * 80;
        }
        snowRef.current.geometry.attributes.position.needsUpdate = true;
    });
    return (
        <points ref={snowRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#e2e8f0" size={3.5} transparent opacity={0.75} sizeAttenuation={false} />
        </points>
    );
};

// -- Assets & Materials --
const MAT_WEST = new THREE.MeshStandardMaterial({ color: '#1d4ed8' });
const MAT_EAST = new THREE.MeshStandardMaterial({ color: '#b91c1c' });
const MAT_GROUND = new THREE.MeshStandardMaterial({ color: '#365314' });
const MAT_SKY_GROUND = new THREE.MeshStandardMaterial({ color: '#7dd3fc' }); // For the horizon background
const MAT_TREE_TRUNK = new THREE.MeshStandardMaterial({ color: '#451a03' });
const MAT_TREE_LEAVES = new THREE.MeshStandardMaterial({ color: '#14532d' });
const MAT_HILL = new THREE.MeshStandardMaterial({ color: '#4d7c0f' });

// Shared prop geometries — every tree/rock reuses these, scaled at the mesh,
// instead of allocating its own vertex buffers (trees alone were ~4 each)
const GEO_TRUNK = new THREE.CylinderGeometry(5, 8, 30, 10);
const GEO_PINE_1 = new THREE.ConeGeometry(22, 28, 10);
const GEO_PINE_2 = new THREE.ConeGeometry(16, 24, 10);
const GEO_PINE_3 = new THREE.ConeGeometry(10, 20, 10);
const GEO_CLUMP = new THREE.DodecahedronGeometry(1, 0); // oak canopies + boulders
const GEO_POPLAR = new THREE.CylinderGeometry(8, 12, 60, 10);
// Cached standard materials keyed by color/emissive — safe to share since
// props never animate their materials (burning flicker swaps cache entries)
const MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();
const stdMat = (color: string, emissive = '#000000') => {
    const key = `${color}|${emissive}`;
    let m = MAT_CACHE.get(key);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.4 });
        MAT_CACHE.set(key, m);
    }
    return m;
};

// -- River Shader & Component --

import { extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';

const RiverMaterial = shaderMaterial(
    { uTime: 0, uColor: new THREE.Color('#3b82f6'), uFoamColor: new THREE.Color('#e0f2fe') },
    // Vertex Shader
    `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    // Fragment Shader
    `
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uFoamColor;
    varying vec2 vUv;

    // Simple pseudo-random noise
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // Flow animation
      float flowSpeed = 1.5;
      vec2 uvFlow = vUv;
      uvFlow.y -= uTime * 0.2; // Flow along Y (along the river path)

      // Generate water surface noise
      float n1 = noise(uvFlow * 15.0);
      float n2 = noise(uvFlow * 30.0 + 3.0);
      float waterNoise = mix(n1, n2, 0.5);

      // Foam streaks
      float foam = step(0.65, waterNoise);
      
      // Soft Edges (Alpha Fade)
      float edgeAlpha = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);

      vec3 finalColor = mix(uColor, uFoamColor, foam * 0.5);

      // Transparency
      gl_FragColor = vec4(finalColor, 0.85 * edgeAlpha);
    }
  `
);

extend({ RiverMaterial });

// Register the custom shader material with R3F's JSX types (React 19 style)
declare module '@react-three/fiber' {
    interface ThreeElements {
        riverMaterial: any;
    }
}

// Build a triangle-strip geometry for one ordered list of river segments
const buildChannelGeo = (points: TerrainObject[]): THREE.BufferGeometry | null => {
    if (points.length < 2) return null;
    const halfWidth = (points[0].width || 65) / 2;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let nX = 1, nZ = 0;
        if (i < points.length - 1) {
            const nx = points[i + 1].x - p.x, ny = points[i + 1].y - p.y;
            const len = Math.sqrt(nx * nx + ny * ny) || 1;
            nX = -ny / len; nZ = nx / len;
        } else if (i > 0) {
            const px = p.x - points[i - 1].x, py = p.y - points[i - 1].y;
            const len = Math.sqrt(px * px + py * py) || 1;
            nX = -py / len; nZ = px / len;
        }
        const v = i / (points.length * 0.1);
        vertices.push(p.x - nX * halfWidth, 0.2, p.y - nZ * halfWidth); uvs.push(0, v);
        vertices.push(p.x + nX * halfWidth, 0.2, p.y + nZ * halfWidth); uvs.push(1, v);
        if (i < points.length - 1) {
            const b = i * 2;
            indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
};

// One animated water mesh (flow shader) with its own uTime driver
const AnimatedWater = ({ geo, color, foam }: { geo: THREE.BufferGeometry, color: string, foam: string }) => {
    const ref = useRef<any>(null);
    const uColor = useMemo(() => new THREE.Color(color), [color]);
    const uFoam = useMemo(() => new THREE.Color(foam), [foam]);
    useFrame(({ clock }) => { if (ref.current) ref.current.uTime = clock.getElapsedTime(); });
    return (
        <mesh geometry={geo} receiveShadow>
            <riverMaterial ref={ref} transparent side={THREE.DoubleSide} uColor={uColor} uFoamColor={uFoam} />
        </mesh>
    );
};

const RiverRenderer = React.memo(({ terrain, mapType }: { terrain: TerrainObject[], mapType: MapType }) => {
    const riverPoints = useMemo(() => terrain.filter(t => t.type === 'river'), [terrain]);

    // Group segments by channel — segments whose X is within 150px of a group's first segment
    const channelGroups = useMemo((): TerrainObject[][] => {
        const groups: TerrainObject[][] = [];
        for (const seg of riverPoints) {
            const grp = groups.find(g => Math.abs(g[0].x - seg.x) < 150);
            if (grp) grp.push(seg);
            else groups.push([seg]);
        }
        return groups;
    }, [riverPoints]);

    const geometries = useMemo(
        () => channelGroups.map(g => buildChannelGeo(g)),
        [channelGroups]
    );

    // Urban: render as concrete wall segments
    if (mapType === MapType.URBAN) {
        return (
            <group>
                {riverPoints.map((p, i) => (
                    <mesh key={i} position={[p.x, 6, p.y]} receiveShadow castShadow>
                        <boxGeometry args={[(p.width || 18), 12, 12]} />
                        <meshStandardMaterial color="#4b5563" roughness={0.9} />
                    </mesh>
                ))}
            </group>
        );
    }

    // Desert: sandy wadi per channel
    if (mapType === MapType.DESERT) {
        return (
            <group>
                {geometries.map((geo, i) => geo && (
                    <mesh key={i} geometry={geo} receiveShadow>
                        <meshStandardMaterial color="#b45309" roughness={1} />
                    </mesh>
                ))}
            </group>
        );
    }

    // Archipelago: wide sea straits with animated deep-ocean shader
    if (mapType === MapType.ARCHIPELAGO) {
        return (
            <group>
                {geometries.map((geo, i) => geo && (
                    <AnimatedWater key={i} geo={geo} color="#0c4a6e" foam="#7dd3fc" />
                ))}
            </group>
        );
    }

    // Countryside: animated water shader, one mesh per channel
    return (
        <group>
            {geometries.map((geo, i) => geo && (
                <AnimatedWater key={i} geo={geo} color="#3b82f6" foam="#e0f2fe" />
            ))}
        </group>
    );
});


// Placeholder to force view terrain height at a given X, Z (Game Y)
const getTerrainHeight = (x: number, z: number, terrain: TerrainObject[]) => {
    let height = 0;
    for (const t of terrain) {
        if (t.type === 'hill') {
            const dx = x - t.x;
            const dz = z - t.y;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < t.size) {
                // Plateau Logic:
                // Flat top until 50% radius, then slope down.
                const plateauRadius = t.size * 0.5;
                const maxH = 40; // Fixed height for plateaus

                if (dist < plateauRadius) {
                    height = Math.max(height, maxH);
                } else {
                    // Linear slope from plateauRadius to t.size
                    // dist goes from 0.5*size to 1.0*size
                    // pct goes from 0 to 1
                    const slopeRange = t.size - plateauRadius;
                    const pct = (dist - plateauRadius) / slopeRange;
                    height = Math.max(height, maxH * (1 - pct));
                }
            }
        }
    }
    return height;
};

const ClickableGroup = ({ onCanvasClick, children, ...props }: any) => {
    return (
        <group
            {...props}
            onClick={(e) => {
                e.stopPropagation();
                if (onCanvasClick) onCanvasClick(e.point.x, e.point.z);
            }}
        >
            {children}
        </group>
    );
};

// -- Reusable Geometries & Materials --
const GEO_FLASH_CORE = new THREE.ConeGeometry(0.6, 3, 8);
const GEO_FLASH_OUTER = new THREE.ConeGeometry(1, 4.5, 8, 1, true);
const GEO_FLASH_BALL = new THREE.SphereGeometry(1, 8, 6);          // gas ball at the bore of a big gun
const GEO_FLASH_SPIKE = new THREE.PlaneGeometry(3.4, 0.4);         // star-flare blade (scaled by flash size — keep it short or it smears)
const MAT_FLASH_CORE = new THREE.MeshBasicMaterial({ color: 'yellow', transparent: true, opacity: 0.9, toneMapped: false });
// Note: Outer material depends on color prop, so we might need to keep it dynamic or cache by color.
// But mostly it's yellow/orange.
const FLASH_MAT_CACHE = new Map<string, THREE.Material>();
const flashMaterial = (color: string, opacity: number) => {
    const key = `${color}|${opacity}`;
    let m = FLASH_MAT_CACHE.get(key);
    if (!m) {
        m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, toneMapped: false });
        FLASH_MAT_CACHE.set(key, m);
    }
    return m;
};

// A muzzle flash is burning gas, not a decal: it flickers hard, it is never the
// same shape twice, and on a big bore it blooms into a star. Anything at or
// above `size` 2 (tank, artillery, gunboat, AA, bunker) gets the gas ball and
// the flare blades; a rifle keeps the plain cone.
// Still no pointLight — dynamic lights are expensive per-fragment, so bloom on
// the toneMapped-off geometry sells the light instead.
const MuzzleFlash = ({ size = 1, color = 'orange' }: { size?: number, color?: string }) => {
    const grp = useRef<THREE.Group>(null);
    const seed = useMemo(() => Math.random(), []);
    const outerMat = useMemo(() => flashMaterial(color, 0.6), [color]);
    const flareMat = useMemo(() => flashMaterial(color, 0.3), [color]);   // blades stay faint, or they read as a smear
    const heavy = size >= 2;

    useFrame(() => {
        const g = grp.current;
        if (!g) return;
        // Flicker + roll: consecutive shots from the same gun must not stamp an
        // identical sprite, which is what made sustained fire look static.
        const t = Date.now() * 0.045 + seed * 12;
        g.scale.setScalar(size * (0.72 + Math.abs(Math.sin(t)) * 0.5));
        g.rotation.x = seed * Math.PI * 2 + t * 0.25;
    });

    return (
        <group ref={grp}>
            {/* Core */}
            <mesh position={[1.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]} geometry={GEO_FLASH_CORE} material={MAT_FLASH_CORE} />
            {/* Outer */}
            <mesh position={[2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} geometry={GEO_FLASH_OUTER} material={outerMat} />
            {heavy && (
                <group>
                    {/* Gas ball hanging at the bore */}
                    <mesh position={[1.8, 0, 0]} scale={0.75} geometry={GEO_FLASH_BALL} material={outerMat} />
                    {/* Star flare: blades crossing the muzzle */}
                    {[0, Math.PI / 2].map((r, i) => (
                        <mesh key={i} position={[1.8, 0, 0]} rotation={[r, 0, 0]} geometry={GEO_FLASH_SPIKE} material={flareMat} />
                    ))}
                </group>
            )}
        </group>
    );
};

// Animated infantry legs — swing from the hip while walking
const InfantryLegs = ({ walking, phase, color = '#333', transparent, opacity }: { walking: boolean, phase: number, color?: string, transparent?: boolean, opacity?: number }) => {
    const t = Date.now() * 0.013 + phase;
    const s = walking ? Math.sin(t) : 0;
    return (
        <group>
            {[-1, 1].map(side => (
                <group key={side} position={[0, 6.5, side * 1.6]} rotation={[0, 0, s * side * 0.55]}>
                    <mesh position={[0, -4.5, 0]} castShadow>
                        <boxGeometry args={[2.5, 9, 2.5]} />
                        <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

// Shared Assets
const GEO_HEALTH_BAR = new THREE.BoxGeometry(1, 3, 1);

// ── GLB unit models (Quaternius, CC0 — see README credits) ──────────────────
// Loaded once via useGLTF; every unit gets a SkeletonUtils clone (required for
// skinned meshes) with team-marked materials tinted toward its side's color.
// Relative paths resolve against the page URL, which works both on the Vite
// dev server and under the GitHub Pages base path.
const MODEL_URL = {
    soldier: 'models/soldier.glb',
    tank: 'models/tank.glb',
    jeep: 'models/jeep.glb',
    truck: 'models/truck.glb',
    apc: 'models/apc.glb',
    antiair: 'models/antiair.glb',
    helicopter: 'models/helicopter.glb',
    fighter: 'models/fighter.glb',
    drone: 'models/drone.glb',
    gunboat: 'models/gunboat.glb',
    artillery: 'models/artillery.glb',
    tesla: 'models/tesla.glb',
    bunker: 'models/bunker.glb',
};
Object.values(MODEL_URL).forEach(u => useGLTF.preload(u));

const TEAM_TINT_WEST = '#60a5fa';
const TEAM_TINT_EAST = '#f87171';
// Colorblind-assist: East's identity color becomes amber. Set synchronously in
// the GameScene body before children render; the Canvas remounts on toggle so
// every tinted clone and flag re-evaluates.
let CB_MODE = false;
const eastColor = (normal: string, cbAlt = '#f59e0b') => CB_MODE ? cbAlt : normal;
const teamTint = (team: Team) => team === Team.WEST ? TEAM_TINT_WEST : eastColor(TEAM_TINT_EAST, '#fbbf24');

// Clone a GLB per unit (SkeletonUtils handles skinned meshes) and recolor its
// materials: each rule lerps matching materials toward a color. `'*'` matches
// every material — which is what the current model pack needs, since all of its
// GLBs ship a single atlas material (`PaletteMaterial001`) rather than the named
// `Swat`/`Main` slots the rules were originally written against. Matching by
// those old names silently tinted nothing, so both sides rendered identical.
type TintRule = { materials: string[], color: string, strength: number };

// The turret pack (artillery/tesla/bunker) is the one set of models that ships
// two named materials instead of a single atlas: 'Light' takes the team color,
// 'Dark' is tinted far less so the shadowed plating stays readable as depth.
const emplacementTint = (team: Team): TintRule[] => [
    { materials: ['Light'], color: teamTint(team), strength: 0.55 },
    { materials: ['Dark'], color: teamTint(team), strength: 0.22 },
];

// Tinted materials are shared across every unit that wants the same look —
// a battle of 80 units used to allocate ~4 cloned materials each.
const TINT_CACHE = new Map<string, THREE.Material>();
const tintedMaterial = (base: THREE.Material, color: string, strength: number): THREE.Material => {
    const key = `${base.uuid}|${color}|${strength}`;
    let m = TINT_CACHE.get(key);
    if (!m) {
        m = base.clone();
        const c = (m as any).color;
        if (c) (m as any).color = c.clone().lerp(new THREE.Color(color), strength);
        TINT_CACHE.set(key, m);
    }
    return m;
};

function useTintedClone(url: string, rules: TintRule[], template?: THREE.Object3D) {
    const { scene } = useGLTF(url);
    const src = template ?? scene;
    const key = rules.map(r => r.materials.join('.') + r.color + r.strength).join('|');
    const obj = useMemo(() => {
        const root = SkeletonUtils.clone(src);
        root.traverse((o: any) => {
            if (o.isMesh || o.isSkinnedMesh) {
                o.castShadow = true;
                o.frustumCulled = false; // skinned bounds lag the armature
                if (o.material) {
                    const rule = rules.find(r => r.materials.some(m => m === '*' || o.material.name.includes(m)));
                    if (rule) o.material = tintedMaterial(o.material, rule.color, rule.strength);
                }
            }
        });
        return root;
    }, [src, key]); // eslint-disable-line react-hooks/exhaustive-deps

    // Every clone of a skinned model gets its own Skeleton, and a Skeleton
    // allocates a bone texture on the GPU. Clones are mounted through
    // <primitive>, which R3F deliberately never disposes — so each unit that
    // died left its bone texture behind and GPU memory climbed for the whole
    // match (measured: ~8 textures leaked per spawn, 1400+ in 40 seconds).
    // Geometry and materials are shared with the template, so only the skeleton
    // is ours to free.
    useEffect(() => () => {
        obj.traverse((o: any) => { if (o.isSkinnedMesh && o.skeleton?.dispose) o.skeleton.dispose(); });
    }, [obj]);

    return obj;
}

// One shared soldier template, merged. The GLB is four skinned meshes
// (body/head/legs/feet) split across ~8 primitives, each carrying its own skin —
// so a cloned soldier used to bring 8 skeletons, 8 bone textures and 8 draw
// calls with it. All four skins list the same joints in the same order and share
// a skeleton root, so the geometry can be merged and bound to a single skeleton:
// one mesh, one skeleton, one draw call per soldier.
const SOLDIER_TEMPLATE = new WeakMap<THREE.Object3D, THREE.Object3D>();

// Normalize a skinned primitive so several of them can be merged: the pack's
// primitives disagree on index/attribute types (skinIndex arrives as Uint8 on
// some, Uint16 on others), and merging those straight produces a geometry whose
// bone indices are nonsense.
const normalizeSkinned = (g: THREE.BufferGeometry): THREE.BufferGeometry | null => {
    const src = g.index ? g.toNonIndexed() : g;
    const pos = src.getAttribute('position'), nrm = src.getAttribute('normal');
    const uv = src.getAttribute('uv');
    const si = src.getAttribute('skinIndex'), sw = src.getAttribute('skinWeight');
    if (!pos || !nrm || !uv || !si || !sw) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(pos.array as ArrayLike<number>), 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from(nrm.array as ArrayLike<number>), 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from(uv.array as ArrayLike<number>), 2));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(si.array as ArrayLike<number>), 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from(sw.array as ArrayLike<number>), 4));
    return out;
};

const soldierTemplate = (scene: THREE.Object3D): THREE.Object3D => {
    let t = SOLDIER_TEMPLATE.get(scene);
    if (t) return t;
    t = SkeletonUtils.clone(scene);
    const skinned: THREE.SkinnedMesh[] = [];
    t.traverse((o: any) => { if (o.isSkinnedMesh) skinned.push(o); });

    // The GLB splits the soldier into four skinned meshes (body/head/legs/feet)
    // across ~11 primitives — 11 draw calls per soldier, doubled by the shadow
    // pass. Every primitive of a given mesh shares that mesh's skin and material,
    // so their geometry can be merged safely: 11 meshes become 4.
    //
    // Merging across the four *meshes* is NOT safe: each skin bakes its own node
    // scale into its inverse bind matrices (feet 0.26, legs 0.50, head 0.18), so
    // binding them all to one skeleton tears the model apart. Left alone.
    const byParent = new Map<THREE.Object3D, THREE.SkinnedMesh[]>();
    for (const m of skinned) {
        if (!m.parent) continue;
        const group = byParent.get(m.parent) ?? [];
        group.push(m);
        byParent.set(m.parent, group);
    }
    for (const [parent, group] of byParent) {
        if (group.length < 2) continue;
        const first = group[0];
        // Same skin only — different skins have incompatible bind matrices.
        const sameSkin = group.every(m => m.skeleton === first.skeleton || m.skeleton.boneInverses[0].equals(first.skeleton.boneInverses[0]));
        if (!sameSkin) continue;
        const parts = group.map(m => normalizeSkinned(m.geometry));
        if (!parts.every(Boolean)) continue;
        const merged = mergeBufferGeometries(parts as THREE.BufferGeometry[], false);
        if (!merged) continue;

        // A bad merge silently deforms the model rather than failing, so only
        // adopt it when every bone index still addresses a real bone.
        const bones = first.skeleton.bones.length;
        const idx = merged.getAttribute('skinIndex');
        const arr = idx?.array as ArrayLike<number> | undefined;
        let sane = !!arr && Number.isInteger(merged.getAttribute('position').count);
        if (sane && arr) for (let i = 0; i < arr.length; i++) if (arr[i] >= bones) { sane = false; break; }
        if (!sane) continue;

        const one = new THREE.SkinnedMesh(merged, first.material);
        one.name = `${first.name}_merged`;
        one.castShadow = true;
        one.frustumCulled = false;
        parent.add(one);
        one.bind(first.skeleton, first.bindMatrix);
        for (const m of group) m.removeFromParent();
    }
    SOLDIER_TEMPLATE.set(scene, t);
    return t;
};

// GLTF sanitizes node names ('Wrist.R' can arrive as 'Wrist_R'), so match loosely.
const findBone = (root: THREE.Object3D, want: string): THREE.Object3D | undefined => {
    const norm = (s: string) => s.replace(/[._\s]/g, '').toLowerCase();
    const target = norm(want);
    let hit: THREE.Object3D | undefined;
    root.traverse(o => { if (!hit && norm(o.name) === target) hit = o; });
    return hit;
};

// The Quaternius soldier ships unarmed — its clips are named Idle_Gun/Run but
// the mesh is only body/head/legs/feet. Bolt a low-poly rifle onto the right
// wrist bone so the squad actually holds what it's firing. One merged geometry
// and a shared material per accent colour: one extra draw call per soldier.
const GEO_RIFLE = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
        g.rotateZ(rz); g.translate(x, y, z); parts.push(g);
    };
    push(new THREE.BoxGeometry(0.62, 0.05, 0.05), 0.1, 0, 0);      // receiver + barrel
    push(new THREE.BoxGeometry(0.20, 0.10, 0.05), -0.20, -0.01, 0); // stock
    push(new THREE.BoxGeometry(0.05, 0.13, 0.04), 0.02, -0.09, 0);  // magazine
    push(new THREE.BoxGeometry(0.16, 0.04, 0.04), 0.30, 0.05, 0);   // fore sight rail
    return mergeBufferGeometries(parts, false)!;
})();

// Special Forces carry a squad machine gun instead: longer barrel, drum magazine and
// an ammo belt hanging off it. He also stands 18% taller than a rifleman, so at
// a glance he reads as the heavy.
const GEO_HMG = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(g); };
    push(new THREE.BoxGeometry(0.95, 0.08, 0.08), 0.22, 0, 0);        // heavy receiver + long barrel
    push(new THREE.BoxGeometry(0.26, 0.13, 0.07), -0.26, -0.02, 0);   // stock
    push(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 10).rotateX(Math.PI / 2), 0.02, -0.12, 0); // drum mag
    push(new THREE.BoxGeometry(0.22, 0.05, 0.03), 0.30, -0.14, 0.03); // ammo belt
    push(new THREE.BoxGeometry(0.10, 0.06, 0.06), 0.68, 0.06, 0);     // muzzle brake
    return mergeBufferGeometries(parts, false)!;
})();

// Red headband — a flat ring around the skull, the one silhouette cue that
// still reads when the camera is pulled back.
const GEO_BANDANA = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 12, 1, true);
const MAT_BANDANA = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.9, side: THREE.DoubleSide });
// Trailing tail of the knot, so it's visible from behind too.
const GEO_BANDANA_TAIL = new THREE.BoxGeometry(0.03, 0.14, 0.02);
// Floating bounty labels ("+$110") as sprites off a cached canvas texture. The
// set of distinct amounts in a match is tiny, so each one is rasterized once and
// reused — unlike drei's <Text>, which allocated (and leaked) a geometry plus a
// texture per popup.
const BOUNTY_CACHE = new Map<string, THREE.SpriteMaterial>();
const bountyMaterial = (text: string): THREE.SpriteMaterial => {
    let m = BOUNTY_CACHE.get(text);
    if (!m) {
        const pad = 8, font = 44;
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d')!;
        ctx.font = `bold ${font}px sans-serif`;
        c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
        c.height = font + pad * 2;
        const g = c.getContext('2d')!;
        g.font = `bold ${font}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 6;
        g.strokeStyle = '#000000';
        g.strokeText(text, c.width / 2, c.height / 2);
        g.fillStyle = '#22c55e';
        g.fillText(text, c.width / 2, c.height / 2);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        // World size for the sprite, scaled off the canvas aspect
        m.userData = { w: (c.width / c.height) * 26, h: 26 };
        BOUNTY_CACHE.set(text, m);
    }
    return m;
};

// Rifle length in the soldier's own units (he stands ~1.8 tall), before the
// wrist bone's baked armature scale is cancelled out.
const RIFLE_LENGTH = 0.85;

const RIFLE_MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();
const rifleMaterial = (color: string): THREE.MeshStandardMaterial => {
    let m = RIFLE_MAT_CACHE.get(color);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.35 });
        RIFLE_MAT_CACHE.set(color, m);
    }
    return m;
};

// Static (unskinned) model: runtime bounding-box auto-fit IS reliable here
// (unlike the armature-driven soldier/tank), plus optional spinning rotor
// nodes and a yaw to map the model's native forward onto the game's +X.
const StaticModel = ({ url, tints, targetLen, axis = 'z', yaw = Math.PI / 2, spinNodes }: {
    url: string, tints: TintRule[], targetLen: number, axis?: 'x' | 'y' | 'z', yaw?: number, spinNodes?: string[],
}) => {
    const obj = useTintedClone(url, tints);
    const fit = useMemo(() => {
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        const s = targetLen / (size[axis] || 1);
        return { s, groundY: -box.min.y * s };
    }, [obj, targetLen, axis]);
    const spinners = useMemo(() => {
        const found: THREE.Object3D[] = [];
        if (spinNodes) obj.traverse((o: any) => { if (spinNodes.some(n => o.name.includes(n))) found.push(o); });
        return found;
    }, [obj, spinNodes]); // eslint-disable-line react-hooks/exhaustive-deps
    useFrame((_, dt) => { for (const r of spinners) r.rotation.y += dt * 30; });
    return (
        <group position={[0, fit.groundY, 0]} rotation={[0, yaw, 0]} scale={fit.s}>
            <primitive object={obj} />
        </group>
    );
};

// Empirical model scales: skinned bind-pose bounding boxes are useless here
// (the Quaternius armatures carry large transforms), so these were calibrated
// visually against the world's tree/rock/unit sizes.
// (probe-measured: soldier is human-scale 1.8 units tall; the tank armature
// bakes a large scale; it faces -X, so TankModel yaws it by PI)
const SOLDIER_SCALE = 11;
const TANK_SCALE = 2.7;

// Role accents: the soldier model's 'Grey' vest material takes a per-role
// color so specialists stay readable while 'Swat' (body) carries the team.
const INFANTRY_ACCENT: Partial<Record<UnitType, string>> = {
    [UnitType.SNIPER]: '#3f6212',       // camo green
    [UnitType.SPECIAL_FORCES]: '#dc2626',        // hero red
    [UnitType.FLAMETHROWER]: '#ea580c', // burn orange
    [UnitType.MEDIC]: '#f8fafc',        // white
    [UnitType.ENGINEER]: '#facc15',     // hi-vis yellow
    [UnitType.MORTAR]: '#78350f',       // powder brown
    [UnitType.AIRBORNE]: '#374151',     // drop-suit slate
};

// Animated infantry (all foot units reuse the rifleman): runs, aims and
// fires using the model's own clips.
const InfantryModel = ({ unit, scale = SOLDIER_SCALE }: { unit: Unit, scale?: number }) => {
    const { scene, animations } = useGLTF(MODEL_URL.soldier);
    const accent = INFANTRY_ACCENT[unit.type];
    // The model has one atlas material, so the team colour rides on it directly;
    // the role accent goes on the rifle, which keeps specialists readable up
    // close without costing an extra mesh.
    const obj = useTintedClone(
        MODEL_URL.soldier,
        [{ materials: ['*'], color: teamTint(unit.team), strength: 0.5 }],
        soldierTemplate(scene),
    );
    // Kit the clone out once: a weapon on the right wrist (so it tracks the hand
    // through the run/aim/fire clips), and the Special Forces headband on the skull.
    const isSpecialForces = unit.type === UnitType.SPECIAL_FORCES;
    useMemo(() => {
        if (obj.getObjectByName('Rifle')) return;
        // The armature bakes a large scale into its bones, so anything parented
        // to a bone inherits it — a naively-sized rifle came out ~780 world units
        // long, i.e. slabs flying across the battlefield. Cancel the bone's scale
        // and size the kit against the soldier himself (~1.8 units tall).
        obj.updateWorldMatrix(false, true);
        const boneScale = (bone: THREE.Object3D) => {
            const s = new THREE.Vector3();
            bone.getWorldScale(s);
            return (s.x + s.y + s.z) / 3 || 1;
        };

        const wrist = findBone(obj, 'Wrist.R');
        if (wrist) {
            // The HMG's geometry is already ~1.4x the rifle's, and the Special Forces body is
            // scaled up 18% on top — so no extra length multiplier beyond a nudge,
            // or the gun ends up longer than he is tall.
            const k = (isSpecialForces ? RIFLE_LENGTH * 1.05 : RIFLE_LENGTH) / boneScale(wrist);
            const gun = new THREE.Mesh(isSpecialForces ? GEO_HMG : GEO_RIFLE, rifleMaterial(accent ?? '#2f3437'));
            gun.name = 'Rifle';
            gun.castShadow = true;
            gun.frustumCulled = false;
            gun.scale.setScalar(k);
            gun.position.set(0.05 * k, 0.02 * k, 0);
            gun.rotation.set(0, 0, -Math.PI / 2);
            wrist.add(gun);
        }

        // Red bandana: the silhouette cue that survives a pulled-back camera.
        const head = isSpecialForces ? findBone(obj, 'Head') : undefined;
        if (head) {
            const k = 1 / boneScale(head);
            const band = new THREE.Mesh(GEO_BANDANA, MAT_BANDANA);
            band.name = 'Bandana';
            band.castShadow = true;
            band.frustumCulled = false;
            band.scale.setScalar(k);
            band.position.set(0, 0.10 * k, 0);
            head.add(band);

            const tail = new THREE.Mesh(GEO_BANDANA_TAIL, MAT_BANDANA);
            tail.name = 'BandanaTail';
            tail.frustumCulled = false;
            tail.scale.setScalar(k);
            tail.position.set(-0.10 * k, 0.06 * k, 0);
            tail.rotation.set(0, 0, 0.35);
            head.add(tail);
        }
    }, [obj, accent, isSpecialForces]);
    const group = useRef<THREE.Group>(null!);
    const { actions } = useAnimations(animations, group);
    const clip = unit.state === UnitState.ATTACKING ? 'CharacterArmature|Idle_Gun_Shoot'
        : unit.state === UnitState.MOVING ? 'CharacterArmature|Run'
        : unit.type === UnitType.SNIPER ? 'CharacterArmature|Idle_Gun_Pointing'
        : 'CharacterArmature|Idle_Gun';
    useEffect(() => {
        const a = actions[clip];
        if (!a) return;
        a.reset();
        // Desync squads so they don't march in lockstep
        a.time = ((unit.id.charCodeAt(0) + unit.id.charCodeAt(2)) % 10) / 10 * a.getClip().duration;
        a.fadeIn(0.12).play();
        return () => { a.fadeOut(0.12); };
    }, [actions, clip, unit.id]);
    return (
        <group ref={group} rotation={[0, Math.PI / 2, 0]} scale={scale}>
            <primitive object={obj} />
        </group>
    );
};

// Tank with animated tracks while rolling.
const TankModel = ({ unit }: { unit: Unit }) => {
    const { animations } = useGLTF(MODEL_URL.tank);
    const obj = useTintedClone(MODEL_URL.tank, [{ materials: ['*'], color: teamTint(unit.team), strength: 0.45 }]);
    const group = useRef<THREE.Group>(null!);
    const { actions } = useAnimations(animations, group);
    useEffect(() => {
        const a = actions['TankArmature|Tank_Forward'];
        if (!a) return;
        // Keep the clip PLAYING even when stationary (paused) — a stopped
        // action reverts the skinned tracks to their coiled bind pose.
        a.play();
        a.paused = unit.state !== UnitState.MOVING;
    }, [actions, unit.state]);
    // The tank GLB faces -X, not +X: its barrel sits on the model's -X side.
    // Unit3D only rotates East by PI, so with no yaw of its own the tank drove
    // gun-backwards on both sides (measured: barrel +5.1 on x from the hull
    // centre while the unit advanced -x). Yaw by PI to put the gun up front.
    return (
        <group ref={group} scale={TANK_SCALE} rotation={[0, Math.PI, 0]}>
            <primitive object={obj} />
        </group>
    );
};

const Unit3D = ({ unit, terrain, onCanvasClick, onUnitClick, focused, selected }: { unit: Unit, terrain: TerrainObject[], onCanvasClick: (x: number, y: number) => void, onUnitClick?: (unit: Unit) => void, focused?: boolean, selected?: boolean }) => {
    const config = UNIT_CONFIG[unit.type] as any;
    const terrainH = getTerrainHeight(unit.position.x, unit.position.y, terrain);

    const position = [unit.position.x, terrainH, unit.position.y];

    const isHit = !!(unit.lastHitTime && (Date.now() - unit.lastHitTime) < 140);

    // Height offset for different units
    let yOffset = 0;
    if (unit.type === UnitType.AIRBORNE) {
        const lifeTime = Date.now() - (unit.spawnTime || 0);
        if (lifeTime < 3000) {
            yOffset = 200 * (1 - Math.min(1, lifeTime / 3000));
        }
    } else if (unit.type === UnitType.DRONE) {
        yOffset = 25;
    } else if (unit.type === UnitType.FIGHTER) {
        yOffset = 42;
    } else if (unit.type === UnitType.ANTI_AIR || unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY) {
        // Vehicle adjustment?
    }

    const color = unit.team === Team.WEST ? config.colorWest : config.colorEast;
    const isWest = unit.team === Team.WEST;
    // Calculate slope rotation? For now just keep them upright or maybe pitch based on normal.
    const rotation = [0, isWest ? 0 : Math.PI, 0];

    // Walk bob for infantry on the move
    const isInfantry = unit.type === UnitType.SOLDIER || unit.type === UnitType.SPECIAL_FORCES || unit.type === UnitType.SNIPER ||
        unit.type === UnitType.FLAMETHROWER || unit.type === UnitType.MEDIC || unit.type === UnitType.AIRBORNE ||
        unit.type === UnitType.ENGINEER || unit.type === UnitType.MORTAR;
    const walkPhase = (unit.id.charCodeAt(0) * 13 + (unit.id.charCodeAt(1) || 0) * 7) % 100;
    // GLB soldiers animate their own run cycle — no procedural bob for them
    const walking = isInfantry && unit.type !== UnitType.SOLDIER && unit.state === UnitState.MOVING && !unit.isInCover && yOffset === 0;
    const bobY = walking ? Math.abs(Math.sin(Date.now() * 0.012 + walkPhase)) * 1.6 : 0;
    const bobTilt = walking ? Math.sin(Date.now() * 0.012 + walkPhase) * 0.05 : 0;

    // The muzzle-flash window scales with the weapon's cadence (flashTicks): fast
    // guns strobe, slow guns linger. Recoil rides the same window and the unit's
    // firing signature, so a howitzer heaves where a rifle twitches.
    const fireFx = getFireFx(unit.type);
    const flashWin = flashTicks(unit.type);
    const firing = unit.attackCooldown > (config.attackSpeed - flashWin);
    const recoil = firing ? (unit.attackCooldown - (config.attackSpeed - flashWin)) * 0.11 * fireFx.recoil : 0;

    // Visual cue for Cover
    const opacity = (unit as any).isInCover ? 0.6 : 1.0;
    const transparent = (unit as any).isInCover;
    const matProps = { color, transparent, opacity };

    return (
        <ClickableGroup
            position={[position[0], position[1] + yOffset + bobY, position[2]]}
            rotation={rotation as any}
            onCanvasClick={onUnitClick ? () => onUnitClick(unit) : onCanvasClick}
        >
            <group receiveShadow castShadow rotation={[0, 0, bobTilt]}>
                {/* Health bar, team ring and aircraft shadow blob are drawn by
                    <InstancedUnitOverlays> — one draw call each for the whole
                    field instead of ~4 per unit. */}

                {/* Geometry based on Type */}
                {
                    unit.type === UnitType.SOLDIER && (
                        <group position={[0, 0, 0]}>
                            <Suspense fallback={null}>
                                <InfantryModel unit={unit} />
                            </Suspense>
                            {firing && (
                                <group position={[10, 12, 1]}>
                                    <MuzzleFlash size={0.8} />
                                </group>
                            )}
                        </group>
                    )
                }
                {
                    unit.type === UnitType.TANK && (
                        <group>
                            <group position={[-recoil, 0, 0]}>
                                <Suspense fallback={null}>
                                    <TankModel unit={unit} />
                                </Suspense>
                            </group>
                            {/* Muzzle Flash at the barrel tip */}
                            {firing && (
                                <group position={[34, 15, 0]}>
                                    <MuzzleFlash size={4} />
                                </group>
                            )}
                        </group>
                    )
                }
                {
                    unit.type === UnitType.GUNBOAT && (
                        <group position={[0, 1.5 + Math.sin(Date.now() * 0.0022 + unit.position.x) * 0.7, 0]} rotation={[Math.sin(Date.now() * 0.0017 + unit.position.y) * 0.03, 0, 0]}>
                            <Suspense fallback={null}>
                                <StaticModel url={MODEL_URL.gunboat} targetLen={36} axis="x" yaw={0} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.6 }]} />
                            </Suspense>
                            {/* Team pennant — the textured hull resists tinting, so fly the colors */}
                            <group position={[-13, 13, 0]}>
                                <mesh>
                                    <cylinderGeometry args={[0.3, 0.3, 10]} />
                                    <meshStandardMaterial color="#57534e" />
                                </mesh>
                                <mesh position={[2.6, 3.4, 0]} rotation={[0, Math.sin(Date.now() * 0.003) * 0.25, 0]}>
                                    <boxGeometry args={[5, 3.2, 0.3]} />
                                    <meshStandardMaterial color={isWest ? '#3b82f6' : eastColor('#ef4444')} emissive={isWest ? '#3b82f6' : eastColor('#ef4444')} emissiveIntensity={0.3} side={THREE.DoubleSide} />
                                </mesh>
                            </group>
                            {firing && (
                                <group position={[20, 10, 0]}>
                                    <MuzzleFlash size={3} />
                                </group>
                            )}
                            {/* Wake foam */}
                            <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[16, 19, 20]} />
                                <meshBasicMaterial color="#e0f2fe" transparent opacity={0.18 + 0.08 * Math.sin(Date.now() * 0.003)} depthWrite={false} />
                            </mesh>
                        </group>
                    )
                }
                {
                    unit.type === UnitType.TESLA && (
                        <group>
                            {/* Emitter crown (GLB); the arc FX below sit above its spikes */}
                            <Suspense fallback={null}>
                                <StaticModel url={MODEL_URL.tesla} targetLen={34} axis="x" yaw={0} tints={emplacementTint(unit.team)} />
                            </Suspense>
                            {/* Charge core sitting in the crown */}
                            <mesh position={[0, 30, 0]} castShadow>
                                <sphereGeometry args={[5, 16, 16]} />
                                <meshStandardMaterial color="#e0f2fe" emissive="#e0f2fe" emissiveIntensity={10} />
                            </mesh>
                            {/* Orbiting charge sparks */}
                            <group position={[0, 30, 0]} rotation={[0, Date.now() * 0.008, 0]}>
                                {[0, Math.PI].map((a, i) => (
                                    <mesh key={i} position={[Math.cos(a) * 7.5, Math.sin(Date.now() * 0.01 + a) * 2, Math.sin(a) * 7.5]}>
                                        <sphereGeometry args={[0.9, 6, 6]} />
                                        <meshBasicMaterial color="#7dd3fc" toneMapped={false} />
                                    </mesh>
                                ))}
                            </group>
                            {/* Stray arc crackling down the coil, flickers in and out */}
                            {Math.sin(Date.now() * 0.017) > 0.55 && (
                                <mesh position={[3.5, 23, 3.5]} rotation={[0.5, Date.now() * 0.02 % (Math.PI * 2), 0.9]}>
                                    <cylinderGeometry args={[0.25, 0.25, 14]} />
                                    <meshBasicMaterial color="#bae6fd" toneMapped={false} transparent opacity={0.85} />
                                </mesh>
                            )}
                            {/* Pulsing charge glow on the ground */}
                            <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1 + 0.12 * Math.sin(Date.now() * 0.005)}>
                                <ringGeometry args={[16, 19, 28]} />
                                <meshBasicMaterial color="#0ea5e9" transparent opacity={0.16 + 0.1 * Math.sin(Date.now() * 0.005)} toneMapped={false} depthWrite={false} />
                            </mesh>
                        </group>
                    )
                }
                {
                    unit.type === UnitType.ARTILLERY && (
                        <group>
                            {/* Towed gun (GLB), rolled back along its firing line by recoil */}
                            <group position={[-recoil, 0, 0]}>
                                <Suspense fallback={null}>
                                    <StaticModel url={MODEL_URL.artillery} targetLen={54} axis="z" yaw={-Math.PI / 2} tints={emplacementTint(unit.team)} />
                                </Suspense>
                            </group>
                            {firing && (
                                <group position={[30, 26, 0]}>
                                    <MuzzleFlash size={7} />
                                </group>
                            )}
                        </group>
                    )
                }

                {
                    unit.type === UnitType.SPECIAL_FORCES && (
                        <group position={[0, 0, 0]}>
                            {/* Hero unit runs slightly larger than the rank and file */}
                            <Suspense fallback={null}>
                                <InfantryModel unit={unit} scale={SOLDIER_SCALE * 1.18} />
                            </Suspense>
                            {firing && (
                                <group position={[12, 13, 1]}>
                                    <MuzzleFlash size={1.5} />
                                </group>
                            )}
                        </group>
                    )
                }

                {
                    (unit.type === UnitType.AIRBORNE) && (
                        <group>
                            <Suspense fallback={null}>
                                <InfantryModel unit={unit} />
                            </Suspense>
                            {firing && (
                                <group position={[10, 12, 1]}>
                                    <MuzzleFlash size={0.8} />
                                </group>
                            )}

                            {/* Parachute Check */}
                            {(Date.now() - (unit.spawnTime || 0) < 3000) && (
                                <group position={[0, 40, 0]}>
                                    <mesh position={[0, 5, 0]}>
                                        <sphereGeometry args={[15, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                                        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
                                    </mesh>
                                    {/* Lines */}
                                    <mesh position={[-10, 0, 0]} rotation={[0, 0, -0.2]}>
                                        <cylinderGeometry args={[0.2, 0.2, 20]} />
                                        <meshBasicMaterial color="white" />
                                    </mesh>
                                    <mesh position={[10, 0, 0]} rotation={[0, 0, 0.2]}>
                                        <cylinderGeometry args={[0.2, 0.2, 20]} />
                                        <meshBasicMaterial color="white" />
                                    </mesh>
                                </group>
                            )}
                        </group>
                    )
                }

                {
                    unit.type === UnitType.ANTI_AIR && (
                        <group>
                            <Suspense fallback={null}>
                                <StaticModel url={MODEL_URL.antiair} targetLen={30} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.55 }]} />
                            </Suspense>
                            {firing && (
                                <group position={[8, 26, 0]} rotation={[0, 0, Math.PI / 4]}>
                                    <MuzzleFlash size={3} color={fireFx.flashColor} />
                                </group>
                            )}
                            {/* Spinning search radar */}
                            <group position={[0, 30, -8]}>
                                <mesh>
                                    <cylinderGeometry args={[0.8, 0.8, 6]} />
                                    <meshStandardMaterial color="#52525b" />
                                </mesh>
                                <group position={[0, 4, 0]} rotation={[0, Date.now() * 0.004, 0]}>
                                    <mesh rotation={[0, 0, Math.PI / 2]}>
                                        <boxGeometry args={[1.5, 12, 4]} />
                                        <meshStandardMaterial color="#71717a" />
                                    </mesh>
                                </group>
                            </group>
                        </group>
                    )
                }

                {
                    unit.type === UnitType.DRONE && (
                        <group>
                            <Suspense fallback={null}>
                                <StaticModel url={MODEL_URL.drone} targetLen={18} tints={[{ materials: ['ColourPalette'], color: teamTint(unit.team), strength: 0.35 }]} spinNodes={['Rotor']} />
                            </Suspense>
                            {/* Blinking status LED */}
                            <mesh position={[0, 6, 0]}>
                                <sphereGeometry args={[1, 8, 8]} />
                                <meshBasicMaterial color={Math.floor(Date.now() / 400) % 2 === 0 ? '#ef4444' : '#450a0a'} toneMapped={false} />
                            </mesh>
                        </group>
                    )
                }

                {
                    unit.type === UnitType.MINE_PERSONAL && (
                        <mesh position={[0, 1, 0]}>
                            <cylinderGeometry args={[3, 3, 2]} />
                            <meshStandardMaterial color="black" />
                            {/* Armed indicator LED */}
                            <mesh position={[0, 1.3, 0]}>
                                <sphereGeometry args={[0.6, 6, 6]} />
                                <meshBasicMaterial color={Date.now() % 1400 < 140 ? '#ef4444' : '#450a0a'} toneMapped={Date.now() % 1400 >= 140} />
                            </mesh>
                        </mesh>
                    )
                }
                {
                    unit.type === UnitType.MINE_TANK && (
                        <mesh position={[0, 1, 0]}>
                            <cylinderGeometry args={[5, 5, 3]} />
                            <meshStandardMaterial color="#222" />
                            <mesh position={[0, 1.8, 0]}>
                                <sphereGeometry args={[0.8, 6, 6]} />
                                <meshBasicMaterial color={Date.now() % 1400 < 140 ? '#ef4444' : '#450a0a'} toneMapped={Date.now() % 1400 >= 140} />
                            </mesh>
                        </mesh>
                    )
                }

                {
                    unit.type === UnitType.HELICOPTER && (
                        <group position={[0, 15, 0]} rotation={[0, (unit.rotation || 0) - Math.PI / 2, 0]}>
                            <group position={[0, -12, 0]} rotation={[0, -Math.PI / 2, 0]}>
                                <Suspense fallback={null}>
                                    <StaticModel url={MODEL_URL.helicopter} targetLen={38} axis="x" yaw={0} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.5 }]} />
                                </Suspense>
                            </group>
                            {/* Rotor blur disc (the model's rotor is static) */}
                            <group position={[0, 10, 0]} rotation={[0, (Date.now() / 40), 0]}>
                                <mesh>
                                    <boxGeometry args={[42, 0.4, 2.2]} />
                                    <meshStandardMaterial color="#111" />
                                </mesh>
                                <mesh rotation={[0, Math.PI / 2, 0]}>
                                    <boxGeometry args={[42, 0.4, 2.2]} />
                                    <meshStandardMaterial color="#111" />
                                </mesh>
                            </group>
                            <mesh position={[0, 10, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                                <circleGeometry args={[21, 24]} />
                                <meshBasicMaterial color="#94a3b8" transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} />
                            </mesh>

                            {/* Muzzle Flashes (Missiles/Guns) */}
                            {firing && (
                                <group>
                                    <group position={[6, -2, 4]} rotation={[0, -Math.PI / 2, 0]}><MuzzleFlash size={2} /></group>
                                    <group position={[-6, -2, 4]} rotation={[0, -Math.PI / 2, 0]}><MuzzleFlash size={2} /></group>
                                </group>
                            )}
                        </group>
                    )
                }
                {
                    unit.type === UnitType.SNIPER && (
                        <group position={[0, 0, 0]}>
                            <Suspense fallback={null}>
                                <InfantryModel unit={unit} />
                            </Suspense>
                            {/* Periodic scope glint */}
                            {(Date.now() % 2400) < 180 && (
                                <mesh position={[8, 13, 1]}>
                                    <sphereGeometry args={[0.9, 6, 6]} />
                                    <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
                                </mesh>
                            )}
                            {firing && (
                                <group position={[11, 12, 1]}>
                                    {/* A pale crack, not a fireball — his tell is the dust it lifts */}
                                    <MuzzleFlash size={1.5} color={fireFx.flashColor} />
                                </group>
                            )}
                        </group>
                    )
                }

                {
                    unit.type === UnitType.NAPALM && (
                        <group>
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                                <circleGeometry args={[40, 32]} />
                                <meshBasicMaterial color="#ef4444" opacity={0.4} transparent />
                            </mesh>
                            <mesh position={[0, 10, 0]}>
                                <sphereGeometry args={[15, 16, 16]} />
                                <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={2} />
                            </mesh>
                        </group>
                    )
                }

                {/* FLAMETHROWER — soldier body with fuel tank and flame nozzle */}
                {unit.type === UnitType.FLAMETHROWER && (
                    <group>
                        <Suspense fallback={null}>
                            <InfantryModel unit={unit} />
                        </Suspense>
                        {/* Fuel tank on the back */}
                        <mesh position={[-4, 10, 0]} castShadow>
                            <cylinderGeometry args={[2.5, 2.5, 10]} />
                            <meshStandardMaterial color="#b45309" />
                        </mesh>
                        {/* Pilot flame at the muzzle */}
                        <mesh position={[10, 12, 1]} scale={1 + 0.3 * Math.sin(Date.now() * 0.03)}>
                            <sphereGeometry args={[0.8, 6, 6]} />
                            <meshBasicMaterial color={Math.floor(Date.now() / 120) % 2 === 0 ? '#f97316' : '#fbbf24'} toneMapped={false} />
                        </mesh>
                        {/* Flame burst when attacking (emissive, blooms) */}
                        {firing && (
                            <mesh position={[13, 11, 1]} scale={1 + 0.4 * Math.sin(Date.now() * 0.05)}>
                                <sphereGeometry args={[2.2, 6, 6]} />
                                <meshBasicMaterial color="#f97316" toneMapped={false} transparent opacity={0.85} />
                            </mesh>
                        )}
                    </group>
                )}

                {/* MEDIC — soldier with green cross on helmet */}
                {unit.type === UnitType.MEDIC && (
                    <group>
                        <Suspense fallback={null}>
                            <InfantryModel unit={unit} />
                        </Suspense>
                        {/* Cross above the head */}
                        <group position={[0, 24, 0]}>
                            <mesh><boxGeometry args={[3, 1, 0.5]} /><meshBasicMaterial color="#16a34a" /></mesh>
                            <mesh><boxGeometry args={[1, 3, 0.5]} /><meshBasicMaterial color="#16a34a" /></mesh>
                        </group>
                        {/* Healing glow (emissive) */}
                        {firing && (
                            <mesh position={[0, 27, 0]}>
                                <sphereGeometry args={[1.4, 6, 6]} />
                                <meshBasicMaterial color="#4ade80" toneMapped={false} />
                            </mesh>
                        )}
                    </group>
                )}

                {/* ENGINEER — soldier with hard hat and mine-detector wand */}
                {unit.type === UnitType.ENGINEER && (
                    <group>
                        <Suspense fallback={null}>
                            <InfantryModel unit={unit} />
                        </Suspense>
                        {/* Detector pole + sweeping disc held forward */}
                        <mesh position={[8, 8, 1]} rotation={[0, 0, -Math.PI / 3]}>
                            <cylinderGeometry args={[0.4, 0.4, 12]} />
                            <meshStandardMaterial color="#78716c" />
                            <mesh position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                <cylinderGeometry args={[3, 3, 0.8]} />
                                <meshStandardMaterial color="#57534e" />
                            </mesh>
                        </mesh>
                        {/* Defusing glow (emissive) */}
                        {firing && (
                            <mesh position={[13, 3, 1]}>
                                <sphereGeometry args={[1.4, 6, 6]} />
                                <meshBasicMaterial color="#4ade80" toneMapped={false} />
                            </mesh>
                        )}
                    </group>
                )}

                {/* MORTAR — crewman kneeling beside an angled tube on a baseplate */}
                {unit.type === UnitType.MORTAR && (
                    <group>
                        {/* Crewman */}
                        <group position={[-5, 0, 0]}>
                            <Suspense fallback={null}>
                                <InfantryModel unit={unit} />
                            </Suspense>
                        </group>
                        {/* Mortar tube on baseplate, angled forward */}
                        <group position={[5, 0, 0]}>
                            <mesh position={[0, 0.8, 0]}>
                                <cylinderGeometry args={[4.2, 4.6, 1.4, 10]} />
                                <meshStandardMaterial color="#292524" />
                            </mesh>
                            <mesh position={[2.5, 6.5, 0]} rotation={[0, 0, -Math.PI / 3.4]} castShadow>
                                <cylinderGeometry args={[1.5, 1.9, 15, 10]} />
                                <meshStandardMaterial color="#3f3f46" />
                            </mesh>
                            {/* Bipod */}
                            <mesh position={[-1.5, 4, 1.6]} rotation={[0.35, 0, 0.3]}>
                                <cylinderGeometry args={[0.35, 0.35, 8]} />
                                <meshStandardMaterial color="#52525b" />
                            </mesh>
                            <mesh position={[-1.5, 4, -1.6]} rotation={[-0.35, 0, 0.3]}>
                                <cylinderGeometry args={[0.35, 0.35, 8]} />
                                <meshStandardMaterial color="#52525b" />
                            </mesh>
                            {firing && (
                                <group position={[7, 13, 0]} rotation={[0, 0, Math.PI / 5]}>
                                    <MuzzleFlash size={2.2} />
                                </group>
                            )}
                        </group>
                    </group>
                )}

                {/* JEEP — fast recon 4x4 with roll cage and mounted MG */}
                {unit.type === UnitType.JEEP && (
                    <group>
                        <Suspense fallback={null}>
                            <StaticModel url={MODEL_URL.jeep} targetLen={28} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.5 }]} />
                        </Suspense>
                        {firing && (
                            <group position={[12, 14, 0]}>
                                <MuzzleFlash size={1.2} />
                            </group>
                        )}
                        {/* Rider pip: the jeep's single seat, same cue as the truck's */}
                        {(unit.passengers?.length || 0) > 0 && (
                            <mesh position={[-2, 15.5, 0]}>
                                <sphereGeometry args={[1.3, 6, 6]} />
                                <meshBasicMaterial color="#fbbf24" toneMapped={false} />
                            </mesh>
                        )}
                    </group>
                )}

                {/* TRANSPORT — canvas-topped troop truck; pips show riders aboard */}
                {unit.type === UnitType.TRANSPORT && (
                    <group>
                        <Suspense fallback={null}>
                            <StaticModel url={MODEL_URL.truck} targetLen={40} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.5 }]} />
                        </Suspense>
                        {/* Passenger pips over the canvas */}
                        {Array.from({ length: unit.passengers?.length || 0 }).map((_, i) => (
                            <mesh key={i} position={[-14 + (i % 6) * 4, 21.5, 0]}>
                                <sphereGeometry args={[1.3, 6, 6]} />
                                <meshBasicMaterial color="#fbbf24" toneMapped={false} />
                            </mesh>
                        ))}
                    </group>
                )}

                {/* FIGHTER — swept-wing jet at altitude */}
                {unit.type === UnitType.FIGHTER && (
                    <group rotation={[0, (unit.rotation || 0) - Math.PI / 2, 0]}>
                        <group position={[0, -4, 0]}>
                            <Suspense fallback={null}>
                                <StaticModel url={MODEL_URL.fighter} targetLen={30} axis="z" yaw={Math.PI} tints={[{ materials: ['mat21'], color: teamTint(unit.team), strength: 0.4 }]} />
                            </Suspense>
                        </group>
                        {/* Afterburner glow */}
                        <mesh position={[0, 0, -14.5]}>
                            <sphereGeometry args={[1.8, 8, 8]} />
                            <meshBasicMaterial color="#fb923c" toneMapped={false} />
                        </mesh>
                        {firing && (
                            <group position={[0, -1.5, 14]} rotation={[0, Math.PI / 2, 0]}>
                                <MuzzleFlash size={1.5} />
                            </group>
                        )}
                    </group>
                )}

                {/* APC — boxy armored carrier */}
                {unit.type === UnitType.APC && (
                    <group>
                        <Suspense fallback={null}>
                            <StaticModel url={MODEL_URL.apc} targetLen={42} tints={[{ materials: ['*'], color: teamTint(unit.team), strength: 0.5 }]} />
                        </Suspense>
                        {firing && (
                            <group position={[22, 14, 0]}>
                                <MuzzleFlash size={1.5} />
                            </group>
                        )}
                    </group>
                )}

                {/* BUNKER — concrete fortification */}
                {unit.type === UnitType.BUNKER && (() => {
                    // Under construction: the structure rises out of the ground over
                    // the build time, wrapped in scaffolding, with no gun yet.
                    const building = !!unit.buildUntil && Date.now() < unit.buildUntil;
                    const progress = building
                        ? Math.max(0.08, 1 - (unit.buildUntil! - Date.now()) / BUNKER_BUILD_MS)
                        : 1;
                    const manned = Math.min(unit.garrison || 0, BUNKER_GARRISON_MAX);
                    return (
                    <group scale={[1, progress, 1]}>
                        {building && (
                            <group>
                                {/* Scaffold poles + a hazard banner, so a site reads as a site */}
                                {([[-17, -15], [17, -15], [-17, 15], [17, 15]] as const).map(([sx, sz], i) => (
                                    <mesh key={i} position={[sx, 11 / progress * 0.5, sz]} scale={[1, 1 / Math.max(progress, 0.08), 1]}>
                                        <cylinderGeometry args={[0.5, 0.5, 22]} />
                                        <meshStandardMaterial color="#a16207" roughness={0.9} />
                                    </mesh>
                                ))}
                                <mesh position={[0, 20 / Math.max(progress, 0.08), 0]} scale={[1, 1 / Math.max(progress, 0.08), 1]}>
                                    <boxGeometry args={[30, 2, 1]} />
                                    <meshBasicMaterial color="#fbbf24" toneMapped={false} />
                                </mesh>
                            </group>
                        )}
                        {/* Garrison pips: one per soldier manning a firing slit */}
                        {!building && manned > 0 && Array.from({ length: manned }).map((_, i) => (
                            <mesh key={`g${i}`} position={[-9 + i * 6, 16.5 / progress, 12]}>
                                <boxGeometry args={[3.6, 1.6, 1.6]} />
                                <meshBasicMaterial color={isWest ? '#60a5fa' : eastColor('#f87171')} toneMapped={false} />
                            </mesh>
                        ))}
                        {/* Emplacement (GLB): the gun the garrison mans */}
                        <Suspense fallback={null}>
                            <StaticModel url={MODEL_URL.bunker} targetLen={46} axis="z" yaw={-Math.PI / 2} tints={emplacementTint(unit.team)} />
                        </Suspense>
                        {/* Radio mast with blinking tip */}
                        <mesh position={[-13, 22, 9]}>
                            <cylinderGeometry args={[0.35, 0.5, 14]} />
                            <meshStandardMaterial color="#1f2937" />
                        </mesh>
                        <mesh position={[-13, 29.5, 9]}>
                            <sphereGeometry args={[0.9, 6, 6]} />
                            <meshBasicMaterial color="#f87171" toneMapped={false} transparent opacity={0.35 + 0.65 * Math.abs(Math.sin(Date.now() * 0.004))} />
                        </mesh>
                        {/* Team flag on a corner pole */}
                        <group position={[-13, 20, -12]}>
                            <mesh>
                                <cylinderGeometry args={[0.4, 0.4, 16]} />
                                <meshStandardMaterial color="#57534e" />
                            </mesh>
                            <mesh position={[3.5, 5.5, 0]} rotation={[0, Math.sin(Date.now() * 0.003) * 0.25, 0]}>
                                <boxGeometry args={[7, 4.5, 0.4]} />
                                <meshStandardMaterial color={isWest ? '#3b82f6' : eastColor('#ef4444')} emissive={isWest ? '#3b82f6' : eastColor('#ef4444')} emissiveIntensity={0.25} side={THREE.DoubleSide} />
                            </mesh>
                        </group>
                        {/* Sandbag perimeter guarding the firing arc */}
                        {([[22, -14], [24, -7], [25, 0], [24, 7], [22, 14], [14, -18], [14, 18]] as const).map(([sx, sz], i) => (
                            <group key={i} position={[sx, 0, sz]} rotation={[0, (i * 37) % 7 * 0.15, 0]}>
                                <mesh position={[0, 2.2, 0]} scale={[1, 0.55, 0.8]} castShadow>
                                    <sphereGeometry args={[4.2, 8, 6]} />
                                    <meshStandardMaterial color="#7c6142" roughness={1} />
                                </mesh>
                                <mesh position={[0.8, 5, 0]} scale={[0.85, 0.5, 0.7]} castShadow>
                                    <sphereGeometry args={[4.2, 8, 6]} />
                                    <meshStandardMaterial color="#6b5238" roughness={1} />
                                </mesh>
                            </group>
                        ))}
                        {!building && firing && (
                            <group position={[18, 11, 0]} rotation={[0, -Math.PI / 2, 0]}>
                                <MuzzleFlash size={2} />
                            </group>
                        )}
                    </group>
                    );
                })()}

                {/* Hit flash overlay */}
                {isHit && (
                    <mesh position={[0, 10, 0]}>
                        <boxGeometry args={[unit.width * 0.9 + 4, 22, unit.height * 0.9 + 4]} />
                        <meshBasicMaterial color="#ef4444" transparent opacity={0.45} depthWrite={false} />
                    </mesh>
                )}

                {/* Focus-fire marker: spinning red diamond + pulsing ground ring */}
                {focused && (
                    <group>
                        <group position={[0, (unit.height || 16) + 30, 0]} rotation={[0, Date.now() * 0.006, 0]}>
                            <mesh>
                                <octahedronGeometry args={[4.5]} />
                                <meshBasicMaterial color="#ef4444" toneMapped={false} />
                            </mesh>
                        </group>
                        <mesh
                            position={[0, -yOffset - bobY + 0.7, 0]}
                            rotation={[-Math.PI / 2, 0, 0]}
                            scale={(1 + 0.15 * Math.sin(Date.now() * 0.012)) * (unit.width * 0.9 + 10)}
                        >
                            <ringGeometry args={[0.8, 1, 24]} />
                            <meshBasicMaterial color="#ef4444" transparent opacity={0.8} toneMapped={false} depthWrite={false} />
                        </mesh>
                    </group>
                )}

                {/* Selection ring + per-unit order indicator */}
                {selected && (
                    <mesh
                        position={[0, -yOffset - bobY + 0.6, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        scale={unit.width * 0.9 + 8}
                    >
                        <ringGeometry args={[0.82, 1, 24]} />
                        <meshBasicMaterial color="#a3e635" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
                    </mesh>
                )}
                {/* Reach: the range you are actually buying. Range was invisible —
                    you could not see that a sniper out-ranges a tank, nor that the
                    hill a unit is standing on is lengthening its reach right now
                    (HILL_RANGE_BONUS), which is the whole reason to take the hill. */}
                {selected && (config.range || 0) > 0 && (
                    <mesh
                        position={[0, -yOffset - bobY + 0.4, 0]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        scale={config.range * (unit.isOnHill ? HILL_RANGE_BONUS : 1)}
                    >
                        <ringGeometry args={[0.985, 1, 64]} />
                        <meshBasicMaterial
                            color={unit.isOnHill ? '#fbbf24' : '#a3e635'}
                            transparent
                            opacity={unit.isOnHill ? 0.55 : 0.32}
                            toneMapped={false}
                            depthWrite={false}
                        />
                    </mesh>
                )}
                {unit.orders && (
                    <mesh position={[0, unit.height + 16, 0]}>
                        <sphereGeometry args={[2, 6, 5]} />
                        <meshBasicMaterial color={unit.orders === 'advance' ? '#22c55e' : unit.orders === 'hold' ? '#f59e0b' : '#ef4444'} toneMapped={false} />
                    </mesh>
                )}
                {/* Pinned by incoming fire: dust kicked around his boots. Without a
                    cue, suppression is an invisible mechanic — the player just sees
                    his troops mysteriously bog down. */}
                {!!unit.suppressedUntil && Date.now() < unit.suppressedUntil && (
                    <group position={[0, -yOffset - bobY, 0]}>
                        {[0, 1, 2].map(i => {
                            const a = (Date.now() * 0.004) + (i * Math.PI * 2) / 3;
                            return (
                                <mesh key={i} position={[Math.cos(a) * 7, 2 + Math.sin(Date.now() * 0.01 + i) * 1.2, Math.sin(a) * 7]}>
                                    <sphereGeometry args={[1.5, 5, 4]} />
                                    <meshBasicMaterial color="#a8a29e" transparent opacity={0.5} depthWrite={false} />
                                </mesh>
                            );
                        })}
                    </group>
                )}

                {/* Foxhole: dug-in ground ring + sandbag parapet facing the enemy */}
                {unit.isEntrenched && (
                    <group position={[0, -yOffset - bobY, 0]}>
                        <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                            <ringGeometry args={[unit.width * 0.55, unit.width * 0.55 + 4, 16]} />
                            <meshBasicMaterial color="#44403c" transparent opacity={0.85} depthWrite={false} />
                        </mesh>
                        {[-0.55, 0, 0.55].map((a, i) => (
                            <mesh
                                key={i}
                                position={[
                                    Math.cos(a) * (unit.width * 0.55 + 4) * (unit.team === Team.WEST ? 1 : -1),
                                    2.2,
                                    Math.sin(a) * (unit.width * 0.55 + 4),
                                ]}
                                castShadow
                            >
                                <sphereGeometry args={[3, 6, 5]} />
                                <meshStandardMaterial color="#7c6f43" roughness={1} />
                            </mesh>
                        ))}
                    </group>
                )}

                {/* Veteran stars */}
                {(unit.veterancy || 0) > 0 && (
                    <group position={[0, unit.height + 10, 0]}>
                        {Array.from({ length: unit.veterancy || 0 }).map((_, i) => (
                            <mesh key={i} position={[(i - ((unit.veterancy || 0) - 1) / 2) * 5, 0, 0]}>
                                <sphereGeometry args={[1.6, 5, 4]} />
                                <meshBasicMaterial color="#fbbf24" />
                            </mesh>
                        ))}
                    </group>
                )}

            </group>
        </ClickableGroup >
    );
};

// Smoke screen: a slowly-churning clump of soft grey billows. Deterministic
// per-zone layout (seeded by id) so puffs don't jump between frames.
const SmokeCloud3D = ({ smoke }: { smoke: SmokeZone }) => {
    const puffs = useMemo(() => {
        let seed = 0;
        for (let i = 0; i < smoke.id.length; i++) seed = (seed * 31 + smoke.id.charCodeAt(i)) % 100000;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        return Array.from({ length: 9 }, () => ({
            a: rnd() * Math.PI * 2,
            d: rnd() * smoke.radius * 0.75,
            r: 13 + rnd() * 11,
            h: 6 + rnd() * 14,
            spin: 0.2 + rnd() * 0.5,
            phase: rnd() * Math.PI * 2,
            light: rnd() > 0.5,
        }));
    }, [smoke.id, smoke.radius]);
    // Roll in over ~1.5s, thin out over the last ~2.5s
    const age = smoke.maxLife - smoke.life;
    const fade = Math.min(1, age / 90) * Math.min(1, smoke.life / 150);
    if (fade <= 0) return null;
    const t = Date.now() * 0.001;
    return (
        <group position={[smoke.x, 0, smoke.y]}>
            {puffs.map((p, i) => {
                const drift = p.a + t * 0.05 * p.spin;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(drift) * p.d, p.h + Math.sin(t * p.spin + p.phase) * 2, Math.sin(drift) * p.d]}
                        scale={fade * (1 + 0.08 * Math.sin(t * 1.7 + p.phase))}
                    >
                        <sphereGeometry args={[p.r, 8, 6]} />
                        <meshStandardMaterial color={p.light ? '#d6d3d1' : '#a8a29e'} transparent opacity={0.55 * fade} depthWrite={false} roughness={1} />
                    </mesh>
                );
            })}
        </group>
    );
};

const Projectile3D = ({ proj }: { proj: Projectile }) => {
    if (proj.isMissile) {
        const angle = -Math.atan2(proj.velocity.y, proj.velocity.x);
        return (
            <group position={[proj.position.x, 15, proj.position.y]} rotation={[0, angle, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[2, 2, 12]} />
                    <meshStandardMaterial color="#cbd5e1" />
                </mesh>
                <mesh position={[-5, 0, 0]} rotation={[0, 0, Math.PI / 2]}> {/* Trail/Fins */}
                    <boxGeometry args={[4, 8, 1]} />
                    <meshStandardMaterial color="#94a3b8" />
                </mesh>
                {/* Engine Glow (emissive + bloom instead of a point light) */}
                <mesh position={[-7, 0, 0]}>
                    <sphereGeometry args={[1.6, 6, 6]} />
                    <meshBasicMaterial color="#fb923c" toneMapped={false} />
                </mesh>
            </group>
        );
    }
    return (
        <mesh position={[proj.position.x, 15, proj.position.y]}>
            <sphereGeometry args={[3, 8, 8]} />
            <meshStandardMaterial color={proj.targetType === 'air' ? '#f43f5e' : '#fbbf24'} emissive="#fbbf24" emissiveIntensity={2} />
        </mesh>
    );
};

// -- Instanced rendering for high-count entities --
// Regular particles and projectiles are drawn via a single InstancedMesh each,
// updated imperatively in useFrame. Special cases (beams, text, decals, missiles)
// stay as individual components — they are rare.

const isSpecialParticle = (p: Particle) => !!(p.targetPos || p.text || p.isGroundDecal || p.isBolt || p.isCorpse || p.isShockwave || p.isSkid);

// Jagged vertical lightning bolt from the sky to a strike point
const LightningBolt = ({ p }: { p: Particle }) => {
    // Random jag offsets, stable for this bolt's lifetime
    const segments = useMemo(() => {
        const segs: { x: number, z: number, y: number, h: number }[] = [];
        const SEG_COUNT = 6;
        const TOP = 380;
        let ox = 0, oz = 0;
        for (let i = 0; i < SEG_COUNT; i++) {
            const h = TOP / SEG_COUNT;
            segs.push({ x: ox, z: oz, y: TOP - h * (i + 0.5), h: h + 6 });
            ox += (Math.random() - 0.5) * 26;
            oz += (Math.random() - 0.5) * 16;
        }
        return segs;
    }, []);

    const flicker = p.life % 4 < 2 ? 1 : 0.4;
    return (
        <group position={[p.position.x, 0, p.position.y]}>
            {segments.map((s, i) => (
                <mesh key={i} position={[s.x, s.y, s.z]}>
                    <cylinderGeometry args={[1.4, 1.4, s.h, 5]} />
                    <meshBasicMaterial color={p.color} toneMapped={false} transparent opacity={flicker * Math.min(1, p.life / 6)} />
                </mesh>
            ))}
            <pointLight position={[0, 40, 0]} color="#bae6fd" intensity={8 * flicker} distance={220} />
        </group>
    );
};

const MAX_PARTICLE_INSTANCES = 2048;
const INST_PARTICLE_GEO = new THREE.BoxGeometry(1, 1, 1);
const INST_PARTICLE_MAT = new THREE.MeshStandardMaterial({ color: 'white', transparent: true, opacity: 0.9 });

// ── Instanced ground flats ────────────────────────────────────────────────────
// Scorch decals, crater rims and tread marks are the highest-count objects on a
// busy field (~270 meshes at 37 units). As individual React meshes they each
// allocated a geometry and a material on mount and cost a draw call; now they
// ride in three instanced meshes. Three has no per-instance opacity, so alpha
// comes in as an instanced attribute the shader multiplies into the fragment.
const withInstanceAlpha = <T extends THREE.Material>(mat: T): T => {
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute float aAlpha;\nvarying float vAlpha;\n' +
            shader.vertexShader.replace('void main() {', 'void main() {\n\tvAlpha = aAlpha;');
        shader.fragmentShader = 'varying float vAlpha;\n' +
            shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vAlpha;');
    };
    return mat;
};

const MAX_FLATS = 220;
const GEO_FLAT_DISC = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const GEO_FLAT_RIM = new THREE.TorusGeometry(1, 0.098, 6, 24).rotateX(-Math.PI / 2);
const GEO_FLAT_STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const MAT_FLAT_LIT = withInstanceAlpha(new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 1 }));
const MAT_FLAT_UNLIT = withInstanceAlpha(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));

const useAlphaGeometry = (base: THREE.BufferGeometry, max: number) => useMemo(() => {
    const g = base.clone();
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
    return g;
}, [base, max]);

const InstancedDecals = ({ particles }: { particles: Particle[] }) => {
    const discRef = useRef<THREE.InstancedMesh>(null!);
    const rimRef = useRef<THREE.InstancedMesh>(null!);
    const stripRef = useRef<THREE.InstancedMesh>(null!);
    const discGeo = useAlphaGeometry(GEO_FLAT_DISC, MAX_FLATS);
    const rimGeo = useAlphaGeometry(GEO_FLAT_RIM, MAX_FLATS);
    const stripGeo = useAlphaGeometry(GEO_FLAT_STRIP, MAX_FLATS);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const col = useMemo(() => new THREE.Color(), []);

    useFrame(() => {
        const disc = discRef.current, rim = rimRef.current, strip = stripRef.current;
        if (!disc || !rim || !strip) return;
        const discA = disc.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
        const rimA = rim.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
        const stripA = strip.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
        let d = 0, r = 0, s = 0;

        const put = (mesh: THREE.InstancedMesh, i: number, color: string, alpha: number, attr: THREE.InstancedBufferAttribute) => {
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, col.set(color));
            attr.setX(i, alpha);
        };

        for (const p of particles) {
            if (p.isGroundDecal) {
                const alpha = Math.min(0.85, p.life / 600);
                if (d < MAX_FLATS) {
                    dummy.position.set(p.position.x, 0.2, p.position.y);
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.set(p.size, 1, p.size);
                    put(disc, d++, p.color, alpha, discA);
                }
                if (p.size >= 30) {
                    if (d < MAX_FLATS) { // burnt core
                        dummy.position.set(p.position.x, 0.35, p.position.y);
                        dummy.scale.set(p.size * 0.45, 1, p.size * 0.45);
                        put(disc, d++, '#0c0a09', alpha, discA);
                    }
                    if (r < MAX_FLATS) { // raised earth rim
                        dummy.position.set(p.position.x, 0.6, p.position.y);
                        dummy.rotation.set(0, 0, 0);
                        dummy.scale.setScalar(p.size * 0.92);
                        put(rim, r++, '#44403c', alpha, rimA);
                    }
                }
            } else if (p.isSkid) {
                const alpha = Math.min(0.14, p.life / 2800);
                for (const side of [-1, 1]) {
                    if (s >= MAX_FLATS) break;
                    const rot = p.rot ?? 0;
                    const off = side * p.size * 0.34;
                    dummy.position.set(
                        p.position.x - Math.sin(-rot) * off,
                        0.15,
                        p.position.y + Math.cos(-rot) * off,
                    );
                    dummy.rotation.set(0, -rot, 0);
                    dummy.scale.set(p.size * 1.8, 1, p.size * 0.22);
                    put(strip, s++, p.color, alpha, stripA);
                }
            }
        }

        for (const [mesh, count, attr] of [[disc, d, discA], [rim, r, rimA], [strip, s, stripA]] as const) {
            mesh.count = count;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            attr.needsUpdate = true;
        }
    });

    return (
        <>
            <instancedMesh ref={discRef} args={[discGeo, MAT_FLAT_LIT, MAX_FLATS]} frustumCulled={false} receiveShadow />
            <instancedMesh ref={rimRef} args={[rimGeo, MAT_FLAT_LIT, MAX_FLATS]} frustumCulled={false} receiveShadow />
            <instancedMesh ref={stripRef} args={[stripGeo, MAT_FLAT_UNLIT, MAX_FLATS]} frustumCulled={false} />
        </>
    );
};

// Per-unit overlays — team ring, health bar, shadow blob under aircraft. These
// are pure decoration but there is one set per unit, so as loose meshes they
// grew the draw call count linearly with army size (~4 per unit, doubled by the
// shadow pass). Instanced, the whole field costs four draw calls no matter how
// many units are fighting.
const MAX_UNIT_INSTANCES = 400;
const GEO_RING_FLAT = new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2);
const GEO_BLOB_FLAT = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const MAT_INST_RING = withInstanceAlpha(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
const MAT_INST_BLOB = withInstanceAlpha(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
const MAT_INST_BAR = new THREE.MeshBasicMaterial();

// Airborne units hang under a parachute on the way in; drones and fighters fly.
const unitYOffset = (unit: Unit) => {
    if (unit.type === UnitType.AIRBORNE) {
        const t = Date.now() - (unit.spawnTime || 0);
        return t < 3000 ? 200 * (1 - Math.min(1, t / 3000)) : 0;
    }
    if (unit.type === UnitType.DRONE) return 25;
    if (unit.type === UnitType.FIGHTER) return 42;
    return 0;
};

const InstancedUnitOverlays = ({ units, terrain, cbMode }: { units: Unit[], terrain: TerrainObject[], cbMode: boolean }) => {
    const ringRef = useRef<THREE.InstancedMesh>(null!);
    const blobRef = useRef<THREE.InstancedMesh>(null!);
    const barRef = useRef<THREE.InstancedMesh>(null!);
    const ringGeo = useAlphaGeometry(GEO_RING_FLAT, MAX_UNIT_INSTANCES);
    const blobGeo = useAlphaGeometry(GEO_BLOB_FLAT, MAX_UNIT_INSTANCES);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const col = useMemo(() => new THREE.Color(), []);

    useFrame(() => {
        const ring = ringRef.current, blob = blobRef.current, bar = barRef.current;
        if (!ring || !blob || !bar) return;
        const ringA = ring.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
        const blobA = blob.geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
        let r = 0, b = 0, h = 0;

        for (const u of units) {
            const cfg = UNIT_CONFIG[u.type] as any;
            const groundY = getTerrainHeight(u.position.x, u.position.y, terrain);
            const yOff = unitYOffset(u);

            // Team ring (hidden traps have none)
            if (r < MAX_UNIT_INSTANCES &&
                u.type !== UnitType.MINE_PERSONAL && u.type !== UnitType.MINE_TANK && u.type !== UnitType.NAPALM) {
                const s = u.width * 0.75 + 6;
                dummy.position.set(u.position.x, groundY + 0.5, u.position.y);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(s, 1, s);
                dummy.updateMatrix();
                ring.setMatrixAt(r, dummy.matrix);
                ring.setColorAt(r, col.set(u.team === Team.WEST ? '#3b82f6' : (cbMode ? '#f59e0b' : '#ef4444')));
                ringA.setX(r, 0.35);
                r++;
            }

            // Shadow blob under aircraft
            if (b < MAX_UNIT_INSTANCES && cfg.isFlying) {
                const s = u.width * 0.5;
                dummy.position.set(u.position.x, 0.3, u.position.y);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(s, 1, s);
                dummy.updateMatrix();
                blob.setMatrixAt(b, dummy.matrix);
                blob.setColorAt(b, col.set('#000000'));
                blobA.setX(b, 0.25);
                b++;
            }

            // Health bar: background + fill, only once damaged
            if (u.health < u.maxHealth && h + 1 < MAX_UNIT_INSTANCES) {
                const frac = Math.max(0, Math.min(1, u.health / u.maxHealth));
                const y = groundY + yOff + 20;
                dummy.rotation.set(0, 0, 0);

                dummy.position.set(u.position.x, y, u.position.y);
                dummy.scale.set(20, 1, 1);
                dummy.updateMatrix();
                bar.setMatrixAt(h, dummy.matrix);
                bar.setColorAt(h, col.set('#1c1917'));
                h++;

                dummy.position.set(u.position.x - 10 + 10 * frac, y, u.position.y + 0.5);
                dummy.scale.set(Math.max(0.01, 20 * frac), 1, 1);
                dummy.updateMatrix();
                bar.setMatrixAt(h, dummy.matrix);
                bar.setColorAt(h, col.set(frac > 0.6 ? '#22c55e' : frac > 0.3 ? '#eab308' : '#ef4444'));
                h++;
            }
        }

        ring.count = r; blob.count = b; bar.count = h;
        for (const [m, a] of [[ring, ringA], [blob, blobA]] as const) {
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
            a.needsUpdate = true;
        }
        bar.instanceMatrix.needsUpdate = true;
        if (bar.instanceColor) bar.instanceColor.needsUpdate = true;
    });

    return (
        <>
            <instancedMesh ref={ringRef} args={[ringGeo, MAT_INST_RING, MAX_UNIT_INSTANCES]} frustumCulled={false} />
            <instancedMesh ref={blobRef} args={[blobGeo, MAT_INST_BLOB, MAX_UNIT_INSTANCES]} frustumCulled={false} />
            <instancedMesh ref={barRef} args={[GEO_HEALTH_BAR, MAT_INST_BAR, MAX_UNIT_INSTANCES]} frustumCulled={false} />
        </>
    );
};

// Drag a box over your own army to select it — the RTS gesture that was simply
// missing (left-drag orbited the camera instead, so no marquee ever appeared).
// Lives inside the Canvas because picking needs the live camera to project each
// unit's field position to the screen.
export type Marquee = { x1: number, y1: number, x2: number, y2: number } | null;

const BoxSelect = ({ units, selectTeam, disabled, onBoxSelect, onMarquee, onDragStart }: {
    units: Unit[],
    selectTeam?: Team | null,
    disabled?: boolean,
    onBoxSelect?: (team: Team, ids: string[]) => void,
    onMarquee?: (m: Marquee) => void,
    onDragStart?: () => void,
}) => {
    const { camera, gl } = useThree();
    // Units churn every frame; read them through a ref so the listeners below
    // aren't torn down and re-attached 60 times a second.
    const unitsRef = useRef(units);
    unitsRef.current = units;
    const stateRef = useRef({ selectTeam, disabled });
    stateRef.current = { selectTeam, disabled };

    const start = useRef<{ x: number, y: number } | null>(null);
    const dragging = useRef(false);

    useEffect(() => {
        const el = gl.domElement;
        const DRAG_SLOP = 6; // below this it's a click, and clicks still select single units

        const down = (e: PointerEvent) => {
            const { selectTeam: team, disabled: off } = stateRef.current;
            if (e.button !== 0 || e.pointerType !== 'mouse' || !team || off) return;
            start.current = { x: e.clientX, y: e.clientY };
            dragging.current = false;
            onDragStart?.();
        };

        const move = (e: PointerEvent) => {
            if (!start.current) return;
            if (!dragging.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < DRAG_SLOP) return;
            dragging.current = true;
            onMarquee?.({ x1: start.current.x, y1: start.current.y, x2: e.clientX, y2: e.clientY });
        };

        const up = (e: PointerEvent) => {
            const team = stateRef.current.selectTeam;
            if (start.current && dragging.current && team) {
                const rect = el.getBoundingClientRect();
                const minX = Math.min(start.current.x, e.clientX), maxX = Math.max(start.current.x, e.clientX);
                const minY = Math.min(start.current.y, e.clientY), maxY = Math.max(start.current.y, e.clientY);
                const v = new THREE.Vector3();
                const ids = unitsRef.current.filter(u => {
                    if (u.team !== team || u.health <= 0 || u.boarded) return false;
                    if (u.type === UnitType.MINE_PERSONAL || u.type === UnitType.MINE_TANK || u.type === UnitType.NAPALM) return false;
                    v.set(u.position.x, 8, u.position.y).project(camera);
                    if (v.z > 1) return false; // behind the camera
                    const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
                    const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
                    return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
                }).map(u => u.id);
                onBoxSelect?.(team, ids);
            }
            start.current = null;
            dragging.current = false;
            onMarquee?.(null);
        };

        el.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            el.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [camera, gl, onBoxSelect, onMarquee, onDragStart]);

    return null;
};

const InstancedParticles = ({ particles }: { particles: Particle[] }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colorObj = useMemo(() => new THREE.Color(), []);

    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        let count = 0;
        for (const p of particles) {
            if (isSpecialParticle(p)) continue;
            if (count >= MAX_PARTICLE_INSTANCES) break;
            // Fade by shrinking (per-instance opacity is not supported)
            const fade = Math.max(0.05, Math.min(1, p.life / 30));
            const s = Math.max(0.01, p.size * (0.4 + 0.6 * fade));
            const y = p.alt !== undefined ? p.alt : 10 + (30 - p.life);
            dummy.position.set(p.position.x, y, p.position.y);
            dummy.scale.set(s, s, s);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(count, dummy.matrix);
            colorObj.set(p.color);
            mesh.setColorAt(count, colorObj);
            count++;
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[INST_PARTICLE_GEO, INST_PARTICLE_MAT, MAX_PARTICLE_INSTANCES]}
            frustumCulled={false}
        />
    );
};

const MAX_PROJECTILE_INSTANCES = 512;
const INST_PROJECTILE_GEO = new THREE.SphereGeometry(3, 8, 8);
const INST_PROJECTILE_MAT = new THREE.MeshBasicMaterial({ color: 'white', toneMapped: false });
const COLOR_PROJ_AIR = new THREE.Color('#f43f5e');
const COLOR_PROJ_GROUND = new THREE.Color('#fbbf24');
// setColorAt runs per projectile per frame — cache the Color objects rather than
// allocating one per round in flight.
const ROUND_COLOR_CACHE = new Map<string, THREE.Color>();
const roundColor = (hex: string) => {
    let c = ROUND_COLOR_CACHE.get(hex);
    if (!c) { c = new THREE.Color(hex); ROUND_COLOR_CACHE.set(hex, c); }
    return c;
};

const InstancedProjectiles = ({ projectiles }: { projectiles: Projectile[] }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        let count = 0;
        for (const proj of projectiles) {
            if (proj.isMissile) continue; // rendered as Projectile3D (has pointLight)
            if (count >= MAX_PROJECTILE_INSTANCES) break;
            // Indirect fire LOBS: the shell climbs and falls across its flight,
            // which is the whole reason it out-ranges everything and clears cover.
            // Flat-trajectory rounds keep the old fixed height.
            let alt = 15;
            if (proj.arcH && proj.flightDist) {
                const t = Math.min(1, proj.distanceTraveled / proj.flightDist);
                alt = 15 + Math.sin(Math.PI * t) * proj.arcH;
            }
            dummy.position.set(proj.position.x, alt, proj.position.y);
            // Stretch into a tracer along the flight direction. Size and color come
            // from the shot: a tank shell is a fat glowing slug, a sniper round a
            // thin pale streak — they used to be the same 3.4x0.65 dash.
            const round = proj.sourceType ? getRoundFx(proj.sourceType) : DEFAULT_ROUND_FX;
            dummy.rotation.set(0, -Math.atan2(proj.velocity.y, proj.velocity.x), 0);
            dummy.scale.set(round.len, round.girth, round.girth);
            dummy.updateMatrix();
            mesh.setMatrixAt(count, dummy.matrix);
            mesh.setColorAt(count, proj.targetType === 'air'
                ? COLOR_PROJ_AIR
                : roundColor(round.color));
            count++;
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh
            ref={meshRef}
            args={[INST_PROJECTILE_GEO, INST_PROJECTILE_MAT, MAX_PROJECTILE_INSTANCES]}
            frustumCulled={false}
        />
    );
};

const Particle3D = ({ p }: { p: Particle }) => {
    // Sky-to-ground lightning bolt
    if (p.isBolt) return <LightningBolt p={p} />;

    // Expanding shockwave ring hugging the ground
    if (p.isShockwave) {
        const SHOCK_LIFE = 18;
        const t = 1 - Math.max(0, p.life) / SHOCK_LIFE; // 0 -> 1
        const radius = Math.max(1, p.size * (0.15 + 0.85 * t));
        const opacity = (1 - t) * 0.75;
        return (
            <mesh position={[p.position.x, 0.8, p.position.y]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[radius * 0.82, radius, 32]} />
                <meshBasicMaterial color={p.color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
            </mesh>
        );
    }

    // Fallen body / burnt wreck lying on the ground
    if (p.isCorpse) {
        const seed = p.id.charCodeAt(0) * 31 + p.id.charCodeAt(p.id.length - 1) * 7;
        const rotY = (seed % 628) / 100;
        const opacity = Math.min(0.9, p.life / 80);
        const isWreck = p.size > 20;
        return (
            <group position={[p.position.x, isWreck ? 4 : 1.2, p.position.y]} rotation={[0, rotY, 0]}>
                <mesh castShadow>
                    <boxGeometry args={isWreck ? [p.size, 8, p.size * 0.6] : [p.size, 2.5, p.size * 0.35]} />
                    <meshStandardMaterial color={p.color} transparent opacity={opacity} roughness={1} />
                </mesh>
                {isWreck && (
                    /* Charred turret stump + smoke glow */
                    <mesh position={[0, 6, 0]} castShadow>
                        <boxGeometry args={[p.size * 0.4, 5, p.size * 0.35]} />
                        <meshStandardMaterial color="#0c0a09" transparent opacity={opacity} roughness={1} />
                    </mesh>
                )}
            </group>
        );
    }

    // Lightning / Beam Logic
    if (p.targetPos) {
        const dx = p.targetPos.x - p.position.x;
        const dy = p.targetPos.y - p.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = -Math.atan2(dy, dx);
        const midX = (p.position.x + p.targetPos.x) / 2;
        const midY = (p.position.y + p.targetPos.y) / 2;

        return (
            <mesh position={[midX, 20, midY]} rotation={[0, angle, 0]}>
                <boxGeometry args={[dist, p.size, p.size]} />
                <meshBasicMaterial color={p.color} toneMapped={false} />
            </mesh>
        );
    }

    // Floating bounty text ("+$110"). Drawn as a cached canvas-texture sprite
    // rather than drei's <Text>: troika allocates a geometry and a texture per
    // instance and they were never freed, so a long match bled GPU memory
    // (geometries and textures climbed without bound as kills piled up). There
    // are only a handful of distinct amounts, so one texture each covers a
    // whole match.
    if (p.text) {
        const mat = bountyMaterial(p.text);
        return (
            <sprite
                position={[p.position.x, 20 + (90 - p.life) * 0.5, p.position.y]}
                scale={[mat.userData.w, mat.userData.h, 1]}
                material={mat}
            />
        );
    }

    // Tread marks and scorch decals are drawn by <InstancedDecals>: they are the
    // highest-count objects in a battle and cost a draw call (plus a fresh
    // geometry and material on every mount) as loose meshes.
    if (p.isSkid || p.isGroundDecal) return null;

    return (
        <mesh position={[p.position.x, 10 + (30 - p.life), p.position.y]}>
            <boxGeometry args={[p.size, p.size, p.size]} />
            <meshStandardMaterial color={p.color} transparent opacity={p.life / 30} />
        </mesh>
    );
};

// Blinking indicator light driven by useFrame so it keeps animating inside
// memoized parents that skip React re-renders.
const Blinker = ({ position, size = 0.8, period = 900 }: { position: [number, number, number], size?: number, period?: number }) => {
    const matRef = useRef<THREE.MeshBasicMaterial>(null!);
    useFrame(() => {
        if (matRef.current) matRef.current.color.set(Math.floor(Date.now() / period) % 2 === 0 ? '#ef4444' : '#450a0a');
    });
    return (
        <mesh position={position}>
            <sphereGeometry args={[size, 6, 6]} />
            <meshBasicMaterial ref={matRef} color="#ef4444" toneMapped={false} />
        </mesh>
    );
};

// Bobbing wrench over a broken bridge: "send an engineer here"
const RepairMarker = () => {
    const ref = useRef<THREE.Group>(null!);
    useFrame(() => {
        if (ref.current) {
            ref.current.position.y = 28 + Math.sin(Date.now() * 0.004) * 4;
            ref.current.rotation.y = Date.now() * 0.002;
        }
    });
    return (
        <group ref={ref} position={[0, 28, 0]}>
            {/* Wrench: open ring head + angled handle */}
            <mesh rotation={[0, 0, Math.PI / 4]}>
                <torusGeometry args={[3, 1.1, 6, 12, Math.PI * 1.5]} />
                <meshBasicMaterial color="#fbbf24" toneMapped={false} />
            </mesh>
            <mesh position={[3.2, -3.2, 0]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[2, 9, 2]} />
                <meshBasicMaterial color="#fbbf24" toneMapped={false} />
            </mesh>
        </group>
    );
};

const TerrainItemInner = ({ item, onCanvasClick, mapType }: { item: TerrainObject, itemState?: TerrainObject['state'], itemHealth?: number, onCanvasClick: (x: number, y: number) => void, mapType?: MapType }) => {
    // River handled by RiverRenderer now
    // if (item.type === 'river') { ... } 

    if (item.type === 'bridge') {
        const width = item.width || 85;
        const height = item.height || 40;

        // Collapsed: two charred halves sagging into the water
        if (item.state === 'broken') {
            return (
                <group position={[item.x, 0.5, item.y]}>
                    <mesh position={[-width * 0.28, -1.5, 0]} rotation={[0, 0, 0.35]} castShadow>
                        <boxGeometry args={[width * 0.42, 1, height]} />
                        <meshStandardMaterial color="#292524" roughness={1} />
                    </mesh>
                    <mesh position={[width * 0.28, -1.5, 0]} rotation={[0, 0, -0.35]} castShadow>
                        <boxGeometry args={[width * 0.42, 1, height]} />
                        <meshStandardMaterial color="#292524" roughness={1} />
                    </mesh>
                    <RepairMarker />
                </group>
            );
        }

        const damaged = (item.health ?? 320) < 320;
        return (
            <group position={[item.x, 0.5, item.y]}>
                {/* Bridge Deck (darkens when damaged) */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[width, 1, height]} />
                    <meshStandardMaterial color={damaged ? '#57350f' : '#78350f'} roughness={0.9} />
                </mesh>
                {/* Railings */}
                <mesh position={[0, 2, -height / 2 + 1]}>
                    <boxGeometry args={[width, 2, 1]} />
                    <meshStandardMaterial color="#4b5563" />
                </mesh>
                <mesh position={[0, 2, height / 2 - 1]}>
                    <boxGeometry args={[width, 2, 1]} />
                    <meshStandardMaterial color="#4b5563" />
                </mesh>
            </group>
        );
    }

    if (item.type === 'crate' || item.type === 'barrel') {
        const s = item.size;
        const seed = Math.abs((item.x * 7919) ^ (item.y * 104729));
        const yaw = (seed % 628) / 100;

        if (item.state === 'broken') {
            return item.type === 'crate' ? (
                // Splintered planks left where the crate stood
                <group position={[item.x, 0.3, item.y]} rotation={[0, yaw, 0]}>
                    {([[-s * 0.4, 0.25], [s * 0.3, -0.5], [0, 1.1]] as const).map(([ox, r], i) => (
                        <mesh key={i} position={[ox, 0.2, (i - 1) * s * 0.3]} rotation={[0, r, 0]}>
                            <boxGeometry args={[s * 1.4, 0.5, s * 0.32]} />
                            <meshStandardMaterial color="#5c4326" roughness={1} />
                        </mesh>
                    ))}
                </group>
            ) : (
                // Burst barrel: charred shell tipped over on a scorch ring
                <group position={[item.x, 0.3, item.y]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
                        <circleGeometry args={[s * 1.2, 12]} />
                        <meshBasicMaterial color="#1c1917" transparent opacity={0.45} depthWrite={false} />
                    </mesh>
                    <mesh position={[s * 0.4, s * 0.35, 0]} rotation={[0.4, yaw, 1.3]}>
                        <cylinderGeometry args={[s * 0.42, s * 0.42, s * 1.05, 8]} />
                        <meshStandardMaterial color="#450a0a" roughness={1} />
                    </mesh>
                </group>
            );
        }

        return item.type === 'crate' ? (
            <group position={[item.x, 0, item.y]} rotation={[0, yaw, 0]}>
                <mesh position={[0, s * 0.5, 0]} castShadow>
                    <boxGeometry args={[s, s, s]} />
                    <meshStandardMaterial color="#8a6a3b" roughness={0.95} />
                </mesh>
                {/* Lid plank */}
                <mesh position={[0, s + 0.12, 0]}>
                    <boxGeometry args={[s * 1.04, 0.25, s * 0.26]} />
                    <meshStandardMaterial color="#6b4f2a" roughness={1} />
                </mesh>
            </group>
        ) : (
            <group position={[item.x, 0, item.y]}>
                <mesh position={[0, s * 0.7, 0]} castShadow>
                    <cylinderGeometry args={[s * 0.5, s * 0.5, s * 1.4, 10]} />
                    <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
                </mesh>
                {/* Band */}
                <mesh position={[0, s * 0.7, 0]}>
                    <cylinderGeometry args={[s * 0.52, s * 0.52, s * 0.16, 10]} />
                    <meshStandardMaterial color="#450a0a" />
                </mesh>
            </group>
        );
    }

    if (item.type === 'hill') {
        const radius = item.size;
        const height = 40; // Matches logic
        const plateauRadius = radius * 0.5;
        const hillSeed = Math.abs((item.x * 92837111) ^ (item.y * 689287499));

        // Desert: smooth wind-blown dune (hemisphere squashed to gameplay height)
        if (mapType === MapType.DESERT) {
            return (
                <ClickableGroup position={[item.x, 0, item.y]} onCanvasClick={onCanvasClick}>
                    <mesh position={[0, 1, 0]} scale={[radius, height + 4, radius * 0.85]} receiveShadow castShadow>
                        <sphereGeometry args={[1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
                        <meshStandardMaterial color="#b45309" roughness={1} />
                    </mesh>
                    {/* Wind ripple crest */}
                    <mesh position={[radius * 0.25, 1, radius * 0.3]} scale={[radius * 0.55, height * 0.5, radius * 0.4]} castShadow>
                        <sphereGeometry args={[1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
                        <meshStandardMaterial color="#c2620c" roughness={1} />
                    </mesh>
                </ClickableGroup>
            );
        }

        // Urban: rubble mound — piled concrete chunks with jutting rebar
        if (mapType === MapType.URBAN) {
            return (
                <ClickableGroup position={[item.x, 0, item.y]} onCanvasClick={onCanvasClick}>
                    <mesh position={[0, height * 0.35, 0]} scale={[radius * 0.95, height * 0.75, radius * 0.85]} receiveShadow castShadow>
                        <dodecahedronGeometry args={[1, 0]} />
                        <meshStandardMaterial color="#57534e" roughness={1} />
                    </mesh>
                    {[0.6, 1.9, 3.3, 4.8].map((a, i) => (
                        <mesh key={i}
                            position={[Math.cos(a) * radius * 0.5, height * (0.18 + (hillSeed >> i) % 3 * 0.08), Math.sin(a) * radius * 0.5]}
                            rotation={[a, a * 2, 0]} castShadow>
                            <boxGeometry args={[radius * 0.3, radius * 0.14, radius * 0.22]} />
                            <meshStandardMaterial color={i % 2 === 0 ? '#44403c' : '#6b7280'} roughness={1} />
                        </mesh>
                    ))}
                    {/* Rebar */}
                    {[1.2, 3.9].map((a, i) => (
                        <mesh key={i} position={[Math.cos(a) * radius * 0.3, height * 0.7, Math.sin(a) * radius * 0.3]} rotation={[0.4, 0, a]}>
                            <cylinderGeometry args={[0.35, 0.35, 16]} />
                            <meshStandardMaterial color="#7c2d12" roughness={1} />
                        </mesh>
                    ))}
                </ClickableGroup>
            );
        }

        // Countryside / archipelago: grassy plateau
        return (
            <ClickableGroup position={[item.x, height / 2 - 1, item.y]} onCanvasClick={onCanvasClick}>
                {/* Truncated Cone for Plateau */}
                <mesh receiveShadow>
                    <cylinderGeometry args={[plateauRadius, radius, height, 32]} />
                    <meshStandardMaterial color="#4d7c0f" roughness={0.9} />
                </mesh>
                {/* Worn plateau cap */}
                <mesh position={[0, height / 2 + 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[plateauRadius * 0.85, 24]} />
                    <meshStandardMaterial color="#3f6212" roughness={1} />
                </mesh>
                {/* Rocky outcrops on the slope */}
                {[0.9, 2.4, 4.1].map((a, i) => (
                    <mesh key={i} position={[Math.cos(a) * radius * 0.75, -height * 0.2, Math.sin(a) * radius * 0.75]} castShadow>
                        <dodecahedronGeometry args={[radius * 0.12, 0]} />
                        <meshStandardMaterial color="#57534e" roughness={1} />
                    </mesh>
                ))}
            </ClickableGroup>
        );
    } else if (item.type === 'rock') {
        const rockSeed = Math.abs((item.x * 73856093) ^ (item.y * 19349663));
        return (
            <ClickableGroup position={[item.x, item.size / 2, item.y]} onCanvasClick={onCanvasClick}>
                <mesh castShadow receiveShadow rotation={[item.size, item.x, item.y]} scale={item.size} geometry={GEO_CLUMP} material={stdMat('#57534e')} />
                {/* Smaller companion boulders */}
                <mesh position={[item.size * 0.9, -item.size * 0.25, item.size * 0.4]} rotation={[rockSeed % 3, rockSeed % 5, 0]} scale={item.size * 0.45} castShadow geometry={GEO_CLUMP} material={stdMat('#4b4642')} />
                {rockSeed % 2 === 0 && (
                    <mesh position={[-item.size * 0.8, -item.size * 0.3, -item.size * 0.35]} rotation={[rockSeed % 4, 0, rockSeed % 3]} scale={item.size * 0.35} castShadow geometry={GEO_CLUMP} material={stdMat('#6b6560')} />
                )}
            </ClickableGroup>
        );
    } else if (item.type === 'building') {
        const seed = Math.abs((item.x * 73856093) ^ (item.y * 19349663));
        const h = 30 + (seed % 40); // Varied height 30-70
        const w = item.width || 30;
        const d = item.height || 30;
        const wallColor = item.state === 'burnt' ? '#1c1917' : (seed % 3 === 0 ? '#374151' : seed % 3 === 1 ? '#4b5563' : '#6b7280');
        const roofProp = seed % 4; // 0 water tank, 1 AC units, 2 antenna, 3 bare
        const hasSetback = h > 52;
        return (
            <ClickableGroup position={[item.x, h / 2, item.y]} onCanvasClick={onCanvasClick}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[w, h, d]} />
                    <meshStandardMaterial color={wallColor} roughness={0.85} />
                </mesh>
                {/* Sidewalk base */}
                <mesh position={[0, -h / 2 + 0.4, 0]} receiveShadow>
                    <boxGeometry args={[w + 10, 0.8, d + 10]} />
                    <meshStandardMaterial color="#6b7280" roughness={1} />
                </mesh>
                {/* Roof */}
                <mesh position={[0, h / 2 + 1, 0]}>
                    <boxGeometry args={[w + 2, 2, d + 2]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.9} />
                </mesh>
                {/* Upper-floor setback on taller buildings */}
                {hasSetback && (
                    <mesh position={[0, h / 2 + 7, 0]} castShadow>
                        <boxGeometry args={[w - 8, 12, d - 8]} />
                        <meshStandardMaterial color={wallColor} roughness={0.85} />
                    </mesh>
                )}
                {/* Rooftop props (seeded) */}
                {item.state !== 'burnt' && roofProp === 0 && (
                    <group position={[w * 0.22, h / 2 + (hasSetback ? 13 : 0), -d * 0.2]}>
                        <mesh position={[0, 6, 0]} castShadow>
                            <cylinderGeometry args={[4, 4, 7, 10]} />
                            <meshStandardMaterial color="#7c5f46" roughness={1} />
                        </mesh>
                        {[[-2.5, -2.5], [2.5, 2.5], [-2.5, 2.5], [2.5, -2.5]].map(([lx, lz], i) => (
                            <mesh key={i} position={[lx, 1.5, lz]}>
                                <cylinderGeometry args={[0.4, 0.4, 5]} />
                                <meshStandardMaterial color="#44403c" />
                            </mesh>
                        ))}
                    </group>
                )}
                {item.state !== 'burnt' && roofProp === 1 && [[-w * 0.2, d * 0.15], [w * 0.18, -d * 0.18]].map(([lx, lz], i) => (
                    <mesh key={i} position={[lx, h / 2 + 3.5, lz]} castShadow>
                        <boxGeometry args={[6, 3.5, 5]} />
                        <meshStandardMaterial color="#9ca3af" roughness={0.8} />
                    </mesh>
                ))}
                {item.state !== 'burnt' && roofProp === 2 && (
                    <group position={[-w * 0.2, h / 2 + (hasSetback ? 13 : 0), d * 0.15]}>
                        <mesh position={[0, 7, 0]}>
                            <cylinderGeometry args={[0.3, 0.5, 14]} />
                            <meshStandardMaterial color="#71717a" />
                        </mesh>
                        <Blinker position={[0, 14, 0]} />
                    </group>
                )}
                {/* Window grid — rooms light up amber at night */}
                {(() => {
                    const night = getDayFactor() < 0.35 && item.state !== 'burnt';
                    const rows = Math.max(2, Math.floor(h / 16));
                    const cols = 3;
                    const winds = [];
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const lit = night && ((seed + r * 7 + c * 13) % 5) < 2;
                            winds.push(
                                // Camera-facing (+Z) wall
                                <mesh key={`${r}-${c}`} position={[(c - 1) * (w / 3.4), (r + 0.7) * (h / (rows + 1)) - h / 2, d / 2 + 0.15]}>
                                    <boxGeometry args={[w * 0.18, 5, 0.4]} />
                                    <meshBasicMaterial color={lit ? '#fbbf24' : '#111827'} toneMapped={!lit} />
                                </mesh>
                            );
                        }
                    }
                    return winds;
                })()}
            </ClickableGroup>
        );
    } else {
        // Tree Variety based on position hash
        const seed = Math.abs((item.x * 73856093) ^ (item.y * 19349663));
        const type = seed % 3; // 0: Pine, 1: Oak, 2: Poplar
        const scaleMod = 1 + (seed % 50) / 100; // 1.0 - 1.5

        let trunkColor = "#451a03";
        let leavesColor = type === 0 ? "#14532d" : (type === 1 ? "#166534" : "#15803d");
        let rot: [number, number, number] = [0, 0, 0];
        let yOffset = 0;

        // Tree State Visuals
        if (item.state === 'burnt') {
            trunkColor = "#1c1917"; // Burnt wood
            leavesColor = "#262626"; // Ash
        } else if (item.state === 'burning') {
            const flicker = Math.floor(Date.now() / 100) % 2 === 0;
            leavesColor = flicker ? "#f97316" : "#fbbf24"; // Fire (bloom via emissive below)
        } else if (item.state === 'broken') {
            rot = [Math.PI / 2, 0, seed % 3]; // Fallen
            yOffset = -5;
        }
        const burningEmissive = item.state === 'burning' ? leavesColor : '#000000';

        const leafMat = stdMat(leavesColor, burningEmissive);
        return (
            <ClickableGroup position={[item.x, 0, item.y]} onCanvasClick={onCanvasClick}>
                <group rotation={rot} position={[0, yOffset, 0]} scale={scaleMod}>
                    {/* Trunk */}
                    <mesh position={[0, 15, 0]} castShadow geometry={GEO_TRUNK} material={stdMat(trunkColor)} />

                    {/* Leaves */}
                    {type === 0 && ( // Pine — three stacked tiers
                        <group>
                            <mesh position={[0, 34, 0]} castShadow geometry={GEO_PINE_1} material={leafMat} />
                            <mesh position={[0, 50, 0]} castShadow geometry={GEO_PINE_2} material={leafMat} />
                            <mesh position={[0, 64, 0]} castShadow geometry={GEO_PINE_3} material={leafMat} />
                        </group>
                    )}
                    {type === 1 && ( // Oak — clustered canopy
                        <group>
                            <mesh position={[0, 50, 0]} scale={22} castShadow geometry={GEO_CLUMP} material={leafMat} />
                            <mesh position={[12, 42, 6]} scale={14} castShadow geometry={GEO_CLUMP} material={leafMat} />
                            <mesh position={[-11, 44, -5]} scale={13} castShadow geometry={GEO_CLUMP} material={leafMat} />
                        </group>
                    )}
                    {type === 2 && ( // Poplar
                        <mesh position={[0, 45, 0]} castShadow geometry={GEO_POPLAR} material={leafMat} />
                    )}

                </group>
            </ClickableGroup>
        );
    }
};

// Terrain only changes on state/health transitions — memoize aggressively.
// Burning trees keep their flicker by opting out while state === 'burning'.
const TerrainItem = React.memo(TerrainItemInner, (prev, next) =>
    prev.item === next.item &&
    prev.mapType === next.mapType &&
    prev.onCanvasClick === next.onCanvasClick &&
    prev.itemState === next.itemState &&
    prev.itemHealth === next.itemHealth &&
    next.itemState !== 'burning'
);

const Flyover3D = ({ fly }: { fly: any }) => {
    const altitude = 120; // Plane flight height

    // Calculate bomb drop position if dropping
    let bombJsx = null;
    if (fly.canisterY !== undefined && fly.targetPos) {
        const totalDist = Math.max(1, fly.targetPos.y - fly.altitudeY);
        const distCovered = Math.max(0, fly.canisterY - fly.altitudeY);
        const progress = Math.min(1, distCovered / totalDist);
        const bombH = altitude * (1 - progress);

        bombJsx = (
            <mesh position={[fly.targetPos.x, bombH, fly.canisterY]}>
                <cylinderGeometry args={[3, 3, 8]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        );
    }

    const isGunship = fly.type === UnitType.GUNSHIP;

    return (
        <group>
            {/* Plane / Gunship */}
            <group position={[fly.currentX, altitude, fly.altitudeY]} rotation={[0, fly.speed >= 0 ? 0 : Math.PI, 0]}>
                {isGunship ? (
                    // AC-130 Gunship — wider, darker, with gun pods
                    <group>
                        {/* Wide fuselage */}
                        <mesh castShadow rotation={[0, 0, -Math.PI / 2]}>
                            <coneGeometry args={[14, 50, 8]} />
                            <meshStandardMaterial color="#1e293b" />
                        </mesh>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[20, 5, 55]} />
                            <meshStandardMaterial color="#0f172a" />
                        </mesh>
                        {/* Wing guns */}
                        <mesh position={[0, -4, -30]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[1.5, 1.5, 18]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        <mesh position={[0, -4, 30]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[1.5, 1.5, 18]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        {/* Engine pods */}
                        {[-20, 20].map((z, i) => (
                            <mesh key={i} position={[0, 0, z]}>
                                <cylinderGeometry args={[5, 5, 12]} />
                                <meshStandardMaterial color="#1e293b" />
                            </mesh>
                        ))}
                        {/* Firing flash */}
                        {fly.shotTimer === 1 && (
                            <group position={[-20, -4, 0]} rotation={[0, 0, Math.PI / 2]}>
                                <MuzzleFlash size={4} color="#f97316" />
                            </group>
                        )}
                    </group>
                ) : (
                    // Standard attack plane
                    <group>
                        <mesh castShadow rotation={[0, 0, -Math.PI / 2]}>
                            <coneGeometry args={[10, 40, 8]} />
                            <meshStandardMaterial color="#334155" />
                        </mesh>
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[15, 2, 40]} />
                            <meshStandardMaterial color="#475569" />
                        </mesh>
                    </group>
                )}
                {/* Health bar */}
                {fly.health < 40 && (
                    <mesh position={[0, 15, 0]}>
                        <boxGeometry args={[20 * (fly.health / 40), 2, 2]} />
                        <meshBasicMaterial color="#22c55e" />
                    </mesh>
                )}
            </group>

            {/* Falling Bomb / Canister */}
            {bombJsx}
        </group>
    );
};

// Supply crate: parachutes down, then sits beaconed until claimed or despawned
const CRATE_COLORS: Record<SupplyCrate['type'], string> = { cash: '#fbbf24', squad: '#60a5fa', medkit: '#4ade80' };
const SupplyCrate3D = ({ crate }: { crate: SupplyCrate }) => {
    const color = CRATE_COLORS[crate.type];
    const landed = crate.alt <= 0;
    const fading = crate.life < 240 ? (Math.floor(Date.now() / 200) % 2 === 0 ? 0.4 : 1) : 1; // blink before despawn
    return (
        <group position={[crate.x, crate.alt, crate.y]}>
            {/* Crate */}
            <group rotation={[0, 0.5, 0]}>
                <mesh position={[0, 4, 0]} castShadow>
                    <boxGeometry args={[10, 8, 10]} />
                    <meshStandardMaterial color="#78350f" roughness={1} transparent opacity={fading} />
                </mesh>
                <mesh position={[0, 4, 0]}>
                    <boxGeometry args={[10.3, 2.2, 10.3]} />
                    <meshBasicMaterial color={color} toneMapped={false} transparent opacity={fading} />
                </mesh>
            </group>
            {/* Parachute while descending */}
            {!landed && (
                <group position={[0, 22, 0]}>
                    <mesh>
                        <sphereGeometry args={[14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                        <meshStandardMaterial color="#e7e5e4" side={THREE.DoubleSide} />
                    </mesh>
                    {[[-8, 0], [8, 0], [0, -8], [0, 8]].map(([lx, lz], i) => (
                        <mesh key={i} position={[lx * 0.5, -7, lz * 0.5]} rotation={[lz !== 0 ? (lz > 0 ? -0.5 : 0.5) : 0, 0, lx !== 0 ? (lx > 0 ? 0.5 : -0.5) : 0]}>
                            <cylinderGeometry args={[0.15, 0.15, 15]} />
                            <meshBasicMaterial color="#d6d3d1" />
                        </mesh>
                    ))}
                </group>
            )}
            {/* Landing beacon */}
            {landed && (
                <group>
                    <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1 + 0.12 * Math.sin(Date.now() * 0.008)}>
                        <ringGeometry args={[14, 17, 24]} />
                        <meshBasicMaterial color={color} transparent opacity={0.6 * fading} toneMapped={false} depthWrite={false} />
                    </mesh>
                    <mesh position={[0, 20, 0]}>
                        <cylinderGeometry args={[0.6, 1.4, 32, 6]} />
                        <meshBasicMaterial color={color} transparent opacity={0.35 * fading} toneMapped={false} depthWrite={false} />
                    </mesh>
                </group>
            )}
        </group>
    );
};

// Orbital laser: red designator line, then a blinding column from the sky
const SatelliteLaser3D = ({ laser }: { laser: LaserStrike }) => {
    const DESIGNATE = 55;
    const active = laser.maxLife - laser.life > DESIGNATE;
    const endFade = Math.min(1, laser.life / 25); // wind-down
    if (!active) {
        // Thin pulsing designator
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.03);
        return (
            <group position={[laser.x, 0, laser.y]}>
                <mesh position={[0, 250, 0]}>
                    <cylinderGeometry args={[0.7, 0.7, 500, 6]} />
                    <meshBasicMaterial color="#ef4444" transparent opacity={0.5 + 0.4 * pulse} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[laser.radius - 2, laser.radius, 32]} />
                    <meshBasicMaterial color="#ef4444" transparent opacity={0.4 + 0.5 * pulse} toneMapped={false} depthWrite={false} />
                </mesh>
            </group>
        );
    }
    const wobble = 1 + 0.12 * Math.sin(Date.now() * 0.02);
    return (
        <group position={[laser.x, 0, laser.y]}>
            {/* Core beam */}
            <mesh position={[0, 250, 0]}>
                <cylinderGeometry args={[3.2 * wobble, 4.2 * wobble, 500, 10]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.95 * endFade} toneMapped={false} />
            </mesh>
            {/* Outer glow sheath */}
            <mesh position={[0, 250, 0]}>
                <cylinderGeometry args={[8 * wobble, 10 * wobble, 500, 10]} />
                <meshBasicMaterial color="#7dd3fc" transparent opacity={0.3 * endFade} toneMapped={false} depthWrite={false} />
            </mesh>
            {/* Impact flare */}
            <mesh position={[0, 3, 0]} scale={wobble}>
                <sphereGeometry args={[laser.radius * 0.35, 12, 10]} />
                <meshBasicMaterial color="#e0f2fe" transparent opacity={0.85 * endFade} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[laser.radius * 0.7, laser.radius, 32]} />
                <meshBasicMaterial color="#bae6fd" transparent opacity={0.5 * endFade} toneMapped={false} depthWrite={false} />
            </mesh>
            <pointLight position={[0, 25, 0]} color="#bae6fd" intensity={6 * endFade} distance={160} />
        </group>
    );
};

const Missile3D = ({ m }: { m: any }) => {
    // Sea-launched cruise missile: a BIG one — flies low and level toward the target
    if (m.isCruise) {
        const angle = Math.atan2(m.velocity.y, m.velocity.x);
        const bob = Math.sin(Date.now() * 0.02) * 1.2;
        return (
            <group position={[m.current.x, 24 + bob, m.current.y]} rotation={[0, -angle, 0]}>
                {/* Fat fuselage with red warhead band */}
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                    <cylinderGeometry args={[4, 4, 36, 12]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
                <mesh position={[13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[4.1, 4.1, 3, 12]} />
                    <meshStandardMaterial color="#b91c1c" />
                </mesh>
                <mesh position={[21, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                    <coneGeometry args={[4, 8, 12]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                {/* Air intake under the belly */}
                <mesh position={[-6, -4, 0]}>
                    <boxGeometry args={[8, 2.5, 3.5]} />
                    <meshStandardMaterial color="#334155" />
                </mesh>
                {/* Big stub wings + cruciform tail */}
                <mesh position={[-4, 0, 0]}>
                    <boxGeometry args={[9, 0.8, 24]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[-15, 2.5, 0]}>
                    <boxGeometry args={[5, 7, 0.8]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[-15, 0, 0]}>
                    <boxGeometry args={[5, 0.8, 12]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                {/* Exhaust plume */}
                <mesh position={[-20, 0, 0]}>
                    <sphereGeometry args={[2.8, 8, 8]} />
                    <meshBasicMaterial color="#fb923c" toneMapped={false} />
                </mesh>
                <mesh position={[-24, 0, 0]} scale={[2, 0.8, 0.8]}>
                    <sphereGeometry args={[1.8, 6, 6]} />
                    <meshBasicMaterial color="#fde68a" toneMapped={false} transparent opacity={0.7} />
                </mesh>
                {/* Shadow blob racing along the ground below */}
                <mesh position={[0, -23 - bob, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[9, 12]} />
                    <meshBasicMaterial color="black" transparent opacity={0.25} depthWrite={false} />
                </mesh>
            </group>
        );
    }
    // Interpolate height for missile dive
    const startZ = 35;
    const totalDist = Math.max(1, m.target.y - startZ);
    const currentDist = Math.max(0, m.current.y - startZ);
    const progress = Math.min(1, currentDist / totalDist);
    // Start height 120 (plane level), End height 0
    const height = 120 * (1 - progress);

    const angle = Math.atan2(m.velocity.y, m.velocity.x); // In X/Z plane

    return (
        <group position={[m.current.x, height, m.current.y]} rotation={[0, -angle, 0]}>
            <group rotation={[Math.PI / 4 * progress, 0, 0]}> {/* Pitch down as it gets closer */}
                <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[4, 4, 15, 8]} />
                    <meshStandardMaterial color="#f97316" emissive="#f97316" />
                </mesh>
                <pointLight intensity={2} distance={50} color="#f97316" />
            </group>
        </group>
    );
}

// Border Line Component
const BorderLine = React.memo(({ onCanvasClick }: { onCanvasClick: (x: number, y: number) => void }) => {
    const dashes = [];
    const centerX = 400;
    // Z range extended for infinite look
    for (let z = -1000; z < 2000; z += 40) {
        dashes.push(
            <mesh key={z} position={[centerX, 0.5, z]} rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); if (onCanvasClick) onCanvasClick(e.point.x, e.point.z); }}>
                <planeGeometry args={[6, 25]} />
                <meshStandardMaterial color="white" opacity={0.6} transparent />
            </mesh>
        );
    }
    return <group>{dashes}</group>;
});

// Horizon backdrop beyond the playfield: mountains, mesas or a city skyline
const Backdrop = React.memo(({ mapType }: { mapType: MapType }) => {
    const items = useMemo(() => {
        const rand = (i: number, s: number) => { const v = Math.sin(i * 91.7 + s * 47.3) * 43758.5453; return v - Math.floor(v); };
        return Array.from({ length: 14 }, (_, i) => ({
            x: -150 + rand(i, 1) * 1100,
            z: -70 - rand(i, 2) * 130,
            h: 70 + rand(i, 3) * 150,
            w: 45 + rand(i, 4) * 70,
        }));
    }, []);

    if (mapType === MapType.URBAN) {
        return (
            <group>
                {items.map((m, i) => (
                    <mesh key={i} position={[m.x, m.h / 2, m.z]}>
                        <boxGeometry args={[m.w, m.h, 30]} />
                        <meshStandardMaterial color="#334155" roughness={1} />
                    </mesh>
                ))}
            </group>
        );
    }
    if (mapType === MapType.DESERT) {
        return (
            <group>
                {items.map((m, i) => (
                    <mesh key={i} position={[m.x, m.h * 0.35, m.z]}>
                        <cylinderGeometry args={[m.w * 0.8, m.w * 1.3, m.h * 0.7, 8]} />
                        <meshStandardMaterial color="#92400e" roughness={1} />
                    </mesh>
                ))}
            </group>
        );
    }
    // Countryside / archipelago: mountain range with snow caps on the tall ones
    return (
        <group>
            {items.map((m, i) => (
                <group key={i} position={[m.x, 0, m.z]}>
                    <mesh position={[0, m.h * 0.8, 0]}>
                        <coneGeometry args={[m.w * 1.5, m.h * 1.6, 7]} />
                        <meshStandardMaterial color="#475569" roughness={1} />
                    </mesh>
                    {m.h > 150 && (
                        <mesh position={[0, m.h * 1.38, 0]}>
                            <coneGeometry args={[m.w * 0.42, m.h * 0.44, 7]} />
                            <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
                        </mesh>
                    )}
                </group>
            ))}
        </group>
    );
});

// Soft clouds drifting slowly across the sky
const CLOUD_DEFS = Array.from({ length: 7 }, (_, i) => {
    const r = (s: number) => { const v = Math.sin(i * 53.7 + s * 29.1) * 43758.5453; return v - Math.floor(v); };
    return { base: r(1) * 1600, y: 250 + r(2) * 110, z: -80 + r(3) * 500, speed: 0.004 + r(4) * 0.005, s: 26 + r(5) * 30 };
});

const Clouds = () => {
    const t = Date.now();
    return (
        <group>
            {CLOUD_DEFS.map((c, i) => {
                const x = ((c.base + t * c.speed) % 1600) - 400;
                return (
                    <group key={i} position={[x, c.y, c.z]}>
                        <mesh scale={[c.s * 2.1, c.s * 0.55, c.s]}>
                            <sphereGeometry args={[1, 10, 8]} />
                            <meshStandardMaterial color="white" transparent opacity={0.45} depthWrite={false} />
                        </mesh>
                        <mesh position={[c.s * 1.3, 3, c.s * 0.2]} scale={[c.s * 1.2, c.s * 0.45, c.s * 0.7]}>
                            <sphereGeometry args={[1, 10, 8]} />
                            <meshStandardMaterial color="white" transparent opacity={0.4} depthWrite={false} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

// Urban street furniture: faded dashed lane lines splitting the field into the
// three spawn lanes, so the bare asphalt reads as a city street grid.
const UrbanRoadMarkings = React.memo(({ mapType }: { mapType: MapType }) => {
    if (mapType !== MapType.URBAN) return null;
    const span = CANVAS_HEIGHT - HORIZON_Y;
    const lanes = [HORIZON_Y + span / 3, HORIZON_Y + (2 * span) / 3];
    const DASHES = 16;
    return (
        <group>
            {lanes.map((y, li) => (
                <group key={li}>
                    {Array.from({ length: DASHES }, (_, i) => (
                        <mesh key={i} position={[(i + 0.5) * (CANVAS_WIDTH / DASHES), 0.55, y]} rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[26, 2.4]} />
                            <meshBasicMaterial color="#eab308" transparent opacity={0.28} depthWrite={false} />
                        </mesh>
                    ))}
                </group>
            ))}
        </group>
    );
});

// Static instanced ground scatter: grass tufts (countryside) / dry shrubs (desert)
const GroundScatter = React.memo(({ mapType }: { mapType: MapType }) => {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const COUNT = 140;
    const active = mapType !== MapType.URBAN; // city streets stay bare
    const color =
        mapType === MapType.DESERT      ? '#a16207' :
        mapType === MapType.ARCHIPELAGO ? '#15803d' : '#1a2e05';

    useEffect(() => {
        if (!active || !ref.current) return;
        const dummy = new THREE.Object3D();
        const rand = (i: number, salt: number) => {
            const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
            return v - Math.floor(v);
        };
        for (let i = 0; i < COUNT; i++) {
            const x = 20 + rand(i, 1) * (CANVAS_WIDTH - 40);
            const z = HORIZON_Y + 20 + rand(i, 2) * (CANVAS_HEIGHT - HORIZON_Y - 40);
            const s = 1.2 + rand(i, 3) * 2.2;
            dummy.position.set(x, 2, z);
            dummy.scale.set(s, s * 1.8, s);
            dummy.rotation.set(0, rand(i, 4) * Math.PI * 2, 0);
            dummy.updateMatrix();
            ref.current.setMatrixAt(i, dummy.matrix);
        }
        ref.current.instanceMatrix.needsUpdate = true;
    }, [mapType, active]);

    if (!active) return null;
    return (
        <instancedMesh ref={ref} args={[undefined as any, undefined as any, COUNT]} frustumCulled={false}>
            <coneGeometry args={[1.6, 4.5, 5]} />
            <meshStandardMaterial color={color} roughness={1} />
        </instancedMesh>
    );
});

const GroundPlane = React.memo(({ onCanvasClick, targetingInfo, mapType }: { onCanvasClick: (x: number, y: number) => void, targetingInfo: { team: Team, type: UnitType } | null, mapType: MapType }) => {
    const groundColor =
        mapType === MapType.URBAN       ? '#374151' :
        mapType === MapType.DESERT      ? '#92400e' :
        mapType === MapType.ARCHIPELAGO ? '#1a6b3a' : '#365314';
    const spotColor =
        mapType === MapType.URBAN       ? '#4b5563' :
        mapType === MapType.DESERT      ? '#b45309' :
        mapType === MapType.ARCHIPELAGO ? '#d97706' : '#14532d'; // sandy beach spots on islands

    const spots = [];
    for (let i = 0; i < 60; i++) {
        const x = (Math.sin(i * 123.45) * 800);
        const y = (Math.cos(i * 678.90) * 400);
        const s = 30 + (i % 20);
        spots.push({ x, y, s });
    }

    return (
        <group>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[CANVAS_WIDTH / 2, -1, CANVAS_HEIGHT / 2]}
                receiveShadow
                onClick={(e) => {
                    e.stopPropagation();
                    onCanvasClick(e.point.x, e.point.z);
                }}
                onPointerOver={() => {
                    if (targetingInfo) document.body.style.cursor = 'crosshair';
                }}
                onPointerMove={(e) => {
                    if (targetingInfo && targetingInfo.type === UnitType.NUKE) {
                        const isWest = targetingInfo.team === Team.WEST;
                        const x = e.point.x; // 3D x is logic x
                        const invalid = (isWest && x < 400) || (!isWest && x > 400);
                        document.body.style.cursor = invalid ? 'not-allowed' : 'crosshair';
                    } else if (targetingInfo) {
                        document.body.style.cursor = 'crosshair';
                    }
                }}
                onPointerOut={() => document.body.style.cursor = 'default'}
            >
                <planeGeometry args={[2000, 2000]} />
                <meshStandardMaterial color={groundColor} roughness={1} />
            </mesh>

            {/* Ground Decoration Spots */}
            {spots.map((s, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[CANVAS_WIDTH / 2 + s.x, -0.5, CANVAS_HEIGHT / 2 + s.y]}>
                    <circleGeometry args={[s.s, 16]} />
                    <meshStandardMaterial color={spotColor} transparent opacity={0.4} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
});

// -- Main Scene Component --

// Reusable color temps for the day/night blend (avoid per-frame allocation)
const TMP_SKY_COLOR = new THREE.Color();
const TMP_SUN_COLOR = new THREE.Color();
const NIGHT_SKY_COLOR = new THREE.Color('#0b1026');
const MOON_COLOR = new THREE.Color('#93c5fd');

export const GameScene: React.FC<GameSceneProps> = ({ units, projectiles, particles, terrain, flyovers, missiles, lasers, crates, smokes, onCanvasClick, selectTeam, onBoxSelect, onMarquee, onDragStart, targetingInfo, weather, fx = 'high', cb = false, mapType, shake, capture, flanks, onUnitClick, focusIds, selectedIds, onCameraApi }) => {
    // Must be set before children render — teamTint/eastColor read it
    CB_MODE = cb;

    // Imperative camera API for the on-screen zoom/scroll buttons. Zoom scales
    // the camera's offset from the target (OrbitControls' min/maxDistance
    // clamp it on update); pan slides target + camera along the screen-right
    // axis projected on the ground plane, with the target kept on the map.
    const controlsRef = useRef<any>(null);
    useEffect(() => {
        const api = {
            zoom: (factor: number) => {
                const c = controlsRef.current;
                if (!c) return;
                const cam = c.object;
                cam.position.sub(c.target).multiplyScalar(factor).add(c.target);
                c.update();
            },
            pan: (dx: number) => {
                const c = controlsRef.current;
                if (!c) return;
                const cam = c.object;
                const right = new THREE.Vector3();
                cam.getWorldDirection(right);
                right.cross(cam.up).setY(0).normalize().multiplyScalar(dx);
                const before = c.target.clone();
                c.target.add(right);
                c.target.x = Math.max(40, Math.min(CANVAS_WIDTH - 40, c.target.x));
                c.target.z = Math.max(40, Math.min(CANVAS_HEIGHT - 40, c.target.z));
                cam.position.add(c.target.clone().sub(before)); // apply the clamped delta
                c.update();
            },
            reset: () => { controlsRef.current?.reset(); },
            state: () => { const c = controlsRef.current; return c ? { dist: c.object.position.distanceTo(c.target), tx: c.target.x, tz: c.target.z } : null; },
            // Jump the view to a world x (minimap click) — world-axis move, so it
            // stays correct however the camera is orbited
            panTo: (x: number) => {
                const c = controlsRef.current;
                if (!c) return;
                const nx = Math.max(40, Math.min(CANVAS_WIDTH - 40, x));
                const dx = nx - c.target.x;
                c.target.x = nx;
                c.object.position.x += dx;
                c.update();
            },
        };
        // Snapshot the initial framing so reset() returns exactly here.
        // OrbitControls mounts async inside the R3F canvas, so retry briefly.
        const save = setInterval(() => {
            if (controlsRef.current) { controlsRef.current.saveState(); clearInterval(save); }
        }, 100);
        onCameraApi?.(api);
        (window as any).__ewCam = api;
        return () => clearInterval(save);
    }, [onCameraApi]);

    // Day/night factor blended on top of the weather palette.
    const dayFactor = getDayFactor();

    // Clear-weather sky carries each map's identity (fog inherits it, so the
    // desert reads as dust haze and the city as smog); weather overrides it.
    const clearSky =
        mapType === MapType.DESERT      ? '#dfc08f' :
        mapType === MapType.URBAN       ? '#9fb2c0' :
        mapType === MapType.ARCHIPELAGO ? '#6fd0e8' : '#87CEEB';
    const weatherSky =
        weather === 'rain'  ? '#334155' :
        weather === 'snow'  ? '#cbd5e1' :
        weather === 'fog'   ? '#94a3b8' :
        weather === 'storm' ? '#1e293b' : clearSky;
    const skyColor = TMP_SKY_COLOR.set(weatherSky).lerp(NIGHT_SKY_COLOR, 1 - dayFactor).getHex();
    const sunColor = TMP_SUN_COLOR.set('#ffffff').lerp(MOON_COLOR, 1 - dayFactor).getHex();

    const baseAmbient =
        weather === 'rain' || weather === 'fog' ? 0.3 :
        weather === 'storm' ? 0.15 :
        weather === 'snow'  ? 0.5 : 0.6;

    return (
        <Canvas key={`${fx}-${cb ? 'cb' : 'std'}`} shadows={fx !== 'low'} dpr={fx === 'low' ? 1 : [1, 1.5]} camera={{ position: [CANVAS_WIDTH / 2, 600, CANVAS_HEIGHT + 200], fov: 45 }} onCreated={(s) => { (window as any).__ewGL = s.gl; }}>
            <color attach="background" args={[skyColor]} />
            {/* Default camera sits ~735 units out — keep fog far beyond that so
                fog weather reads as heavy haze, not a total whiteout */}
            <fog attach="fog" args={[
                skyColor,
                weather === 'fog' ? 350 : 500,
                weather === 'fog' ? 1050 : 1500
            ]} />

            {weather === 'rain'  && <RainEffect />}
            {weather === 'snow'  && <SnowEffect />}
            {weather === 'storm' && <RainEffect />}

            <ambientLight intensity={baseAmbient * (0.3 + 0.7 * dayFactor)} />
            <directionalLight
                position={[200, 500, 200]}
                intensity={1.5 * (0.18 + 0.82 * dayFactor)}
                color={sunColor}
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-left={-600}
                shadow-camera-right={600}
                shadow-camera-top={600}
                shadow-camera-bottom={-600}
            />

            {/* Backdrop and clouds sit outside the shake rig — the horizon shouldn't rattle */}
            <Backdrop mapType={mapType} />
            {fx !== 'low' && <Clouds />}

            <ShakeRig shake={shake}>
                <GroundPlane onCanvasClick={onCanvasClick} targetingInfo={targetingInfo} mapType={mapType} />
                <GroundScatter mapType={mapType} />
                <UrbanRoadMarkings mapType={mapType} />
                <RiverRenderer terrain={terrain} mapType={mapType} />
                {/* Dirt roads leading up to each bridge */}
                {terrain.filter(t => t.type === 'bridge').map(b => (
                    <mesh key={'road-' + b.id} position={[b.x, 0.25, b.y]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[(b.width || 85) + 240, (b.height || 40) * 0.6]} />
                        <meshStandardMaterial
                            color={mapType === MapType.URBAN ? '#3f3f46' : mapType === MapType.DESERT ? '#a16207' : '#6b4f2a'}
                            transparent opacity={0.5} depthWrite={false}
                        />
                    </mesh>
                ))}
                <BorderLine onCanvasClick={onCanvasClick} />
                {capture && <CapturePoint3D cap={capture} />}
                {flanks?.map((f, i) => <CapturePoint3D key={i} cap={f} small />)}

                {terrain.map(t => {
                    if (t.type === 'river') return null; // Skip old river segments
                    return <TerrainItem key={t.id} item={t} itemState={t.state} itemHealth={t.health} onCanvasClick={onCanvasClick} mapType={mapType} />;
                })}

                {units.map(u => <Unit3D key={u.id} unit={u} terrain={terrain} onCanvasClick={onCanvasClick} onUnitClick={onUnitClick} focused={focusIds?.includes(u.id)} selected={selectedIds?.includes(u.id)} />)}

                {projectiles.map(p => p.isMissile ? <Projectile3D key={p.id} proj={p} /> : null)}
                <InstancedProjectiles projectiles={projectiles} />

                {particles.map(p => isSpecialParticle(p) ? <Particle3D key={p.id} p={p} /> : null)}
                <InstancedParticles particles={particles} />
                <InstancedDecals particles={particles} />
                <InstancedUnitOverlays units={units} terrain={terrain} cbMode={cb} />

                {flyovers.map(f => <Flyover3D key={f.id} fly={f} />)}

                {missiles.map(m => <Missile3D key={m.id} m={m} />)}

                {lasers?.map(l => <SatelliteLaser3D key={l.id} laser={l} />)}
                {smokes?.map(s => <SmokeCloud3D key={s.id} smoke={s} />)}

                {crates?.map(c => <SupplyCrate3D key={c.id} crate={c} />)}
            </ShakeRig>

            {/* Camera can tilt and swing across the front 180° arc, but never
                orbit behind the battlefield — from the far side West/East would
                appear mirrored and disorient the player. */}
            <OrbitControls
                ref={controlsRef}
                target={[CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2]}
                maxPolarAngle={Math.PI / 2.1}
                minAzimuthAngle={-Math.PI / 2}
                maxAzimuthAngle={Math.PI / 2}
                minDistance={220}
                maxDistance={1250}
                // Left-drag is the selection marquee (RTS convention), so the
                // camera orbits on right-drag. Touch is untouched: one finger
                // still orbits, since a marquee needs a mouse.
                mouseButtons={{ LEFT: undefined as any, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
                onChange={(e) => { if (e) (window as any).__ewCamAz = (e.target as any).getAzimuthalAngle(); }}
            />

            <BoxSelect units={units} selectTeam={selectTeam} disabled={!!targetingInfo} onBoxSelect={onBoxSelect} onMarquee={onMarquee} onDragStart={onDragStart} />

            {/* Bloom only picks up pixels brighter than luminanceThreshold: emissive
                materials (tesla coil, napalm, missiles) and toneMapped=false projectiles */}
            {fx !== 'low' && (
                <EffectComposer>
                    <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.0} luminanceSmoothing={0.2} />
                </EffectComposer>
            )}
        </Canvas>
    );
};
