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

    this.load.image('hires-backdrop', 'assets/hires/backdrop.png');
    this.load.image('hires-cactus', 'assets/hires/cactus.png');
    this.load.image('hires-tank-blue', 'assets/hires/tank_blue.png');
    this.load.image('hires-tank-red', 'assets/hires/tank_red.png');
    this.load.image('hires-barrel-blue', 'assets/hires/barrel_blue.png');
    this.load.image('hires-barrel-red', 'assets/hires/barrel_red.png');
    this.load.image('hires-shell', 'assets/hires/shell.png');
    this.load.image('hires-chute', 'assets/hires/chute.png');
    this.load.image('hires-rock', 'assets/hires/rock.png');
    this.load.image('hires-logo', 'assets/hires/logo.png');
    this.load.image('hires-mini-tank-blue', 'assets/hires/mini_tank_blue.png');
    this.load.image('hires-mini-tank-red', 'assets/hires/mini_tank_red.png');
    this.load.spritesheet('hires-blast', 'assets/hires/blast.png', { frameWidth: 128, frameHeight: 128 });
  }

  create(): void {
    const fontLoads = [
      document.fonts.load('600 16px "Barlow Condensed"'),
      document.fonts.load('700 16px "Barlow Condensed"'),
      document.fonts.load('400 12px "JetBrains Mono"')
    ];
    Promise.all(fontLoads).catch(() => undefined).finally(() => this.scene.start('LaunchScene'));
  }
}
