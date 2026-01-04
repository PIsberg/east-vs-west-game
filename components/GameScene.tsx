
import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, SoftShadows, useTexture, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Team, Unit, UnitType, Projectile, Particle, TerrainObject, Vector2D } from '../types';
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
    weather: 'clear' | 'rain';
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

const RiverRenderer = ({ terrain }: { terrain: TerrainObject[] }) => {
    const riverRef = useRef<any>(null);

    // Filter and sort river points (assuming they are generated in order in GameCanvas)
    // GameCanvas generates them y = -20 to HEIGHT + 20 in loop, so they are ordered by Y.
    const riverPoints = useMemo(() => terrain.filter(t => t.type === 'river'), [terrain]);

    // Construct Geometry
    const geometry = useMemo(() => {
        if (riverPoints.length < 2) return null;

        const width = 65; // Slightly wider than before (55) to overlap banks
        const halfWidth = width / 2;

        // Create vertices for Triangle Strip
        // For each point, create Left and Right vertex
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Calculate curve tangents could be better, but for now simple +/- X is okay 
        // IF the river flows vertically. 
        // The river gen is x = centerX + sin(y)... so it flows mostly along Z (Game Y).
        // So the "Right" vector is roughly (1, 0, 0).

        for (let i = 0; i < riverPoints.length; i++) {
            const p = riverPoints[i];

            // Calculate tangent if possible for better width orientation
            let normalX = 1;
            let normalZ = 0;

            if (i < riverPoints.length - 1) {
                const next = riverPoints[i + 1];
                const dx = next.x - p.x;
                const dy = next.y - p.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                // Perpendicular to direction
                normalX = -dy / len;
                normalZ = dx / len;
            } else if (i > 0) {
                // Use prev
                const prev = riverPoints[i - 1];
                const dx = p.x - prev.x;
                const dy = p.y - prev.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                normalX = -dy / len;
                normalZ = dx / len;
            }

            // Left Vertex
            vertices.push(p.x - normalX * halfWidth, 0.2, p.y - normalZ * halfWidth);
            uvs.push(0, i / (riverPoints.length * 0.1)); // Scale V for repeating texture

            // Right Vertex
            vertices.push(p.x + normalX * halfWidth, 0.2, p.y + normalZ * halfWidth);
            uvs.push(1, i / (riverPoints.length * 0.1));

            // Indices
            if (i < riverPoints.length - 1) {
                const base = i * 2;
                // Triangle 1
                indices.push(base, base + 1, base + 2);
                // Triangle 2
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;

    }, [riverPoints]);

    useFrame(({ clock }) => {
        if (riverRef.current) {
            riverRef.current.uTime = clock.getElapsedTime();
        }
    });

    if (!geometry) return null;

    return (
        <mesh geometry={geometry} receiveShadow> {/* Wait, vertices are already x,y,z? No, y is height. */}
            {/* Actually my vertices are x, height, z (game y). So NO rotation needed on mesh if geometry is right. */}
            {/* But wait, in existing code TerrainItem uses rotation={[-Math.PI / 2, 0, 0]} and planeGeometry (x,y). */}
            {/* My manual vertices are (x, 0.2, z). So I don't need rotation. */}
            {/* Let's verify rotation. Standard Three.js Y is UP. */}
            {/* My vertices: x, 0.2, y (which is Z in 3D). Correct. */}
            {/* <riverMaterial /> is not a standard element. need 'primitive' or cast. */}
            {/* react-three-fiber 'extend' makes it available as camelCase 'riverMaterial' */}
            <riverMaterial ref={riverRef} transparent side={THREE.DoubleSide} />
        </mesh>
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

const Unit3D = ({ unit, terrain, onCanvasClick }: { unit: Unit, terrain: TerrainObject[], onCanvasClick: (x: number, y: number) => void }) => {
    const config = UNIT_CONFIG[unit.type] as any;
    const terrainH = getTerrainHeight(unit.position.x, unit.position.y, terrain);

    const position = [unit.position.x, terrainH, unit.position.y];

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
                {/* Health Bar (Floating) */}
                <mesh position={[0, 20, 0]}>
                    <boxGeometry args={[20, 3, 1]} />
                    <meshBasicMaterial color="gray" />
                </mesh>
                <mesh position={[-10 + 10 * (unit.health / unit.maxHealth), 20, 0.5]}>
                    <boxGeometry args={[20 * (unit.health / unit.maxHealth), 3, 1]} />
                    <meshBasicMaterial color="#22c55e" />
                </mesh>

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
                                <mesh position={[40, 18, 0]}>
                                    <sphereGeometry args={[8, 8, 8]} />
                                    <meshBasicMaterial color="orange" transparent opacity={0.8} />
                                    <mesh position={[2, 0, 0]}>
                                        <sphereGeometry args={[4, 8, 8]} />
                                        <meshBasicMaterial color="yellow" />
                                    </mesh>
                                </mesh>
                            )}
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
                                    <mesh position={[0, 20, 40]}>
                                        <sphereGeometry args={[10, 8, 8]} />
                                        <meshBasicMaterial color="orange" transparent opacity={0.8} />
                                    </mesh>
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
                                        <torusGeometry args={[1.5, 0.5, 8, 16]} />
                                        <meshStandardMaterial color="#1c1917" transparent={transparent} opacity={opacity} />
                                    </mesh>
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
                        <group position={[0, 15, 0]}>
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


            </group>
        </ClickableGroup >
    );
};

const Projectile3D = ({ proj }: { proj: Projectile }) => {
    return (
        <mesh position={[proj.position.x, 15, proj.position.y]}>
            <sphereGeometry args={[3, 8, 8]} />
            <meshStandardMaterial color={proj.targetType === 'air' ? '#f43f5e' : '#fbbf24'} emissive="#fbbf24" emissiveIntensity={2} />
        </mesh>
    );
};

const Particle3D = ({ p }: { p: Particle }) => {
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

    return (
        <group>
            {/* Plane */}
            <group position={[fly.currentX, altitude, fly.altitudeY]} rotation={[0, fly.speed > 0 ? 0 : Math.PI, 0]}>
                <mesh castShadow rotation={[0, 0, -Math.PI / 2]}>
                    <coneGeometry args={[10, 40, 8]} />
                    <meshStandardMaterial color="#334155" />
                </mesh>
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[15, 2, 40]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                {/* Health */}
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

const GroundPlane = ({ onCanvasClick, targetingInfo }: { onCanvasClick: (x: number, y: number) => void, targetingInfo: { team: Team, type: UnitType } | null }) => {
    // Generate grass spots
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
                <meshStandardMaterial color="#365314" roughness={1} />
            </mesh>

            {/* Grass Decoration Spots */}
            {spots.map((s, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[CANVAS_WIDTH / 2 + s.x, -0.5, CANVAS_HEIGHT / 2 + s.y]}>
                    <circleGeometry args={[s.s, 16]} />
                    <meshStandardMaterial color="#14532d" transparent opacity={0.4} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

// -- Main Scene Component --

export const GameScene: React.FC<GameSceneProps> = ({ units, projectiles, particles, terrain, flyovers, missiles, onCanvasClick, targetingInfo, weather }) => {



    return (
        <Canvas shadows camera={{ position: [CANVAS_WIDTH / 2, 600, CANVAS_HEIGHT + 200], fov: 45 }}>
            <color attach="background" args={[weather === 'rain' ? '#334155' : '#87CEEB']} />
            <fog attach="fog" args={[weather === 'rain' ? '#334155' : '#87CEEB', 500, 1500]} />

            {/* Rain Effect */}
            {weather === 'rain' && <RainEffect />}

            <ambientLight intensity={weather === 'rain' ? 0.3 : 0.6} />
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

            <GroundPlane onCanvasClick={onCanvasClick} targetingInfo={targetingInfo} />
            <RiverRenderer terrain={terrain} />
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
