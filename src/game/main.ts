import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { GAME_CONFIG } from './types/GameTypes';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: document.body,
  // Anti-aliased rendering looks better at fractional CSS scales than the
  // previous pixelArt: true nearest-neighbor upscale. The retro pixel
  // sprite system (currently hidden) would need its own per-texture
  // NEAREST filter if it ever comes back.
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height
  },
  scene: [BootScene, MenuScene, GameScene]
});
