import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.image('retro-backdrop', 'assets/retro/backdrop.png');
    this.load.image('retro-cactus', 'assets/retro/cactus.png');
    this.load.image('retro-tank-blue', 'assets/retro/tank_blue.png');
    this.load.image('retro-tank-red', 'assets/retro/tank_red.png');
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
