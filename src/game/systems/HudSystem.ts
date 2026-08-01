import Phaser from 'phaser';
import {
  CONTROLLER_LABELS,
  GAME_CONFIG,
  GRAVITY_LABELS,
  PHYSICS_DEFAULTS,
  VISCOSITY_LABELS,
  WALL_LABELS,
  type MatchState,
  type PlayerId,
  type TankState,
  type TurnState,
  type VisualSystem,
  type WeaponDefinition
} from '../types/GameTypes';
import { soundSystem } from './SoundSystem';
import { getPlayerPalette } from './TankSystem';
import { WEAPON_WINDOW_SIZE } from './WeaponWindow';
import type { ShopCatalogEntry } from './EconomySystem';

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
  pageSize: 10,
  pagePrevX: 400,
  pageNextX: 560,
  pageY: 444,
  pageBtnW: 36,
  pageBtnH: 24,
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
  /** Bundle size for an item — units added per single purchase. */
  bundleSize: (key: string) => number;
  /** Owned count for an item (units, not bundles). */
  ownedFor: (key: string) => number;
  /** Visible catalog entries for the current page. */
  visibleRows: () => ShopCatalogEntry[];
  /** Page label (e.g. "PAGE 1/2"). */
  pageLabel: () => string;
  /** Total number of shop pages. */
  shopPageCount: () => number;
  /** Market price factor for an item (demand/neglect). */
  marketFactor: (key: string) => number;
}

export const EMPTY_SHOP_PENDING: ShopPending = {
  pendingFor: () => 0,
  effectiveCash: (p) => p.cash,
  hasPending: () => false,
  effectivePrice: (basePrice) => basePrice,
  saleItem: () => null,
  saleDiscount: () => 0,
  bundleSize: () => 1,
  ownedFor: () => 0,
  visibleRows: () => [],
  pageLabel: () => '',
  shopPageCount: () => 1,
  marketFactor: () => 1
};

export class HudSystem {
  private graphics: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private currentPendingShop: ShopPending = EMPTY_SHOP_PENDING;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  private uiPalette(visualSystem: VisualSystem) {
    const c = GAME_CONFIG.colors;
    return visualSystem === 'retroPixel'
      ? { frame: c.steelLight, title: c.desertGold, accent: c.desertGold, header: c.desertGold, label: c.white }
      : { frame: c.yellow, title: c.magenta, accent: c.cyan, header: c.cyan, label: c.cyan };
  }

  render(
    turn: TurnState,
    tanks: TankState[],
    weapon: WeaponDefinition,
    match: MatchState,
    statusMessage: string | null,
    visualSystem: VisualSystem = 'classic',
    pendingShop: ShopPending = EMPTY_SHOP_PENDING,
    weaponWindowStart = 0,
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
      this.drawQuitConfirmModal(visualSystem);
      return;
    }

    if (!inShop && !matchOver) {
      if (visualSystem === 'retroPixel') {
        this.drawRetroPixelHud(turn, tanks, weapon, match, weaponWindowStart);
      } else if (visualSystem === 'hiRes') {
        this.drawHiResHud(turn, tanks, weapon, match, weaponWindowStart);
      } else {
        this.drawTopHud(turn, tanks, match);
        this.drawConsole(turn, tanks[turn.activePlayerId], weapon, match, weaponWindowStart);
      }
    }

