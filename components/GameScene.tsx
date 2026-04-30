
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows, useTexture, ContactShadows, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Team, Unit, UnitType, Projectile, Particle, TerrainObject, Vector2D, MapType } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, HORIZON_Y, UNIT_CONFIG } from '../constants';

// Add type definition for the custom shader material
declare global {
    namespace JSX {
        interface IntrinsicElements {
            riverMaterial: any;
        }
    }
}

interface GameSceneProps {
    units: Unit[];
    projectiles: Projectile[];
    particles: Particle[];
    terrain: TerrainObject[];
    flyovers: any[]; // Using any for now to match the internal logic refs
    missiles: any[];
    onCanvasClick: (x: number, y: number) => void;
    targetingInfo: { team: Team, type: UnitType } | null;
    weather: 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
    mapType: MapType;
}

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
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
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
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
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

const RiverRenderer = ({ terrain, mapType }: { terrain: TerrainObject[], mapType: MapType }) => {
    const riverRef = useRef<any>(null);

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

    useFrame(({ clock }) => {
        if (riverRef.current) riverRef.current.uTime = clock.getElapsedTime();
    });

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

    // Archipelago: wide sea straits — static ocean colour, no shader needed
    if (mapType === MapType.ARCHIPELAGO) {
        return (
            <group>
                {geometries.map((geo, i) => geo && (
                    <mesh key={i} geometry={geo} receiveShadow>
                        <meshStandardMaterial color="#0c4a6e" roughness={0.25} metalness={0.1} />
                    </mesh>
                ))}
            </group>
        );
    }

    // Countryside: animated water shader, one mesh per channel
    return (
        <group>
            {geometries.map((geo, i) => geo && (
                <mesh key={i} geometry={geo} receiveShadow>
                    <riverMaterial ref={i === 0 ? riverRef : undefined} transparent side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
    );
};


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
const MAT_FLASH_CORE = new THREE.MeshBasicMaterial({ color: 'yellow', transparent: true, opacity: 0.9 });
// Note: Outer material depends on color prop, so we might need to keep it dynamic or cache by color.
// But mostly it's yellow/orange.

const MuzzleFlash = ({ size = 1, color = 'orange' }: { size?: number, color?: string }) => {
    // Memoize outer material if color changes infrequent
    const outerMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), [color]);

    return (
        <group scale={[size, size, size]}>
            {/* Core */}
            <mesh position={[1.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]} geometry={GEO_FLASH_CORE} material={MAT_FLASH_CORE} />
            {/* Outer */}
            <mesh position={[2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} geometry={GEO_FLASH_OUTER} material={outerMat} />
            <pointLight distance={15} intensity={3} color={color} />
        </group>
    );
};

// Shared Assets
const MAT_HEALTH_BG = new THREE.MeshBasicMaterial({ color: 'gray' });
const MAT_HEALTH_FG = new THREE.MeshBasicMaterial({ color: '#22c55e' });
const GEO_HEALTH_BAR = new THREE.BoxGeometry(1, 3, 1);

const Unit3D = ({ unit, terrain, onCanvasClick }: { unit: Unit, terrain: TerrainObject[], onCanvasClick: (x: number, y: number) => void }) => {
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
    } else if (unit.type === UnitType.ANTI_AIR || unit.type === UnitType.TANK || unit.type === UnitType.ARTILLERY) {
        // Vehicle adjustment?
    }

    const color = unit.team === Team.WEST ? config.colorWest : config.colorEast;
    const isWest = unit.team === Team.WEST;
    // Calculate slope rotation? For now just keep them upright or maybe pitch based on normal.
    const rotation = [0, isWest ? 0 : Math.PI, 0];

    // Visual cue for Cover
    const opacity = (unit as any).isInCover ? 0.6 : 1.0;
    const transparent = (unit as any).isInCover;
    const matProps = { color, transparent, opacity };

    return (
        <ClickableGroup position={[position[0], position[1] + yOffset, position[2]]} rotation={rotation as any} onCanvasClick={onCanvasClick}>
            <group receiveShadow castShadow>
                {/* Health Bar (Floating) - Optimized via Scale */}
                <mesh position={[0, 20, 0]} scale={[20, 1, 1]} geometry={GEO_HEALTH_BAR} material={MAT_HEALTH_BG} />
                <mesh
                    position={[-10 + 10 * (unit.health / unit.maxHealth), 20, 0.5]}
                    scale={[Math.max(0.01, 20 * (unit.health / unit.maxHealth)), 1, 1]}
                    geometry={GEO_HEALTH_BAR}
                    material={MAT_HEALTH_FG}
                />

                {/* Geometry based on Type */}
                {
                    unit.type === UnitType.SOLDIER && (
                        <group position={[0, 0, 0]}>
                            {/* Head */}
                            <mesh position={[0, 16, 0]} castShadow>
                                <sphereGeometry args={[3.5, 16, 16]} />
                                <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} /> {/* Skin tone */}
                                <mesh position={[0, 1, 0]}>
                                    <cylinderGeometry args={[4, 3.8, 2]} />
                                    <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} /> {/* Helmet */}
                                </mesh>
                            </mesh>
                            {/* Body */}
                            <mesh position={[0, 9, 0]} castShadow>
                                <boxGeometry args={[6, 10, 4]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Arms */}
                            <mesh position={[-4, 10, 0]} rotation={[0, 0, 0.2]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            <mesh position={[4, 10, 2]} rotation={[-0.5, 0, -0.2]}> {/* Aiming arm */}
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color={color} />
                                <mesh position={[0, -4, 2]} rotation={[Math.PI / 2, 0, 0]}> {/* Gun */}
                                    <boxGeometry args={[1, 8, 1]} />
                                    <meshStandardMaterial color="black" />
                                </mesh>
                            </mesh>
                            {/* Legs */}
                            <mesh position={[-2, 2, 0]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                            <mesh position={[2, 2, -1]} rotation={[0.2, 0, 0]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                        </group>
                    )
                }
                {
                    unit.type === UnitType.TANK && (
                        <group>
                            {/* Modern Main Battle Tank (Oriented along X-axis for default Right facing) */}
                            {/* Hull */}
                            <mesh position={[0, 8, 0]} castShadow receiveShadow>
                                <boxGeometry args={[45, 12, 28]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Tracks */}
                            <mesh position={[0, 6, -15]}>
                                <boxGeometry args={[42, 12, 8]} />
                                <meshStandardMaterial color="#222" transparent={transparent} opacity={opacity} />
                            </mesh>
                            <mesh position={[0, 6, 15]}>
                                <boxGeometry args={[42, 12, 8]} />
                                <meshStandardMaterial color="#222" transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Turret */}
                            <mesh position={[0, 18, 0]} castShadow>
                                <boxGeometry args={[25, 9, 20]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Main Gun (Pointing Right +X) */}
                            <mesh position={[20, 18, 0]} rotation={[0, 0, -Math.PI / 2]}>
                                <cylinderGeometry args={[2.5, 2.5, 30]} />
                                <meshStandardMaterial color="#444" transparent={transparent} opacity={opacity} />
                                <mesh position={[0, 15, 0]}> {/* Bore fume extractor */}
                                    <cylinderGeometry args={[3.5, 3.5, 6]} />
                                    <meshStandardMaterial color="#333" />
                                </mesh>
                            </mesh>

                            {/* Muzzle Flash */}
                            {unit.attackCooldown > (config.attackSpeed - 8) && (
                                <MuzzleFlash size={4} />
                            )}
                        </group>
                    )
                }
                {
                    unit.type === UnitType.TESLA && (
                        <group>
                            <mesh position={[0, 8, 0]} castShadow>
                                <boxGeometry args={[32, 16, 24]} />
                                <meshStandardMaterial color={color} />
                            </mesh>
                            {/* Tesla Coil Base */}
                            <mesh position={[0, 20, 0]} castShadow>
                                <cylinderGeometry args={[8, 10, 4]} />
                                <meshStandardMaterial color="#444" />
                            </mesh>
                            {/* Coil Rings */}
                            <mesh position={[0, 26, 0]} castShadow>
                                <cylinderGeometry args={[4, 4, 12]} />
                                <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={2} />
                            </mesh>
                            {/* Top Sphere */}
                            <mesh position={[0, 34, 0]} castShadow>
                                <sphereGeometry args={[5, 16, 16]} />
                                <meshStandardMaterial color="#e0f2fe" emissive="#e0f2fe" emissiveIntensity={10} />
                            </mesh>
                        </group>
                    )
                }
                {
                    unit.type === UnitType.ARTILLERY && (
                        <group>
                            {/* Modern SPG Hull */}
                            <mesh position={[0, 8, 0]} castShadow receiveShadow>
                                <boxGeometry args={[32, 14, 38]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Tracks */}
                            <mesh position={[-17, 7, 0]}>
                                <boxGeometry args={[6, 14, 34]} />
                                <meshStandardMaterial color="#333" transparent={transparent} opacity={opacity} />
                            </mesh>
                            <mesh position={[17, 7, 0]}>
                                <boxGeometry args={[6, 14, 34]} />
                                <meshStandardMaterial color="#333" transparent={transparent} opacity={opacity} />
                            </mesh>

                            {/* Turret Assembly (Rotated to face enemy) */}
                            <group position={[0, 18, 0]} rotation={[0, Math.PI / 2, 0]}>
                                {/* Muzzle Flash (Local coords to Turret) */}
                                {unit.attackCooldown > (config.attackSpeed - 8) && (
                                    <group position={[0, 20, 48]}>
                                        <MuzzleFlash size={7} />
                                    </group>
                                )}
                                {/* Turret Block */}
                                <mesh position={[0, 0, -4]} castShadow>
                                    <boxGeometry args={[22, 12, 24]} />
                                    <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                                </mesh>
                                {/* Long Barrel Howitzer (Angled Up) */}
                                <group position={[0, 2, 10]} rotation={[Math.PI / 4, 0, 0]}>
                                    <mesh position={[0, 10, 0]}>
                                        <cylinderGeometry args={[2.5, 3, 35]} />
                                        <meshStandardMaterial color="#444" transparent={transparent} opacity={opacity} />
                                    </mesh>
                                    {/* Muzzle Brake */}
                                    <mesh position={[0, 28, 0]}>
                                        <boxGeometry args={[5, 6, 5]} />
                                        <meshStandardMaterial color="#222" transparent={transparent} opacity={opacity} />
                                    </mesh>
                                </group>
                                {/* Radar/Antenna */}
                                <mesh position={[8, 7, -10]}>
                                    <cylinderGeometry args={[0.5, 0.5, 8]} />
                                    <meshStandardMaterial color="#888" transparent={transparent} opacity={opacity} />
                                </mesh>
                            </group>
                        </group>
                    )
                }

                {
                    unit.type === UnitType.RAMBO && (
                        <group position={[0, 0, 0]}>
                            {/* Head w/ Bandana */}
                            <mesh position={[0, 18, 0]} castShadow>
                                <sphereGeometry args={[4.5, 16, 16]} />
                                <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} />
                                <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                    <torusGeometry args={[3.8, 0.8, 8, 24]} />
                                    <meshStandardMaterial color="red" transparent={transparent} opacity={opacity} />
                                </mesh>
                            </mesh>
                            {/* Muscular Body */}
                            <mesh position={[0, 10, 0]} castShadow>
                                <boxGeometry args={[10, 12, 6]} />
                                <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} /> {/* Shirtless / skin */}
                                <mesh position={[0, -4, 0]}>
                                    <boxGeometry args={[10.2, 4, 6.2]} />
                                    <meshStandardMaterial color="#44403c" transparent={transparent} opacity={opacity} /> {/* Pants belt area */}
                                </mesh>
                            </mesh>
                            {/* Arms (Muscular) */}
                            <mesh position={[-6, 11, 0]} rotation={[0, 0, 0.3]}>
                                <boxGeometry args={[3.5, 10, 3.5]} />
                                <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} />
                            </mesh>
                            <mesh position={[6, 11, 2]} rotation={[-0.4, 0, -0.3]}>
                                <boxGeometry args={[3.5, 10, 3.5]} />
                                <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} />
                                {/* Big Gun (Minigun style) */}
                                <group position={[0, -6, 2]} rotation={[Math.PI / 2, 0, 0]}>
                                    <mesh>
                                        <cylinderGeometry args={[2, 2, 12]} />
                                        <meshStandardMaterial color="#1c1917" transparent={transparent} opacity={opacity} />
                                    </mesh>
                                    <mesh position={[0, 6, 0]}>
                                        <meshStandardMaterial color="#1c1917" transparent={transparent} opacity={opacity} />
                                    </mesh>
                                    {unit.attackCooldown > 5 && (
                                        <group position={[0, 8, 0]} rotation={[0, 0, Math.PI / 2]}>
                                            <MuzzleFlash size={1.5} />
                                        </group>
                                    )}
                                </group>
                            </mesh>
                            {/* Legs */}
                            <mesh position={[-3, 2, 0]}>
                                <boxGeometry args={[3.5, 10, 3.5]} />
                                <meshStandardMaterial color="#44403c" transparent={transparent} opacity={opacity} />
                            </mesh>
                            <mesh position={[3, 2, -1]} rotation={[0.2, 0, 0]}>
                                <boxGeometry args={[3.5, 10, 3.5]} />
                                <meshStandardMaterial color="#44403c" />
                            </mesh>
                        </group>
                    )
                }

                {
                    (unit.type === UnitType.AIRBORNE) && (
                        <group>
                            {/* Paratrooper uses Soldier-like model */}
                            <group position={[0, 0, 0]}>
                                <mesh position={[0, 16, 0]} castShadow>
                                    <sphereGeometry args={[3.5, 16, 16]} />
                                    <meshStandardMaterial color="#fca5a5" />
                                    <mesh position={[0, 1, 0]}>
                                        <cylinderGeometry args={[4, 3.8, 2]} />
                                        <meshStandardMaterial color={color} />
                                    </mesh>
                                </mesh>
                                <mesh position={[0, 9, 0]} castShadow>
                                    <boxGeometry args={[6, 10, 4]} />
                                    <meshStandardMaterial color={color} />
                                    {/* Backpack/Chute Pack */}
                                    <mesh position={[0, 2, -2.5]}>
                                        <boxGeometry args={[5, 6, 2]} />
                                        <meshStandardMaterial color="#4b5563" />
                                    </mesh>
                                </mesh>
                                <mesh position={[-4, 10, 0]} rotation={[0, 0, 0.4]}> {/* Arms out holding lines? */}
                                    <boxGeometry args={[2.5, 9, 2.5]} />
                                    <meshStandardMaterial color={color} />
                                </mesh>
                                <mesh position={[4, 10, 0]} rotation={[0, 0, -0.4]}>
                                    <boxGeometry args={[2.5, 9, 2.5]} />
                                    <meshStandardMaterial color={color} />
                                </mesh>
                                <mesh position={[-2, 2, 0]}>
                                    <boxGeometry args={[2.5, 9, 2.5]} />
                                    <meshStandardMaterial color="#333" />
                                </mesh>
                                <mesh position={[2, 2, 0]}>
                                    <boxGeometry args={[2.5, 9, 2.5]} />
                                    <meshStandardMaterial color="#333" />
                                </mesh>
                            </group>

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
                            <mesh position={[0, 10, 0]} castShadow receiveShadow>
                                <boxGeometry args={[35, 16, 25]} />
                                <meshStandardMaterial color={color} />
                            </mesh>
                            <mesh position={[0, 22, 0]}>
                                <cylinderGeometry args={[8, 8, 8, 8]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                            <mesh position={[0, 28, 5]} rotation={[-Math.PI / 4, 0, 0]}>
                                <boxGeometry args={[10, 20, 6]} />
                                <meshStandardMaterial color="#222" />
                                {unit.attackCooldown > 35 && (
                                    <group position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                        <MuzzleFlash size={3} />
                                    </group>
                                )}
                            </mesh>
                        </group>
                    )
                }

                {
                    unit.type === UnitType.DRONE && (
                        <group>
                            <mesh position={[0, 0, 0]} castShadow>
                                <boxGeometry args={[10, 4, 10]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                            <mesh position={[0, 0, 0]}>
                                <boxGeometry args={[24, 1, 1]} />
                                <meshStandardMaterial color="#111" />
                            </mesh>
                            <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                                <boxGeometry args={[24, 1, 1]} />
                                <meshStandardMaterial color="#111" />
                            </mesh>
                            {[[-12, 0], [12, 0], [0, -12], [0, 12]].map((p, i) => (
                                <mesh key={i} position={[p[0], 2, p[1]] as any}>
                                    <cylinderGeometry args={[4, 4, 1]} />
                                    <meshStandardMaterial color="black" opacity={0.5} transparent />
                                </mesh>
                            ))}
                        </group>
                    )
                }

                {
                    unit.type === UnitType.MINE_PERSONAL && (
                        <mesh position={[0, 1, 0]}>
                            <cylinderGeometry args={[3, 3, 2]} />
                            <meshStandardMaterial color="black" />
                        </mesh>
                    )
                }
                {
                    unit.type === UnitType.MINE_TANK && (
                        <mesh position={[0, 1, 0]}>
                            <cylinderGeometry args={[5, 5, 3]} />
                            <meshStandardMaterial color="#222" />
                        </mesh>
                    )
                }

                {
                    unit.type === UnitType.HELICOPTER && (
                        <group position={[0, 15, 0]} rotation={[0, (unit.rotation || 0) - Math.PI / 2, 0]}>
                            {/* Body (Bubble) */}
                            <mesh castShadow>
                                <sphereGeometry args={[8, 16, 16]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Tail Boom */}
                            <mesh position={[0, 0, -12]} rotation={[Math.PI / 2, 0, 0]}>
                                <cylinderGeometry args={[2, 4, 16]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Tail Rotor */}
                            <mesh position={[1, 0, -20]} rotation={[0, 0, (Date.now() / 50)]}>
                                <boxGeometry args={[1, 8, 1]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                            {/* Main Rotor Shaft */}
                            <mesh position={[0, 8, 0]}>
                                <cylinderGeometry args={[1, 1, 4]} />
                                <meshStandardMaterial color="#333" />
                            </mesh>
                            {/* Main Rotor Blades (Spinning) */}
                            <group position={[0, 10, 0]} rotation={[0, (Date.now() / 50), 0]}>
                                <mesh>
                                    <boxGeometry args={[40, 0.5, 3]} />
                                    <meshStandardMaterial color="#111" />
                                </mesh>
                                <mesh rotation={[0, Math.PI / 2, 0]}>
                                    <boxGeometry args={[40, 0.5, 3]} />
                                    <meshStandardMaterial color="#111" />
                                </mesh>
                            </group>
                            {/* Skids */}
                            <mesh position={[-4, -8, 0]}>
                                <boxGeometry args={[1, 1, 16]} />
                                <meshStandardMaterial color="#444" />
                            </mesh>
                            <mesh position={[4, -8, 0]}>
                                <boxGeometry args={[1, 1, 16]} />
                                <meshStandardMaterial color="#444" />
                            </mesh>
                            <mesh position={[-4, -5, 4]} rotation={[0.5, 0, 0]}><boxGeometry args={[1, 6, 1]} /><meshStandardMaterial color="#444" /></mesh>
                            <mesh position={[4, -5, 4]} rotation={[0.5, 0, 0]}><boxGeometry args={[1, 6, 1]} /><meshStandardMaterial color="#444" /></mesh>
                            <mesh position={[-4, -5, -4]} rotation={[-0.5, 0, 0]}><boxGeometry args={[1, 6, 1]} /><meshStandardMaterial color="#444" /></mesh>
                            <mesh position={[4, -5, -4]} rotation={[-0.5, 0, 0]}><boxGeometry args={[1, 6, 1]} /><meshStandardMaterial color="#444" /></mesh>

                            {/* Muzzle Flashes (Missiles/Guns) */}
                            {unit.attackCooldown > (config.attackSpeed - 10) && (
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
                            {/* Ghillie Suit / Camo Body */}
                            <mesh position={[0, 16, 0]} castShadow>
                                <sphereGeometry args={[3.5, 16, 16]} />
                                <meshStandardMaterial color="#fca5a5" /> {/* Skin */}
                                <mesh position={[0, 1, 0]}> {/* Boonie Hat */}
                                    <cylinderGeometry args={[5, 4, 1.5]} />
                                    <meshStandardMaterial color="#3f6212" /> {/* Dark Green */}
                                </mesh>
                            </mesh>
                            <mesh position={[0, 9, 0]} castShadow>
                                <boxGeometry args={[6, 10, 4]} />
                                <meshStandardMaterial color="#3f6212" /> {/* Camo Body */}
                            </mesh>
                            {/* Arms Aiming */}
                            <mesh position={[-4, 10, 2]} rotation={[-0.2, 0, 0.2]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#3f6212" />
                            </mesh>
                            <mesh position={[4, 10, 2]} rotation={[-1.2, 0.4, -0.2]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#3f6212" />
                                {/* Long Rifle */}
                                <group position={[0, -6, 2]} rotation={[Math.PI / 2, 0, 0]}>
                                    <mesh position={[0, 6, 0]}> {/* Stock & Body */}
                                        <boxGeometry args={[1.5, 12, 2]} />
                                        <meshStandardMaterial color="#3e3228" /> // Wood/Dark
                                    </mesh>
                                    <mesh position={[0, 14, 0]}> {/* Long Barrel */}
                                        <cylinderGeometry args={[0.5, 0.6, 16]} />
                                        <meshStandardMaterial color="#111" />
                                    </mesh>
                                    <mesh position={[0, 8, 1.5]} rotation={[Math.PI / 2, 0, 0]}> {/* Scope */}
                                        <cylinderGeometry args={[0.8, 0.8, 6]} />
                                        <meshStandardMaterial color="#000" />
                                    </mesh>
                                </group>
                            </mesh>
                            {/* Legs (Prone or Standing?) Standing for now */}
                            <mesh position={[-2, 2, 0]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#3f6212" />
                            </mesh>
                            <mesh position={[2, 2, -1]} rotation={[0.2, 0, 0]}>
                                <boxGeometry args={[2.5, 9, 2.5]} />
                                <meshStandardMaterial color="#3f6212" />
                            </mesh>
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
                        {/* Head */}
                        <mesh position={[0, 16, 0]} castShadow>
                            <sphereGeometry args={[3.5, 16, 16]} />
                            <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} />
                            <mesh position={[0, 1, 0]}>
                                <cylinderGeometry args={[4, 3.8, 2]} />
                                <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            </mesh>
                        </mesh>
                        {/* Body */}
                        <mesh position={[0, 9, 0]} castShadow>
                            <boxGeometry args={[6, 10, 4]} />
                            <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                        </mesh>
                        {/* Fuel tank on back */}
                        <mesh position={[0, 9, -4]} castShadow>
                            <cylinderGeometry args={[2.5, 2.5, 10]} />
                            <meshStandardMaterial color="#b45309" />
                        </mesh>
                        {/* Flame arm / nozzle */}
                        <mesh position={[4, 10, 2]} rotation={[-0.3, 0, -0.15]}>
                            <boxGeometry args={[2, 9, 2]} />
                            <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                            <mesh position={[0, -5, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
                                <cylinderGeometry args={[1.2, 0.8, 10]} />
                                <meshStandardMaterial color="#78350f" />
                            </mesh>
                        </mesh>
                        {/* Legs */}
                        <mesh position={[-2, 2, 0]}><boxGeometry args={[2.5, 9, 2.5]} /><meshStandardMaterial color="#333" /></mesh>
                        <mesh position={[2, 2, -1]} rotation={[0.2, 0, 0]}><boxGeometry args={[2.5, 9, 2.5]} /><meshStandardMaterial color="#333" /></mesh>
                        {/* Flame glow when attacking */}
                        {unit.attackCooldown > 4 && <pointLight position={[5, 8, 4]} color="#f97316" distance={30} intensity={4} />}
                    </group>
                )}

                {/* MEDIC — soldier with green cross on helmet */}
                {unit.type === UnitType.MEDIC && (
                    <group>
                        {/* Head with cross */}
                        <mesh position={[0, 16, 0]} castShadow>
                            <sphereGeometry args={[3.5, 16, 16]} />
                            <meshStandardMaterial color="#fca5a5" transparent={transparent} opacity={opacity} />
                            <mesh position={[0, 1.2, 0]}>
                                <cylinderGeometry args={[4, 3.8, 2]} />
                                <meshStandardMaterial color="white" transparent={transparent} opacity={opacity} />
                            </mesh>
                            {/* Cross symbol */}
                            <mesh position={[0, 2.5, 4]}><boxGeometry args={[3, 1, 0.5]} /><meshBasicMaterial color="#16a34a" /></mesh>
                            <mesh position={[0, 2.5, 4]}><boxGeometry args={[1, 3, 0.5]} /><meshBasicMaterial color="#16a34a" /></mesh>
                        </mesh>
                        {/* Body (white coat) */}
                        <mesh position={[0, 9, 0]} castShadow>
                            <boxGeometry args={[6, 10, 4]} />
                            <meshStandardMaterial color="white" transparent={transparent} opacity={opacity} />
                        </mesh>
                        {/* Arms */}
                        <mesh position={[-4, 10, 0]} rotation={[0, 0, 0.2]}><boxGeometry args={[2.5, 9, 2.5]} /><meshStandardMaterial color="white" transparent={transparent} opacity={opacity} /></mesh>
                        <mesh position={[4, 10, 1]} rotation={[-0.3, 0, -0.2]}>
                            <boxGeometry args={[2.5, 9, 2.5]} />
                            <meshStandardMaterial color="white" transparent={transparent} opacity={opacity} />
                            {/* Medkit */}
                            <mesh position={[0, -5, 1.5]}><boxGeometry args={[4, 3, 3]} /><meshStandardMaterial color="#dc2626" /></mesh>
                        </mesh>
                        {/* Legs */}
                        <mesh position={[-2, 2, 0]}><boxGeometry args={[2.5, 9, 2.5]} /><meshStandardMaterial color="#1f2937" /></mesh>
                        <mesh position={[2, 2, -1]} rotation={[0.2, 0, 0]}><boxGeometry args={[2.5, 9, 2.5]} /><meshStandardMaterial color="#1f2937" /></mesh>
                        {/* Healing glow */}
                        {unit.attackCooldown > 30 && <pointLight position={[0, 12, 0]} color="#4ade80" distance={25} intensity={2} />}
                    </group>
                )}

                {/* APC — boxy armored carrier */}
                {unit.type === UnitType.APC && (
                    <group>
                        {/* Hull */}
                        <mesh position={[0, 8, 0]} castShadow receiveShadow>
                            <boxGeometry args={[44, 13, 28]} />
                            <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                        </mesh>
                        {/* Angled front */}
                        <mesh position={[22, 10, 0]} rotation={[0, 0, -0.4]} castShadow>
                            <boxGeometry args={[8, 10, 26]} />
                            <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} />
                        </mesh>
                        {/* Wheels/tracks */}
                        <mesh position={[0, 4, -15]}><boxGeometry args={[40, 8, 6]} /><meshStandardMaterial color="#222" /></mesh>
                        <mesh position={[0, 4, 15]}><boxGeometry args={[40, 8, 6]} /><meshStandardMaterial color="#222" /></mesh>
                        {/* Small turret / MG mount */}
                        <mesh position={[0, 18, 0]} castShadow>
                            <boxGeometry args={[14, 6, 14]} />
                            <meshStandardMaterial color="#374151" transparent={transparent} opacity={opacity} />
                        </mesh>
                        {/* MG barrel */}
                        <mesh position={[12, 18, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[1, 1, 14]} />
                            <meshStandardMaterial color="#111" />
                        </mesh>
                        {unit.attackCooldown > (config.attackSpeed - 10) && <MuzzleFlash size={1.5} />}
                    </group>
                )}

                {/* BUNKER — concrete fortification */}
                {unit.type === UnitType.BUNKER && (
                    <group>
                        {/* Base slab */}
                        <mesh position={[0, 4, 0]} castShadow receiveShadow>
                            <boxGeometry args={[38, 8, 34]} />
                            <meshStandardMaterial color="#4b5563" roughness={0.95} />
                        </mesh>
                        {/* Upper parapet */}
                        <mesh position={[0, 11, 0]} castShadow>
                            <boxGeometry args={[34, 6, 30]} />
                            <meshStandardMaterial color="#374151" roughness={0.9} />
                        </mesh>
                        {/* Gun slit opening */}
                        <mesh position={[17, 11, 0]}>
                            <boxGeometry args={[2, 3, 16]} />
                            <meshStandardMaterial color="#111" />
                        </mesh>
                        {/* Gun barrel */}
                        <mesh position={[20, 11, 0]} rotation={[0, 0, -Math.PI / 2]}>
                            <cylinderGeometry args={[1.5, 1.5, 12]} />
                            <meshStandardMaterial color="#1f2937" />
                        </mesh>
                        {/* Sandbags */}
                        {[-12, 0, 12].map((z, i) => (
                            <mesh key={i} position={[-20, 6, z]} castShadow>
                                <sphereGeometry args={[5, 8, 6]} />
                                <meshStandardMaterial color="#78350f" roughness={1} />
                            </mesh>
                        ))}
                        {unit.attackCooldown > (config.attackSpeed - 8) && (
                            <group position={[18, 11, 0]} rotation={[0, -Math.PI / 2, 0]}>
                                <MuzzleFlash size={2} />
                            </group>
                        )}
                    </group>
                )}

                {/* Hit flash overlay */}
                {isHit && (
                    <mesh position={[0, 10, 0]}>
                        <boxGeometry args={[unit.width * 0.9 + 4, 22, unit.height * 0.9 + 4]} />
                        <meshBasicMaterial color="#ef4444" transparent opacity={0.45} depthWrite={false} />
                    </mesh>
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
                {/* Engine Glow */}
                <pointLight position={[-5, 0, 0]} color="orange" distance={40} intensity={3} />
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

const Particle3D = ({ p }: { p: Particle }) => {
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
                <pointLight distance={50} intensity={2} color={p.color} />
            </mesh>
        );
    }

    // Floating Text (Dollar Sign)
    if (p.text) {
        return (
            <group position={[p.position.x, 20 + (90 - p.life) * 0.5, p.position.y]}>
                <Text
                    fontSize={24}
                    color="#22c55e"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={1}
                    outlineColor="black"
                    rotation={[-Math.PI / 2, 0, 0]} // Face camera (top down-ish) or Billboard? Use Billboard logic if needed, but simple rotation works for top-down game
                >
                    {p.text}
                </Text>
            </group>
        );
    }

    // Scorch Mark / Ground Decal
    if (p.isGroundDecal) {
        return (
            <mesh position={[p.position.x, 0.2, p.position.y]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[p.size, 16]} />
                <meshStandardMaterial color={p.color} transparent opacity={p.life / 600} depthWrite={false} />
            </mesh>
        );
    }

    return (
        <mesh position={[p.position.x, 10 + (30 - p.life), p.position.y]}>
            <boxGeometry args={[p.size, p.size, p.size]} />
            <meshStandardMaterial color={p.color} transparent opacity={p.life / 30} />
        </mesh>
    );
};

const TerrainItem = ({ item, onCanvasClick }: { item: TerrainObject, onCanvasClick: (x: number, y: number) => void }) => {
    // River handled by RiverRenderer now
    // if (item.type === 'river') { ... } 

    if (item.type === 'bridge') {
        const width = item.width || 85;
        const height = item.height || 40;
        return (
            <group position={[item.x, 0.5, item.y]}>
                {/* Bridge Deck */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[width, 1, height]} />
                    <meshStandardMaterial color="#78350f" roughness={0.9} />
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

    if (item.type === 'hill') {
        const radius = item.size;
        const height = 40; // Matches logic
        const plateauRadius = radius * 0.5;

        return (
            <ClickableGroup position={[item.x, height / 2 - 1, item.y]} onCanvasClick={onCanvasClick}>
                {/* Truncated Cone for Plateau */}
                <mesh receiveShadow>
                    <cylinderGeometry args={[plateauRadius, radius, height, 32]} />
                    <meshStandardMaterial color="#4d7c0f" roughness={0.9} />
                </mesh>
            </ClickableGroup>
        );
    } else if (item.type === 'rock') {
        return (
            <ClickableGroup position={[item.x, item.size / 2, item.y]} onCanvasClick={onCanvasClick}>
                <mesh castShadow receiveShadow rotation={[item.size, item.x, item.y]}>
                    <dodecahedronGeometry args={[item.size, 0]} />
                    <meshStandardMaterial color="#57534e" />
                </mesh>
            </ClickableGroup>
        );
    } else if (item.type === 'building') {
        const seed = Math.abs((item.x * 73856093) ^ (item.y * 19349663));
        const h = 30 + (seed % 40); // Varied height 30-70
        const w = item.width || 30;
        const d = item.height || 30;
        const wallColor = item.state === 'burnt' ? '#1c1917' : (seed % 3 === 0 ? '#374151' : seed % 3 === 1 ? '#4b5563' : '#6b7280');
        return (
            <ClickableGroup position={[item.x, h / 2, item.y]} onCanvasClick={onCanvasClick}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[w, h, d]} />
                    <meshStandardMaterial color={wallColor} roughness={0.85} />
                </mesh>
                {/* Roof */}
                <mesh position={[0, h / 2 + 1, 0]}>
                    <boxGeometry args={[w + 2, 2, d + 2]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.9} />
                </mesh>
                {/* Windows (simple dark strips) */}
                {[0.3, 0.6].map((frac, i) => (
                    <mesh key={i} position={[w / 2 + 0.1, frac * h - h / 2, 0]}>
                        <boxGeometry args={[0.5, 4, d * 0.6]} />
                        <meshStandardMaterial color="#111827" />
                    </mesh>
                ))}
                {item.state === 'burning' && <pointLight color="#f97316" intensity={3} distance={40} position={[0, h / 2, 0]} />}
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
            leavesColor = flicker ? "#f97316" : "#fbbf24"; // Fire
        } else if (item.state === 'broken') {
            rot = [Math.PI / 2, 0, seed % 3]; // Fallen
            yOffset = -5;
        }

        return (
            <ClickableGroup position={[item.x, 0, item.y]} onCanvasClick={onCanvasClick}>
                <group rotation={rot} position={[0, yOffset, 0]}>
                    {/* Trunk */}
                    <mesh position={[0, 15 * scaleMod, 0]} castShadow>
                        <cylinderGeometry args={[5 * scaleMod, 8 * scaleMod, 30 * scaleMod]} />
                        <meshStandardMaterial color={trunkColor} />
                    </mesh>

                    {/* Leaves */}
                    {type === 0 && ( // Pine
                        <mesh position={[0, 45 * scaleMod, 0]} castShadow>
                            <coneGeometry args={[20 * scaleMod, 50 * scaleMod, 16]} />
                            <meshStandardMaterial color={leavesColor} />
                        </mesh>
                    )}
                    {type === 1 && ( // Oak
                        <mesh position={[0, 50 * scaleMod, 0]} castShadow>
                            <dodecahedronGeometry args={[25 * scaleMod, 0]} />
                            <meshStandardMaterial color={leavesColor} />
                        </mesh>
                    )}
                    {type === 2 && ( // Poplar
                        <mesh position={[0, 45 * scaleMod, 0]} castShadow>
                            <cylinderGeometry args={[8 * scaleMod, 12 * scaleMod, 60 * scaleMod]} />
                            <meshStandardMaterial color={leavesColor} />
                        </mesh>
                    )}

                    {item.state === 'burning' && <pointLight color="#f97316" intensity={2} distance={30} decay={2} position={[0, 30, 0]} />}
                </group>
            </ClickableGroup>
        );
    }
};

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

const Missile3D = ({ m }: { m: any }) => {
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
const BorderLine = ({ onCanvasClick }: { onCanvasClick: (x: number, y: number) => void }) => {
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
};

const GroundPlane = ({ onCanvasClick, targetingInfo, mapType }: { onCanvasClick: (x: number, y: number) => void, targetingInfo: { team: Team, type: UnitType } | null, mapType: MapType }) => {
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
};

// -- Main Scene Component --

export const GameScene: React.FC<GameSceneProps> = ({ units, projectiles, particles, terrain, flyovers, missiles, onCanvasClick, targetingInfo, weather, mapType }) => {



    return (
        <Canvas shadows camera={{ position: [CANVAS_WIDTH / 2, 600, CANVAS_HEIGHT + 200], fov: 45 }}>
            <color attach="background" args={[
                weather === 'rain'  ? '#334155' :
                weather === 'snow'  ? '#cbd5e1' :
                weather === 'fog'   ? '#94a3b8' :
                weather === 'storm' ? '#1e293b' : '#87CEEB'
            ]} />
            <fog attach="fog" args={[
                weather === 'rain'  ? '#334155' :
                weather === 'snow'  ? '#cbd5e1' :
                weather === 'fog'   ? '#94a3b8' :
                weather === 'storm' ? '#1e293b' : '#87CEEB',
                weather === 'fog' ? 180 : 500,
                weather === 'fog' ? 550 : 1500
            ]} />

            {weather === 'rain'  && <RainEffect />}
            {weather === 'snow'  && <SnowEffect />}
            {weather === 'storm' && <RainEffect />}

            <ambientLight intensity={
                weather === 'rain' || weather === 'fog' ? 0.3 :
                weather === 'storm' ? 0.15 :
                weather === 'snow'  ? 0.5 : 0.6
            } />
            <directionalLight
                position={[200, 500, 200]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-600}
                shadow-camera-right={600}
                shadow-camera-top={600}
                shadow-camera-bottom={-600}
            />

            <GroundPlane onCanvasClick={onCanvasClick} targetingInfo={targetingInfo} mapType={mapType} />
            <RiverRenderer terrain={terrain} mapType={mapType} />
            <BorderLine onCanvasClick={onCanvasClick} />

            {terrain.map(t => {
                if (t.type === 'river') return null; // Skip old river segments
                return <TerrainItem key={t.id} item={t} onCanvasClick={onCanvasClick} />;
            })}

            {units.map(u => <Unit3D key={u.id} unit={u} terrain={terrain} onCanvasClick={onCanvasClick} />)}

            {projectiles.map(p => <Projectile3D key={p.id} proj={p} />)}

            {particles.map(p => <Particle3D key={p.id} p={p} />)}

            {flyovers.map(f => <Flyover3D key={f.id} fly={f} />)}

            {missiles.map(m => <Missile3D key={m.id} m={m} />)}

            <OrbitControls target={[CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2]} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
    );
};
