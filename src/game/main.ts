import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { GAME_CONFIG } from './types/GameTypes';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  antialias: true,
  // Enable Phaser's DOM-element layer so LobbyScene can put real HTML
  // <input>s on top of the canvas (proper touch keyboard support, etc.).
  dom: { createContainer: true },
  // The canvas backing store is renderScale× the 960×540 game world; each
  // scene's main camera zooms by renderScale so world coordinates are
  // unchanged. (Scale.zoom cannot do this — it only stretches the canvas's
  // CSS size, leaving the backing store at 960×540, which is what made
  // everything pixelated on hi-DPI displays.)
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_CONFIG.width * GAME_CONFIG.renderScale,
    height: GAME_CONFIG.height * GAME_CONFIG.renderScale
  },
  scene: [BootScene, MenuScene, LobbyScene, GameScene]
});
