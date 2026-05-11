import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { GAME_CONFIG } from './types/GameTypes';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height
  },
  scene: [BootScene, MenuScene, GameScene]
});
