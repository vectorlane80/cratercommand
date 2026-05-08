import Phaser from 'phaser';
import { GAME_CONFIG, type TankState, type TurnState, type WeaponDefinition } from '../types/GameTypes';

export class HudSystem {
  private graphics: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  render(turn: TurnState, tanks: TankState[], weapon: WeaponDefinition): void {
    this.clearTexts();
    this.graphics.clear();
    this.drawTopHud(turn, tanks);
    this.drawConsole(turn, tanks[turn.activePlayerId], weapon);
  }

  destroy(): void {
    this.clearTexts();
    this.graphics.destroy();
  }

  private drawTopHud(turn: TurnState, tanks: TankState[]): void {
    const colors = GAME_CONFIG.colors;

    this.addText(20, 10, 'PLAYER 1', colors.magenta, GAME_CONFIG.font.large);
    this.addText(48, 42, `${tanks[0].health}`, colors.white, GAME_CONFIG.font.large);
    this.addText(382, 10, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.large);

    const arrow = turn.wind.direction < 0 ? '<--' : '-->';
    this.addText(398, 48, 'Wind:', colors.white, GAME_CONFIG.font.medium);
    this.addText(492, 48, `${arrow}  ${turn.wind.magnitude}`, colors.green, GAME_CONFIG.font.medium);

    this.addText(836, 10, 'PLAYER 2', colors.cyan, GAME_CONFIG.font.large);
    this.addText(874, 42, `${tanks[1].health}`, colors.white, GAME_CONFIG.font.large);

    if (turn.phase === 'gameOver' && turn.winnerId !== null) {
      this.addText(340, 154, `PLAYER ${turn.winnerId + 1} WINS`, colors.yellow, GAME_CONFIG.font.title);
      this.addText(332, 190, 'PRESS R TO RESTART', colors.white, GAME_CONFIG.font.medium);
    }
  }