    if (inShop) {
      this.drawShopOverlay(match, visualSystem);
    } else if (turn.phase === 'roundOver' && statusMessage) {
      this.drawCenterBanner(statusMessage, 'PRESS SPACE OR ENTER FOR SHOP', visualSystem);
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
        'PRESS R TO RESTART',
        visualSystem
      );
    }

    // Fall-event toast — sits at the top-center under the player cards so
    // chute deployments and fall damage are unmissable. Suppressed during
    // the shop (its panel covers the area), behind the forfeit-confirm modal,
    // and on the match-over screen. Deliberately shown during round-over so
    // death taunts from a round-ending kill are visible above the banner.
    if (topToast && !quitConfirm && !inShop && !matchOver) {
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
  private drawQuitConfirmModal(visualSystem: VisualSystem = 'classic'): void {
    const colors = GAME_CONFIG.colors;
    const palette = this.uiPalette(visualSystem);
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
    this.graphics.lineStyle(4, palette.frame, 1);
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
    this.graphics.lineStyle(3, palette.frame, 1);
    this.graphics.strokeRect(yesX, btnY, btnW, btnH);
    this.addTextCentered(yesX + btnW / 2, btnY + btnH / 2 - 12, 'YES (Y)', colors.red, GAME_CONFIG.font.large);

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(noX, btnY, btnW, btnH);
    this.graphics.lineStyle(3, palette.frame, 1);
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
      if (match.activeWallMode !== 'none') {
        this.addText(430, 88, `WALLS: ${WALL_LABELS[match.activeWallMode]}`, colors.cyan, GAME_CONFIG.font.small);
      }

      // Physics indicator (only show if non-default)
      this.drawPhysicsIndicator(GAME_CONFIG.width / 2 - 40, 154, match);
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

  private drawPhysicsIndicator(x: number, y: number, match: MatchState): void {
    const colors = GAME_CONFIG.colors;
    const physics = match.physics;
    const isNonDefault =
      physics.gravity !== PHYSICS_DEFAULTS.gravity ||
      physics.viscosity !== PHYSICS_DEFAULTS.viscosity ||
      physics.tanksFall !== PHYSICS_DEFAULTS.tanksFall;

    if (!isNonDefault) {
      return;
    }

    // Build indicator text
    const gravityLabel = GRAVITY_LABELS[physics.gravity];
    const viscosityLabel = VISCOSITY_LABELS[physics.viscosity];
    const fallsLabel = physics.tanksFall ? 'ON' : 'OFF';

    const indicator = `${gravityLabel}/${viscosityLabel}/${fallsLabel}`;
    this.addText(x, y, indicator, colors.white, GAME_CONFIG.font.small);
  }

  private drawConsole(turn: TurnState, activeTank: TankState, weapon: WeaponDefinition, match: MatchState, weaponWindowStart = 0): void {
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
    this.drawWeaponList(top, activeTank, weaponWindowStart);
    this.drawAimPowerPanel(activeTank, turn.phase, top);
    this.drawSelectedWeapon(weapon, activeTank, top);
    this.drawStatusPanel(activeTank, match, top);

    const stripY = GAME_CONFIG.layout.bottomStatusTop - 5;
    this.graphics.fillStyle(colors.black, 1);
    this.graphics.fillRect(0, stripY, GAME_CONFIG.width, 26);
    this.addText(20, stripY + 4, '←→/↑↓ Aim·Power  A/D·TAP MOVE  Q/E Weapon  SPACE/CLICK FIRE', 0x2e66ff, GAME_CONFIG.font.medium);
    const soundLabel = `F10 SOUND: ${soundSystem.enabled ? 'ON' : 'OFF'}`;
    this.addText(700, stripY + 4, soundLabel, soundSystem.enabled ? colors.green : colors.dimGray, GAME_CONFIG.font.small);
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
    match: MatchState,
    weaponWindowStart = 0
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
    this.drawRetroWeaponRows(18, top + 32, activeTank, activePalette.primary, weaponWindowStart);
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
      '←→ Aim  ↑↓ Power  A/D·TAP MOVE  1-8 Weapon',
      colors.cyan,
      GAME_CONFIG.font.small
    );
    this.addText(
      16,
      top + 162,
      'SPACE Fire  V Visual  ENTER Advance',
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

  private drawRetroWeaponRows(x: number, y: number, activeTank: TankState, highlightColor: number, weaponWindowStart = 0): void {
    const rowStep = 11;
    for (let windowIdx = 0; windowIdx < WEAPON_WINDOW_SIZE; windowIdx += 1) {
      const index = weaponWindowStart + windowIdx;
      if (index >= GAME_CONFIG.weapons.length) break;

      const weapon = GAME_CONFIG.weapons[index];
      const selected = activeTank.selectedWeaponIndex === index;
      const count = activeTank.ammo[weapon.id];
      const isEmpty = count === 0;
      const rowY = y + windowIdx * rowStep;
      if (selected) {
        this.graphics.fillStyle(highlightColor, 0.95);
        this.graphics.fillRect(x - 4, rowY - 1, 188, rowStep);
      }
      const labelColor = selected
        ? GAME_CONFIG.colors.white
        : isEmpty
          ? GAME_CONFIG.colors.dimGray
          : GAME_CONFIG.colors.green;
      this.addText(x, rowY, `${windowIdx + 1}. ${weapon.name}`, labelColor, GAME_CONFIG.font.small);
      this.addText(
        x + 148,
        rowY,
        count === -1 ? '--' : `${count}`,
        labelColor,
        GAME_CONFIG.font.small
      );
    }
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

    // Quarter-zone markers (frame x: 220..396, this x offset by 220 so actual x = x-16)
    // x+14=234 (-5), x+70=290 (-1), x+114=334 (+1), x+158=378 (+5)
    this.addText(x - 6, y - 4, '<<', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 50, y - 4, '<', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 98, y - 4, '>', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 142, y - 4, '>>', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
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

    // Quarter-zone markers (frame x: 400..604, this x offset by 400 so actual x = x-16)
    // x+11=427 (-5), x+76=492 (-1), x+137=553 (+1), x+178=594 (+5)
    this.addText(x - 5, y - 4, '<<', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 60, y - 4, '<', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 121, y - 4, '>', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
    this.addText(x + 162, y - 4, '>>', GAME_CONFIG.colors.dimGray, GAME_CONFIG.font.small);
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
    const moveStr = activeTank.fuel > 0
      ? `MOVE   ${Math.round(activeTank.moveRemaining)} / ${GAME_CONFIG.movement.perTurn}+${Math.round(activeTank.fuel)}`
      : `MOVE   ${Math.round(activeTank.moveRemaining)} / ${GAME_CONFIG.movement.perTurn}`;
    this.addText(
      x,
      y + 12,
      moveStr,
      colors.white,
      GAME_CONFIG.font.small
    );
    this.addText(x, y + 24, `CHUTES ${activeTank.parachutes}`, colors.yellow, GAME_CONFIG.font.small);
    this.addText(x, y + 36, `BATT   ${activeTank.batteries}`, colors.cyan, GAME_CONFIG.font.small);
    const guideLabel = activeTank.selectedGuidanceId
      ? (GAME_CONFIG.items.find((i) => i.id === activeTank.selectedGuidanceId)?.sidebarLabel ?? activeTank.selectedGuidanceId.toUpperCase())
      : '--';
    this.addText(x, y + 48, `GUIDE  ${guideLabel}`, colors.cyan, GAME_CONFIG.font.small);
    this.addText(x, y + 60, `SHIELD ${activeTank.armedShieldHp > 0 ? activeTank.armedShieldHp + ' HP' : '--'}`, colors.cyan, GAME_CONFIG.font.small);
    this.addText(x, y + 72, `CASH   $${match.profiles[activeTank.id].cash}`, colors.green, GAME_CONFIG.font.small);
    this.addText(
      x,
      y + 84,
      `WINS   ${match.profiles[0].wins}-${match.profiles[1].wins}  (to ${match.roundsToWin})`,
      colors.cyan,
      GAME_CONFIG.font.small
    );
  }

  private drawFireButton(top: number): void {
    this.graphics.fillStyle(GAME_CONFIG.colors.panelLight, 1);
    this.graphics.fillRect(386, top + 8, 110, 36);
    this.graphics.lineStyle(3, GAME_CONFIG.colors.black, 1);
    this.graphics.strokeRect(386, top + 8, 110, 36);
    this.addText(406, top + 12, 'Fire', GAME_CONFIG.colors.red, GAME_CONFIG.font.title);
  }

  private drawWeaponList(top: number, activeTank: TankState, weaponWindowStart = 0): void {
    const hasScrollUp = weaponWindowStart > 0;
    const hasScrollDown = weaponWindowStart + WEAPON_WINDOW_SIZE < GAME_CONFIG.weapons.length;

    this.addText(20, top + 20, `Weapon ${activeTank.selectedWeaponIndex + 1}/${GAME_CONFIG.weapons.length}`, GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);
    if (hasScrollUp) this.addText(288, top + 22, '▲', GAME_CONFIG.colors.green, GAME_CONFIG.font.small);
    if (hasScrollDown) this.addText(288, top + 142, '▼', GAME_CONFIG.colors.green, GAME_CONFIG.font.small);
    this.addText(210, top + 20, `Move ${Math.round(activeTank.moveRemaining)}`, GAME_CONFIG.colors.magenta, GAME_CONFIG.font.small);

    const rowStep = 13;
    for (let windowIdx = 0; windowIdx < WEAPON_WINDOW_SIZE; windowIdx += 1) {
      const weaponIdx = weaponWindowStart + windowIdx;
      if (weaponIdx >= GAME_CONFIG.weapons.length) break;

      const weapon = GAME_CONFIG.weapons[weaponIdx];
      const count = activeTank.ammo[weapon.id];
      const isSelected = activeTank.selectedWeaponIndex === weaponIdx;
      const isEmpty = count === 0;
      const labelColor = isSelected
        ? GAME_CONFIG.colors.yellow
        : isEmpty
          ? GAME_CONFIG.colors.dimGray
          : GAME_CONFIG.colors.white;

      if (isSelected) {
        this.graphics.fillStyle(GAME_CONFIG.colors.panelDark, 1);
        this.graphics.fillRect(14, top + 36 + windowIdx * rowStep, 282, rowStep);
      }

      const ammoText = count === -1 ? '--' : `${count}`;
      this.addText(20, top + 38 + windowIdx * rowStep, `${windowIdx + 1} ${weapon.name}`, labelColor, GAME_CONFIG.font.small);
      this.addText(258, top + 38 + windowIdx * rowStep, ammoText, labelColor, GAME_CONFIG.font.small);
    }
  }

  private drawAimPowerPanel(activeTank: TankState, phase: string, top: number): void {
    const canFire = phase === 'aiming';
    const stateColor = canFire ? GAME_CONFIG.colors.green : GAME_CONFIG.colors.red;
    const colors = GAME_CONFIG.colors;

    this.addText(344, top + 56, 'Angle', colors.green, GAME_CONFIG.font.medium);
    this.addText(480, top + 54, `${Math.round(activeTank.angle)}`, colors.green, GAME_CONFIG.font.large);
    // Quarter-zone markers for angle
    this.addText(326, top + 56, '<<', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(410, top + 56, '<', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(440, top + 56, '>', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(458, top + 56, '>>', colors.dimGray, GAME_CONFIG.font.small);

    this.addText(344, top + 88, 'Power', colors.magenta, GAME_CONFIG.font.medium);
    this.addText(480, top + 86, `${Math.round(activeTank.power)}`, colors.magenta, GAME_CONFIG.font.large);
    // Quarter-zone markers for power
    this.addText(326, top + 88, '<<', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(410, top + 88, '<', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(440, top + 88, '>', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(458, top + 88, '>>', colors.dimGray, GAME_CONFIG.font.small);

    this.addText(344, top + 132, canFire ? 'SPACE TO FIRE' : 'SHOT IN FLIGHT', stateColor, GAME_CONFIG.font.tiny);

    this.graphics.lineStyle(3, colors.magenta, 1);
    this.graphics.strokeRect(344, top + 116, 174, 12);
    this.graphics.fillStyle(colors.magenta, 0.85);
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
    this.addText(728, top + 34, `P${activeTank.id + 1} TURN`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(728, top + 46, `HP   ${activeTank.health}`, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    const moveStr = activeTank.fuel > 0
      ? `MOVE ${Math.round(activeTank.moveRemaining)}/${GAME_CONFIG.movement.perTurn}+${Math.round(activeTank.fuel)}`
      : `MOVE ${Math.round(activeTank.moveRemaining)}/${GAME_CONFIG.movement.perTurn}`;
    this.addText(728, top + 58, moveStr, GAME_CONFIG.colors.white, GAME_CONFIG.font.small);
    this.addText(728, top + 70, `CHUTES  ${activeTank.parachutes}`, GAME_CONFIG.colors.yellow, GAME_CONFIG.font.small);
    this.addText(728, top + 82, `BATT    ${activeTank.batteries}`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    const guideLabel = activeTank.selectedGuidanceId
      ? (GAME_CONFIG.items.find((i) => i.id === activeTank.selectedGuidanceId)?.sidebarLabel ?? activeTank.selectedGuidanceId.toUpperCase())
      : '--';
    this.addText(728, top + 94, `GUIDE   ${guideLabel}`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(728, top + 106, `SHIELD ${activeTank.armedShieldHp > 0 ? activeTank.armedShieldHp + ' HP' : '--'}`, GAME_CONFIG.colors.cyan, GAME_CONFIG.font.small);
    this.addText(
      728,
      top + 118,
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

  private drawCenterBanner(line1: string, line2: string, visualSystem: VisualSystem = 'classic'): void {
    const palette = this.uiPalette(visualSystem);
    const w = 560;
    const h = 110;
    const x = (GAME_CONFIG.width - w) / 2;
    const y = 130;
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.82);
    this.graphics.fillRect(x, y, w, h);
    this.graphics.lineStyle(3, palette.frame, 1);
    this.graphics.strokeRect(x, y, w, h);
    this.addText(x + 24, y + 22, line1, palette.title, GAME_CONFIG.font.title);
    this.addText(x + 24, y + 68, line2, GAME_CONFIG.colors.white, GAME_CONFIG.font.medium);
  }

  private drawShopOverlay(match: MatchState, visualSystem: VisualSystem = 'classic'): void {
    const shopperId = match.shoppingPlayerId as PlayerId;
    const profile = match.profiles[shopperId];
    const colors = GAME_CONFIG.colors;
    const palette = this.uiPalette(visualSystem);
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
    this.graphics.lineStyle(3, palette.frame, 1);
    this.graphics.strokeRect(panelX, panelY, panelW, panelH);

    // ----- HEADER -----
    // ROUND N SHOP (title) + player name on the left, CASH centered,
    // FINISH button on the right.
    const playerName = profile.displayName ?? `PLAYER ${shopperId + 1}`;
    const playerColor = getPlayerPalette(shopperId, 'classic').primary;
    this.addText(panelX + 20, panelY + 10, `ROUND ${match.round} SHOP`, palette.title, GAME_CONFIG.font.large);
    this.addText(panelX + 20, panelY + 48, playerName, playerColor, GAME_CONFIG.font.large);

    this.addText(panelX + 380, panelY + 18, 'CASH', palette.header, GAME_CONFIG.font.medium);
    this.addText(panelX + 380, panelY + 48, `$${effectiveCash}`, colors.green, GAME_CONFIG.font.large);

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.graphics.lineStyle(2, palette.frame, 1);
    this.graphics.strokeRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.addText(SHOP_LAYOUT.finishX + 16, SHOP_LAYOUT.finishY + 12, 'FINISH ⏎', palette.title, GAME_CONFIG.font.medium);

    // ----- LEFT SIDEBAR (INVENTORY summary + UNDO) -----
    const sideX = panelX + 14;
    const sideY = panelY + 90;
    const sideW = 168;
    const sideH = panelH - 100;
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(sideX, sideY, sideW, sideH);
    this.graphics.lineStyle(1, colors.panelLight, 1);
    this.graphics.strokeRect(sideX, sideY, sideW, sideH);

    this.addText(sideX + 12, sideY + 10, 'INVENTORY', palette.title, GAME_CONFIG.font.medium);

    const totalWeapons = GAME_CONFIG.weapons.reduce((sum, w) => {
      const owned = profile.ammo[w.id] ?? 0;
      if (owned === -1) return sum; // skip unlimited (Small Missile)
      return sum + owned + pending.pendingFor(w.id) * pending.bundleSize(w.id);
    }, 0);

    this.addText(sideX + 12, sideY + 46, 'WEAPONS', palette.label, GAME_CONFIG.font.small);
    this.addText(sideX + sideW - 40, sideY + 46, `${totalWeapons}`, colors.white, GAME_CONFIG.font.small);

    GAME_CONFIG.items.forEach((item, idx) => {
      const itemTotal = pending.ownedFor(item.id) + pending.pendingFor(item.id) * pending.bundleSize(item.id);
      const itemColor = item.id === 'parachute' ? colors.yellow : palette.label;
      const itemY = sideY + 72 + idx * 20;
      const label = item.sidebarLabel ?? item.name.toUpperCase() + 'S';
      this.addText(sideX + 12, itemY, label, itemColor, GAME_CONFIG.font.tiny);
      this.addText(sideX + sideW - 30, itemY, `${itemTotal}`, colors.white, GAME_CONFIG.font.tiny);
    });

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
    this.addText(colName, tableY + 8, 'ITEM', palette.header, GAME_CONFIG.font.medium);
    this.addText(colPrice, tableY + 8, 'PRICE', palette.header, GAME_CONFIG.font.medium);
    this.addText(colOwn, tableY + 8, 'OWNED', palette.header, GAME_CONFIG.font.medium);
    this.addText(668, tableY + 8, 'BUY', palette.header, GAME_CONFIG.font.medium);
    this.addText(colCost, tableY + 8, 'COST', palette.header, GAME_CONFIG.font.medium);

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

      const bundleSize = pending.bundleSize(itemKey);
      const displayName = bundleSize > 1 ? `${itemName} x${bundleSize}` : itemName;

      this.addText(colKey, rowY, keyLabel, rowColor, GAME_CONFIG.font.medium);
      this.addText(colName, rowY, displayName, rowColor, GAME_CONFIG.font.medium);
      this.addText(colPrice, rowY, buyable ? `$${price}` : 'FREE', rowColor, GAME_CONFIG.font.medium);
      if (onSale) {
        this.addText(colPrice + 76, rowY + 2, `-${saleDiscountPct}%`, colors.yellow, GAME_CONFIG.font.small);
      }
      // Market price indicator: ▲ if up, ▼ if down
      const factor = pending.marketFactor(itemKey);
      if (factor > 1.1) {
        this.addText(colPrice + 100, rowY, '▲', colors.red, GAME_CONFIG.font.medium);
      } else if (factor < 0.9) {
        this.addText(colPrice + 100, rowY, '▼', colors.green, GAME_CONFIG.font.medium);
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

    const visibleRows = pending.visibleRows();
    visibleRows.forEach((entry, idx) => {
      const keyLabel = entry.kind === 'weapon' ? String((idx + 1) % 10) : (GAME_CONFIG.items.find((it) => it.id === entry.key)?.hotkey ?? String((idx + 1) % 10));
      const owned = pending.ownedFor(entry.key);
      const tint = entry.kind === 'weapon' ? colors.white : (entry.key === 'parachute' ? colors.yellow : colors.cyan);
      drawRow(keyLabel, entry.key, entry.name, entry.basePrice, owned, tint);
    });

    // ----- PAGE STRIP -----
    const pageButtonColor = pending.shopPageCount() > 1 ? colors.white : colors.dimGray;
    this.drawRockerButton(SHOP_LAYOUT.pagePrevX, SHOP_LAYOUT.pageY, '<', pageButtonColor);
    this.addText(SHOP_LAYOUT.pagePrevX + 52, SHOP_LAYOUT.pageY + 2, pending.pageLabel(), palette.label, GAME_CONFIG.font.medium);
    this.drawRockerButton(SHOP_LAYOUT.pageNextX, SHOP_LAYOUT.pageY, '>', pageButtonColor);

    // ----- FOOTER -----
    const footerY = panelY + panelH - 38;
    this.addText(colOwn, footerY, 'TOTAL COST', palette.header, GAME_CONFIG.font.medium);
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

  private addText(
    x: number,
    y: number,
    value: string,
    color: number,
    fontSize: string,
    fontFamily?: string,
    letterSpacing?: number
  ): void {
    const text = this.scene.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    // Higher resolution makes text crisp under Phaser scale.zoom + CSS scale.
    text.setResolution(2);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    this.texts.push(text);
  }

  private drawHiResPanelFrame(x: number, y: number, w: number, h: number, title: string): void {
    // Dark glass gradient background
    this.graphics.fillGradientStyle(0x261e18, 0x261e18, 0x0c0907, 0x0c0907, 0.93);
    this.graphics.fillRoundedRect(x, y, w, h, 3);
    // Outer border — warm highlight
    this.graphics.lineStyle(1, 0xffbe78, 0.16);
    this.graphics.strokeRoundedRect(x, y, w, h, 3);
    // Inset top highlight
    this.graphics.lineStyle(1, 0xffffff, 0.06);
    this.graphics.beginPath();
    this.graphics.moveTo(x + 2, y + 1);
    this.graphics.lineTo(x + w - 2, y + 1);
    this.graphics.strokePath();
    // Title
    if (title) {
      this.addText(x + (w - title.length * 6) / 2, y + 8, title, 0xffbe78, '10px', 'JetBrains Mono', 2);
    }
  }

  private drawHiResHud(
    turn: TurnState,
    tanks: TankState[],
    weapon: WeaponDefinition,
    match: MatchState,
    weaponWindowStart = 0
  ): void {
    const activeTank = tanks[turn.activePlayerId];
    const activePalette = getPlayerPalette(turn.activePlayerId, 'hiRes');
    const top = GAME_CONFIG.layout.consoleTop;

    // ===== TOP BAR (0-70px) =====
    this.graphics.fillStyle(0x0a0705, 1);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, 70);
    this.graphics.lineStyle(1, 0xffb347, 0.22);
    this.graphics.beginPath();
    this.graphics.moveTo(0, 69);
    this.graphics.lineTo(GAME_CONFIG.width, 69);
    this.graphics.strokePath();

    // LEFT: Player 1 - mini-tank at (20,14), text at specific coords
    this.addText(66, 8, `PLAYER ${tanks[0].id + 1}`, getPlayerPalette(0, 'hiRes').primary, '16px', 'Barlow Condensed');
    this.addText(66, 24, `${tanks[0].health}`, getPlayerPalette(0, 'hiRes').primary, '22px', 'Barlow Condensed');
    // HP suffix - measured width trick
    this.addText(66 + 200, 32, `/ 125 HP`, 0xf4ece2, '8px', 'JetBrains Mono');
    const hpNumText1 = this.texts[this.texts.length - 3];
    const hpNumW1 = hpNumText1.width;
    const hpText1 = this.texts[this.texts.length - 1];
    hpText1.setX(66 + hpNumW1 + 6);
    // HP bar
    this.graphics.fillStyle(0xffffff, 0.1);
    this.graphics.fillRoundedRect(66, 48, 130, 4, 2);
    const healthPct1 = tanks[0].health / GAME_CONFIG.tank.maxHealth;
    this.graphics.fillGradientStyle(0x3f9dff, 0x3f9dff, 0x8ed0ff, 0x8ed0ff, 1);
    this.graphics.fillRoundedRect(66, 48, 130 * healthPct1, 4, 2);
    // Cash line
    const cashStr1 = `$${match.profiles[0].cash.toLocaleString()}`;
    const winsLabel1 = match.profiles[0].wins === 1 ? 'WIN' : 'WINS';
    this.addText(66, 56, `${cashStr1} · ${match.profiles[0].wins} ${winsLabel1}`, 0xf4ece2, '9px', 'JetBrains Mono');

    // RIGHT: Player 2 - mini-tank at (902,14), text mirrored
    this.addText(838, 8, `PLAYER ${tanks[1].id + 1}`, getPlayerPalette(1, 'hiRes').primary, '16px', 'Barlow Condensed');
    // Draw suffix FIRST at x 790, then numeral at x 884
    this.addText(790, 32, `/ 125 HP`, 0xf4ece2, '8px', 'JetBrains Mono');
    this.addText(884, 24, `${tanks[1].health}`, getPlayerPalette(1, 'hiRes').primary, '22px', 'Barlow Condensed');
    // HP bar
    this.graphics.fillStyle(0xffffff, 0.1);
    this.graphics.fillRoundedRect(764, 48, 130, 4, 2);
    const healthPct2 = tanks[1].health / GAME_CONFIG.tank.maxHealth;
    this.graphics.fillGradientStyle(0xff7a3c, 0xff7a3c, 0xffc08a, 0xffc08a, 1);
    this.graphics.fillRoundedRect(764, 48, 130 * healthPct2, 4, 2);
    // Cash line
    const cashStr2 = `$${match.profiles[1].cash.toLocaleString()}`;
    const winsLabel2 = match.profiles[1].wins === 1 ? 'WIN' : 'WINS';
    this.addText(764, 56, `${cashStr2} · ${match.profiles[1].wins} ${winsLabel2}`, 0xf4ece2, '9px', 'JetBrains Mono');

    // CENTER
    this.addText(480, 6, `ROUND ${match.round} · FIRST TO ${GAME_CONFIG.match.roundsToWin}`, 0xf4ece2, '9px', 'JetBrains Mono', 3);
    this.addText(480, 20, `PLAYER ${turn.activePlayerId + 1} TO FIRE`, activePalette.primary, '20px', 'Barlow Condensed');

    // Wind gauge
    this.drawHiResWindGauge(turn, 408, 48, 452, 545, 42);

    // ===== CONSOLE BAND (358-480px) =====
    this.graphics.fillStyle(0x2a1d14, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, 182);
    this.graphics.lineStyle(1, 0xffb347, 0.22);
    this.graphics.beginPath();
    this.graphics.moveTo(0, top);
    this.graphics.lineTo(GAME_CONFIG.width, top);
    this.graphics.strokePath();

    // Weapon panel: title at (18, top+14), counter at (176, top+14), rows at top+32
    this.drawHiResPanelFrame(8, top + 8, 208, 122, '');
    this.addText(18, top + 14, 'WEAPONS', 0xffb347, '9px', 'JetBrains Mono', 5.2);
    const counter = `${activeTank.selectedWeaponIndex + 1}/39`;
    this.addText(176, top + 14, counter, 0xf4ece2, '9px', 'JetBrains Mono');
    this.drawHiResWeaponRows(18, top + 32, activeTank, weaponWindowStart);

    // Angle panel: title at (232, top+14), range at (330, top+14), numeral at (250, top+30), degree at measured+2
    this.drawHiResPanelFrame(220, top + 8, 176, 122, '');
    this.addText(232, top + 14, 'ANGLE', 0xffb347, '9px', 'JetBrains Mono', 5.2);
    this.addText(330, top + 14, '15–165', 0xf4ece2, '9px', 'JetBrains Mono');
    this.addText(250, top + 30, `${Math.round(activeTank.angle)}`, activePalette.primary, '26px', 'Barlow Condensed');
    const angleNumText = this.texts[this.texts.length - 1];
    const angleNumW = angleNumText.width;
    this.addText(250 + angleNumW + 2, top + 34, '°', 0xf4ece2, '10px', 'JetBrains Mono');
    this.drawHiResAngleDial(308, top + 100, activeTank, activePalette.primary);

    // Power panel: title at (416, top+14), range at (536, top+14), numeral at (430, top+30), ADJUST at (478, top+42), segments at top+100
    this.drawHiResPanelFrame(400, top + 8, 204, 122, '');
    this.addText(416, top + 14, 'POWER', 0xffb347, '9px', 'JetBrains Mono', 5.2);
    this.addText(536, top + 14, '15–100', 0xf4ece2, '9px', 'JetBrains Mono');
    this.addText(430, top + 30, `${Math.round(activeTank.power)}`, activePalette.primary, '26px', 'Barlow Condensed');
    this.addText(478, top + 42, '↕ ADJUST', 0xf4ece2, '8px', 'JetBrains Mono');
    this.drawHiResPowerSegments(416, top + 100, activeTank);

    // Fire panel: rect (626, top+28, 108, 52) with gradient, FIRE at (680, top+44), SPACE/CLICK at (680, top+96)
    this.drawHiResPanelFrame(610, top + 8, 140, 122, '');
    const fireAlpha = turn.phase === 'aiming' ? 1 : 0.35;
    this.graphics.fillGradientStyle(0xff7043, 0xff7043, 0xc22c0c, 0xc22c0c, fireAlpha);
    this.graphics.fillRoundedRect(626, top + 28, 108, 52, 6);
    this.graphics.lineStyle(1, 0xff9a73, 0.5);
    this.graphics.strokeRoundedRect(626, top + 28, 108, 52, 6);
    const fireTextColor = turn.phase === 'aiming' ? 0xfff1e8 : 0x999999;
    this.addText(680, top + 44, 'FIRE', fireTextColor, '22px', 'Barlow Condensed');
    this.addText(680, top + 96, 'SPACE / CLICK', 0xf4ece2, '8px', 'JetBrains Mono', 2);

    // Status panel: title at (770, top+14), rows with labels at x 770, values right-aligned to x 938
    this.drawHiResPanelFrame(756, top + 8, 196, 122, '');
    this.addText(770, top + 14, 'STATUS', 0xffb347, '9px', 'JetBrains Mono', 5.2);
    this.drawHiResStatusRows(770, top + 34, activeTank, match);

    // ===== BOTTOM STRIP =====
    const stripY = top + 136;
    this.graphics.fillStyle(0x070504, 1);
    this.graphics.fillRect(0, stripY, GAME_CONFIG.width, 46);
    this.graphics.lineStyle(1, 0xffb347, 0.22);
    this.graphics.beginPath();
    this.graphics.moveTo(0, stripY);
    this.graphics.lineTo(GAME_CONFIG.width, stripY);
    this.graphics.strokePath();

    // Left: keycaps
    this.drawHiResKeycapChips(top);

    // Right: status at (598, stripY+3), weapon at (598, stripY+15), ESC at (820, stripY+2)
    const statusText = turn.phase === 'aiming' ? 'READY TO FIRE' : 'SHOT IN FLIGHT';
    const statusColor = turn.phase === 'aiming' ? 0x58d98b : 0xffd15c;
    this.addText(598, stripY + 3, statusText, statusColor, '9px', 'JetBrains Mono');
    this.addText(598, stripY + 15, weapon.name.toUpperCase(), 0xf4ece2, '9px', 'JetBrains Mono');

    // ESC MENU chip: (820, stripY+2, 130, 22)
    this.graphics.fillStyle(0x1a0d0a, 1);
    this.graphics.fillRoundedRect(820, stripY + 2, 130, 22, 3);
    this.graphics.lineStyle(1, 0xff5a3c, 0.7);
    this.graphics.strokeRoundedRect(820, stripY + 2, 130, 22, 3);
    this.addText(885, stripY + 7, 'ESC MENU', 0xff8a6c, '9px', 'JetBrains Mono');
  }


  private drawHiResWindGauge(turn: TurnState, labelX: number, labelY: number, segmentX: number, magX: number, magY: number): void {
    const windMag = Math.abs(turn.wind.magnitude);
    const filledSegments = Math.ceil(windMag / 5);

    // WIND label at (408, 48)
    this.addText(labelX, labelY, 'WIND', 0xf4ece2, '9px', 'JetBrains Mono', 3);

    // 4 segments 16x4 starting x 452 gap 4
    let segX = segmentX;
    for (let i = 0; i < 4; i += 1) {
      const isFilled = i < filledSegments;
      this.graphics.fillStyle(isFilled ? 0x58d98b : 0x3a2d22, 1);
      this.graphics.fillRoundedRect(segX, 46, 16, 4, 2);
      segX += 16 + 4;
    }

    // Arrow triangle pointing left/right after segments
    const arrowX = segX + 2;
    if (turn.wind.direction > 0) {
      // Right-pointing
      this.graphics.fillStyle(0x58d98b, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(arrowX, 44);
      this.graphics.lineTo(arrowX + 6, 48);
      this.graphics.lineTo(arrowX, 52);
      this.graphics.closePath();
      this.graphics.fillPath();
    } else {
      // Left-pointing
      this.graphics.fillStyle(0x58d98b, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(arrowX + 6, 44);
      this.graphics.lineTo(arrowX, 48);
      this.graphics.lineTo(arrowX + 6, 52);
      this.graphics.closePath();
      this.graphics.fillPath();
    }

    // Magnitude at (545, 42)
    this.addText(magX, magY, `${windMag}`, 0x58d98b, '15px', 'Barlow Condensed');
  }

  private drawHiResWeaponRows(x: number, y: number, tank: TankState, weaponWindowStart: number): void {
    const weapons = GAME_CONFIG.weapons;
    for (let i = 0; i < 3 && weaponWindowStart + i < weapons.length; i += 1) {
      const w = weapons[weaponWindowStart + i];
      const idx = weaponWindowStart + i;
      const isSelected = idx === tank.selectedWeaponIndex;
      const ammo = tank.ammo[w.id] ?? 0;
      const rowY = y + i * 11;

      if (isSelected) {
        this.graphics.fillStyle(0x3f9dff, 0.42);
        this.graphics.fillRoundedRect(x - 2, rowY - 1, 200, 11, 2);
      }

      const nameColor = isSelected ? 0xffffff : 0xf4ece2;
      this.addText(x, rowY, `${idx + 1} ${w.name}`, nameColor, '9px', 'JetBrains Mono');
      const ammoStr = ammo === -1 ? '∞' : String(ammo);
      const ammoColor = ammo === 0 ? 0x8a8a8a : 0xf4ece2;
      this.addText(190, rowY, ammoStr, ammoColor, '9px', 'JetBrains Mono');
    }
  }

  private drawHiResPowerSegments(x0: number, y0: number, tank: TankState): void {
    const segmentW = 15;
    const gap = 3;
    const segmentH = 10;
    const filledCount = Math.round(tank.power / 10);

    for (let i = 0; i < 10; i += 1) {
      const segX = x0 + i * (segmentW + gap);
      const isFilled = i < filledCount;
      if (isFilled) {
        this.graphics.fillGradientStyle(0x8ed0ff, 0x8ed0ff, 0x3f9dff, 0x3f9dff, 1);
      } else {
        this.graphics.fillStyle(0xffffff, 0.09);
      }
      this.graphics.fillRoundedRect(segX, y0, segmentW, segmentH, 2);
    }

    this.addText(x0, y0 + 16, 'MIN', 0xf4ece2, '7px', 'JetBrains Mono');
    this.addText(x0 + 150, y0 + 16, 'MAX', 0xf4ece2, '7px', 'JetBrains Mono');
  }

  private drawHiResAngleDial(cx: number, cy: number, tank: TankState, highlightColor: number): void {
    const radius = 34;
    this.graphics.lineStyle(2, 0xffffff, 0.14);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius, Phaser.Math.DegToRad(-165), Phaser.Math.DegToRad(-15), false);
    this.graphics.strokePath();

    const tickDegrees = [15, 45, 90, 135, 165];
    this.graphics.lineStyle(2, 0xffffff, 0.25);
    tickDegrees.forEach((deg) => {
      const rad = Phaser.Math.DegToRad(deg);
      const x1 = cx + Math.cos(rad) * 30;
      const y1 = cy - Math.sin(rad) * 30;
      const x2 = cx + Math.cos(rad) * 34;
      const y2 = cy - Math.sin(rad) * 34;
      this.graphics.beginPath();
      this.graphics.moveTo(x1, y1);
      this.graphics.lineTo(x2, y2);
      this.graphics.strokePath();
    });

    const needleRad = Phaser.Math.DegToRad(tank.angle);
    const needleX = cx + Math.cos(needleRad) * 30;
    const needleY = cy - Math.sin(needleRad) * 30;
    this.graphics.lineStyle(3, highlightColor, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(cx, cy);
    this.graphics.lineTo(needleX, needleY);
    this.graphics.strokePath();

    this.graphics.fillStyle(0xf4ece2, 1);
    this.graphics.fillCircle(cx, cy, 4);
  }

  private drawHiResStatusRows(x: number, y: number, tank: TankState, match: MatchState): void {
    const labels = ['MOVE', 'CHUTES', 'BATT', 'GUIDE', 'SHIELD', 'CASH'];
    const rowH = 14;

    const moveStr = tank.fuel > 0
      ? `${Math.round(tank.moveRemaining)} / ${GAME_CONFIG.movement.perTurn}+${Math.round(tank.fuel)}`
      : `${Math.round(tank.moveRemaining)} / ${GAME_CONFIG.movement.perTurn}`;
    const chutesStr = `${tank.parachutes}`;
    const battStr = `${tank.batteries}`;
    const guideLabel = tank.selectedGuidanceId
      ? (GAME_CONFIG.items.find((i) => i.id === tank.selectedGuidanceId)?.sidebarLabel ?? tank.selectedGuidanceId.toUpperCase())
      : '--';
    const shieldStr = tank.armedShieldHp > 0 ? `${tank.armedShieldHp} HP` : '--';
    const cashStr = `$${match.profiles[tank.id].cash.toLocaleString()}`;

    const values = [moveStr, chutesStr, battStr, guideLabel, shieldStr, cashStr];
    const valueColors = [0xf4ece2, 0xffd15c, 0x7fd6ff, 0x7fd6ff, 0x7fd6ff, 0x58d98b];

    for (let i = 0; i < labels.length; i += 1) {
      const rowY = y + i * rowH;
      this.addText(x, rowY, labels[i], 0xf4ece2, '9px', 'JetBrains Mono');

      // Draw value text, measure width, and position at x 938
      this.addText(x + 200, rowY, values[i], valueColors[i], '9px', 'JetBrains Mono');
      const valueText = this.texts[this.texts.length - 1];
      const valueW = valueText.width;
      valueText.setX(938 - valueW);
    }
  }


  private drawHiResKeycapChips(top: number): void {
    const chipY1 = top + 144;
    const chipY2 = top + 162;
    const chipH = 16;
    const chipPadding = 8;
    const gapAfterChip = 10;
    const gapAfterDesc = 12;
    let currentX = 16;

    // Helper to draw a keycap chip
    const drawChip = (keyText: string, descText: string, yPos: number) => {
      // Create key-token text and measure its actual width
      this.addText(currentX + 4, yPos, keyText, 0xffd9a0, GAME_CONFIG.font.small, 'JetBrains Mono', 1);
      const keyToken = this.texts[this.texts.length - 1];
      const tokenW = keyToken.width;

      // Draw chip rect using actual width
      const chipW = tokenW + chipPadding;
      this.graphics.fillStyle(0x1a140f, 1);
      this.graphics.fillRoundedRect(currentX, yPos - 2, chipW, chipH, 3);
      this.graphics.lineStyle(1, 0xffbe78, 0.25);
      this.graphics.strokeRoundedRect(currentX, yPos - 2, chipW, chipH, 3);

      // Advance past chip
      currentX += chipW + gapAfterChip;

      // Create description text and measure its actual width
      this.addText(currentX, yPos, descText, 0x8a8078, GAME_CONFIG.font.small, 'JetBrains Mono', 1);
      const descToken = this.texts[this.texts.length - 1];
      const descW = descToken.width;

      // Advance past description with gap before next chip
      currentX += descW + gapAfterDesc;
    };

    // Line 1
    drawChip('←→', 'Aim', chipY1);
    drawChip('↑↓', 'Power', chipY1);
    drawChip('A/D', 'TAP MOVE', chipY1);
    drawChip('1-8', 'Weapon', chipY1);

    // Line 2
    currentX = 16;
    drawChip('SPACE', 'Fire', chipY2);
    drawChip('V', 'Visual', chipY2);
    drawChip('ENTER', 'Advance', chipY2);
  }

  private clearTexts(): void {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }
}
