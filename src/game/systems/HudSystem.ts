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

/**
 * Shop overlay layout constants. Click hit-tests in GameScene must match
 * these so the rocker (+/-) buttons line up with their drawn graphics.
 */
// Near-fullscreen shop panel with a left sidebar (INVENTORY summary + UNDO)
// and a wide right-hand table (KEY / ITEM / PRICE / YOU OWN / [- N +] / COST).
// All coordinates are in 960x540 game-world pixels.
export const SHOP_LAYOUT = {
  panelX: 20,
  panelY: 20,
  panelW: 920,
  panelH: 500,
  // Table region (right of sidebar)
  tableX: 204,
  tableY: 110,
  listYStart: 150,        // tableY + 40 (column-header strip)
  rowH: 28,
  weaponCount: 8,
  parachuteGap: 10,
  // Rocker buttons (absolute x)
  colMinus: 624,
  colPlus: 716,
  buttonW: 36,
  buttonH: 24,
  // Quick-add hitbox covers the row left of the minus button
  rowClickX: 218,
  rowClickW: 400,
  // Footer / sidebar buttons (for pointer hit-test)
  finishX: 800,
  finishY: 34,
  finishW: 120,
  finishH: 44,
  undoX: 46,
  undoY: 460,
  undoW: 138,
  undoH: 36
};

export interface ShopPending {
  pendingFor: (key: string) => number;
  effectiveCash: (profile: { cash: number }) => number;
  hasPending: () => boolean;
  /** Round-inflated + sale-adjusted price for a given item. 0 → not for sale. */
  effectivePrice: (basePrice: number, itemKey: string) => number;
  /** Item key currently on sale this round, or null. */
  saleItem: () => string | null;
  /** Sale discount fraction (0..1) for `saleItem`, or 0. */
  saleDiscount: () => number;
}

