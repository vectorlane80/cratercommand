import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type MatchState,
  type PlayerId,
  type TankState,
  type TurnState,
  type VisualSystem,
  type WeaponDefinition
} from '../types/GameTypes';

export class HudSystem {
  private graphics: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  render(
    turn: TurnState,
    tanks: TankState[],
    weapon: WeaponDefinition,
    match: MatchState,
    statusMessage: string | null,
    visualSystem: VisualSystem = 'classic'
  ): void {
    this.clearTexts();
    this.graphics.clear();

    const inShop = turn.phase === 'shopping' && match.shoppingPlayerId !== null;
    const matchOver = turn.phase === 'matchOver' && match.matchWinnerId !== null;

    if (!inShop && !matchOver) {
      if (visualSystem === 'retroPixel') {
        this.drawRetroPixelHud(turn, tanks, weapon, match);
      } else {
        this.drawTopHud(turn, tanks, match);
        this.drawConsole(turn, tanks[turn.activePlayerId], weapon, match);
      }
    }

    if (inShop) {
      this.drawShopOverlay(match);
    } else if (turn.phase === 'roundOver' && statusMessage) {
      this.drawCenterBanner(statusMessage, 'PRESS SPACE OR ENTER FOR SHOP');
    } else if (matchOver) {
      this.drawFullScreenBackdrop();
      this.drawCenterBanner(
        `PLAYER ${match.matchWinnerId! + 1} WINS THE MATCH`,
        'PRESS R TO RESTART'
      );
    }
  }