  private drawConsole(turn: TurnState, activeTank: TankState, weapon: WeaponDefinition): void {
    const colors = GAME_CONFIG.colors;
    const top = GAME_CONFIG.layout.consoleTop;

    this.graphics.fillStyle(colors.panelGray, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, GAME_CONFIG.layout.consoleHeight);
    this.graphics.lineStyle(3, colors.panelLight, 1);
    this.graphics.strokeRect(0, top, GAME_CONFIG.width, GAME_CONFIG.layout.consoleHeight - 1);
    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(10, top + 16, 290, 142);
    this.graphics.fillRect(328, top + 42, 205, 104);
    this.graphics.fillRect(548, top + 38, 146, 108);
    this.graphics.fillRect(710, top + 18, 238, 128);

    this.drawFireButton(top);
    this.drawWeaponList(top);
    this.drawAimPowerPanel(activeTank, turn.phase, top);
    this.drawSelectedWeapon(weapon, top);
    this.drawLogo(top);

    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, GAME_CONFIG.layout.bottomStatusTop + 4, GAME_CONFIG.width, 16);
    this.addText(42, 526, 'F1 = Help', 0x2e66ff, GAME_CONFIG.font.tiny);
    this.addText(382, 526, 'EMPIRE INTERACTIVE', colors.yellow, GAME_CONFIG.font.tiny);
    this.addText(790, 526, 'F10 = Sound', 0x2e66ff, GAME_CONFIG.font.tiny);
  }

  private drawFireButton(top: number): void {
    this.graphics.fillStyle(GAME_CONFIG.colors.panelLight, 1);
    this.graphics.fillRect(386, top + 8, 110, 36);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.black, 1);
    this.graphics.strokeRect(386, top + 8, 110, 36);
    this.addText(406, top + 12, 'Fire', GAME_CONFIG.colors.red, GAME_CONFIG.font.title);
  }

  private drawWeaponList(top: number): void {
    const rows = [
      ['1', 'Small Missile', '10'],
      ['2', 'Big Missile', '20'],
      ['3', 'Triple Missile', '30'],
      ['4', 'Huge Missile', '40'],
      ['5', 'Dirt Mover', '25'],
      ['6', 'Bouncing Bomb', '30'],
      ['7', 'Bullet', '10'],
      ['8', 'Stream', '20']
    ];

    this.addText(20, top + 20, 'Weapon', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);
    this.addText(210, top + 20, 'Move  4', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);

    const rowStep = 13;
    rows.forEach(([key, name, ammo], index) => {
      const color = index === 0 ? GAME_CONFIG.colors.white : 0x9c9c9c;
      this.addText(20, top + 38 + index * rowStep, `${key} ${name}`, color, GAME_CONFIG.font.small);
      this.addText(258, top + 38 + index * rowStep, ammo, color, GAME_CONFIG.font.small);
    });

    this.addText(20, top + 145, 'ESC to Exit', GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
  }

  private drawAimPowerPanel(activeTank: TankState, phase: string, top: number): void {
    const canFire = phase === 'aiming';
    const stateColor = canFire ? GAME_CONFIG.colors.green : GAME_CONFIG.colors.red;

    this.addText(344, top + 56, 'Angle', GAME_CONFIG.colors.green, GAME_CONFIG.font.medium);
    this.addText(480, top + 54, `${Math.round(activeTank.angle)}`, GAME_CONFIG.colors.green, GAME_CONFIG.font.large);
    this.addText(344, top + 88, 'Power', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.medium);
    this.addText(480, top + 86, `${Math.round(activeTank.power)}`, GAME_CONFIG.colors.magenta, GAME_CONFIG.font.large);
    this.addText(344, top + 132, canFire ? 'SPACE TO FIRE' : 'SHOT IN FLIGHT', stateColor, GAME_CONFIG.font.tiny);

    this.graphics.lineStyle(3, GAME_CONFIG.colors.magenta, 1);
    this.graphics.strokeRect(344, top + 116, 174, 12);
    this.graphics.fillStyle(GAME_CONFIG.colors.magenta, 0.85);
    this.graphics.fillRect(346, top + 118, activeTank.power * 1.7, 8);
  }

  private drawSelectedWeapon(weapon: WeaponDefinition, top: number): void {
    this.addText(583, top + 46, 'Weapon', GAME_CONFIG.colors.cyan, GAME_CONFIG.font.medium);
    this.addText(562, top + 76, weapon.name, GAME_CONFIG.colors.white, GAME_CONFIG.font.tiny);
    this.graphics.fillStyle(GAME_CONFIG.colors.magenta, 1);
    this.graphics.fillRect(614, top + 96, 14, 24);
    this.graphics.lineStyle(2, GAME_CONFIG.colors.white, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(614, top + 120);
    this.graphics.lineTo(604, top + 130);
    this.graphics.moveTo(628, top + 120);
    this.graphics.lineTo(638, top + 130);
    this.graphics.strokePath();
    this.addText(608, top + 132, weapon.ammoLabel, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.tiny);
  }

  private drawLogo(top: number): void {
    this.addText(762, top + 36, 'CRATER', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.title);
    this.addText(744, top + 74, 'COMMAND', GAME_CONFIG.colors.cyan, GAME_CONFIG.font.title);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.green, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(738, top + 116);
    this.graphics.lineTo(770, top + 96);
    this.graphics.lineTo(798, top + 116);
    this.graphics.lineTo(826, top + 96);
    this.graphics.lineTo(858, top + 116);
    this.graphics.strokePath();
    this.addText(740, top + 130, '(C) 2024 YOUR STUDIO', GAME_CONFIG.colors.yellow, GAME_CONFIG.font.tiny);
  }

  private addText(x: number, y: number, value: string, color: number, fontSize: string): void {
    const text = this.scene.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    text.setResolution(1);
    this.texts.push(text);
  }

  private clearTexts(): void {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }
}
