import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('retro-sky', 'assets/retro/sky.png');
    this.load.image('retro-far-mountains', 'assets/retro/far_mountains.png');
    this.load.image('retro-mid-mountains', 'assets/retro/mid_mountains.png');
    this.load.image('retro-sun', 'assets/retro/sun.png');
    this.load.image('retro-cactus', 'assets/retro/cactus.png');
  }

  create(): void {
    this.scene.start('GameScene');
  }
}