  private drawFullScreenBackdrop(): void {
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 1);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
  }

  destroy(): void {
    this.clearTexts();
    this.graphics.destroy();
  }

  private drawTopHud(turn: TurnState, tanks: TankState[], match: MatchState): void {
    const colors = GAME_CONFIG.colors;

    this.addText(20, 6, 'PLAYER 1', colors.magenta, GAME_CONFIG.font.large);
    this.addText(48, 38, `${tanks[0].health}`, colors.white, GAME_CONFIG.font.large);
    this.addText(20, 64, `$${match.profiles[0].cash}  W:${match.profiles[0].wins}`, colors.yellow, GAME_CONFIG.font.small);

    this.addText(382, 6, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.large);

    const arrow = turn.wind.direction < 0 ? '<--' : '-->';
    this.addText(398, 42, 'Wind:', colors.white, GAME_CONFIG.font.medium);
    this.addText(492, 42, `${arrow}  ${turn.wind.magnitude}`, colors.green, GAME_CONFIG.font.medium);
    this.addText(
      430,
      68,
      `ROUND ${match.round}  (FIRST TO ${match.roundsToWin})`,
      colors.cyan,
      GAME_CONFIG.font.small
    );

    this.addText(836, 6, 'PLAYER 2', colors.cyan, GAME_CONFIG.font.large);
    this.addText(874, 38, `${tanks[1].health}`, colors.white, GAME_CONFIG.font.large);
    this.addText(
      790,
      64,
      `$${match.profiles[1].cash}  W:${match.profiles[1].wins}`,
      colors.yellow,
      GAME_CONFIG.font.small
    );
  }

  private drawConsole(turn: TurnState, activeTank: TankState, weapon: WeaponDefinition, match: MatchState): void {
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
    this.drawWeaponList(top, activeTank);
    this.drawAimPowerPanel(activeTank, turn.phase, top);
    this.drawSelectedWeapon(weapon, activeTank, top);
    this.drawStatusPanel(activeTank, match, top);

    const stripY = GAME_CONFIG.layout.bottomStatusTop - 5;
    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, stripY, GAME_CONFIG.width, 26);
    this.addText(20, stripY + 4, '←→ Aim  ↑↓ Power  A/D Move  SPACE Fire', 0x2e66ff, GAME_CONFIG.font.medium);
    this.addText(660, stripY + 4, '1-8 Weapon   V Visual', colors.yellow, GAME_CONFIG.font.medium);
  }

  private drawRetroPixelHud(
    turn: TurnState,
    tanks: TankState[],
    weapon: WeaponDefinition,
    match: MatchState
  ): void {
    const colors = GAME_CONFIG.colors;
    const activeTank = tanks[turn.activePlayerId];
    const top = GAME_CONFIG.layout.consoleTop;

    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, 82);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(2, 2, GAME_CONFIG.width - 4, GAME_CONFIG.height - 4);
    this.graphics.lineStyle(1, colors.steelDark, 1);
    this.graphics.strokeRect(6, 6, GAME_CONFIG.width - 12, GAME_CONFIG.height - 12);

    this.drawRetroPlayerPanel(22, 14, tanks[0], match, colors.retroBlue);
    this.drawRetroPlayerPanel(774, 14, tanks[1], match, colors.retroOrange);

    const windArrow = turn.wind.direction < 0 ? '<' : '>';
    this.addText(448, 16, `Turn ${match.round}`, colors.white, GAME_CONFIG.font.medium);
    this.addText(
      434,
      42,
      `PLAYER ${turn.activePlayerId + 1}`,
      turn.activePlayerId === 0 ? colors.retroBlue : colors.retroOrange,
      GAME_CONFIG.font.large
    );
    this.addText(432, 66, `Wind ${windArrow} ${turn.wind.magnitude}`, colors.white, GAME_CONFIG.font.medium);

    this.graphics.fillStyle(colors.steelMid, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, 134);
    this.graphics.lineStyle(3, colors.steelLight, 1);
    this.graphics.strokeRect(0, top, GAME_CONFIG.width, 134);

    this.drawRetroPanelFrame(8, top + 8, 208, 122, 'WEAPONS');
    this.drawRetroWeaponRows(18, top + 38, activeTank);
    this.drawRetroPanelFrame(220, top + 8, 176, 122, 'ANGLE');
    this.drawRetroAnglePanel(236, top + 42, activeTank);
    this.drawRetroPanelFrame(400, top + 8, 204, 122, 'POWER');
    this.drawRetroPowerPanel(416, top + 42, activeTank);
    this.drawRetroPanelFrame(610, top + 8, 140, 122, '');
    this.drawRetroFireButton(632, top + 36, turn.phase === 'aiming');
    this.drawRetroPanelFrame(756, top + 8, 196, 122, 'ITEMS');
    this.drawRetroItemsPanel(772, top + 42, activeTank, match);

    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, top + 136, GAME_CONFIG.width, 46);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(0, top + 136, GAME_CONFIG.width, 46);
    this.addText(16, top + 144, '** Welcome to CRATER COMMAND! **', colors.green, GAME_CONFIG.font.small);
    this.addText(
      16,
      top + 162,
      `** Turn ${match.round} - PLAYER ${turn.activePlayerId + 1} **   Weapon: ${weapon.name}   V swaps visual system`,
      colors.cyan,
      GAME_CONFIG.font.small
    );
    this.addText(744, top + 146, turn.phase === 'aiming' ? 'SPACE to fire' : 'SHOT IN FLIGHT', colors.white, GAME_CONFIG.font.small);
    this.addText(744, top + 164, 'ESC for menu', colors.red, GAME_CONFIG.font.small);
  }

  private drawRetroPlayerPanel(x: number, y: number, tank: TankState, match: MatchState, color: number): void {
    const colors = GAME_CONFIG.colors;
    this.addText(x, y, `PLAYER ${tank.id + 1}`, color, GAME_CONFIG.font.medium);
    this.drawMiniTank(x + 2, y + 30, color);
    this.addText(x + 56, y + 24, `${tank.health}`, colors.white, GAME_CONFIG.font.medium);
    this.graphics.fillStyle(colors.steelDark, 1);
    this.graphics.fillRect(x + 102, y + 28, 74, 8);
    this.graphics.fillStyle(colors.green, 1);
    this.graphics.fillRect(x + 104, y + 30, Math.max(0, tank.health / GAME_CONFIG.tank.maxHealth) * 70, 4);
    this.addText(x + 56, y + 48, `$ ${match.profiles[tank.id].cash}`, colors.yellow, GAME_CONFIG.font.small);
  }

  private drawMiniTank(x: number, y: number, color: number): void {
    this.graphics.fillStyle(color, 1);
    this.graphics.fillRect(x, y + 12, 38, 8);
    this.graphics.fillRect(x + 8, y + 4, 18, 8);
    this.graphics.lineStyle(3, color, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(x + 20, y + 5);
    this.graphics.lineTo(x + 34, y - 2);
    this.graphics.strokePath();
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 1);
    for (let i = 0; i < 5; i += 1) {
      this.graphics.fillRect(x + 3 + i * 7, y + 21, 4, 4);
    }
  }

  private drawRetroPanelFrame(x: number, y: number, w: number, h: number, title: string): void {
    const colors = GAME_CONFIG.colors;
    this.graphics.fillStyle(colors.steelDark, 1);
    this.graphics.fillRect(x, y, w, h);
    this.graphics.lineStyle(3, colors.steelLight, 1);
    this.graphics.strokeRect(x, y, w, h);
    this.graphics.lineStyle(1, colors.black, 1);
    this.graphics.strokeRect(x + 5, y + 5, w - 10, h - 10);
    if (title) {
      this.addText(x + 52, y + 8, title, colors.white, GAME_CONFIG.font.medium);
    }
  }

  private drawRetroWeaponRows(x: number, y: number, activeTank: TankState): void {
    GAME_CONFIG.weapons.slice(0, 5).forEach((weapon, index) => {
      const selected = activeTank.selectedWeaponIndex === index;
      const count = activeTank.ammo[weapon.id];
      if (selected) {
        this.graphics.fillStyle(GAME_CONFIG.colors.retroBlue, 0.95);
        this.graphics.fillRect(x - 4, y + index * 17 - 2, 188, 16);
      }
      this.addText(
        x,
        y + index * 17,
        `${index + 1}. ${weapon.name}`,
        selected ? GAME_CONFIG.colors.white : GAME_CONFIG.colors.green,
        GAME_CONFIG.font.small
      );
      this.addText(x + 148, y + index * 17, count === -1 ? '--' : `${count}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    });
    this.addText(x + 30, y + 88, 'More Weapons...', GAME_CONFIG.colors.yellow, GAME_CONFIG.font.small);
  }

  private drawRetroAnglePanel(x: number, y: number, activeTank: TankState): void {
    this.addText(x + 48, y - 4, `${Math.round(activeTank.angle)}°`, GAME_CONFIG.colors.retroBlue, GAME_CONFIG.font.title);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.white, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(x + 18, y + 72);
    this.graphics.lineTo(x + 138, y + 72);
    this.graphics.moveTo(x + 18, y + 72);
    this.graphics.lineTo(x + 102, y + 24);
    this.graphics.strokePath();
    this.graphics.lineStyle(1, GAME_CONFIG.colors.steelLight, 1);
    this.graphics.arc(x + 18, y + 72, 52, Phaser.Math.DegToRad(-45), 0);
    this.graphics.strokePath();
  }

  private drawRetroPowerPanel(x: number, y: number, activeTank: TankState): void {
    this.addText(x + 60, y - 4, `${Math.round(activeTank.power)}`, GAME_CONFIG.colors.retroBlue, GAME_CONFIG.font.title);
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 1);
    this.graphics.fillRect(x + 4, y + 54, 168, 22);
    this.graphics.lineStyle(2, GAME_CONFIG.colors.steelLight, 1);
    this.graphics.strokeRect(x + 4, y + 54, 168, 22);
    const blocks = Math.round(activeTank.power / 10);
    for (let i = 0; i < 10; i += 1) {
      this.graphics.fillStyle(i < blocks ? GAME_CONFIG.colors.green : GAME_CONFIG.colors.steelDark, 1);
      this.graphics.fillRect(x + 9 + i * 16, y + 59, 12, 12);
    }
    this.addText(x + 4, y + 84, 'Min', GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(x + 136, y + 84, 'Max', GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
  }

  private drawRetroFireButton(x: number, y: number, canFire: boolean): void {
    this.graphics.fillStyle(canFire ? 0x2b2b2b : 0x151515, 1);
    this.graphics.fillRect(x, y, 94, 58);
    this.graphics.lineStyle(4, GAME_CONFIG.colors.steelLight, 1);
    this.graphics.strokeRect(x, y, 94, 58);
    this.addText(x + 20, y + 14, 'FIRE', canFire ? GAME_CONFIG.colors.red : GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.title);
  }

  private drawRetroItemsPanel(x: number, y: number, activeTank: TankState, match: MatchState): void {
    const rows = [
      `1. Shield     $ 150`,
      `2. Armor      $ 200`,
      `3. Repair Kit $ 100`,
      `4. Teleporter $ 300`
    ];
    rows.forEach((row, index) => {
      this.addText(x, y + index * 15, row, index === 0 ? GAME_CONFIG.colors.cyan : GAME_CONFIG.colors.white, GAME_CONFIG.font.tiny);
    });
    this.addText(x, y + 66, `Cash $${match.profiles[activeTank.id].cash}`, GAME_CONFIG.colors.green, GAME_CONFIG.font.tiny);
    this.addText(x, y + 82, 'More Items...', GAME_CONFIG.colors.yellow, GAME_CONFIG.font.tiny);
  }

  private drawFireButton(top: number): void {
    this.graphics.fillStyle(GAME_CONFIG.colors.panelLight, 1);
    this.graphics.fillRect(386, top + 8, 110, 36);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.black, 1);
    this.graphics.strokeRect(386, top + 8, 110, 36);
    this.addText(406, top + 12, 'Fire', GAME_CONFIG.colors.red, GAME_CONFIG.font.title);
  }

  private drawWeaponList(top: number, activeTank: TankState): void {
    this.addText(20, top + 20, 'Weapon', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);
    this.addText(210, top + 20, `Move ${Math.round(activeTank.moveRemaining)}`, GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);

    const rowStep = 13;
    GAME_CONFIG.weapons.forEach((weapon, index) => {
      const count = activeTank.ammo[weapon.id];
      const isSelected = activeTank.selectedWeaponIndex === index;
      const isEmpty = count === 0;
      const labelColor = isSelected
        ? GAME_CONFIG.colors.yellow
        : isEmpty
          ? GAME_CONFIG.colors.dimGray
          : GAME_CONFIG.colors.white;

      if (isSelected) {
        this.graphics.fillStyle(GAME_CONFIG.colors.panelDark, 1);
        this.graphics.fillRect(14, top + 36 + index * rowStep, 282, rowStep);
      }

      const ammoText = count === -1 ? '--' : `${count}`;
      this.addText(20, top + 38 + index * rowStep, `${index + 1} ${weapon.name}`, labelColor, GAME_CONFIG.font.small);
      this.addText(258, top + 38 + index * rowStep, ammoText, labelColor, GAME_CONFIG.font.small);
    });
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

  private drawSelectedWeapon(weapon: WeaponDefinition, activeTank: TankState, top: number): void {
    this.addText(583, top + 46, 'Weapon', GAME_CONFIG.colors.cyan, GAME_CONFIG.font.medium);

    const nameX = 621 - Math.min(weapon.name.length, 16) * 3;
    this.addText(nameX, top + 74, weapon.name, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);

    const bodyColor = this.weaponIconBodyColor(weapon);
    this.graphics.fillStyle(bodyColor, 1);
    this.graphics.fillRect(614, top + 96, 14, 22);
    this.graphics.lineStyle(2, GAME_CONFIG.colors.white, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(614, top + 118);
    this.graphics.lineTo(604, top + 128);
    this.graphics.moveTo(628, top + 118);
    this.graphics.lineTo(638, top + 128);
    this.graphics.strokePath();

    const ammo = activeTank.ammo[weapon.id];
    const ammoText = ammo === -1 ? 'UNLIMITED' : `AMMO ${ammo}`;
    this.addText(580, top + 134, ammoText, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
  }

  private weaponIconBodyColor(weapon: WeaponDefinition): number {
    switch (weapon.behavior) {
      case 'dirt':
        return GAME_CONFIG.colors.darkGreen;
      case 'bounce':
        return GAME_CONFIG.colors.green;
      case 'split':
        return GAME_CONFIG.colors.cyan;
      case 'salvo':
        return GAME_CONFIG.colors.red;
      default:
        return GAME_CONFIG.colors.magenta;
    }
  }

  private drawStatusPanel(activeTank: TankState, match: MatchState, top: number): void {
    this.addText(728, top + 24, 'STATUS', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.medium);
    this.addText(728, top + 50, `P${activeTank.id + 1} TURN`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(728, top + 66, `HP   ${activeTank.health}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(728, top + 80, `MOVE ${Math.round(activeTank.moveRemaining)}/${GAME_CONFIG.movement.perTurn}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(728, top + 94, `CHUTES ${activeTank.parachutes}`, GAME_CONFIG.colors.yellow, GAME_CONFIG.font.small);
    this.addText(
      728,
      top + 108,
      `CASH $${match.profiles[activeTank.id].cash}`,
      GAME_CONFIG.colors.green,
      GAME_CONFIG.font.small
    );
    this.addText(
      728,
      top + 122,
      `ROUND ${match.round}  W ${match.profiles[0].wins}-${match.profiles[1].wins}`,
      GAME_CONFIG.colors.cyan,
      GAME_CONFIG.font.small
    );
  }

  private drawCenterBanner(line1: string, line2: string): void {
    const w = 560;
    const h = 110;
    const x = (GAME_CONFIG.width - w) / 2;
    const y = 130;
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.82);
    this.graphics.fillRect(x, y, w, h);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.yellow, 1);
    this.graphics.strokeRect(x, y, w, h);
    this.addText(x + 24, y + 22, line1, GAME_CONFIG.colors.yellow, GAME_CONFIG.font.title);
    this.addText(x + 24, y + 68, line2, GAME_CONFIG.colors.white, GAME_CONFIG.font.medium);
  }

  private drawShopOverlay(match: MatchState): void {
    const shopperId = match.shoppingPlayerId as PlayerId;
    const profile = match.profiles[shopperId];
    const colors = GAME_CONFIG.colors;

    this.graphics.fillStyle(colors.black, 0.86);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    const panelX = 80;
    const panelY = 40;
    const panelW = GAME_CONFIG.width - 160;
    const panelH = GAME_CONFIG.height - 80;
    this.graphics.fillStyle(colors.panelGray, 1);
    this.graphics.fillRect(panelX, panelY, panelW, panelH);
    this.graphics.lineStyle(4, colors.yellow, 1);
    this.graphics.strokeRect(panelX, panelY, panelW, panelH);

    this.addText(panelX + 24, panelY + 18, `ROUND ${match.round} SHOP`, colors.magenta, GAME_CONFIG.font.title);
    this.addText(
      panelX + 24,
      panelY + 56,
      `PLAYER ${shopperId + 1} SHOPPING`,
      shopperId === 0 ? colors.magenta : colors.cyan,
      GAME_CONFIG.font.large
    );
    this.addText(panelX + 24, panelY + 90, `CASH $${profile.cash}`, colors.green, GAME_CONFIG.font.large);
    this.addText(
      panelX + 360,
      panelY + 90,
      `PARACHUTES ${profile.parachutes}`,
      colors.yellow,
      GAME_CONFIG.font.large
    );

    const listX = panelX + 24;
    let listY = panelY + 130;
    this.addText(listX, listY, 'KEY  WEAPON              PRICE     OWNED', colors.cyan, GAME_CONFIG.font.medium);
    listY += 28;

    GAME_CONFIG.weapons.forEach((weapon, index) => {
      const owned = profile.ammo[weapon.id];
      const canAfford = weapon.price > 0 && profile.cash >= weapon.price;
      const labelColor = weapon.price === 0
        ? colors.dimGray
        : canAfford
          ? colors.white
          : colors.dimGray;
      const priceText = weapon.price === 0 ? 'FREE' : `$${weapon.price}`;
      const ownedText = owned === -1 ? '--' : `${owned}`;
      this.addText(
        listX,
        listY,
        `${index + 1}    ${weapon.name.padEnd(18, ' ')}  ${priceText.padEnd(8, ' ')}  ${ownedText}`,
        labelColor,
        GAME_CONFIG.font.medium
      );
      listY += 24;
    });

    listY += 8;
    const chuteAfford = profile.cash >= GAME_CONFIG.match.parachutePrice;
    this.addText(
      listX,
      listY,
      `P    Parachute           $${GAME_CONFIG.match.parachutePrice}      ${profile.parachutes}`,
      chuteAfford ? GAME_CONFIG.colors.yellow : GAME_CONFIG.colors.dimGray,
      GAME_CONFIG.font.medium
    );

    this.addText(
      panelX + 24,
      panelY + panelH - 42,
      'PRESS 1-8 OR P TO BUY    ENTER TO FINISH',
      colors.white,
      GAME_CONFIG.font.medium
    );
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
