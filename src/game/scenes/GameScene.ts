import Phaser from 'phaser';
import { TerrainSystem } from '../systems/TerrainSystem';
import { GAME_CONFIG, type TankData, type TerrainData } from '../types/GameTypes';

export class GameScene extends Phaser.Scene {
  private terrainSystem!: TerrainSystem;
  private terrainData!: TerrainData;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private aimLine!: Phaser.GameObjects.Graphics;


  private player1Angle: number = GAME_CONFIG.aiming.initialAngle;
  private player1Power: number = GAME_CONFIG.aiming.initialPower;


  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private tanks: TankData[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.backgroundColor);

    this.terrainSystem = new TerrainSystem();
    this.terrainData = this.terrainSystem.generate(this.scale.width, this.scale.height);

    this.terrainGraphics = this.add.graphics();
    this.terrainSystem.draw(this.terrainGraphics, this.terrainData);

    this.tanks = this.createTanks();
    this.drawTanks(this.tanks);

    this.aimLine = this.add.graphics();
    this.drawAimLine();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update(): void {
    if (this.cursors.left.isDown) {
      this.player1Angle = Math.max(GAME_CONFIG.aiming.minAngle, this.player1Angle - GAME_CONFIG.aiming.angleStep);
    }
    if (this.cursors.right.isDown) {
      this.player1Angle = Math.min(GAME_CONFIG.aiming.maxAngle, this.player1Angle + GAME_CONFIG.aiming.angleStep);
    }
    if (this.cursors.up.isDown) {
      this.player1Power = Math.min(GAME_CONFIG.aiming.maxPower, this.player1Power + GAME_CONFIG.aiming.powerStep);
    }
    if (this.cursors.down.isDown) {
      this.player1Power = Math.max(GAME_CONFIG.aiming.minPower, this.player1Power - GAME_CONFIG.aiming.powerStep);
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      console.log(`fire: angle=${this.player1Angle}, power=${this.player1Power}`);
    }

    this.drawAimLine();
  }

  private createTanks(): TankData[] {
    const tank1X = this.scale.width * 0.2;
    const tank2X = this.scale.width * 0.8;
    const tank1Y = this.terrainSystem.getHeightAtX(this.terrainData, tank1X) - GAME_CONFIG.tank.yOffset;
    const tank2Y = this.terrainSystem.getHeightAtX(this.terrainData, tank2X) - GAME_CONFIG.tank.yOffset;

    return [
      { x: tank1X, y: tank1Y, color: 0x2b2d42, label: 'Player 1' },
      { x: tank2X, y: tank2Y, color: 0x6d597a, label: 'Player 2' }
    ];
  }

  private drawTanks(tanks: TankData[]): void {
    tanks.forEach((tank) => {
      const tankBody = this.add.rectangle(tank.x, tank.y, GAME_CONFIG.tank.width, GAME_CONFIG.tank.height, tank.color);
      tankBody.setOrigin(0.5, 1);

      this.add.text(tank.x - 30, tank.y - 30, tank.label, {
        color: '#ffffff',
        fontSize: '14px'
      });
    });
  }

  private drawAimLine(): void {
    const player1Tank = this.tanks[0];
    if (!player1Tank) return;

    const radians = Phaser.Math.DegToRad(this.player1Angle);
    const startX = player1Tank.x;
    const startY = player1Tank.y - GAME_CONFIG.tank.height;
    const endX = startX + Math.cos(radians) * GAME_CONFIG.aiming.lineLength;
    const endY = startY - Math.sin(radians) * GAME_CONFIG.aiming.lineLength;

    this.aimLine.clear();
    this.aimLine.lineStyle(2, 0xffd166, 1);
    this.aimLine.beginPath();
    this.aimLine.moveTo(startX, startY);
    this.aimLine.lineTo(endX, endY);
    this.aimLine.strokePath();
  }
}
