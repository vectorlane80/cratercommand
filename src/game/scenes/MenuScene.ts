import Phaser from 'phaser';
import {
  CONTROLLER_CYCLE,
  CONTROLLER_LABELS,
  GAME_CONFIG,
  type ControllerKind
} from '../types/GameTypes';

export interface MenuResult {
  controllers: [ControllerKind, ControllerKind];
}

export class MenuScene extends Phaser.Scene {
  private controllers: [ControllerKind, ControllerKind] = ['human', 'cpu-veteran'];
  private texts: Phaser.GameObjects.Text[] = [];
  private graphics!: Phaser.GameObjects.Graphics;

  private oneKey!: Phaser.Input.Keyboard.Key;
  private twoKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    this.graphics = this.add.graphics();

    this.oneKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.twoKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.render();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.oneKey)) {
      this.controllers[0] = this.cycle(this.controllers[0]);
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.twoKey)) {
      this.controllers[1] = this.cycle(this.controllers[1]);
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      const result: MenuResult = { controllers: [...this.controllers] as [ControllerKind, ControllerKind] };
      this.scene.start('GameScene', result);
    }
  }

  private cycle(current: ControllerKind): ControllerKind {
    const idx = CONTROLLER_CYCLE.indexOf(current);
    return CONTROLLER_CYCLE[(idx + 1) % CONTROLLER_CYCLE.length];
  }

  private render(): void {
    this.clearTexts();
    this.graphics.clear();

    const colors = GAME_CONFIG.colors;

    // Title
    this.addText(GAME_CONFIG.width / 2 - 174, 60, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.title);
    this.addText(GAME_CONFIG.width / 2 - 80, 100, 'MATCH SETUP', colors.cyan, GAME_CONFIG.font.large);

    // Player rows
    const rowY1 = 200;
    const rowY2 = 260;
    this.drawPlayerRow(0, rowY1, 'PLAYER 1', this.controllers[0], colors.cyan);
    this.drawPlayerRow(1, rowY2, 'PLAYER 2', this.controllers[1], colors.magenta);

    // Hints
    this.addText(
      GAME_CONFIG.width / 2 - 220,
      350,
      'Press 1 to cycle Player 1   ·   2 to cycle Player 2',
      colors.white,
      GAME_CONFIG.font.medium
    );
    this.addText(
      GAME_CONFIG.width / 2 - 156,
      390,
      'SPACE or ENTER to start match',
      colors.yellow,
      GAME_CONFIG.font.medium
    );

    // Difficulty hints
    this.addText(40, 460, 'CADET — sloppy shots, picks random weapons.', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(40, 478, 'VETERAN — solid aim, uses highest-damage weapon available.', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(40, 496, 'MARSHAL — searches every weapon and angle for the best shot.', colors.dimGray, GAME_CONFIG.font.small);
  }

  private drawPlayerRow(_idx: number, y: number, label: string, kind: ControllerKind, accent: number): void {
    const colors = GAME_CONFIG.colors;
    const boxX = 280;
    const boxY = y - 6;
    const boxW = 400;
    const boxH = 40;

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(boxX, boxY, boxW, boxH);
    this.graphics.lineStyle(2, accent, 1);
    this.graphics.strokeRect(boxX, boxY, boxW, boxH);

    this.addText(120, y, label, accent, GAME_CONFIG.font.large);
    this.addText(boxX + 16, y + 4, CONTROLLER_LABELS[kind], colors.white, GAME_CONFIG.font.medium);
  }

  private addText(x: number, y: number, value: string, color: number, fontSize: string): void {
    const text = this.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    text.setResolution(1);
    this.texts.push(text);
  }

  private clearTexts(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }
}
