import Phaser from 'phaser';
import {
  bananasInk,
  bananasIs1Bit,
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

interface BananasGlyphMask {
  pts: Array<[number, number]>;
  w: number;
  h: number;
}

const bananasGlyphCache: Record<string, BananasGlyphMask> = {};

export function bananasTextMask(str: string, fine = false): BananasGlyphMask {
  const cacheKey = (fine ? 'f:' : 'c:') + str;
  if (bananasGlyphCache[cacheKey]) return bananasGlyphCache[cacheKey];
  const w = Math.max(1, str.length * 6);
  const h = 9;
  const canvas = document.createElement('canvas');
  const scale = fine ? 2 : 1;
  canvas.width = w * scale;
  canvas.height = h * scale;
  const context = canvas.getContext('2d')!;
  context.font = fine ? '18px monospace' : '9px monospace';
  context.textBaseline = 'top';
  context.fillStyle = '#fff';
  context.fillText(str, 0, 0);
  const data = context.getImageData(0, 0, w * scale, h * scale).data;
  const pts: Array<[number, number]> = [];
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      if (fine) {
        // Supersample: light a cell when at least half its 2x2 subpixels
        // have ink. The straight 9px threshold dropped thin strokes and left
        // small text ragged; big cells keep the coarse mask, whose open
        // counters read better at wordmark sizes.
        let covered = 0;
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            if (data[((py * 2 + sy) * w * 2 + px * 2 + sx) * 4 + 3] > 60) covered += 1;
          }
        }
        if (covered >= 2) pts.push([px, py]);
      } else if (data[(py * w + px) * 4 + 3] > 100) {
        pts.push([px, py]);
      }
    }
  }
  bananasGlyphCache[cacheKey] = { pts, w, h };
  return bananasGlyphCache[cacheKey];
}

export function bananasPixText(
  graphics: Phaser.GameObjects.Graphics,
  str: string,
  x: number,
  y: number,
  cell: number,
  color: number
): number {
  const mask = bananasTextMask(str.toUpperCase(), cell <= 2);
  graphics.fillStyle(color, 1);
  mask.pts.forEach(([px, py]) => graphics.fillRect(x + px * cell, y + py * cell, cell, cell));
  return mask.w * cell;
}

export function bananasPixTextCentered(
  graphics: Phaser.GameObjects.Graphics,
  str: string,
  cx: number,
  y: number,
  cell: number,
  color: number
): number {
  const mask = bananasTextMask(str.toUpperCase(), cell <= 2);
  return bananasPixText(graphics, str, Math.round(cx - (mask.w * cell) / 2), y, cell, color);
}

