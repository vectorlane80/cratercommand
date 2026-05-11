import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { GAME_CONFIG } from './types/GameTypes';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  antialias: true,
  // scale.zoom doubles the canvas backing-store while keeping game-world
  // coordinates the same. Game logic still sees a 960x540 world; the canvas
  // is 1920x1080 internally. Combined with Text.setResolution(2) (in HUD /
  // MenuScene), text textures match the higher backing density so they
  // render crisply when CSS-stretched to fit the viewport.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 2,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height
  },
  scene: [BootScene, MenuScene, GameScene]
});
