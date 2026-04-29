# Tasks

## Milestone 1: Initial playable scene shell

### Completed
- Set up a Vite + TypeScript + Phaser browser project with no backend.
- Added Boot and Game scenes with a running single-scene game flow.
- Added generated placeholder terrain from a simple height array and rendered silhouette.
- Added two placeholder tanks positioned on top of terrain.
- Added labels for Player 1 and Player 2.
- Added a visible debug aim line for Player 1.
- Added keyboard controls:
  - Left/Right adjusts angle.
  - Up/Down adjusts power.
  - Space logs a fire message with angle and power.

### Next milestone
- Implement first projectile prototype (single ballistic shot) with custom update loop and no physics engine.

## Manual test steps
1. Run `npm install` and confirm dependencies install.
2. Run `npm run dev` and open the local Vite URL.
3. Confirm sky/background color and terrain silhouette render.
4. Confirm two tanks are visible and sit on top of terrain with labels “Player 1” and “Player 2”.
5. Press Left/Right and confirm Player 1 aim line rotates.
6. Press Up/Down and then Space; confirm console log includes updated angle and power values.
7. Confirm no projectile, crater, AI, menu, weapon, or audio features are present yet.