export const EMPTY_SHOP_PENDING: ShopPending = {
  pendingFor: () => 0,
  effectiveCash: (p) => p.cash,
  hasPending: () => false,
  effectivePrice: (basePrice) => basePrice,
  saleItem: () => null,
  saleDiscount: () => 0
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
    pendingShop: ShopPending = EMPTY_SHOP_PENDING,
    topToast: { text: string; color: number } | null = null,
    quitConfirm = false
  ): void {
    this.currentPendingShop = pendingShop;
    this.clearTexts();
    this.graphics.clear();

    const inShop = turn.phase === 'shopping' && match.shoppingPlayerId !== null;
    const matchOver = turn.phase === 'matchOver' && match.matchWinnerId !== null;

    // When the forfeit modal is open, skip every other layer — the modal
    // demands focus and Phaser Text objects from the regular HUD would
    // otherwise show through the modal's dim rectangle (Text is above
    // Graphics in the display list).
    if (quitConfirm) {
      this.drawQuitConfirmModal();
      return;
    }

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
      const winId = match.matchWinnerId!;
      const winName = match.profiles[winId].displayName ?? `PLAYER ${winId + 1}`;
      this.drawCenterBanner(
        `${winName} WINS THE MATCH`,
        'PRESS R TO RESTART'
      );
    }

    // Fall-event toast — sits at the top-center under the player cards so
    // chute deployments and fall damage are unmissable. Suppressed during
    // the shop and round-over screens (those have their own panels covering
    // the area) and behind the forfeit-confirm modal.
    if (topToast && !quitConfirm && !inShop && turn.phase !== 'roundOver' && !matchOver) {
      const labelW = topToast.text.length * 11;
      const x = (GAME_CONFIG.width - labelW) / 2;
      const y = 96;
      this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.7);
      this.graphics.fillRect(x - 10, y - 4, labelW + 20, 26);
      this.graphics.lineStyle(2, topToast.color, 1);
      this.graphics.strokeRect(x - 10, y - 4, labelW + 20, 26);
      this.addText(x, y, topToast.text, topToast.color, GAME_CONFIG.font.medium);
    }

  }

  /**
   * Forfeit-to-menu modal. Full-screen dim backdrop with a centered card
   * carrying the warning and YES/NO buttons. Geometry matches
   * GameScene.handleQuitConfirmPointer.
   */
  private drawQuitConfirmModal(): void {
    const colors = GAME_CONFIG.colors;
    const W = GAME_CONFIG.width;
    const H = GAME_CONFIG.height;
    const cx = W / 2;

    // Hard-dim everything behind so the modal demands attention.
    this.graphics.fillStyle(colors.black, 0.85);
    this.graphics.fillRect(0, 0, W, H);

    // Centered card sized to fit cleanly within 540h.
    const cardW = 480;
    const cardH = 240;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;
    this.graphics.fillStyle(colors.panelGray, 1);
    this.graphics.fillRect(cardX, cardY, cardW, cardH);
    this.graphics.lineStyle(4, colors.red, 1);
    this.graphics.strokeRect(cardX, cardY, cardW, cardH);

    // Heading
    this.addTextCentered(cx, cardY + 24, 'FORFEIT MATCH?', colors.red, GAME_CONFIG.font.title);

    // Body
    this.addTextCentered(
      cx,
      cardY + 80,
      'Return to the menu?',
      colors.white,
      GAME_CONFIG.font.medium
    );
    this.addTextCentered(
      cx,
      cardY + 108,
      'This counts as a forfeit.',
      colors.yellow,
      GAME_CONFIG.font.medium
    );

    // Buttons (must match handleQuitConfirmPointer geometry)
    const btnH = 44;
    const btnW = 140;
    const btnY = cardY + cardH - btnH - 20;
    const gap = 24;
    const yesX = cx - btnW - gap / 2;
    const noX = cx + gap / 2;

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(yesX, btnY, btnW, btnH);
    this.graphics.lineStyle(3, colors.red, 1);
    this.graphics.strokeRect(yesX, btnY, btnW, btnH);
    this.addTextCentered(yesX + btnW / 2, btnY + btnH / 2 - 12, 'YES (Y)', colors.red, GAME_CONFIG.font.large);

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(noX, btnY, btnW, btnH);
    this.graphics.lineStyle(3, colors.green, 1);
    this.graphics.strokeRect(noX, btnY, btnW, btnH);
    this.addTextCentered(noX + btnW / 2, btnY + btnH / 2 - 12, 'NO (N)', colors.green, GAME_CONFIG.font.large);
  }

  private addTextCentered(cx: number, y: number, value: string, color: number, fontSize: string): void {
    const text = this.scene.add.text(cx, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    text.setOrigin(0.5, 0);
    text.setResolution(2);
    this.texts.push(text);
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

    const name = profile.displayName ?? `PLAYER ${id + 1}`;
    this.addText(x, 6, name, palette.primary, GAME_CONFIG.font.large);
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
    const totalCost = profile.cash - effectiveCash;
    const hasPending = pending.hasPending();
    const saleKey = pending.saleItem();
    const saleDiscountPct = Math.round(pending.saleDiscount() * 100);

    const panelX = SHOP_LAYOUT.panelX;
    const panelY = SHOP_LAYOUT.panelY;
    const panelW = SHOP_LAYOUT.panelW;
    const panelH = SHOP_LAYOUT.panelH;

    // Dim full-screen backdrop, then the panel itself.
    this.graphics.fillStyle(colors.black, 0.86);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    this.graphics.fillStyle(colors.panelGray, 1);
    this.graphics.fillRect(panelX, panelY, panelW, panelH);
    this.graphics.lineStyle(3, colors.yellow, 1);
    this.graphics.strokeRect(panelX, panelY, panelW, panelH);

    // ----- HEADER -----
    // ROUND N SHOP (title) + player name on the left, CASH centered,
    // FINISH button on the right.
    const playerName = profile.displayName ?? `PLAYER ${shopperId + 1}`;
    const playerColor = getPlayerPalette(shopperId, 'classic').primary;
    this.addText(panelX + 20, panelY + 10, `ROUND ${match.round} SHOP`, colors.magenta, GAME_CONFIG.font.large);
    this.addText(panelX + 20, panelY + 48, playerName, playerColor, GAME_CONFIG.font.large);

    this.addText(panelX + 380, panelY + 18, 'CASH', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(panelX + 380, panelY + 48, `$${effectiveCash}`, colors.green, GAME_CONFIG.font.large);

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.graphics.lineStyle(2, colors.yellow, 1);
    this.graphics.strokeRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.addText(SHOP_LAYOUT.finishX + 16, SHOP_LAYOUT.finishY + 12, 'FINISH ⏎', colors.yellow, GAME_CONFIG.font.medium);

    // ----- LEFT SIDEBAR (INVENTORY summary + UNDO) -----
    const sideX = panelX + 14;
    const sideY = panelY + 90;
    const sideW = 168;
    const sideH = panelH - 100;
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(sideX, sideY, sideW, sideH);
    this.graphics.lineStyle(1, colors.panelLight, 1);
    this.graphics.strokeRect(sideX, sideY, sideW, sideH);

    this.addText(sideX + 12, sideY + 10, 'INVENTORY', colors.white, GAME_CONFIG.font.medium);

    const totalWeapons = GAME_CONFIG.weapons.reduce((sum, w) => {
      const owned = profile.ammo[w.id] ?? 0;
      if (owned === -1) return sum; // skip unlimited (Small Missile)
      return sum + owned + pending.pendingFor(w.id);
    }, 0);
    const totalChutes = profile.parachutes + pending.pendingFor('parachute');
    const totalShields = profile.shields + pending.pendingFor('shield');

    this.addText(sideX + 12, sideY + 46, 'WEAPONS', colors.magenta, GAME_CONFIG.font.small);
    this.addText(sideX + sideW - 40, sideY + 46, `${totalWeapons}`, colors.white, GAME_CONFIG.font.small);
    this.addText(sideX + 12, sideY + 72, 'PARACHUTES', colors.yellow, GAME_CONFIG.font.small);
    this.addText(sideX + sideW - 30, sideY + 72, `${totalChutes}`, colors.white, GAME_CONFIG.font.small);
    this.addText(sideX + 12, sideY + 98, 'SHIELDS', colors.cyan, GAME_CONFIG.font.small);
    this.addText(sideX + sideW - 30, sideY + 98, `${totalShields}`, colors.white, GAME_CONFIG.font.small);

    // UNDO button at the bottom of the sidebar (only when something to undo).
    if (hasPending) {
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(SHOP_LAYOUT.undoX, SHOP_LAYOUT.undoY, SHOP_LAYOUT.undoW, SHOP_LAYOUT.undoH);
      this.graphics.lineStyle(2, colors.red, 1);
      this.graphics.strokeRect(SHOP_LAYOUT.undoX, SHOP_LAYOUT.undoY, SHOP_LAYOUT.undoW, SHOP_LAYOUT.undoH);
      this.addText(SHOP_LAYOUT.undoX + 32, SHOP_LAYOUT.undoY + 8, 'UNDO ⌫', colors.red, GAME_CONFIG.font.medium);
    }

    // ----- MAIN TABLE -----
    const tableX = SHOP_LAYOUT.tableX;
    const tableY = SHOP_LAYOUT.tableY;
    const tableW = panelX + panelW - tableX - 14;

    const colKey = tableX + 16;
    const colName = tableX + 52;
    const colPrice = tableX + 256;
    const colOwn = tableX + 376;
    const colCost = tableX + 590;

    // Column header
    this.addText(colName, tableY + 8, 'ITEM', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(colPrice, tableY + 8, 'PRICE', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(colOwn, tableY + 8, 'YOU OWN', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(SHOP_LAYOUT.colMinus + 24, tableY + 8, 'BUY', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(colCost, tableY + 8, 'COST', colors.cyan, GAME_CONFIG.font.medium);

    let rowY = SHOP_LAYOUT.listYStart;
    const drawRow = (
      keyLabel: string,
      itemKey: string,
      itemName: string,
      basePrice: number,
      ownedDisplay: number,
      tint: number
    ) => {
      const pendingQty = pending.pendingFor(itemKey);
      const price = pending.effectivePrice(basePrice, itemKey);
      const onSale = saleKey === itemKey;
      const buyable = basePrice > 0;
      const canAfford = buyable && effectiveCash >= price;
      const rowColor = !buyable
        ? colors.dimGray
        : canAfford
          ? tint
          : colors.dimGray;

      this.addText(colKey, rowY, keyLabel, rowColor, GAME_CONFIG.font.medium);
      this.addText(colName, rowY, itemName, rowColor, GAME_CONFIG.font.medium);
      this.addText(colPrice, rowY, buyable ? `$${price}` : 'FREE', rowColor, GAME_CONFIG.font.medium);
      if (onSale) {
        this.addText(colPrice + 76, rowY + 2, `-${saleDiscountPct}%`, colors.yellow, GAME_CONFIG.font.small);
      }
      const ownedText = ownedDisplay === -1 ? '--' : `${ownedDisplay}`;
      this.addText(colOwn + 20, rowY, ownedText, rowColor, GAME_CONFIG.font.medium);

      // Rocker buttons + pending count between them.
      const minusActive = pendingQty > 0;
      this.drawRockerButton(SHOP_LAYOUT.colMinus, rowY, '-', minusActive ? colors.red : colors.dimGray);
      this.addText(SHOP_LAYOUT.colMinus + 50, rowY, `${pendingQty}`, colors.white, GAME_CONFIG.font.medium);
      this.drawRockerButton(SHOP_LAYOUT.colPlus, rowY, '+', canAfford ? colors.green : colors.dimGray);

      // Cost cell
      const cost = pendingQty * price;
      this.addText(colCost + 4, rowY, `$${cost}`, cost > 0 ? colors.green : colors.dimGray, GAME_CONFIG.font.medium);

      // Subtle row divider
      this.graphics.lineStyle(1, colors.panelLight, 0.25);
      this.graphics.beginPath();
      this.graphics.moveTo(tableX + 8, rowY + SHOP_LAYOUT.rowH - 4);
      this.graphics.lineTo(tableX + tableW - 8, rowY + SHOP_LAYOUT.rowH - 4);
      this.graphics.strokePath();

      rowY += SHOP_LAYOUT.rowH;
    };

    GAME_CONFIG.weapons.forEach((weapon, index) => {
      drawRow(String(index + 1), weapon.id, weapon.name, weapon.price, profile.ammo[weapon.id], colors.white);
    });

    // Dashed divider before specials
    rowY += SHOP_LAYOUT.parachuteGap;
    this.graphics.lineStyle(1, colors.panelLight, 0.6);
    for (let dx = tableX + 8; dx < tableX + tableW - 8; dx += 12) {
      this.graphics.beginPath();
      this.graphics.moveTo(dx, rowY - 4);
      this.graphics.lineTo(dx + 6, rowY - 4);
      this.graphics.strokePath();
    }

    drawRow('P', 'parachute', 'Parachute', GAME_CONFIG.match.parachutePrice, profile.parachutes, colors.yellow);
    drawRow('S', 'shield', 'Shield', GAME_CONFIG.match.shieldPrice, profile.shields, colors.cyan);

    // ----- FOOTER -----
    const footerY = panelY + panelH - 38;
    this.addText(colOwn, footerY, 'TOTAL COST', colors.cyan, GAME_CONFIG.font.medium);
    this.addText(colCost, footerY, `$${totalCost}`, totalCost > 0 ? colors.green : colors.dimGray, GAME_CONFIG.font.large);

    // Hint sits below the table, centered.
    this.addText(
      panelX + panelW / 2 - 220,
      panelY + panelH - 16,
      'TAP + / - TO ADJUST  ·  ENTER TO CONFIRM',
      colors.white,
      GAME_CONFIG.font.small
    );
  }

  /**
   * Filled "rocker" button used in the shop overlay for +/- quantity
   * adjustments. The text label (+/-) is centered in a fixed-size cell so
   * the click hitboxes in GameScene line up with the visuals.
   */
  private drawRockerButton(x: number, y: number, label: string, accent: number): void {
    const w = SHOP_LAYOUT.buttonW;
    const h = SHOP_LAYOUT.buttonH;
    this.graphics.fillStyle(GAME_CONFIG.colors.panelDark, 1);
    this.graphics.fillRect(x, y - 2, w, h);
    this.graphics.lineStyle(2, accent, 1);
    this.graphics.strokeRect(x, y - 2, w, h);
    // Center the +/- glyph in the cell. Medium font is ~14px wide per glyph.
    this.addText(x + 10, y, label, accent, GAME_CONFIG.font.medium);
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
