# Technical Decisions

## Stack
- **Vite + TypeScript + Phaser (no React)** was selected to keep startup fast and code focused on game loop logic.
- **No backend** is used for milestone 1 to keep all gameplay local and deterministic while prototyping core mechanics.

## Architecture
- **BootScene** only transitions into **GameScene**, keeping startup responsibilities separate from gameplay logic.
- **TerrainSystem** owns terrain generation, rendering, and terrain-height lookup by X.
- **Game constants** are centralized in `src/game/types/GameTypes.ts` under `GAME_CONFIG` for easy balancing.

## Scope boundaries for milestone 1
- No projectile physics yet.
- No craters/destructible terrain yet.
- No AI.
- No weapons system.
- No menus.
- No audio.