export function bananasBox(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  frame: number
): void {
  graphics.fillStyle(fill, 1);
  graphics.fillRect(x, y, w, h);
  graphics.fillStyle(frame, 1);
  graphics.fillRect(x, y, w, 2);
  graphics.fillRect(x, y + h - 2, w, 2);
  graphics.fillRect(x, y, 2, h);
  graphics.fillRect(x + w - 2, y, 2, h);
}

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
    if (visualSystem === 'retroPixel') {
      return { frame: c.steelLight, title: c.desertGold, accent: c.desertGold, header: c.desertGold, label: c.white };
    }
    if (visualSystem === 'hiRes') {
      return { frame: 0xffbe78, title: 0xffb347, accent: 0xff7a3c, header: 0xffb347, label: 0xf4ece2 };
    }
    return { frame: c.yellow, title: c.magenta, accent: c.cyan, header: c.cyan, label: c.cyan };
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
    quitConfirm = false,
    isOnline = false,
    localShopper = true
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
      if (visualSystem === 'bananas') {
        this.drawBananasHud(turn, tanks, match, weapon);
      } else if (visualSystem === 'retroPixel') {
        this.drawRetroPixelHud(turn, tanks, weapon, match, weaponWindowStart);
      } else if (visualSystem === 'hiRes') {
        this.drawHiResHud(turn, tanks, weapon, match, weaponWindowStart);
      } else {
        this.drawTopHud(turn, tanks, match);
        this.drawConsole(turn, tanks[turn.activePlayerId], weapon, match, weaponWindowStart);
      }
    }

    if (inShop) {
      if (localShopper) {
        this.drawShopOverlay(match, visualSystem);
      } else {
        this.drawFullScreenBackdrop();
        const shoppingPlayerId = match.shoppingPlayerId;
        if (shoppingPlayerId !== null) {
          const shopperName = match.profiles[shoppingPlayerId].displayName ?? `PLAYER ${shoppingPlayerId + 1}`;
          this.drawCenterBanner(`${shopperName} IS SHOPPING`, 'PLEASE WAIT', visualSystem);
        }
      }
    } else if (turn.phase === 'roundOver' && statusMessage) {
      this.drawCenterBanner(
        statusMessage,
        visualSystem === 'bananas'
          ? 'PRESS SPACE OR ENTER FOR NEXT ROUND'
          : 'PRESS SPACE OR ENTER FOR SHOP',
        visualSystem
      );
    } else if (turn.phase === 'aiming' && statusMessage) {
      // AI is thinking — small banner that doesn't block visibility.
      if (visualSystem === 'bananas') {
        this.addText(GAME_CONFIG.width / 2, 140, statusMessage, bananasInk(0xffff55), '14px', 'Courier New', undefined, { originX: 0.5 });
      } else {
        this.addText(
          (GAME_CONFIG.width - statusMessage.length * 11) / 2,
          140,
          statusMessage,
          GAME_CONFIG.colors.yellow,
          GAME_CONFIG.font.medium
        );
      }
    } else if (matchOver) {
      this.drawFullScreenBackdrop();
      const winId = match.matchWinnerId!;
      const winName = match.profiles[winId].displayName ?? `PLAYER ${winId + 1}`;
      // Online rematch isn't a thing — the only exit is back to the menu.
      this.drawCenterBanner(
        `${winName} WINS THE MATCH`,
        isOnline ? 'ESC FOR MENU' : 'R TO PLAY AGAIN  ·  ESC FOR MENU',
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
      const toastColor = visualSystem === 'bananas' ? bananasInk(topToast.color) : topToast.color;
      this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.7);
      this.graphics.fillRect(x - 10, y - 4, labelW + 20, 26);
      this.graphics.lineStyle(2, toastColor, 1);
      this.graphics.strokeRect(x - 10, y - 4, labelW + 20, 26);
      if (visualSystem === 'bananas') {
        this.addText(GAME_CONFIG.width / 2, y, topToast.text, toastColor, '14px', 'Courier New', undefined, { originX: 0.5 });
      } else {
        this.addText(x, y, topToast.text, topToast.color, GAME_CONFIG.font.medium);
      }
    }

  }

  /**
   * Forfeit-to-menu modal. Full-screen dim backdrop with a centered card
   * carrying the warning and YES/NO buttons. Geometry matches
   * GameScene.handleQuitConfirmPointer.
   */
  private drawQuitConfirmModal(visualSystem: VisualSystem = 'classic'): void {
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

    if (visualSystem === 'hiRes') {
      // Glass panel treatment: match drawHiResPanelFrame exactly
      // gradient alphas .92 top → .95 bottom, border 0xffbe78 alpha .16, inset highlight WHITE 0xffffff alpha .07, corner radius 3
      this.graphics.fillGradientStyle(0x261e18, 0x261e18, 0x0c0907, 0x0c0907, 0.92, 0.92, 0.95, 0.95);
      this.graphics.fillRoundedRect(cardX, cardY, cardW, cardH, 3);
      this.graphics.lineStyle(1, 0xffbe78, 0.16);
      this.graphics.strokeRoundedRect(cardX, cardY, cardW, cardH, 3);
      // Inset highlight (top edge, white, alpha .07)
      this.graphics.lineStyle(1, 0xffffff, 0.07);
      this.graphics.beginPath();
      this.graphics.moveTo(cardX + 2, cardY + 1);
      this.graphics.lineTo(cardX + cardW - 2, cardY + 1);
      this.graphics.strokePath();

      // Heading in orange/coral
      this.addTextCentered(cx, cardY + 24, 'FORFEIT MATCH?', 0xff8a6c, '22px', 'Barlow Condensed', undefined, { weight: '700' });

      // Body in mono
      this.addTextCenteredMono(cx, cardY + 80, 'Return to the menu?', 0xffffff, '10px', { weight: '400' });
      this.addTextCenteredMono(cx, cardY + 108, 'This counts as a forfeit.', 0xffbe78, '10px', { weight: '400' });

      // YES button: red gradient
      const btnH = 44;
      const btnW = 140;
      const btnY = cardY + cardH - btnH - 20;
      const gap = 24;
      const yesX = cx - btnW - gap / 2;
      const noX = cx + gap / 2;

      this.graphics.fillGradientStyle(0xff7043, 0xff7043, 0xc22c0c, 0xc22c0c, 1);
      this.graphics.fillRoundedRect(yesX, btnY, btnW, btnH, 4);
      this.graphics.lineStyle(1, 0xffb48c, 0.5);
      this.graphics.strokeRoundedRect(yesX, btnY, btnW, btnH, 4);
      this.addTextCenteredBarlow(yesX + btnW / 2, btnY + btnH / 2 - 6, 'YES (Y)', 0xfff5ec, '18px', { weight: '700' });

      // NO button: dark ghost with green text, Barlow label (both buttons Barlow)
      this.graphics.fillStyle(0x0c0a08, 1);
      this.graphics.fillRoundedRect(noX, btnY, btnW, btnH, 4);
      this.graphics.lineStyle(1, 0x58d98b, 0.4);
      this.graphics.strokeRoundedRect(noX, btnY, btnW, btnH, 4);
      this.addTextCenteredBarlow(noX + btnW / 2, btnY + btnH / 2 - 6, 'NO (N)', 0x58d98b, '18px', { weight: '700' });

    } else if (visualSystem === 'bananas') {
      bananasBox(this.graphics, cardX, cardY, cardW, cardH, bananasInk(0x000000), bananasInk(0xffffff));
      this.addText(cx, cardY + 24, 'FORFEIT MATCH?', bananasInk(0xffff55), '24px', 'Courier New', undefined, { originX: 0.5 });

      const btnH = 44;
      const btnW = 140;
      const btnY = cardY + cardH - btnH - 20;
      const gap = 24;
      const yesX = cx - btnW - gap / 2;
      const noX = cx + gap / 2;

      bananasBox(this.graphics, yesX, btnY, btnW, btnH, bananasInk(0x000000), bananasInk(0xffffff));
      this.addText(yesX + btnW / 2, btnY + 13, 'YES (Y)', bananasInk(0xffffff), '14px', 'Courier New', undefined, { originX: 0.5 });
      bananasBox(this.graphics, noX, btnY, btnW, btnH, bananasInk(0x000000), bananasInk(0xffffff));
      this.addText(noX + btnW / 2, btnY + 13, 'NO (N)', bananasInk(0xffffff), '14px', 'Courier New', undefined, { originX: 0.5 });

    } else if (visualSystem === 'retroPixel') {
      // Steel/boxy treatment with desertGold title
      this.graphics.fillStyle(colors.steelMid, 1);
      this.graphics.fillRect(cardX, cardY, cardW, cardH);
      this.graphics.lineStyle(2, colors.desertGold, 1);
      this.graphics.strokeRect(cardX, cardY, cardW, cardH);

      // Title in desertGold
      this.addTextCentered(cx, cardY + 24, 'FORFEIT MATCH?', colors.desertGold, '24px', 'Courier New', undefined, { weight: '700' });

      // Body in white/yellow
      this.addTextCentered(cx, cardY + 80, 'Return to the menu?', colors.white, '18px', 'Courier New', undefined, { weight: '400' });
      this.addTextCentered(cx, cardY + 108, 'This counts as a forfeit.', colors.yellow, '18px', 'Courier New', undefined, { weight: '400' });

      // YES button: red border
      const btnH = 44;
      const btnW = 140;
      const btnY = cardY + cardH - btnH - 20;
      const gap = 24;
      const yesX = cx - btnW - gap / 2;
      const noX = cx + gap / 2;

      this.graphics.fillStyle(0x050505, 1);
      this.graphics.fillRect(yesX, btnY, btnW, btnH);
      this.graphics.lineStyle(2, colors.red, 1);
      this.graphics.strokeRect(yesX, btnY, btnW, btnH);
      this.addTextCentered(yesX + btnW / 2, btnY + btnH / 2 - 12, 'YES (Y)', colors.red, '18px', 'Courier New', undefined, { weight: '700' });

      // NO button: green border
      this.graphics.fillStyle(0x050505, 1);
      this.graphics.fillRect(noX, btnY, btnW, btnH);
      this.graphics.lineStyle(2, colors.green, 1);
      this.graphics.strokeRect(noX, btnY, btnW, btnH);
      this.addTextCentered(noX + btnW / 2, btnY + btnH / 2 - 12, 'NO (N)', colors.green, '18px', 'Courier New', undefined, { weight: '700' });

    } else {
      // Classic: byte-identical
      const palette = this.uiPalette(visualSystem);
      this.graphics.fillStyle(colors.panelGray, 1);
      this.graphics.fillRect(cardX, cardY, cardW, cardH);
      this.graphics.lineStyle(4, palette.frame, 1);
      this.graphics.strokeRect(cardX, cardY, cardW, cardH);

      this.addTextCentered(cx, cardY + 24, 'FORFEIT MATCH?', colors.red, GAME_CONFIG.font.title);

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
  }

  private addTextCentered(cx: number, y: number, value: string, color: number, fontSize: string, fontFamily?: string, letterSpacing?: number, opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }): void {
    let fontStyle: string = 'bold';
    if (opts?.weight === '400') {
      fontStyle = '';
    } else if (opts?.weight === '600') {
      fontStyle = '600';
    }

    const text = this.scene.add.text(cx, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle
    });
    text.setOrigin(opts?.originX ?? 0.5, opts?.originY ?? 0);
    text.setResolution(GAME_CONFIG.renderScale);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
    this.texts.push(text);
  }

  private addTextCenteredMono(cx: number, y: number, value: string, color: number, fontSize: string, opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }): void {
    let fontStyle: string = '';
    if (opts?.weight === '600') {
      fontStyle = '600';
    } else if (opts?.weight === '700') {
      fontStyle = 'bold';
    }

    const text = this.scene.add.text(cx, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: 'JetBrains Mono',
      fontSize,
      fontStyle
    });
    text.setOrigin(opts?.originX ?? 0.5, opts?.originY ?? 0);
    text.setResolution(GAME_CONFIG.renderScale);
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
    this.texts.push(text);
  }

  private addTextCenteredBarlow(cx: number, y: number, value: string, color: number, fontSize: string, opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }): void {
    let fontStyle: string = 'bold';
    if (opts?.weight === '400') {
      fontStyle = '';
    } else if (opts?.weight === '600') {
      fontStyle = '600';
    }

    const text = this.scene.add.text(cx, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: 'Barlow Condensed',
      fontSize,
      fontStyle
    });
    text.setOrigin(opts?.originX ?? 0.5, opts?.originY ?? 0);
    text.setResolution(GAME_CONFIG.renderScale);
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
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

  private drawBananasHud(
    turn: TurnState,
    tanks: TankState[],
    match: MatchState,
    _weapon: WeaponDefinition
  ): void {
    const tank = tanks[turn.activePlayerId];
    const top = GAME_CONFIG.layout.consoleTop;
    const p1Name = match.profiles[0].displayName ?? 'PLAYER 1';
    const p2Name = match.profiles[1].displayName ?? 'PLAYER 2';
    const activeName = match.profiles[turn.activePlayerId].displayName ?? `PLAYER ${turn.activePlayerId + 1}`;

    this.addText(24, 10, p1Name, bananasInk(0x55ffff), '14px', 'Courier New');
    this.addText(
      480,
      10,
      `${match.profiles[0].wins} > SCORE < ${match.profiles[1].wins}`,
      bananasInk(0xffffff),
      '14px',
      'Courier New',
      undefined,
      { originX: 0.5 }
    );
    this.addText(936, 10, p2Name, bananasInk(0xff55ff), '14px', 'Courier New', undefined, { originX: 1 });

    this.graphics.fillStyle(bananasInk(0x0000aa), 1);
    this.graphics.fillRect(0, top, 960, 134);
    this.graphics.fillStyle(bananasInk(0xffffff), 1);
    this.graphics.fillRect(0, top, 960, 2);

    bananasBox(this.graphics, 8, 366, 208, 122, bananasInk(0x000000), bananasInk(0xffffff));
    this.addText(88, 374, 'SCORE', bananasInk(0xffffff), '14px', 'Courier New');
    this.addText(20, 398, p1Name, bananasInk(0x55ffff), '14px', 'Courier New');
    this.addText(180, 398, `${match.profiles[0].wins}`, bananasInk(0xffff55), '14px', 'Courier New');
    this.addText(20, 420, p2Name, bananasInk(0xff55ff), '14px', 'Courier New');
    this.addText(180, 420, `${match.profiles[1].wins}`, bananasInk(0xffff55), '14px', 'Courier New');
    this.addText(20, 448, `BEST OF ${match.roundsToWin * 2 - 1}`, bananasInk(0xaaaaaa), '14px', 'Courier New');
    this.addText(20, 466, 'BANANA', bananasInk(0xffff55), '14px', 'Courier New');

    bananasBox(this.graphics, 220, 366, 176, 122, bananasInk(0x000000), bananasInk(0xffffff));
    this.addText(274, 374, 'ANGLE', bananasInk(0xffffff), '14px', 'Courier New');
    this.addText(308, 398, `${Math.round(tank.angle)}`, bananasInk(0xffff55), '42px', 'Courier New', undefined, { originX: 0.5 });
    this.graphics.fillStyle(bananasInk(0xffffff), 1);
    this.graphics.fillRect(238, 466, 140, 2);
    const angleRadians = (tank.angle * Math.PI) / 180;
    this.graphics.lineStyle(3, bananasInk(0x55ff55), 1);
    this.graphics.beginPath();
    this.graphics.moveTo(308, 466);
    this.graphics.lineTo(308 + Math.cos(angleRadians) * 60, 466 - Math.sin(angleRadians) * 60);
    this.graphics.strokePath();
    this.addText(230, 448, '<<', bananasInk(0x555555), '14px', 'Courier New');
    this.addText(356, 448, '>>', bananasInk(0x555555), '14px', 'Courier New');

    bananasBox(this.graphics, 400, 366, 204, 122, bananasInk(0x000000), bananasInk(0xffffff));
    this.addText(462, 374, 'VELOCITY', bananasInk(0xffffff), '14px', 'Courier New');
    this.addText(502, 398, `${Math.round(tank.power)}`, bananasInk(0xffff55), '42px', 'Courier New', undefined, { originX: 0.5 });
    bananasBox(this.graphics, 418, 452, 168, 22, bananasInk(0x000000), bananasInk(0xffffff));
    const filledSegments = Math.floor(tank.power / 10);
    for (let i = 0; i < 10; i += 1) {
      this.graphics.fillStyle(bananasInk(i < filledSegments ? 0x55ff55 : 0x555555), 1);
      this.graphics.fillRect(423 + i * 16, 457, 12, 12);
    }
    this.addText(410, 448, '<<', bananasInk(0x555555), '14px', 'Courier New');
    this.addText(578, 448, '>>', bananasInk(0x555555), '14px', 'Courier New');

    bananasBox(this.graphics, 610, 366, 140, 122, bananasInk(0x000000), bananasInk(0xffffff));
    bananasBox(
      this.graphics,
      632,
      394,
      94,
      58,
      bananasIs1Bit()
        ? 0x000000
        : bananasInk(turn.phase === 'aiming' ? 0xaa0000 : 0x555555),
      bananasInk(0xffffff)
    );
    this.addText(679, 410, 'FIRE', bananasInk(0xffff55), '30px', 'Courier New', undefined, { originX: 0.5 });
    this.addText(679, 462, 'SPACE', bananasInk(0xaaaaaa), '14px', 'Courier New', undefined, { originX: 0.5 });

    bananasBox(this.graphics, 756, 366, 196, 122, bananasInk(0x000000), bananasInk(0xffffff));
    this.addText(838, 374, 'WIND', bananasInk(0xffffff), '14px', 'Courier New');
    this.drawBananasWindArrow(854, 412, turn.wind.magnitude, turn.wind.direction);
    this.addText(
      772,
      430,
      `${turn.wind.direction > 0 ? 'RIGHT' : 'LEFT'}  ${turn.wind.magnitude}`,
      bananasInk(0xff5555),
      '14px',
      'Courier New'
    );
    this.addText(772, 450, `ROUND   ${match.round}`, bananasInk(0xffffff), '14px', 'Courier New');
    this.addText(772, 468, 'GRAVITY 9.8', bananasInk(0xaaaaaa), '14px', 'Courier New');

    this.graphics.fillStyle(bananasInk(0x000000), 1);
    this.graphics.fillRect(0, 494, 960, 46);
    this.graphics.fillStyle(bananasInk(0xffffff), 1);
    this.graphics.fillRect(0, 494, 960, 2);
    this.addText(16, 504, '<- -> ANGLE   UP DN VELOCITY   SPACE THROW', bananasInk(0x55ffff), '14px', 'Courier New');
    this.addText(16, 522, 'V CYCLE DISPLAY   ENTER NEXT   ESC MENU', bananasInk(0x55ffff), '14px', 'Courier New');

    const stripY = GAME_CONFIG.layout.bottomStatusTop - 5;
    bananasBox(this.graphics, 820, stripY + 2, 130, 22, bananasInk(0x000000), bananasInk(0x555555));
    this.addText(885, stripY + 8, 'ESC', bananasInk(0xaaaaaa), '14px', 'Courier New', undefined, { originX: 0.5 });
    const throwText = `${activeName} THROWS`;
    this.addText(812, 504, throwText, bananasInk(0xffff55), '14px', 'Courier New', undefined, { originX: 1 });
    if (turn.phase === 'projectileInFlight') {
      const flightText = 'BANANA IN FLIGHT';
      this.addText(812, 522, flightText, bananasInk(0xffffff), '14px', 'Courier New', undefined, { originX: 1 });
    }
  }

  private drawBananasWindArrow(cx: number, y: number, magnitude: number, direction: -1 | 1): void {
    const len = Math.min(magnitude, 20) * 4 * direction;
    this.graphics.fillStyle(bananasInk(0xff5555), 1);
    this.graphics.fillRect(Math.min(cx, cx + len), y, Math.abs(len), 3);
    const tipX = cx + len;
    for (let i = 0; i < 7; i += 1) {
      this.graphics.fillRect(tipX - direction * i, y - i + 1, 2, 2 * i + 1);
    }
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
    this.graphics.lineStyle(2, colors.desertGold, 0.7);
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
      match.profiles[turn.activePlayerId].displayName ?? `PLAYER ${turn.activePlayerId + 1}`,
      activePalette.primary,
      GAME_CONFIG.font.large
    );
    this.addText(432, 66, `Wind ${windArrow} ${turn.wind.magnitude}`, colors.green, GAME_CONFIG.font.medium);

    this.graphics.fillStyle(colors.steelMid, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, 134);
    this.graphics.lineStyle(3, colors.desertGold, 0.7);
    this.graphics.strokeRect(1, top + 1, 958, 132);

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
    this.addText(x, y, match.profiles[tank.id].displayName ?? `PLAYER ${tank.id + 1}`, color, GAME_CONFIG.font.medium);
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
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(x, y, w, h);
    this.graphics.lineStyle(1, colors.black, 1);
    this.graphics.strokeRect(x + 5, y + 5, w - 10, h - 10);
    if (title) {
      // Create text to measure width, then center it, then add it properly
      const titleText = this.scene.add.text(x + w / 2, y + 8, title, {
        color: Phaser.Display.Color.IntegerToColor(colors.desertGold).rgba,
        fontFamily: GAME_CONFIG.font.family,
        fontSize: GAME_CONFIG.font.medium,
        fontStyle: 'bold'
      });
      titleText.setOrigin(0.5, 0);
      titleText.setResolution(GAME_CONFIG.renderScale);
      this.texts.push(titleText);
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
    // Stray '<' at x+50 removed per R1
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
    // Stray '<' at x+60 removed per R1
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

    if (visualSystem === 'hiRes') {
      // Glass panel treatment for hi-res: match drawHiResPanelFrame exactly
      // gradient alphas .92 top → .95 bottom, border 0xffbe78 alpha .16, inset highlight WHITE 0xffffff alpha .07, corner radius 3
      this.graphics.fillGradientStyle(0x261e18, 0x261e18, 0x0c0907, 0x0c0907, 0.92, 0.92, 0.95, 0.95);
      this.graphics.fillRoundedRect(x, y, w, h, 3);
      this.graphics.lineStyle(1, 0xffbe78, 0.16);
      this.graphics.strokeRoundedRect(x, y, w, h, 3);
      // Inset highlight (white, top edge, alpha .07)
      this.graphics.lineStyle(1, 0xffffff, 0.07);
      this.graphics.beginPath();
      this.graphics.moveTo(x + 2, y + 1);
      this.graphics.lineTo(x + w - 2, y + 1);
      this.graphics.strokePath();

      // Headline in Barlow 700
      this.addText(x + 24, y + 20, line1, 0xffb347, '24px', 'Barlow Condensed', undefined, { weight: '700' });
      // Sub-line in mono
      this.addText(x + 24, y + 66, line2, 0xd8cfc4, '10px', 'JetBrains Mono', undefined, { weight: '400' });
    } else if (visualSystem === 'bananas') {
      bananasBox(this.graphics, x, y, w, h, bananasInk(0x000000), bananasInk(0xffffff));
      this.addText(x + w / 2, y + 22, line1, bananasInk(0xffff55), '24px', 'Courier New', undefined, { originX: 0.5 });
      this.addText(x + w / 2, y + 68, line2, bananasInk(0xffffff), '16px', 'Courier New', undefined, { originX: 0.5 });
    } else if (visualSystem === 'retroPixel') {
      // Retro: boxy 2px steel + desertGold
      this.graphics.fillStyle(GAME_CONFIG.colors.steelMid, 1);
      this.graphics.fillRect(x, y, w, h);
      this.graphics.lineStyle(2, GAME_CONFIG.colors.steelLight, 1);
      this.graphics.strokeRect(x, y, w, h);
      this.addText(x + 24, y + 22, line1, GAME_CONFIG.colors.desertGold, GAME_CONFIG.font.title);
      this.addText(x + 24, y + 68, line2, GAME_CONFIG.colors.white, GAME_CONFIG.font.medium);
    } else {
      // Classic: original treatment
      this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.82);
      this.graphics.fillRect(x, y, w, h);
      this.graphics.lineStyle(3, palette.frame, 1);
      this.graphics.strokeRect(x, y, w, h);
      this.addText(x + 24, y + 22, line1, palette.title, GAME_CONFIG.font.title);
      this.addText(x + 24, y + 68, line2, GAME_CONFIG.colors.white, GAME_CONFIG.font.medium);
    }
  }

  private drawShopOverlay(match: MatchState, visualSystem: VisualSystem = 'classic'): void {
    if (visualSystem === 'hiRes') {
      this.drawShopOverlayHiRes(match);
    } else if (visualSystem === 'retroPixel') {
      this.drawShopOverlayRetro(match);
    } else {
      this.drawShopOverlayClassic(match);
    }
  }

  private drawShopOverlayClassic(match: MatchState): void {
    const shopperId = match.shoppingPlayerId as PlayerId;
    const profile = match.profiles[shopperId];
    const colors = GAME_CONFIG.colors;
    const palette = this.uiPalette('classic');
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

  private drawShopOverlayHiRes(match: MatchState): void {
    const shopperId = match.shoppingPlayerId as PlayerId;
    const profile = match.profiles[shopperId];
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

    // Warm-dark backdrop at 0.9 alpha, full screen
    this.graphics.fillStyle(0x0a0705, 0.9);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // Glass panel frame using hi-res idiom
    this.graphics.fillGradientStyle(0x261e18, 0x261e18, 0x0c0907, 0x0c0907, 0.92);
    this.graphics.fillRoundedRect(panelX, panelY, panelW, panelH, 3);
    this.graphics.lineStyle(1, 0xffbe78, 0.16);
    this.graphics.strokeRoundedRect(panelX, panelY, panelW, panelH, 3);
    // Inset highlight (white, top edge)
    this.graphics.lineStyle(1, 0xffffff, 0.07);
    this.graphics.beginPath();
    this.graphics.moveTo(panelX + 2, panelY + 1);
    this.graphics.lineTo(panelX + panelW - 2, panelY + 1);
    this.graphics.strokePath();

    // ----- HEADER -----
    // ROUND N SHOP title in Barlow Condensed 22px weight 700
    this.addText(panelX + 20, panelY + 10, `ROUND ${match.round} SHOP`, 0xffb347, '22px', 'Barlow Condensed', undefined, { weight: '700' });

    // Shopper name via getPlayerPalette(shopperId, visualSystem)
    const shopperId_playerColor = getPlayerPalette(shopperId, 'hiRes').primary;
    this.addText(panelX + 20, panelY + 48, profile.displayName ?? `PLAYER ${shopperId + 1}`, shopperId_playerColor, '22px', 'Barlow Condensed', undefined, { weight: '700' });

    // CASH label JetBrains Mono 9px letterSpacing 2 alpha .85 color 0xffb347
    this.addText(panelX + 380, panelY + 18, 'CASH', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    // Cash value Barlow 22px weight 600 green
    this.addText(panelX + 380, panelY + 48, `$${effectiveCash}`, 0x58d98b, '22px', 'Barlow Condensed', undefined, { weight: '600' });

    // FINISH button: red gradient key (3-stop ff7043→c22c0c→8f2106, radius 4)
    // Glow layer (larger, lower alpha)
    this.graphics.fillStyle(0xff7043, 0.15);
    this.graphics.fillRoundedRect(SHOP_LAYOUT.finishX - 2, SHOP_LAYOUT.finishY - 2, SHOP_LAYOUT.finishW + 4, SHOP_LAYOUT.finishH + 4, 5);

    // 3-stop gradient: #ff7043 → #c22c0c → #8f2106
    this.graphics.fillGradientStyle(0xff7043, 0xff7043, 0x8f2106, 0x8f2106, 1);
    this.graphics.fillRoundedRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH, 4);

    // Inset highlight
    this.graphics.lineStyle(1, 0xffb48c, 0.8);
    this.graphics.beginPath();
    this.graphics.moveTo(SHOP_LAYOUT.finishX + 1, SHOP_LAYOUT.finishY + 1);
    this.graphics.lineTo(SHOP_LAYOUT.finishX + SHOP_LAYOUT.finishW - 1, SHOP_LAYOUT.finishY + 1);
    this.graphics.strokePath();

    // FINISH label Barlow 18px weight 700 0xfff5ec centered
    this.addText(SHOP_LAYOUT.finishX + SHOP_LAYOUT.finishW / 2, SHOP_LAYOUT.finishY + SHOP_LAYOUT.finishH / 2, 'FINISH', 0xfff5ec, '18px', 'Barlow Condensed', undefined, { weight: '700', originX: 0.5, originY: 0.5 });

    // ----- LEFT SIDEBAR (INVENTORY + UNDO) -----
    const sideX = panelX + 14;
    const sideY = panelY + 90;
    const sideW = 168;
    const sideH = panelH - 100;

    // Glass mini-panel for sidebar using hi-res idiom
    this.graphics.fillGradientStyle(0x261e18, 0x261e18, 0x0c0907, 0x0c0907, 0.92);
    this.graphics.fillRoundedRect(sideX, sideY, sideW, sideH, 3);
    this.graphics.lineStyle(1, 0xffbe78, 0.16);
    this.graphics.strokeRoundedRect(sideX, sideY, sideW, sideH, 3);
    // Inset highlight (white, top edge, alpha .07)
    this.graphics.lineStyle(1, 0xffffff, 0.07);
    this.graphics.beginPath();
    this.graphics.moveTo(sideX + 2, sideY + 1);
    this.graphics.lineTo(sideX + sideW - 2, sideY + 1);
    this.graphics.strokePath();

    // INVENTORY title: mono 9px ls 2 0xffb347 @.85
    this.addText(sideX + 12, sideY + 10, 'INVENTORY', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });

    // Inventory rows: same data as classic
    const totalWeapons = GAME_CONFIG.weapons.reduce((sum, w) => {
      const owned = profile.ammo[w.id] ?? 0;
      if (owned === -1) return sum; // skip unlimited (Small Missile)
      return sum + owned + pending.pendingFor(w.id) * pending.bundleSize(w.id);
    }, 0);

    // WEAPONS row: dim label + bright count
    this.addText(sideX + 12, sideY + 46, 'WEAPONS', 0xf4ece2, '9px', 'JetBrains Mono', undefined, { alpha: 0.42, weight: '400' });
    this.addText(sideX + sideW - 30, sideY + 46, `${totalWeapons}`, 0xf4ece2, '9px', 'JetBrains Mono', undefined, { weight: '400' });

    // Item rows: dim label + bright count (same data as classic)
    GAME_CONFIG.items.forEach((item, idx) => {
      const itemTotal = pending.ownedFor(item.id) + pending.pendingFor(item.id) * pending.bundleSize(item.id);
      const itemLabel = item.sidebarLabel ?? item.name.toUpperCase() + 'S';
      const itemY = sideY + 72 + idx * 20;
      this.addText(sideX + 12, itemY, itemLabel, 0xf4ece2, '9px', 'JetBrains Mono', undefined, { alpha: 0.42, weight: '400' });
      this.addText(sideX + sideW - 30, itemY, `${itemTotal}`, 0xf4ece2, '9px', 'JetBrains Mono', undefined, { weight: '400' });
    });

    // UNDO ghost chip at its hit rect when pending
    if (hasPending) {
      this.graphics.lineStyle(1, 0xff7a3c, 0.5);
      this.graphics.strokeRoundedRect(SHOP_LAYOUT.undoX, SHOP_LAYOUT.undoY, SHOP_LAYOUT.undoW, SHOP_LAYOUT.undoH, 3);
      this.addText(SHOP_LAYOUT.undoX + SHOP_LAYOUT.undoW / 2, SHOP_LAYOUT.undoY + SHOP_LAYOUT.undoH / 2, 'UNDO', 0xff7a3c, '9px', 'JetBrains Mono', 2, { originX: 0.5, originY: 0.5, weight: '400' });
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

    // Column headers: mono 9px ls 2 color 0xffb347 alpha .85
    this.addText(colName, tableY + 8, 'ITEM', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    this.addText(colPrice, tableY + 8, 'PRICE', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    this.addText(colOwn, tableY + 8, 'OWNED', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    this.addText(668, tableY + 8, 'BUY', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    this.addText(colCost, tableY + 8, 'COST', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });

    let rowY = SHOP_LAYOUT.listYStart;
    const drawRow = (
      keyLabel: string,
      itemKey: string,
      itemName: string,
      basePrice: number,
      ownedDisplay: number
    ) => {
      const pendingQty = pending.pendingFor(itemKey);
      const price = pending.effectivePrice(basePrice, itemKey);
      const onSale = saleKey === itemKey;
      const buyable = basePrice > 0;
      const canAfford = buyable && effectiveCash >= price;
      const rowColor = !buyable ? 0xaaaaaa : canAfford ? 0xf4ece2 : 0xaaaaaa;
      const rowAlpha = ownedDisplay === 0 && !buyable ? 0.4 : 1;

      const bundleSize = pending.bundleSize(itemKey);
      const displayName = bundleSize > 1 ? `${itemName} x${bundleSize}` : itemName;

      this.addText(colKey, rowY, keyLabel, rowColor, '10px', 'JetBrains Mono', undefined, { alpha: rowAlpha, weight: '400' });
      this.addText(colName, rowY, displayName, rowColor, '10px', 'JetBrains Mono', undefined, { alpha: rowAlpha, weight: '400' });
      this.addText(colPrice, rowY, buyable ? `$${price}` : 'FREE', rowColor, '10px', 'JetBrains Mono', undefined, { alpha: rowAlpha, weight: '400' });
      if (onSale) {
        this.addText(colPrice + 76, rowY + 2, `-${saleDiscountPct}%`, 0xffb347, '9px', 'JetBrains Mono', undefined, { weight: '400' });
      }
      const ownedText = ownedDisplay === -1 ? '--' : `${ownedDisplay}`;
      this.addText(colOwn + 20, rowY, ownedText, rowColor, '10px', 'JetBrains Mono', undefined, { alpha: rowAlpha, weight: '400' });

      // Hi-res rocker buttons: rounded-3 chips (fill 0x1a140f, 1px 0xffbe78 @.3 stroke, glyph mono centered)
      const minusActive = pendingQty > 0;
      this.drawHiResRockerChip(SHOP_LAYOUT.colMinus, rowY, '-', minusActive ? 0xff7043 : 0x888888);
      this.addText(SHOP_LAYOUT.colMinus + 18, rowY + 12, `${pendingQty}`, 0xf4ece2, '10px', 'JetBrains Mono', undefined, { originX: 0.5, originY: 0.5, weight: '400' });
      this.drawHiResRockerChip(SHOP_LAYOUT.colPlus, rowY, '+', canAfford ? 0x58d98b : 0x888888);

      // Cost cell
      const cost = pendingQty * price;
      this.addText(colCost + 4, rowY, `$${cost}`, cost > 0 ? 0x58d98b : 0x888888, '10px', 'JetBrains Mono', undefined, { weight: '400' });

      // Subtle row divider
      this.graphics.lineStyle(1, 0xffbe78, 0.08);
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
      drawRow(keyLabel, entry.key, entry.name, entry.basePrice, owned);
    });

    // ----- PAGE CONTROLS -----
    // Page prev/next: same chip treatment + 'PAGE N/M' mono between
    const pageButtonColor = pending.shopPageCount() > 1 ? 0xf4ece2 : 0x888888;
    this.drawHiResRockerChip(SHOP_LAYOUT.pagePrevX, SHOP_LAYOUT.pageY, '<', pageButtonColor);
    this.addText(SHOP_LAYOUT.pagePrevX + 52, SHOP_LAYOUT.pageY + 12, pending.pageLabel(), 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, originY: 0.5, weight: '400' });
    this.drawHiResRockerChip(SHOP_LAYOUT.pageNextX, SHOP_LAYOUT.pageY, '>', pageButtonColor);

    // ----- FOOTER -----
    const footerY = panelY + panelH - 38;
    this.addText(colOwn, footerY, 'TOTAL COST', 0xffb347, '9px', 'JetBrains Mono', 2, { alpha: 0.85, weight: '400' });
    this.addText(colCost, footerY, `$${totalCost}`, totalCost > 0 ? 0x58d98b : 0x888888, '20px', 'Barlow Condensed', undefined, { weight: '600' });

    // Bottom hint: mono 9px alpha .45 centered
    this.addText(
      panelX + panelW / 2,
      panelY + panelH - 16,
      'TAP + / - TO ADJUST  ·  ENTER TO CONFIRM',
      0xf4ece2,
      '9px',
      'JetBrains Mono',
      1,
      { alpha: 0.45, originX: 0.5, weight: '400' }
    );
  }

  private drawShopOverlayRetro(match: MatchState): void {
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

    // Dim full-screen backdrop
    this.graphics.fillStyle(colors.black, 0.86);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // Steel body: steelMid fill, steelDark inset panels, uniform 2px steelLight borders
    this.graphics.fillStyle(colors.steelMid, 1);
    this.graphics.fillRect(panelX, panelY, panelW, panelH);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(panelX, panelY, panelW, panelH);

    // ----- HEADER -----
    const playerName = profile.displayName ?? `PLAYER ${shopperId + 1}`;
    const playerColor = getPlayerPalette(shopperId, 'retroPixel').primary;
    this.addText(panelX + 20, panelY + 10, `ROUND ${match.round} SHOP`, colors.desertGold, GAME_CONFIG.font.large);
    this.addText(panelX + 20, panelY + 48, playerName, playerColor, GAME_CONFIG.font.large);

    this.addText(panelX + 380, panelY + 18, 'CASH', colors.desertGold, GAME_CONFIG.font.medium);
    this.addText(panelX + 380, panelY + 48, `$${effectiveCash}`, colors.green, GAME_CONFIG.font.large);

    this.graphics.fillStyle(colors.steelDark, 1);
    this.graphics.fillRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(SHOP_LAYOUT.finishX, SHOP_LAYOUT.finishY, SHOP_LAYOUT.finishW, SHOP_LAYOUT.finishH);
    this.addText(SHOP_LAYOUT.finishX + 16, SHOP_LAYOUT.finishY + 12, 'FINISH ⏎', colors.desertGold, GAME_CONFIG.font.medium);

    // ----- LEFT SIDEBAR (INVENTORY summary + UNDO) -----
    const sideX = panelX + 14;
    const sideY = panelY + 90;
    const sideW = 168;
    const sideH = panelH - 100;
    this.graphics.fillStyle(colors.steelDark, 1);
    this.graphics.fillRect(sideX, sideY, sideW, sideH);
    this.graphics.lineStyle(2, colors.steelLight, 1);
    this.graphics.strokeRect(sideX, sideY, sideW, sideH);

    this.addText(sideX + 12, sideY + 10, 'INVENTORY', colors.desertGold, GAME_CONFIG.font.medium);

    const totalWeapons = GAME_CONFIG.weapons.reduce((sum, w) => {
      const owned = profile.ammo[w.id] ?? 0;
      if (owned === -1) return sum; // skip unlimited (Small Missile)
      return sum + owned + pending.pendingFor(w.id) * pending.bundleSize(w.id);
    }, 0);

    this.addText(sideX + 12, sideY + 46, 'WEAPONS', colors.white, GAME_CONFIG.font.small);
    this.addText(sideX + sideW - 40, sideY + 46, `${totalWeapons}`, colors.white, GAME_CONFIG.font.small);

    GAME_CONFIG.items.forEach((item, idx) => {
      const itemTotal = pending.ownedFor(item.id) + pending.pendingFor(item.id) * pending.bundleSize(item.id);
      const itemColor = item.id === 'parachute' ? colors.yellow : colors.white;
      const itemY = sideY + 72 + idx * 20;
      const label = item.sidebarLabel ?? item.name.toUpperCase() + 'S';
      this.addText(sideX + 12, itemY, label, itemColor, GAME_CONFIG.font.tiny);
      this.addText(sideX + sideW - 30, itemY, `${itemTotal}`, colors.white, GAME_CONFIG.font.tiny);
    });

    // UNDO button at the bottom of the sidebar
    if (hasPending) {
      this.graphics.fillStyle(colors.steelDark, 1);
      this.graphics.fillRect(SHOP_LAYOUT.undoX, SHOP_LAYOUT.undoY, SHOP_LAYOUT.undoW, SHOP_LAYOUT.undoH);
      this.graphics.lineStyle(2, colors.steelLight, 1);
      this.graphics.strokeRect(SHOP_LAYOUT.undoX, SHOP_LAYOUT.undoY, SHOP_LAYOUT.undoW, SHOP_LAYOUT.undoH);
      this.addText(SHOP_LAYOUT.undoX + 32, SHOP_LAYOUT.undoY + 8, 'UNDO ⌫', colors.desertGold, GAME_CONFIG.font.medium);
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

    // Column headers: retro row idiom
    this.addText(colName, tableY + 8, 'ITEM', colors.desertGold, GAME_CONFIG.font.medium);
    this.addText(colPrice, tableY + 8, 'PRICE', colors.desertGold, GAME_CONFIG.font.medium);
    this.addText(colOwn, tableY + 8, 'OWNED', colors.desertGold, GAME_CONFIG.font.medium);
    this.addText(668, tableY + 8, 'BUY', colors.desertGold, GAME_CONFIG.font.medium);
    this.addText(colCost, tableY + 8, 'COST', colors.desertGold, GAME_CONFIG.font.medium);

    let rowY = SHOP_LAYOUT.listYStart;
    const drawRow = (
      keyLabel: string,
      itemKey: string,
      itemName: string,
      basePrice: number,
      ownedDisplay: number
    ) => {
      const pendingQty = pending.pendingFor(itemKey);
      const price = pending.effectivePrice(basePrice, itemKey);
      const onSale = saleKey === itemKey;
      const buyable = basePrice > 0;
      const canAfford = buyable && effectiveCash >= price;
      // Retro row idiom: green available / dimGray zero-owned / white selected
      const rowColor = !buyable
        ? colors.dimGray
        : canAfford
          ? colors.green
          : colors.dimGray;

      const bundleSize = pending.bundleSize(itemKey);
      const displayName = bundleSize > 1 ? `${itemName} x${bundleSize}` : itemName;

      this.addText(colKey, rowY, keyLabel, rowColor, GAME_CONFIG.font.medium);
      this.addText(colName, rowY, displayName, rowColor, GAME_CONFIG.font.medium);
      this.addText(colPrice, rowY, buyable ? `$${price}` : 'FREE', rowColor, GAME_CONFIG.font.medium);
      if (onSale) {
        this.addText(colPrice + 76, rowY + 2, `-${saleDiscountPct}%`, colors.yellow, GAME_CONFIG.font.small);
      }
      const ownedText = ownedDisplay === -1 ? '--' : `${ownedDisplay}`;
      this.addText(colOwn + 20, rowY, ownedText, rowColor, GAME_CONFIG.font.medium);

      // Rocker buttons + pending count
      const minusActive = pendingQty > 0;
      this.drawRockerButton(SHOP_LAYOUT.colMinus, rowY, '-', minusActive ? colors.red : colors.dimGray);
      this.addText(SHOP_LAYOUT.colMinus + 50, rowY, `${pendingQty}`, colors.white, GAME_CONFIG.font.medium);
      this.drawRockerButton(SHOP_LAYOUT.colPlus, rowY, '+', canAfford ? colors.green : colors.dimGray);

      // Cost cell
      const cost = pendingQty * price;
      this.addText(colCost + 4, rowY, `$${cost}`, cost > 0 ? colors.green : colors.dimGray, GAME_CONFIG.font.medium);

      // Subtle row divider
      this.graphics.lineStyle(1, colors.steelDark, 0.5);
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
      drawRow(keyLabel, entry.key, entry.name, entry.basePrice, owned);
    });

    // ----- PAGE STRIP -----
    const pageButtonColor = pending.shopPageCount() > 1 ? colors.white : colors.dimGray;
    this.drawRockerButton(SHOP_LAYOUT.pagePrevX, SHOP_LAYOUT.pageY, '<', pageButtonColor);
    this.addText(SHOP_LAYOUT.pagePrevX + 52, SHOP_LAYOUT.pageY + 2, pending.pageLabel(), colors.white, GAME_CONFIG.font.medium);
    this.drawRockerButton(SHOP_LAYOUT.pageNextX, SHOP_LAYOUT.pageY, '>', pageButtonColor);

    // ----- FOOTER -----
    const footerY = panelY + panelH - 38;
    this.addText(colOwn, footerY, 'TOTAL COST', colors.desertGold, GAME_CONFIG.font.medium);
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
   * adjustments (classic/retro). The text label (+/-) is centered in a fixed-size cell.
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

  /**
   * Hi-res rocker button with rounded corners and warm accent border.
   */
  private addText(
    x: number,
    y: number,
    value: string,
    color: number,
    fontSize: string,
    fontFamily?: string,
    letterSpacing?: number,
    opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }
  ): void {
    // Convert weight to fontStyle: '400' → '', '600' → '600', '700' → 'bold' (default)
    let fontStyle: string = 'bold';
    if (opts?.weight === '400') {
      fontStyle = '';
    } else if (opts?.weight === '600') {
      fontStyle = '600';
    }

    const text = this.scene.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle
    });
    // Match the texture density to the renderScale-zoomed camera so glyph
    // pixels map 1:1 onto the canvas backing store.
    text.setResolution(GAME_CONFIG.renderScale);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
    if (opts?.originX !== undefined || opts?.originY !== undefined) {
      text.setOrigin(opts?.originX ?? 0, opts?.originY ?? 0);
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

  /**
   * Soft glow behind a big numeral: concentric low-alpha fills approximate a
   * radial falloff, since Graphics has no gradient-filled circles.
   */
  private drawNumeralGlow(cx: number, cy: number, color: number): void {
    const layers: Array<[number, number]> = [[30, 0.04], [21, 0.05], [13, 0.06]];
    for (const [radius, alpha] of layers) {
      this.graphics.fillStyle(color, alpha);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, radius, 0, Math.PI * 2);
      this.graphics.fillPath();
    }
  }

  /**
   * Hi-res rocker button chip for shop (rounded-3, fill 0x1a140f, 1px border)
   */
  private drawHiResRockerChip(x: number, y: number, label: string, accentColor: number): void {
    const w = SHOP_LAYOUT.buttonW;
    const h = SHOP_LAYOUT.buttonH;
    this.graphics.fillStyle(0x1a140f, 1);
    this.graphics.fillRoundedRect(x, y - 2, w, h, 3);
    this.graphics.lineStyle(1, accentColor, 0.3);
    this.graphics.strokeRoundedRect(x, y - 2, w, h, 3);
    // Center the glyph via origin 0.5
    this.addText(x + w / 2, y + h / 2 - 2, label, accentColor, '9px', 'JetBrains Mono', undefined, { originX: 0.5, originY: 0.5, weight: '400' });
  }

  /**
   * Draw an HP bar with a glow effect using the layered-stroke idiom.
   */
  private drawHpBarWithGlow(x: number, y: number, w: number, h: number, currentHealth: number, colorLight: number, colorDark: number): void {
    const healthPct = Math.min(1, currentHealth / GAME_CONFIG.tank.maxHealth);
    const filledW = w * healthPct;

    // Glow layer (larger, lower alpha)
    this.graphics.fillStyle(colorDark, 0.15);
    this.graphics.fillRoundedRect(x - 2, y - 2, filledW + 4, h + 4, 3);

    // Main bar
    this.graphics.fillGradientStyle(colorLight, colorLight, colorDark, colorDark, 1);
    this.graphics.fillRoundedRect(x, y, filledW, h, 3);

    // Background (unfilled portion)
    this.graphics.fillStyle(0xffffff, 0.08);
    this.graphics.fillRoundedRect(x + filledW, y, w - filledW, h, 3);
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

    // ===== TOP BAR (0-104px gradient fade) =====
    // Gradient fade background: dark at top, fade to transparent at bottom
    this.graphics.fillGradientStyle(0x0a0705, 0x0a0705, 0x0a0705, 0x0a0705, 1, 1, 1, 0.2);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, 104);
    // Hairline at bottom (faded)
    this.graphics.lineStyle(1, 0xffb347, 0.16);
    this.graphics.beginPath();
    this.graphics.moveTo(0, 103.5);
    this.graphics.lineTo(GAME_CONFIG.width, 103.5);
    this.graphics.strokePath();

    // LEFT: Player 1 text column at x98
    // PLAYER label: 21px light tint #5aa9ff, ls .06em
    this.addText(98, 12, match.profiles[tanks[0].id].displayName ?? `PLAYER ${tanks[0].id + 1}`, 0x5aa9ff, '21px', 'Barlow Condensed', 1.26, { weight: '400' });
    // HP numeral: 30px cream (not player-color)
    this.addText(98, 32, `${tanks[0].health}`, 0xf4ece2, '30px', 'Barlow Condensed');
    // HP suffix positioned off the numeral width
    const hpNum1Idx = this.texts.length - 1;
    const hpNum1 = this.texts[hpNum1Idx];
    const hpNumW1 = hpNum1.width;
    const maxHealthStr = `/ ${GAME_CONFIG.tank.maxHealth} HP`;
    this.addText(98 + hpNumW1 + 4, 42, maxHealthStr, 0xf4ece2, '10px', 'JetBrains Mono', undefined, { alpha: 0.45, weight: '400' });
    // HP bar: 150×5 r3 with glow
    this.drawHpBarWithGlow(98, 66, 150, 5, tanks[0].health, 0x3f9dff, 0x8ed0ff);
    // Cash: 10px @.55 alpha, ls .08em
    const cashStr1 = `$${match.profiles[0].cash.toLocaleString()}`;
    this.addText(98, 78, cashStr1, 0xf4ece2, '10px', 'JetBrains Mono', 0.8, { alpha: 0.55, weight: '400' });

    // RIGHT: Player 2 mirrored — text column right-aligned to x862, the
    // mirror of P1's x98 start, so it clears the mini-tank sprite at x874+.
    const p2Right = GAME_CONFIG.width - 98;
    this.addText(p2Right, 12, match.profiles[tanks[1].id].displayName ?? `PLAYER ${tanks[1].id + 1}`, 0xff8a4c, '21px', 'Barlow Condensed', 1.26, { originX: 1, weight: '400' });
    // HP numeral: 30px cream, right-aligned
    this.addText(p2Right, 32, `${tanks[1].health}`, 0xf4ece2, '30px', 'Barlow Condensed', undefined, { originX: 1 });
    // HP suffix: positioned off the numeral width
    const hpNum2Idx = this.texts.length - 1;
    const hpNum2 = this.texts[hpNum2Idx];
    const hpNumW2 = hpNum2.width;
    this.addText(p2Right - hpNumW2 - 4, 42, maxHealthStr, 0xf4ece2, '10px', 'JetBrains Mono', undefined, { alpha: 0.45, weight: '400', originX: 1 });
    // HP bar: 150×5 r3, P2 right-anchored with glow
    this.drawHpBarWithGlow(p2Right - 150, 66, 150, 5, tanks[1].health, 0xff7a3c, 0xffc08a);
    // Cash: 10px @.55 alpha, ls .08em, right-aligned
    const cashStr2 = `$${match.profiles[1].cash.toLocaleString()}`;
    this.addText(p2Right, 78, cashStr2, 0xf4ece2, '10px', 'JetBrains Mono', 0.8, { alpha: 0.55, weight: '400', originX: 1 });

    // CENTER CLUSTER: truly centered (origin)
    // Kicker: 10px @.5, "ROUND 1 · FIRST TO 2"
    this.addText(480, 14, `ROUND ${match.round} · FIRST TO ${match.roundsToWin}`, 0xf4ece2, '10px', 'JetBrains Mono', 3, { alpha: 0.5, originX: 0.5, weight: '400' });
    // TO FIRE: 27px + blue glow, "PLAYER 1 TO FIRE"
    this.addText(480, 40, `${match.profiles[turn.activePlayerId].displayName ?? `PLAYER ${turn.activePlayerId + 1}`} TO FIRE`, activePalette.primary, '27px', 'Barlow Condensed', 2, { originX: 0.5, weight: '600' });
    // Add glow effect to TO FIRE text (layered stroke idiom)
    if (activePalette.primary === 0x5aa9ff) {
      // Blue glow
      this.graphics.fillStyle(0x5aa9ff, 0.15);
      this.graphics.beginPath();
      this.graphics.arc(480, 40, 30, 0, Math.PI * 2);
      this.graphics.fillPath();
    } else {
      // Orange glow
      this.graphics.fillStyle(0xff8a4c, 0.15);
      this.graphics.beginPath();
      this.graphics.arc(480, 40, 30, 0, Math.PI * 2);
      this.graphics.fillPath();
    }

    // Wind gauge with new layout
    // One row tucked under the TO FIRE headline (label · segments · arrow ·
    // magnitude) — the old placement overlapped the headline's glyph box.
    this.drawHiResWindGauge(turn, 436, 78, 444, 540, 78);

    // ===== CONSOLE BAND (3-stop gradient) =====
    // 3-stop gradient for console background
    this.graphics.fillGradientStyle(0x3d2817, 0x3d2817, 0x2a1d14, 0x2a1d14, 1, 1, 1, 1);
    this.graphics.fillRect(0, top, GAME_CONFIG.width, 182);
    // Faded hairline at top
    this.graphics.lineStyle(1, 0xffb347, 0.14);
    this.graphics.beginPath();
    this.graphics.moveTo(0, top + 0.5);
    this.graphics.lineTo(GAME_CONFIG.width, top + 0.5);
    this.graphics.strokePath();

    // Weapon panel: title with letter-spacing, counter right-aligned from weapons.length
    this.drawHiResPanelFrame(8, top + 8, 208, 122, '');
    this.addText(18, top + 14, 'WEAPONS', 0xffb347, '9px', 'JetBrains Mono', 2.34, { alpha: 0.85, weight: '400' });
    const weaponCounter = `${activeTank.selectedWeaponIndex + 1}/${GAME_CONFIG.weapons.length}`;
    this.addText(200, top + 14, weaponCounter, 0xf4ece2, '9px', 'JetBrains Mono', undefined, { originX: 1, weight: '400' });
    this.drawHiResWeaponRows(18, top + 32, activeTank, weaponWindowStart);

    // Angle panel: title, range @.3, numeral 44px +glow, dial r69 at top+116
    this.drawHiResPanelFrame(220, top + 8, 176, 122, '');
    this.addText(232, top + 14, 'ANGLE', 0xffb347, '9px', 'JetBrains Mono', 4.68, { alpha: 0.85, weight: '400' });
    this.addText(356, top + 14, '15–165', 0xf4ece2, '9px', 'JetBrains Mono', undefined, { alpha: 0.3, originX: 1, weight: '400' });
    // 44px numeral + glow effect
    this.addText(231, top + 42, `${Math.round(activeTank.angle)}`, activePalette.primary, '44px', 'Barlow Condensed', undefined, { weight: '600' });
    const angleNum = this.texts[this.texts.length - 1];
    const angleNumW = angleNum.width;
    // Soft glow centered on the numeral (concentric low-alpha fills; a single
    // flat disc at the text's top-left corner reads as a gray smudge).
    this.drawNumeralGlow(231 + angleNumW / 2, top + 42 + angleNum.height / 2, activePalette.primary);
    // ° glyph 20px @.5
    this.addText(231 + angleNumW + 2, top + 38, '°', 0xf4ece2, '20px', 'JetBrains Mono', undefined, { alpha: 0.5, weight: '400' });
    // Dial with arc and ticks at top+116
    this.drawHiResAngleDial(308, top + 116, activeTank, activePalette.primary);

    // Power panel: title, range @.3, numeral 44px +glow at x411, segments at top+82
    this.drawHiResPanelFrame(400, top + 8, 204, 122, '');
    this.addText(416, top + 14, 'POWER', 0xffb347, '9px', 'JetBrains Mono', 4.68, { alpha: 0.85, weight: '400' });
    this.addText(588, top + 14, '15–100', 0xf4ece2, '9px', 'JetBrains Mono', undefined, { alpha: 0.3, originX: 1, weight: '400' });
    // 44px numeral + glow at x411
    this.addText(411, top + 42, `${Math.round(activeTank.power)}`, activePalette.primary, '44px', 'Barlow Condensed', undefined, { weight: '600' });
    const powerNum = this.texts[this.texts.length - 1];
    this.drawNumeralGlow(411 + powerNum.width / 2, top + 42 + powerNum.height / 2, activePalette.primary);
    // ↑↓ ADJUST hint: 9px @.4, ls .14em — to the RIGHT of the numeral,
    // bottom-anchored near the digits' visual baseline. Fixed y: the text
    // object's height includes leading, which would land it on the segment
    // row at top+82.
    this.addText(411 + powerNum.width + 8, top + 79, '↑↓ ADJUST', 0xf4ece2, '9px', 'JetBrains Mono', 1.26, { alpha: 0.4, originY: 1, weight: '400' });
    // Power segments at top+82 with glow
    this.drawHiResPowerSegments(416, top + 82, activeTank);

    // Fire panel: 3-stop gradient, glow, inset highlight, FIRE centered, SPACE/CLICK centered
    this.drawHiResPanelFrame(610, top + 8, 140, 122, '');
    const fireAlpha = turn.phase === 'aiming' ? 1 : 0.35;

    // FIRE key button: draw at hit rect (632, top+36, 94×58) r4
    // Glow layer (larger, lower alpha)
    this.graphics.fillStyle(0xff7043, fireAlpha * 0.15);
    this.graphics.fillRoundedRect(630, top + 34, 98, 62, 5);

    // 3-stop gradient: #ff7043 → #c22c0c (62%) → #8f2106
    // For simplicity, use a 2-stop gradient from light to dark
    this.graphics.fillGradientStyle(0xff7043, 0xff7043, 0x8f2106, 0x8f2106, fireAlpha);
    this.graphics.fillRoundedRect(632, top + 36, 94, 58, 4);

    // Inset highlight (top edge)
    this.graphics.lineStyle(1, 0xffb48c, 0.8);
    this.graphics.beginPath();
    this.graphics.moveTo(633, top + 37);
    this.graphics.lineTo(725, top + 37);
    this.graphics.strokePath();

    // Main border
    this.graphics.lineStyle(1, 0xffb48c, 0.5);
    this.graphics.strokeRoundedRect(632, top + 36, 94, 58, 4);

    const fireTextColor = turn.phase === 'aiming' ? 0xfff5ec : 0x999999;
    // FIRE label: 30px centered, ls .14em
    this.addText(679, top + 55, 'FIRE', fireTextColor, '30px', 'Barlow Condensed', 4.2, { originX: 0.5, originY: 0.5 });
    // SPACE / CLICK: 9px centered @.45, ls .22em
    this.addText(679, top + 76, 'SPACE / CLICK', 0xf4ece2, '9px', 'JetBrains Mono', 1.98, { alpha: 0.45, originX: 0.5, weight: '400' });

    // Status panel: title, labels @.42 dim, values bright, right-edge 941, pitch 13
    this.drawHiResPanelFrame(756, top + 8, 196, 122, '');
    this.addText(770, top + 14, 'STATUS', 0xffb347, '9px', 'JetBrains Mono', 4.68, { alpha: 0.85, weight: '400' });
    this.drawHiResStatusRows(770, top + 34, activeTank, match);

    // ===== BOTTOM STRIP (vertical gradient bg, border 0xffbe78 @.14) =====
    const stripY = top + 136;
    // Vertical gradient background
    this.graphics.fillGradientStyle(0x1a0d0a, 0x1a0d0a, 0x070504, 0x070504, 1);
    this.graphics.fillRect(0, stripY, GAME_CONFIG.width, 46);
    // Border
    this.graphics.lineStyle(1, 0xffbe78, 0.14);
    this.graphics.beginPath();
    this.graphics.moveTo(0, stripY + 0.5);
    this.graphics.lineTo(GAME_CONFIG.width, stripY + 0.5);
    this.graphics.strokePath();

    // Center: ONE row of 5 keycaps (AIM/POWER/MOVE/WEAPON/VISUAL) with en-dash labels
    this.drawHiResKeycapChips(top);

    // Right group: ONE line, vertically centered on the ESC chip, ending at
    // x812 so it stays clear of the chip's frozen hit rect (x820..950).
    const chipStripY = GAME_CONFIG.layout.bottomStatusTop - 5;
    const rightLineY = chipStripY + 13;
    const statusText = turn.phase === 'aiming' ? 'READY TO FIRE' : 'SHOT IN FLIGHT';
    const statusColor = turn.phase === 'aiming' ? 0x58d98b : 0xffd15c;

    // weapon name (9px ls .14em @.45), right-aligned to x812
    this.addText(812, rightLineY, weapon.name.toUpperCase(), 0xf4ece2, '9px', 'JetBrains Mono', 1.26, { alpha: 0.45, originX: 1, originY: 0.5, weight: '400' });
    const weaponNameObj = this.texts[this.texts.length - 1];

    // READY TO FIRE (10px ls .16em) to the left of the weapon name
    this.addText(812 - weaponNameObj.width - 14, rightLineY, statusText, statusColor, '10px', 'JetBrains Mono', 1.6, { originX: 1, originY: 0.5, weight: '400' });

    // ESC chip border-only (no fill), drawn at hit rect (820..950, chipStripY+2..chipStripY+24)
    this.graphics.lineStyle(1, 0xff7a3c, 0.45);
    this.graphics.strokeRoundedRect(820, chipStripY + 2, 130, 22, 3);
    // ESC label: 9px #ff7a3c, centered
    this.addText(885, chipStripY + 13, 'ESC', 0xff7a3c, '9px', 'JetBrains Mono', undefined, { originX: 0.5, originY: 0.5, weight: '400' });
  }


  private drawHiResWindGauge(turn: TurnState, labelX: number, labelY: number, segmentX: number, magX: number, magY: number): void {
    const windMag = Math.abs(turn.wind.magnitude);
    const filledSegments = Math.min(Math.ceil(windMag / 5), 4); // 4 segments, filled = ceil(|wind|/5) capped at 4
    const hasPartialSegment = (windMag % 5) > 0 && filledSegments < 4;

    // WIND label: 10px ls .24em @.5, right-aligned so the gauge row centers
    this.addText(labelX, labelY, 'WIND', 0xf4ece2, '10px', 'JetBrains Mono', 2.4, { alpha: 0.5, originX: 1, weight: '400' });

    // Segments: 16×3 gap3, 4 total, empty rgba(255,255,255,.16), partial @.55
    let segX = segmentX;
    for (let i = 0; i < 4; i += 1) {
      const isFilled = i < filledSegments - (hasPartialSegment ? 1 : 0);
      const isPartial = i === filledSegments - 1 && hasPartialSegment;

      if (isFilled) {
        this.graphics.fillStyle(0x58d98b, 1);
      } else if (isPartial) {
        this.graphics.fillStyle(0x58d98b, 0.55);
      } else {
        this.graphics.fillStyle(0xffffff, 0.16);
      }
      this.graphics.fillRoundedRect(segX, labelY + 8, 16, 3, 1);
      segX += 16 + 3;
    }

    // Arrow triangle pointing left/right after segments
    const arrowX = segX + 2;
    const arrowY = labelY + 8;
    if (turn.wind.direction > 0) {
      // Right-pointing
      this.graphics.fillStyle(0x58d98b, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(arrowX, arrowY - 4);
      this.graphics.lineTo(arrowX + 6, arrowY);
      this.graphics.lineTo(arrowX, arrowY + 4);
      this.graphics.closePath();
      this.graphics.fillPath();
    } else {
      // Left-pointing
      this.graphics.fillStyle(0x58d98b, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(arrowX + 6, arrowY - 4);
      this.graphics.lineTo(arrowX, arrowY);
      this.graphics.lineTo(arrowX + 6, arrowY + 4);
      this.graphics.closePath();
      this.graphics.fillPath();
    }

    // Magnitude: 17px
    this.addText(magX, magY, `> ${Math.ceil(windMag)}`, 0x58d98b, '17px', 'Barlow Condensed', undefined, { weight: '600' });
  }

  private drawHiResWeaponRows(x: number, y: number, tank: TankState, weaponWindowStart: number): void {
    const weapons = GAME_CONFIG.weapons;
    for (let i = 0; i < WEAPON_WINDOW_SIZE && weaponWindowStart + i < weapons.length; i += 1) {
      const w = weapons[weaponWindowStart + i];
      // Window-relative index (1–8, not absolute idx+1)
      const windowIdx = i + 1;
      const absIdx = weaponWindowStart + i;
      const isSelected = absIdx === tank.selectedWeaponIndex;
      const ammo = tank.ammo[w.id] ?? 0;
      const rowY = y + i * 11;
      const isDimmed = ammo === 0;

      if (isSelected) {
        // Selected row: gradient + 2px left accent bar
        this.graphics.fillStyle(0x3f9dff, 0.35);
        this.graphics.fillRoundedRect(x - 2, rowY - 1, 200, 11, 2);
        // Left accent bar 2px
        this.graphics.fillStyle(0x3f9dff, 0.8);
        this.graphics.fillRect(x - 2, rowY - 1, 2, 11);
      }

      // Name and window index: dimmed if zero ammo
      const nameAlpha = isDimmed ? 0.28 : 1;
      const nameColor = isSelected ? 0xffffff : 0xf4ece2;
      this.addText(x + 4, rowY, `${windowIdx} ${w.name}`, nameColor, '9px', 'JetBrains Mono', undefined, { alpha: nameAlpha, weight: '400' });

      // Ammo right-aligned: dimmed if zero, special styling for infinity
      const ammoStr = ammo === -1 ? '∞' : String(ammo);
      let ammoColor = 0xf4ece2;
      let ammoAlpha = 1;
      if (ammo === 0) {
        ammoAlpha = 0.28;
        ammoColor = 0xf4ece2;
      } else if (ammo === -1) {
        ammoAlpha = 0.4;
        ammoColor = 0xf4ece2;
      }
      this.addText(200, rowY, ammoStr, ammoColor, '9px', 'JetBrains Mono', undefined, { alpha: ammoAlpha, originX: 1, weight: '400' });
    }
  }

  private drawHiResPowerSegments(x0: number, y0: number, tank: TankState): void {
    const segmentW = 14;
    const gap = 4;
    const segmentH = 16;
    const filledCount = Math.round(tank.power / 10); // 10 segments for 0–100 power range

    for (let i = 0; i < 10; i += 1) {
      const segX = x0 + i * (segmentW + gap);
      const isFilled = i < filledCount;

      if (isFilled) {
        // Glow layer (larger, lower alpha)
        this.graphics.fillStyle(0x8ed0ff, 0.15);
        this.graphics.fillRoundedRect(segX - 1, y0 - 1, segmentW + 2, segmentH + 2, 2);
        // Main gradient
        this.graphics.fillGradientStyle(0x8ed0ff, 0x8ed0ff, 0x3f9dff, 0x3f9dff, 1);
      } else {
        this.graphics.fillStyle(0xffffff, 0.08);
      }
      this.graphics.fillRoundedRect(segX, y0, segmentW, segmentH, 2);
    }

    // MIN/MAX labels: 9px ls .16em @.35
    this.addText(x0, y0 + 22, 'MIN', 0xf4ece2, '9px', 'JetBrains Mono', 1.44, { alpha: 0.35, weight: '400' });
    this.addText(x0 + (10 * (segmentW + gap)) - 4, y0 + 22, 'MAX', 0xf4ece2, '9px', 'JetBrains Mono', 1.44, { alpha: 0.35, originX: 1, weight: '400' });
  }

  private drawHiResAngleDial(cx: number, cy: number, tank: TankState, highlightColor: number): void {
    const radius = 69; // 2x larger dial (r34 → r69)

    // Main arc outline: 15°–165° (range)
    this.graphics.lineStyle(2, 0xffffff, 0.14);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius, Phaser.Math.DegToRad(-165), Phaser.Math.DegToRad(-15), false);
    this.graphics.strokePath();

    // Active sweep arc: 15° → angle with rgba(90,169,255,.55)
    const needleRad = Phaser.Math.DegToRad(tank.angle);
    const startRad = Phaser.Math.DegToRad(15);
    this.graphics.lineStyle(8, 0x5aa9ff, 0.55);
    this.graphics.beginPath();
    this.graphics.arc(cx, cy, radius - 4, startRad, needleRad, tank.angle < 15);
    this.graphics.strokePath();

    // 3 ticks at 15°, 90°, 165° (not 5)
    const tickDegrees = [15, 90, 165];
    this.graphics.lineStyle(2, 0xffffff, 0.25);
    tickDegrees.forEach((deg) => {
      const rad = Phaser.Math.DegToRad(deg);
      const x1 = cx + Math.cos(rad) * (radius - 8);
      const y1 = cy - Math.sin(rad) * (radius - 8);
      const x2 = cx + Math.cos(rad) * radius;
      const y2 = cy - Math.sin(rad) * radius;
      this.graphics.beginPath();
      this.graphics.moveTo(x1, y1);
      this.graphics.lineTo(x2, y2);
      this.graphics.strokePath();
    });

    // Needle with round cap: from center to angle, cap #5aa9ff
    const needleX = cx + Math.cos(needleRad) * (radius - 8);
    const needleY = cy - Math.sin(needleRad) * (radius - 8);
    this.graphics.lineStyle(3, highlightColor, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(cx, cy);
    this.graphics.lineTo(needleX, needleY);
    this.graphics.strokePath();

    // Round needle cap
    this.graphics.fillStyle(0x5aa9ff, 1);
    this.graphics.fillCircle(needleX, needleY, 3);

    // Center circle
    this.graphics.fillStyle(0xf4ece2, 1);
    this.graphics.fillCircle(cx, cy, 4);
  }

  private drawHiResStatusRows(x: number, y: number, tank: TankState, match: MatchState): void {
    const labels = ['MOVE', 'CHUTES', 'BATT', 'GUIDE', 'SHIELD', 'CASH'];
    const rowH = 13; // Pitch 13

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

      // Labels: dim @.42 with letter-spacing .1em
      const labelText = labels[i];
      const isMoveLabel = i === 0;
      const labelAlpha = 0.42;
      this.addText(x, rowY, labelText, 0xf4ece2, '9px', 'JetBrains Mono', 0.9, { alpha: labelAlpha, weight: '400' });

      // Values: bright, right-edge 941
      const valueAlpha = isMoveLabel ? 0.7 : 1; // MOVE tail dimmed
      this.addText(x + 200, rowY, values[i], valueColors[i], '9px', 'JetBrains Mono', undefined, { alpha: valueAlpha, weight: '400' });
      const valueText = this.texts[this.texts.length - 1];
      const valueW = valueText.width;
      valueText.setX(941 - valueW);
    }
  }


  private drawHiResKeycapChips(top: number): void {
    const stripY = top + 136;
    const chipY = stripY + 14; // Centered vertically in strip
    const chipH = 20;
    const chipPadding = 8;
    const chipSpacing = 60; // Total spacing per chip

    // 5 chips centered: AIM / POWER / MOVE / WEAPON / VISUAL with en-dash 1–8
    const chips = [
      { keyCap: '←→', label: 'AIM', keys: '1–2' },
      { keyCap: '↑↓', label: 'POWER', keys: '3–4' },
      { keyCap: 'A/D', label: 'MOVE', keys: '5' },
      { keyCap: '1-8', label: 'WEAPON', keys: '6–7' },
      { keyCap: 'V', label: 'VISUAL', keys: '8' }
    ];

    // Calculate starting x to center the 5 chips
    const totalChipWidth = chips.length * chipSpacing;
    let startX = (GAME_CONFIG.width - totalChipWidth) / 2;
    let currentX = startX;

    for (const chip of chips) {
      // Keycap text and measurement
      this.addText(currentX + 4, chipY - 2, chip.keyCap, 0xffd9a0, '9px', 'JetBrains Mono', undefined, { weight: '400' });
      const keyToken = this.texts[this.texts.length - 1];
      const tokenW = keyToken.width;

      // Draw chip rect with neutral chrome fill
      const chipW = tokenW + chipPadding;
      this.graphics.fillStyle(0xffffff, 0.05);
      this.graphics.fillRoundedRect(currentX, chipY - 2, chipW, chipH, 3);
      this.graphics.lineStyle(1, 0xffffff, 0.2);
      this.graphics.strokeRoundedRect(currentX, chipY - 2, chipW, chipH, 3);

      // Label below keycap: cream text @.55
      this.addText(currentX + chipW / 2, chipY + 8, chip.label, 0xf4ece2, '8px', 'JetBrains Mono', undefined, { alpha: 0.55, originX: 0.5, weight: '400' });

      currentX += chipSpacing;
    }
  }

  private clearTexts(): void {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }
}
