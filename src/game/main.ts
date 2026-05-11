import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { GAME_CONFIG } from './types/GameTypes';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  pixelArt: true,
  scene: [BootScene, GameScene]
});
