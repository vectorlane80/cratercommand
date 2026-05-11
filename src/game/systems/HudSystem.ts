import Phaser from 'phaser';
import {
  CONTROLLER_LABELS,
  GAME_CONFIG,
  type MatchState,
  type PlayerId,
  type TankState,
  type TurnState,
  type VisualSystem,
  type WeaponDefinition
} from '../types/GameTypes';
import { soundSystem } from './SoundSystem';
import { getPlayerPalette } from './TankSystem';

export interface ShopPending {
  pendingFor: (key: string) => number;
  effectiveCash: (profile: { cash: number }) => number;
  hasPending: () => boolean;
}

export const EMPTY_SHOP_PENDING: ShopPending = {
  pendingFor: () => 0,
  effectiveCash: (p) => p.cash,
  hasPending: () => false
};

export class HudSystem {
  private graphics: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private currentPendingShop: ShopPending = EMPTY_SHOP_PENDING;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  render(
    turn: TurnState,
    tanks: TankState[],
    weapon: WeaponDefinition,
    match: MatchState,
    statusMessage: string | null,
    visualSystem: VisualSystem = 'classic',
    pendingShop: ShopPending = EMPTY_SHOP_PENDING
  ): void {
    this.currentPendingShop = pendingShop;
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
    } else if (turn.phase === 'aiming' && statusMessage) {
      // AI is thinking — small banner that doesn't block visibility.
      this.addText(
        (GAME_CONFIG.width - statusMessage.length * 11) / 2,
        140,
        statusMessage,
        GAME_CONFIG.colors.yellow,
        GAME_CONFIG.font.medium
      );
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
    const n = tanks.length;

    // 2 players: keep the classic left+right layout with CRATER COMMAND in
    // the middle (more room to breathe). For 3-4 players, distribute slots
    // evenly across the top and move the wind/round indicators to a single
    // center strip below the player cards.
    if (n === 2) {
      this.drawPlayerCard(0, 20, tanks, match);
      this.drawPlayerCard(1, 836, tanks, match);
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
      return;
    }

    // 3 or 4 player layout
    const usableW = GAME_CONFIG.width - 40;
    const slotW = usableW / n;
    for (let i = 0; i < n; i += 1) {
      this.drawPlayerCard(i as PlayerId, 20 + i * slotW, tanks, match);
    }

    const arrow = turn.wind.direction < 0 ? '<--' : '-->';
    const stripY = 86;
    this.graphics.fillStyle(colors.black, 0.4);
    this.graphics.fillRect(0, stripY, GAME_CONFIG.width, 18);
    this.addText(36, stripY + 1, `ROUND ${match.round}  (FIRST TO ${match.roundsToWin})`, colors.cyan, GAME_CONFIG.font.small);
    this.addText(
      GAME_CONFIG.width / 2 - 60,
      stripY + 1,
      `WIND ${arrow}  ${turn.wind.magnitude}`,
      colors.green,
      GAME_CONFIG.font.small
    );
    this.addText(GAME_CONFIG.width - 160, stripY + 1, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.small);
  }

