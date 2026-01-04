# East vs West 3D - Architecture Documentation

## Overview
**East vs West 3D** is a tug-of-war strategy game built with React and Three.js. The game features a hybrid architecture where game logic runs in a high-performance loop separate from the React render cycle, while 3D rendering is handled by `@react-three/fiber`.

## Technology Stack

### Core Frameworks
-   **React (v18+)**: The backbone of the application structure and UI overlays.
-   **TypeScript**: Ensures type safety across game entities, state, and configuration.
-   **Vite**: Build tool for fast development and HMR.

### Rendering & Graphics
-   **Three.js**: The underlying 3D graphics library.
-   **@react-three/fiber (R3F)**: A React reconciler for Three.js, allowing declarative unit and terrain composition.
-   **@react-three/drei**: Helper library for common R3F abstractions (Shadows, Camera controls, etc.).
-   **Lucide React**: Vector icons for the UI/HUD.
-   **Tailwind CSS**: Utility-first CSS for styling the HUD and menus.

## Architecture Pattern

### 1. Hybrid State Management
The game uses a **dual-state strategy** to balance React's declarative nature with the high-frequency updates needed for a game loop:

-   **React State (`useState`)**:
    -   Used for "Low Frequency" updates: Score, Money, UI overlays (Game Over), Spawn Queue.
    -   Triggers HUD re-renders only when necessary.

-   **Mutable Refs (`useRef`)**:
    -   Used for "High Frequency" updates: Unit positions, Projectiles, Particles, Physics.
    -   **Why?** React state updates are asynchronous and trigger re-renders. A game loop running at 60 FPS cannot afford the overhead of React reconciliation for every frame.
    -   **Implementation**: `unitsRef`, `projectilesRef`, `particlesRef` store the mutable game state.

### 2. The Game Loop (`requestAnimationFrame`)
Located in `GameCanvas.tsx`, the `tick` function is the heartbeat of the game.
-   **Update Phase**: Calculates movement, collision detection, and logic updates.
-   **Render Phase**: R3F handles the 3D rendering automatically based on the prop updates passed to components.
    *(Note: In this specific implementation, we pass the refs down to `GameScene`, or R3F components subscribe to the refs to update their transforms directly without re-rendering the entire React tree).*

### 3. Separation of Concerns
-   **`App.tsx`**: The container. Handles global UI state (Score, Money), Input handling (Keyboard shortcuts), and Layout.
-   **`GameCanvas.tsx`**: The **Game Engine**.
    -   Contains the `update()` loop.
    -   Handles logic: Movement, Pathfinding (A* or simple vector), Targeting, Combat, Spawning.
    -   Manages `SpatialHash` for optimized collision detection.
-   **`GameScene.tsx`**: The **Renderer**.
    -   Purely presentational 3D components (`Unit3D`, `Projectile3D`).
    -   Receives arrays of data and maps them to 3D meshes.
-   **`types.ts`**: Shared interfaces defining `Unit`, `Projectile`, `GameState`, ensuring consistency between Logic and Render layers.
-   **`constants.ts`**: Game balance configuration (Health, Damage, Speed, Colors).

## Key Systems

### Spatial Hashing (`spatialHash.ts`)
To optimize collision detection (Projectile vs Unit), the game uses a Spatial Hash grid. Instead of checking every projectile against every unit ($O(N*M)$), we only check entities in the same or neighboring grid cells, significantly reducing computational load.

### 3D Rendering Optimization
-   **Instancing (Planned/Potential)**: Currently, units are rendered as individual components. For massive scale, `InstancedMesh` would be the next optimization step.
-   **Canvas vs 3D**: The game logic treats the world as a 2D plane (x, y) with a "horizon" for perspective scaling. The 3D renderer simply projects this 2D logic into 3D space, adding visual flair like height, rotation, and particle effects without complicating the core simulation.

## Directory Structure
```
/src
  /components
    App.tsx           # UI & Input
    GameCanvas.tsx    # Game Logic & Loop
    GameScene.tsx     # 3D Rendering
  /services
    audio.ts          # Sound Manager
    ai.ts             # (Optional) Battle Commentary LLM
  /utils
    spatialHash.ts    # Collision Optimization
  constants.ts        # Game Config
  types.ts            # Type Definitions
```