  private drawPlayerCard(id: PlayerId, x: number, tanks: TankState[], match: MatchState): void {
    const palette = getPlayerPalette(id, 'classic');
    const profile = match.profiles[id];
    const tank = tanks[id];
    if (!profile || !tank) return;

    this.addText(x, 6, `PLAYER ${id + 1}`, palette.primary, GAME_CONFIG.font.large);
    this.addText(x, 30, CONTROLLER_LABELS[profile.controller], GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.tiny);
    this.addText(x + 28, 42, `${tank.health}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.large);
    this.addText(x, 68, `$${profile.cash}  W:${profile.wins}`, GAME_CONFIG.colors.yellow, GAME_CONFIG.font.small);
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
    this.addText(20, stripY + 4, '←→/↑↓ Aim·Power   A/D Move   SPACE/CLICK FIRE', 0x2e66ff, GAME_CONFIG.font.medium);
    const soundLabel = `F10 SOUND: ${soundSystem.enabled ? 'ON' : 'OFF'}`;
    this.addText(560, stripY + 4, soundLabel, soundSystem.enabled ? colors.green : colors.dimGray, GAME_CONFIG.font.small);
    // ESC quit button — fixed position so pointer routing in GameScene can hit-test it.
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(820, stripY + 2, 130, 22);
    this.graphics.lineStyle(1, colors.red, 1);
    this.graphics.strokeRect(820, stripY + 2, 130, 22);
    this.addText(830, stripY + 6, 'ESC: MENU', colors.red, GAME_CONFIG.font.small);
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
    const activePalette = getPlayerPalette(turn.activePlayerId, 'retroPixel');

    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, 82);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(2, 2, GAME_CONFIG.width - 4, GAME_CONFIG.height - 4);
    this.graphics.lineStyle(1, colors.steelDark, 1);
    this.graphics.strokeRect(6, 6, GAME_CONFIG.width - 12, GAME_CONFIG.height - 12);

    this.drawRetroPlayerPanel(22, 14, tanks[0], match, getPlayerPalette(0, 'retroPixel').primary);
    this.drawRetroPlayerPanel(774, 14, tanks[1], match, getPlayerPalette(1, 'retroPixel').primary);

    const windArrow = turn.wind.direction < 0 ? '<' : '>';
    this.addText(434, 12, `ROUND ${match.round}`, colors.white, GAME_CONFIG.font.medium);
    this.addText(
      434,
      36,
      `PLAYER ${turn.activePlayerId + 1}`,
      activePalette.primary,
      GAME_CONFIG.font.large
    );
    this.addText(432, 66, `Wind ${windArrow} ${turn.wind.magnitude}`, colors.green, GAME_CONFIG.font.medium);

    this.graphics.fillStyle(colors.steelMid, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, 134);
    this.graphics.lineStyle(3, colors.steelLight, 1);
    this.graphics.strokeRect(0, top, GAME_CONFIG.width, 134);

    this.drawRetroPanelFrame(8, top + 8, 208, 122, 'WEAPONS');
    this.drawRetroWeaponRows(18, top + 32, activeTank, activePalette.primary);
    this.drawRetroPanelFrame(220, top + 8, 176, 122, 'ANGLE');
    this.drawRetroAnglePanel(236, top + 42, activeTank, activePalette.primary);
    this.drawRetroPanelFrame(400, top + 8, 204, 122, 'POWER');
    this.drawRetroPowerPanel(416, top + 42, activeTank, activePalette.primary);
    this.drawRetroPanelFrame(610, top + 8, 140, 122, '');
    this.drawRetroFireButton(632, top + 36, turn.phase === 'aiming');
    this.drawRetroPanelFrame(756, top + 8, 196, 122, 'STATUS');
    this.drawRetroStatusPanel(770, top + 36, activeTank, match);

    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, top + 136, GAME_CONFIG.width, 46);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(0, top + 136, GAME_CONFIG.width, 46);

    this.addText(
      16,
      top + 144,
      '←→ Aim   ↑↓ Power   A/D Move   1-8 Weapon',
      colors.cyan,
      GAME_CONFIG.font.small
    );
    this.addText(
      16,
      top + 162,
      'SPACE Fire    V Visual    ENTER Advance',
      colors.cyan,
      GAME_CONFIG.font.small
    );
    this.addText(
      720,
      top + 144,
      turn.phase === 'aiming' ? 'SPACE to fire' : 'SHOT IN FLIGHT',
      turn.phase === 'aiming' ? colors.green : colors.yellow,
      GAME_CONFIG.font.small
    );
    this.addText(720, top + 162, `Weapon: ${weapon.name}`, colors.white, GAME_CONFIG.font.small);
  }

  private drawRetroPlayerPanel(x: number, y: number, tank: TankState, match: MatchState, color: number): void {
    const colors = GAME_CONFIG.colors;
    this.addText(x, y, `PLAYER ${tank.id + 1}`, color, GAME_CONFIG.font.medium);
    this.drawMiniTank(x + 2, y + 30, color);
    this.addText(x + 56, y + 22, `${tank.health}`, colors.white, GAME_CONFIG.font.medium);
    this.graphics.fillStyle(colors.steelDark, 1);
    this.graphics.fillRect(x + 102, y + 28, 74, 8);
    this.graphics.fillStyle(colors.green, 1);
    this.graphics.fillRect(x + 104, y + 30, Math.max(0, tank.health / GAME_CONFIG.tank.maxHealth) * 70, 4);
    this.addText(
      x + 56,
      y + 44,
      `$ ${match.profiles[tank.id].cash}  W:${match.profiles[tank.id].wins}`,
      colors.yellow,
      GAME_CONFIG.font.small
    );
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
      this.addText(x + (w - title.length * 11) / 2, y + 8, title, colors.white, GAME_CONFIG.font.medium);
    }
  }

  private drawRetroWeaponRows(x: number, y: number, activeTank: TankState, highlightColor: number): void {
    const rowStep = 11;
    GAME_CONFIG.weapons.forEach((weapon, index) => {
      const selected = activeTank.selectedWeaponIndex === index;
      const count = activeTank.ammo[weapon.id];
      const isEmpty = count === 0;
      const rowY = y + index * rowStep;
      if (selected) {
        this.graphics.fillStyle(highlightColor, 0.95);
        this.graphics.fillRect(x - 4, rowY - 1, 188, rowStep);
      }
      const labelColor = selected
        ? GAME_CONFIG.colors.white
        : isEmpty
          ? GAME_CONFIG.colors.dimGray
          : GAME_CONFIG.colors.green;
      this.addText(x, rowY, `${index + 1}. ${weapon.name}`, labelColor, GAME_CONFIG.font.small);
      this.addText(
        x + 148,
        rowY,
        count === -1 ? '--' : `${count}`,
        labelColor,
        GAME_CONFIG.font.small
      );
    });
  }

  private drawRetroAnglePanel(x: number, y: number, activeTank: TankState, accentColor: number): void {
    this.addText(x + 48, y - 4, `${Math.round(activeTank.angle)}°`, accentColor, GAME_CONFIG.font.title);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.white, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(x + 18, y + 72);
    this.graphics.lineTo(x + 138, y + 72);

    const rad = Phaser.Math.DegToRad(activeTank.angle);
    const dial = 56;
    this.graphics.moveTo(x + 18, y + 72);
    this.graphics.lineTo(x + 18 + Math.cos(rad) * dial, y + 72 - Math.sin(rad) * dial);
    this.graphics.strokePath();
  }

  private drawRetroPowerPanel(x: number, y: number, activeTank: TankState, accentColor: number): void {
    this.addText(x + 60, y - 4, `${Math.round(activeTank.power)}`, accentColor, GAME_CONFIG.font.title);
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

  private drawRetroStatusPanel(x: number, y: number, activeTank: TankState, match: MatchState): void {
    const colors = GAME_CONFIG.colors;
    this.addText(x, y, `HP     ${activeTank.health} / ${GAME_CONFIG.tank.maxHealth}`, colors.white, GAME_CONFIG.font.small);
    this.addText(
      x,
      y + 14,
      `MOVE   ${Math.round(activeTank.moveRemaining)} / ${GAME_CONFIG.movement.perTurn}`,
      colors.white,
      GAME_CONFIG.font.small
    );
    this.addText(x, y + 28, `CHUTES ${activeTank.parachutes}`, colors.yellow, GAME_CONFIG.font.small);
    this.addText(x, y + 42, `CASH   $${match.profiles[activeTank.id].cash}`, colors.green, GAME_CONFIG.font.small);
    this.addText(
      x,
      y + 56,
      `WINS   ${match.profiles[0].wins}-${match.profiles[1].wins}  (to ${match.roundsToWin})`,
      colors.cyan,
      GAME_CONFIG.font.small
    );
    this.addText(x, y + 70, `WEAPON ${GAME_CONFIG.weapons[activeTank.selectedWeaponIndex].name}`, colors.white, GAME_CONFIG.font.small);
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
    this.addText(728, top + 22, 'STATUS', GAME_CONFIG.colors.magenta, GAME_CONFIG.font.medium);
    this.addText(728, top + 46, `P${activeTank.id + 1} TURN`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(728, top + 60, `HP   ${activeTank.health}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(728, top + 74, `MOVE ${Math.round(activeTank.moveRemaining)}/${GAME_CONFIG.movement.perTurn}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(728, top + 88, `CHUTES  ${activeTank.parachutes}`, GAME_CONFIG.colors.yellow, GAME_CONFIG.font.small);
    this.addText(728, top + 102, `SHIELDS ${activeTank.shields}`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(
      728,
      top + 116,
      `CASH $${match.profiles[activeTank.id].cash}`,
      GAME_CONFIG.colors.green,
      GAME_CONFIG.font.small
    );
    this.addText(
      728,
      top + 130,
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
    const pending = this.currentPendingShop;
    const effectiveCash = pending.effectiveCash(profile);
    const hasPending = pending.hasPending();

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
    // Cash readout reflects pending purchases. When something is in the cart
    // we show "balance / total" with the post-checkout figure in white and
    // the pre-checkout figure in dim gray for context.
    const cashText = hasPending ? `CASH $${effectiveCash} / $${profile.cash}` : `CASH $${profile.cash}`;
    this.addText(panelX + 24, panelY + 90, cashText, colors.green, GAME_CONFIG.font.large);
    this.addText(
      panelX + 320,
      panelY + 90,
      `CHUTES ${profile.parachutes + pending.pendingFor('parachute')}${pending.pendingFor('parachute') ? ` (+${pending.pendingFor('parachute')})` : ''}`,
      colors.yellow,
      GAME_CONFIG.font.large
    );
    this.addText(
      panelX + 600,
      panelY + 90,
      `SHIELDS ${profile.shields + pending.pendingFor('shield')}${pending.pendingFor('shield') ? ` (+${pending.pendingFor('shield')})` : ''}`,
      colors.cyan,
      GAME_CONFIG.font.large
    );

    const listX = panelX + 24;
    let listY = panelY + 130;
    this.addText(listX, listY, 'KEY  WEAPON              PRICE     OWNED', colors.cyan, GAME_CONFIG.font.medium);
    listY += 28;

    GAME_CONFIG.weapons.forEach((weapon, index) => {
      const owned = profile.ammo[weapon.id];
      const pendingQty = pending.pendingFor(weapon.id);
      const canAfford = weapon.price > 0 && effectiveCash >= weapon.price;
      const labelColor = weapon.price === 0
        ? colors.dimGray
        : canAfford
          ? colors.white
          : colors.dimGray;
      const priceText = weapon.price === 0 ? 'FREE' : `$${weapon.price}`;
      const totalCount = owned === -1 ? '--' : `${owned + pendingQty}`;
      const ownedText = pendingQty > 0 ? `${totalCount} (+${pendingQty})` : totalCount;
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
    const chutePending = pending.pendingFor('parachute');
    const chuteAfford = effectiveCash >= GAME_CONFIG.match.parachutePrice;
    const chuteCount = `${profile.parachutes + chutePending}${chutePending ? ` (+${chutePending})` : ''}`;
    this.addText(
      listX,
      listY,
      `P    Parachute           $${GAME_CONFIG.match.parachutePrice}      ${chuteCount}`,
      chuteAfford ? GAME_CONFIG.colors.yellow : GAME_CONFIG.colors.dimGray,
      GAME_CONFIG.font.medium
    );

    listY += 24;
    const shieldPending = pending.pendingFor('shield');
    const shieldAfford = effectiveCash >= GAME_CONFIG.match.shieldPrice;
    const shieldCount = `${profile.shields + shieldPending}${shieldPending ? ` (+${shieldPending})` : ''}`;
    this.addText(
      listX,
      listY,
      `S    Shield              $${GAME_CONFIG.match.shieldPrice}      ${shieldCount}`,
      shieldAfford ? GAME_CONFIG.colors.cyan : GAME_CONFIG.colors.dimGray,
      GAME_CONFIG.font.medium
    );

    // Footer buttons: UNDO (left, only when something to undo) and FINISH
    const footerY = panelY + panelH - 50;
    if (hasPending) {
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(listX, footerY, 160, 36);
      this.graphics.lineStyle(2, colors.red, 1);
      this.graphics.strokeRect(listX, footerY, 160, 36);
      this.addText(listX + 14, footerY + 6, 'UNDO ⌫', colors.red, GAME_CONFIG.font.medium);
    }
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(panelX + panelW - 184, footerY, 160, 36);
    this.graphics.lineStyle(2, colors.yellow, 1);
    this.graphics.strokeRect(panelX + panelW - 184, footerY, 160, 36);
    this.addText(panelX + panelW - 174, footerY + 6, 'FINISH ⏎', colors.yellow, GAME_CONFIG.font.medium);

    this.addText(
      listX + 200,
      footerY + 8,
      'TAP TO BUY · BACKSPACE undoes',
      colors.white,
      GAME_CONFIG.font.small
    );
  }

  private addText(x: number, y: number, value: string, color: number, fontSize: string): void {
    const text = this.scene.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    // Higher resolution makes text crisp under Phaser scale.zoom + CSS scale.
    text.setResolution(2);
    this.texts.push(text);
  }

  private clearTexts(): void {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }
}
