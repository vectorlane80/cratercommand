import Phaser from 'phaser';
import { AISystem, isAIController, type AIDecision } from '../systems/AISystem';
import { HudSystem } from '../systems/HudSystem';
import { soundSystem } from '../systems/SoundSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TankSystem } from '../systems/TankSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { TurnSystem } from '../systems/TurnSystem';
import {
  GAME_CONFIG,
  type ControllerKind,
  type PlayerProfile,
  type ImpactResult,
  type MatchState,
  type PlayerId,
  type ProjectileState,
  type TankState,
  type TerrainData,
  type TurnState,
  type VisualSystem,
  type WeaponDefinition
} from '../types/GameTypes';

// How long an AI tank spends thinking + animating its aim before firing.
const AI_TURN_THINK_MS = 700;
const AI_TURN_AIM_MS = 900;
const AI_TURN_FIRE_DELAY_MS = 250;
const AI_SHOP_DELAY_MS = 350;

// Retro pixel backdrop: the single full-width panorama from Sprites 2,
// scaled to cover the battlefield. Cacti sit on the procedural terrain.
const RETRO_BACKDROP_Y = 0;
const RETRO_BACKDROP_HEIGHT = 260;
const RETRO_CACTUS_POSITIONS = [0.08, 0.3, 0.45, 0.6, 0.74, 0.93] as const;
const RETRO_CACTUS_SCALE = 0.6;

export class GameScene extends Phaser.Scene {
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private tankGraphics!: Phaser.GameObjects.Graphics;
  private projectileGraphics!: Phaser.GameObjects.Graphics;

  // Retro-mode image layers (created once, shown only when visualSystem === 'retroPixel').
  private retroBackdrop!: Phaser.GameObjects.Image;
  private retroCacti: Phaser.GameObjects.Image[] = [];
  private retroTankBodies: Phaser.GameObjects.Image[] = [];

  private terrainSystem!: TerrainSystem;
  private tankSystem!: TankSystem;
  private projectileSystem!: ProjectileSystem;
  private turnSystem!: TurnSystem;
  private hudSystem!: HudSystem;
  private aiSystem!: AISystem;

  private terrainData!: TerrainData;
  private tanks: TankState[] = [];
  private turn!: TurnState;
  private match!: MatchState;
  private activeProjectiles: ProjectileState[] = [];
  private statusMessage: string | null = null;
  private visualSystem: VisualSystem = GAME_CONFIG.visuals.defaultSystem;

  // AI turn state. When the active tank is CPU-controlled, the scene
  // computes an AIDecision once and then animates the tank's angle/power
  // toward those targets across AI_TURN_AIM_MS before firing.
  private aiDecision: AIDecision | null = null;
  private aiStartAngle = 0;
  private aiStartPower = 0;
  private aiTurnElapsedMs = 0;
  private aiHasFired = false;
  private aiShopElapsedMs = 0;
  private pendingControllers: ControllerKind[] = ['human', 'cpu-veteran'];
  private pendingRoundsToWin: number = GAME_CONFIG.match.roundsToWin;

  // Tentative shop purchases for the current shopper. Committed on ENTER,
  // discarded on ESC. Keys: weapon ids + 'parachute' + 'shield'.
  private pendingShopBuys: Record<string, number> = {};
  private pendingShopHistory: string[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private moveLeftKey!: Phaser.Input.Keyboard.Key;
  private moveRightKey!: Phaser.Input.Keyboard.Key;
  private parachuteBuyKey!: Phaser.Input.Keyboard.Key;
  private shieldBuyKey!: Phaser.Input.Keyboard.Key;
  private soundToggleKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private backspaceKey!: Phaser.Input.Keyboard.Key;
  private weaponKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super('GameScene');
  }

  init(data: { controllers?: ControllerKind[]; roundsToWin?: number }): void {
    if (data?.controllers && data.controllers.length >= 2) {
      this.pendingControllers = data.controllers;
    }
    if (typeof data?.roundsToWin === 'number' && data.roundsToWin >= 1) {
      this.pendingRoundsToWin = data.roundsToWin;
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    this.backgroundGraphics = this.add.graphics();

    // Retro layers sit between background fill and procedural terrain. They
    // are only made visible when visualSystem === 'retroPixel'.
    this.retroBackdrop = this.add
      .image(GAME_CONFIG.width / 2, RETRO_BACKDROP_Y, 'retro-backdrop')
      .setOrigin(0.5, 0);
    this.retroBackdrop.setDisplaySize(GAME_CONFIG.width, RETRO_BACKDROP_HEIGHT);

    this.terrainGraphics = this.add.graphics();

    // Cacti sit above terrain but below tanks/projectiles.
    this.retroCacti = RETRO_CACTUS_POSITIONS.map(() =>
      this.add.image(0, 0, 'retro-cactus').setOrigin(0.5, 1).setScale(RETRO_CACTUS_SCALE)
    );

    this.tankGraphics = this.add.graphics();

    // Retro tank body sprites (gun is drawn procedurally on top by tankGraphics).
    this.retroTankBodies = [
      this.add.image(0, 0, 'retro-tank-blue').setOrigin(0.5, 1).setScale(0.55),
      this.add.image(0, 0, 'retro-tank-red').setOrigin(0.5, 1).setScale(0.55)
    ];

    this.projectileGraphics = this.add.graphics();

    this.terrainSystem = new TerrainSystem();
    this.tankSystem = new TankSystem();
    this.projectileSystem = new ProjectileSystem();
    this.turnSystem = new TurnSystem();
    this.hudSystem = new HudSystem(this);
    this.aiSystem = new AISystem();

    this.match = this.turnSystem.createMatchState(this.pendingControllers, this.pendingRoundsToWin);
    this.beginRound(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.moveLeftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.moveRightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.parachuteBuyKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.shieldBuyKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.soundToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F10);
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.backspaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);
    const numberKeyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT
    ];
    this.weaponKeys = numberKeyCodes.map((code) => this.input.keyboard!.addKey(code));
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.P,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.V,
      Phaser.Input.Keyboard.KeyCodes.F10,
      Phaser.Input.Keyboard.KeyCodes.ESC,
      Phaser.Input.Keyboard.KeyCodes.BACKSPACE,
      ...numberKeyCodes
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    // Mouse/touch routing.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y));

    this.renderAll();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.soundToggleKey)) {
      soundSystem.toggle();
      this.renderTanksAndHud();
    }

    // Escape hatch: ESC returns to the main menu from any phase. Pending
    // shop purchases (if any) are discarded.
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.returnToMenu();
      return;
    }

    if (this.turn.phase === 'matchOver') {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (this.turn.phase === 'roundOver') {
      if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.enterShoppingPhase();
      }
      return;
    }

    if (this.turn.phase === 'shopping') {
      if (this.isCurrentShopperAI()) {
        this.tickAIShop(delta);
        return;
      }
      const changed = this.handleShoppingInput();
      if (changed) this.renderAll();
      return;
    }

    if (this.turn.phase === 'aiming') {
      if (this.isActivePlayerAI()) {
        this.tickAITurn(delta);
        return;
      }

      const moved = this.handleMovementInput(delta);
      const pointerMoved = this.tickPointerMovement(delta);
      const changed = this.handleAimingInput();
      const switched = this.handleWeaponSelection();

      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.fireActiveWeapon();
        return;
      }

      if (moved || pointerMoved || changed || switched) {
        this.renderTanksAndHud();
      }
      return;
    }

    if (this.turn.phase === 'projectileInFlight') {
      this.tickProjectiles(delta);
    }
  }

  // -------- AI TURN HANDLING --------

  private isActivePlayerAI(): boolean {
    return isAIController(this.match.profiles[this.turn.activePlayerId].controller);
  }

  private isCurrentShopperAI(): boolean {
    const id = this.match.shoppingPlayerId;
    return id !== null && isAIController(this.match.profiles[id].controller);
  }

  private startAITurn(): void {
    const activeTank = this.tanks[this.turn.activePlayerId];
    const opponents = this.tanks.filter((t) => t.id !== activeTank.id);
    this.aiDecision = this.aiSystem.decide(
      this.match.profiles[activeTank.id].controller,
      activeTank,
      opponents,
      this.turn.wind,
      this.terrainSystem,
      this.terrainData
    );
    // Force the AI to a weapon it actually has ammo for.
    if (!this.tankHasAmmo(activeTank, this.aiDecision.weaponIndex)) {
      for (let i = 0; i < GAME_CONFIG.weapons.length; i += 1) {
        if (this.tankHasAmmo(activeTank, i)) {
          this.aiDecision.weaponIndex = i;
          break;
        }
      }
    }
    activeTank.selectedWeaponIndex = this.aiDecision.weaponIndex;
    this.aiStartAngle = activeTank.angle;
    this.aiStartPower = activeTank.power;
    this.aiTurnElapsedMs = 0;
    this.aiHasFired = false;
    this.statusMessage = `${this.match.profiles[activeTank.id].controller.replace('cpu-', '').toUpperCase()} IS THINKING…`;
    this.renderAll();
  }

  private tickAITurn(delta: number): void {
    if (!this.aiDecision) {
      this.startAITurn();
      return;
    }

    this.aiTurnElapsedMs += delta;
    const activeTank = this.tanks[this.turn.activePlayerId];

    if (this.aiTurnElapsedMs <= AI_TURN_THINK_MS) {
      // Pure pause so the player can read the "thinking" message.
      return;
    }

    const aimT = Math.min(
      1,
      (this.aiTurnElapsedMs - AI_TURN_THINK_MS) / AI_TURN_AIM_MS
    );
    activeTank.angle = Phaser.Math.Linear(this.aiStartAngle, this.aiDecision.angle, aimT);
    activeTank.power = Phaser.Math.Linear(this.aiStartPower, this.aiDecision.power, aimT);
    this.renderTanksAndHud();

    if (
      !this.aiHasFired &&
      this.aiTurnElapsedMs >= AI_TURN_THINK_MS + AI_TURN_AIM_MS + AI_TURN_FIRE_DELAY_MS
    ) {
      activeTank.angle = this.aiDecision.angle;
      activeTank.power = this.aiDecision.power;
      this.statusMessage = null;
      this.aiHasFired = true;
      this.aiDecision = null;
      this.fireActiveWeapon();
    }
  }

  private tickAIShop(delta: number): void {
    this.aiShopElapsedMs += delta;
    if (this.aiShopElapsedMs >= AI_SHOP_DELAY_MS) {
      this.aiShopElapsedMs = 0;
      this.finishShoppingForCurrentPlayer();
    }
  }

  // -------- ROUND / MATCH LIFECYCLE --------

  private beginRound(startingPlayer: PlayerId): void {
    this.statusMessage = null;
    this.activeProjectiles = [];
    this.terrainData = this.terrainSystem.generate(this.scale.width, GAME_CONFIG.layout.battlefieldHeight);
    this.tanks = this.tankSystem.createTanks(this.terrainSystem, this.terrainData, this.match.profiles);
    this.turn = {
      activePlayerId: startingPlayer,
      phase: 'aiming',
      winnerId: null,
      wind: this.turnSystem.rollWind()
    };
    if (this.terrainGraphics) this.renderAll();
  }

  private resolveRoundEnd(winnerId: PlayerId): void {
    this.turnSystem.saveTanksToProfiles(this.tanks, this.match);

    this.tanks.forEach((tank) => {
      const earned = tank.damageDealt * GAME_CONFIG.match.damageCashMultiplier;
      this.match.profiles[tank.id].cash += earned;
    });

    this.match.profiles[winnerId].wins += 1;
    this.match.profiles[winnerId].cash += GAME_CONFIG.match.roundWinBonus;
    if (this.tanks[winnerId].alive) {
      this.match.profiles[winnerId].cash += GAME_CONFIG.match.survivalBonus;
    }

    this.turn.winnerId = winnerId;

    if (this.match.profiles[winnerId].wins >= this.match.roundsToWin) {
      this.match.matchWinnerId = winnerId;
      this.turn.phase = 'matchOver';
      soundSystem.playMatchWin();
    } else {
      this.turn.phase = 'roundOver';
      this.statusMessage = `PLAYER ${winnerId + 1} WINS ROUND ${this.match.round}`;
      soundSystem.playRoundWin();
    }

    this.renderAll();
  }

  private enterShoppingPhase(): void {
    const winnerId = this.turn.winnerId ?? 0;
    this.match.shoppingPlayerId = winnerId;
    // Every player gets a shopping turn, dead or alive (they'll respawn at
    // full HP next round but with whatever loadout they bought).
    this.match.shopVisitsRemaining = this.match.profiles.length;
    this.turn.phase = 'shopping';
    this.statusMessage = null;
    this.clearPendingShop();
    this.renderAll();
  }

  private returnToMenu(): void {
    soundSystem.playUiClick();
    this.scene.start('MenuScene');
  }

  // -------- PENDING SHOP HELPERS --------

  private pendingPriceFor(key: string): number {
    if (key === 'parachute') return GAME_CONFIG.match.parachutePrice;
    if (key === 'shield') return GAME_CONFIG.match.shieldPrice;
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === key);
    return weapon?.price ?? 0;
  }

  private totalPendingCost(): number {
    let total = 0;
    for (const [k, qty] of Object.entries(this.pendingShopBuys)) {
      total += qty * this.pendingPriceFor(k);
    }
    return total;
  }

  /**
   * Returns the player's "effective" cash — what's left after applying every
   * pending purchase in the cart, so the shop overlay's running balance and
   * affordability checks both stay consistent.
   */
  effectiveCash(profile: PlayerProfile): number {
    return profile.cash - this.totalPendingCost();
  }

  /** Pending count of an item — what's in the cart but not yet committed. */
  pendingFor(key: string): number {
    return this.pendingShopBuys[key] ?? 0;
  }

  /**
   * Try to add one unit to the shopping cart. Returns true if it fit within
   * the shopper's remaining cash budget. Free items (price 0) are rejected
   * because they aren't purchasable anyway (the unlimited Small Missile).
   */
  private tryQueueShopBuy(profile: PlayerProfile, key: string, price: number): boolean {
    if (price <= 0) return false;
    if (this.effectiveCash(profile) < price) return false;
    this.pendingShopBuys[key] = (this.pendingShopBuys[key] ?? 0) + 1;
    this.pendingShopHistory.push(key);
    return true;
  }

  private undoLastShopBuy(): boolean {
    const last = this.pendingShopHistory.pop();
    if (!last) return false;
    const next = (this.pendingShopBuys[last] ?? 0) - 1;
    if (next <= 0) delete this.pendingShopBuys[last];
    else this.pendingShopBuys[last] = next;
    return true;
  }

  private clearPendingShop(): void {
    this.pendingShopBuys = {};
    this.pendingShopHistory = [];
  }

  private commitPendingShop(profile: PlayerProfile): void {
    for (const [key, qty] of Object.entries(this.pendingShopBuys)) {
      const cost = qty * this.pendingPriceFor(key);
      profile.cash -= cost;
      if (key === 'parachute') profile.parachutes += qty;
      else if (key === 'shield') profile.shields += qty;
      else {
        if (profile.ammo[key] === -1) profile.ammo[key] = 0;
        profile.ammo[key] = (profile.ammo[key] ?? 0) + qty;
      }
    }
    this.clearPendingShop();
  }

  private finishShoppingForCurrentPlayer(): void {
    // Note: caller is responsible for either commitPendingShop or
    // clearPendingShop BEFORE calling this. We always clear pending here
    // after transitioning to make sure stale buys don't leak between
    // shoppers.
    this.clearPendingShop();
    this.match.shopVisitsRemaining -= 1;
    if (this.match.shopVisitsRemaining <= 0) {
      this.match.shoppingPlayerId = null;
      this.match.round += 1;
      const n = this.match.profiles.length;
      const nextStarter = (((this.turn.winnerId ?? 0) + 1) % n) as PlayerId;
      this.beginRound(nextStarter);
      return;
    }
    const n = this.match.profiles.length;
    this.match.shoppingPlayerId = (((this.match.shoppingPlayerId ?? 0) + 1) % n) as PlayerId;
    this.renderAll();
  }

  // -------- INPUT HANDLERS --------

  private handleAimingInput(): boolean {
    const activeTank = this.tanks[this.turn.activePlayerId];
    let changed = false;

    if (this.cursors.left.isDown) {
      activeTank.angle = Math.max(GAME_CONFIG.aiming.minAngle, activeTank.angle - GAME_CONFIG.aiming.angleStep);
      changed = true;
    }
    if (this.cursors.right.isDown) {
      activeTank.angle = Math.min(GAME_CONFIG.aiming.maxAngle, activeTank.angle + GAME_CONFIG.aiming.angleStep);
      changed = true;
    }
    if (this.cursors.up.isDown) {
      activeTank.power = Math.min(GAME_CONFIG.aiming.maxPower, activeTank.power + GAME_CONFIG.aiming.powerStep);
      changed = true;
    }
    if (this.cursors.down.isDown) {
      activeTank.power = Math.max(GAME_CONFIG.aiming.minPower, activeTank.power - GAME_CONFIG.aiming.powerStep);
      changed = true;
    }

    return changed;
  }

  private handleMovementInput(delta: number): boolean {
    const activeTank = this.tanks[this.turn.activePlayerId];
    const others = this.tanks.filter((t) => t.id !== activeTank.id);
    const deltaSeconds = delta / 1000;
    let moved = false;

    if (this.moveLeftKey.isDown) {
      if (this.tankSystem.moveTank(activeTank, -1, deltaSeconds, this.terrainSystem, this.terrainData, others)) {
        moved = true;
      }
    }
    if (this.moveRightKey.isDown) {
      if (this.tankSystem.moveTank(activeTank, 1, deltaSeconds, this.terrainSystem, this.terrainData, others)) {
        moved = true;
      }
    }
    return moved;
  }

  private handleWeaponSelection(): boolean {
    const activeTank = this.tanks[this.turn.activePlayerId];
    for (let i = 0; i < this.weaponKeys.length; i += 1) {
      if (Phaser.Input.Keyboard.JustDown(this.weaponKeys[i])) {
        if (this.tankHasAmmo(activeTank, i)) {
          activeTank.selectedWeaponIndex = i;
          soundSystem.playUiClick();
          return true;
        }
      }
    }
    return false;
  }

  private handleShoppingInput(): boolean {
    if (this.match.shoppingPlayerId === null) return false;
    const profile = this.match.profiles[this.match.shoppingPlayerId];
    let changed = false;

    for (let i = 0; i < this.weaponKeys.length; i += 1) {
      if (Phaser.Input.Keyboard.JustDown(this.weaponKeys[i])) {
        const weapon = GAME_CONFIG.weapons[i];
        if (this.tryQueueShopBuy(profile, weapon.id, weapon.price)) {
          soundSystem.playUiSelect();
          changed = true;
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.parachuteBuyKey)) {
      if (this.tryQueueShopBuy(profile, 'parachute', GAME_CONFIG.match.parachutePrice)) {
        soundSystem.playUiSelect();
        changed = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.shieldBuyKey)) {
      if (this.tryQueueShopBuy(profile, 'shield', GAME_CONFIG.match.shieldPrice)) {
        soundSystem.playUiSelect();
        changed = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.backspaceKey)) {
      if (this.undoLastShopBuy()) {
        soundSystem.playUiClick();
        changed = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.commitPendingShop(profile);
      soundSystem.playUiClick();
      this.finishShoppingForCurrentPlayer();
      return true;
    }

    return changed;
  }

  // -------- POINTER (MOUSE / TOUCH) HANDLING --------

  /**
   * Single pointerdown handler that routes to whichever interaction the
   * pointer landed on. All coordinates are in 960x540 game space (Phaser's
   * Scale.FIT keeps pointer events in this coordinate system regardless of
   * the canvas's actual screen size).
   */
  private handlePointerDown(x: number, y: number): void {
    if (this.turn.phase === 'matchOver') {
      this.scene.restart();
      return;
    }
    if (this.turn.phase === 'roundOver') {
      this.enterShoppingPhase();
      return;
    }
    if (this.turn.phase === 'shopping') {
      if (!this.isCurrentShopperAI()) this.handleShopPointer(x, y);
      return;
    }
    if (this.turn.phase === 'aiming' && !this.isActivePlayerAI()) {
      this.handleAimingPointer(x, y);
      return;
    }
  }

  private handleAimingPointer(x: number, y: number): void {
    const top = GAME_CONFIG.layout.consoleTop;
    const activeTank = this.tanks[this.turn.activePlayerId];

    // ESC: MENU button in bottom strip (820..950, stripY+2..+24)
    const stripY = GAME_CONFIG.layout.bottomStatusTop - 5;
    if (x >= 820 && x <= 950 && y >= stripY + 2 && y <= stripY + 24) {
      this.returnToMenu();
      return;
    }

    // FIRE button (drawn at x=386..496, y=top+8..top+44).
    if (x >= 386 && x <= 496 && y >= top + 8 && y <= top + 44) {
      this.fireActiveWeapon();
      return;
    }

    // Weapon list: x=14..296, rows at top+36 + i*13, 8 rows.
    if (x >= 14 && x <= 296 && y >= top + 36 && y < top + 36 + 8 * 13) {
      const rowIdx = Math.floor((y - (top + 36)) / 13);
      if (rowIdx >= 0 && rowIdx < GAME_CONFIG.weapons.length) {
        if (this.tankHasAmmo(activeTank, rowIdx)) {
          activeTank.selectedWeaponIndex = rowIdx;
          this.renderTanksAndHud();
        }
      }
      return;
    }

    // The console's middle inner panel (x=328..533) holds BOTH the Angle
    // value (top half, y < top+84) and the Power value + bar (bottom half).
    // Split the hitbox top/bottom; within each half, clicking the left side
    // decreases by 5, right side increases by 5.
    if (x >= 328 && x <= 533 && y >= top + 42 && y <= top + 146) {
      const horizontalDelta = x < (328 + 533) / 2 ? -5 : 5;
      const isAngleHalf = y < top + 84;
      if (isAngleHalf) {
        activeTank.angle = Phaser.Math.Clamp(
          activeTank.angle + horizontalDelta,
          GAME_CONFIG.aiming.minAngle,
          GAME_CONFIG.aiming.maxAngle
        );
      } else {
        activeTank.power = Phaser.Math.Clamp(
          activeTank.power + horizontalDelta,
          GAME_CONFIG.aiming.minPower,
          GAME_CONFIG.aiming.maxPower
        );
      }
      this.renderTanksAndHud();
      return;
    }

    // Battlefield (above the console): clicking left or right of the active
    // tank moves it that direction, consuming move budget. Touch can hold
    // the click to keep moving — the held-pointer path lives in update()
    // via tickPointerMovement.
    if (y < GAME_CONFIG.layout.consoleTop) {
      this.tryPointerMove(x, 16); // immediate small step on tap
    }
  }

  private handleShopPointer(x: number, y: number): void {
    if (this.match.shoppingPlayerId === null) return;
    const profile = this.match.profiles[this.match.shoppingPlayerId];

    // Shop overlay coords mirror HudSystem.drawShopOverlay.
    const panelX = 80;
    const panelY = 40;
    const panelH = GAME_CONFIG.height - 80;
    const listX = panelX + 24;
    const listYStart = panelY + 158; // header row at +130, first weapon row at +158
    const rowH = 24;

    // Weapon rows (8 weapons) — clicking adds to pending cart
    for (let i = 0; i < GAME_CONFIG.weapons.length; i += 1) {
      const rowY = listYStart + i * rowH;
      if (x >= listX && x <= listX + 500 && y >= rowY - 4 && y < rowY + rowH - 4) {
        const weapon = GAME_CONFIG.weapons[i];
        if (this.tryQueueShopBuy(profile, weapon.id, weapon.price)) {
          soundSystem.playUiSelect();
          this.renderAll();
        }
        return;
      }
    }

    // Parachute row (next after weapons)
    const chuteY = listYStart + GAME_CONFIG.weapons.length * rowH + 8;
    if (x >= listX && x <= listX + 500 && y >= chuteY - 4 && y < chuteY + rowH - 4) {
      if (this.tryQueueShopBuy(profile, 'parachute', GAME_CONFIG.match.parachutePrice)) {
        soundSystem.playUiSelect();
        this.renderAll();
      }
      return;
    }

    // Shield row (after parachute)
    const shieldY = chuteY + rowH;
    if (x >= listX && x <= listX + 500 && y >= shieldY - 4 && y < shieldY + rowH - 4) {
      if (this.tryQueueShopBuy(profile, 'shield', GAME_CONFIG.match.shieldPrice)) {
        soundSystem.playUiSelect();
        this.renderAll();
      }
      return;
    }

    // Undo button — small button left of Finish
    const undoY = panelY + panelH - 50;
    if (x >= listX && x <= listX + 160 && y >= undoY) {
      if (this.undoLastShopBuy()) {
        soundSystem.playUiClick();
        this.renderAll();
      }
      return;
    }

    // Finish/checkout button (bottom-right area of the overlay)
    if (y >= undoY) {
      this.commitPendingShop(profile);
      soundSystem.playUiClick();
      this.finishShoppingForCurrentPlayer();
    }
  }

  /**
   * Continuous movement when the player is holding the pointer on the
   * battlefield area: each frame in aiming phase we check the active
   * pointer; if it's held and the cursor is left/right of the active tank,
   * step the tank in that direction.
   */
  private tickPointerMovement(delta: number): boolean {
    const pointer = this.input.activePointer;
    if (!pointer.isDown) return false;
    if (pointer.y >= GAME_CONFIG.layout.consoleTop) return false;
    return this.tryPointerMove(pointer.x, delta);
  }

  private tryPointerMove(targetX: number, delta: number): boolean {
    const activeTank = this.tanks[this.turn.activePlayerId];
    const others = this.tanks.filter((t) => t.id !== activeTank.id);
    const deltaSeconds = Math.min(delta, 64) / 1000;
    const dx = targetX - activeTank.x;
    if (Math.abs(dx) < 6) return false;
    const direction: -1 | 1 = dx < 0 ? -1 : 1;
    return this.tankSystem.moveTank(
      activeTank,
      direction,
      deltaSeconds,
      this.terrainSystem,
      this.terrainData,
      others
    );
  }

  // -------- WEAPON LOGIC --------

  private tankHasAmmo(tank: TankState, weaponIndex: number): boolean {
    const weapon = GAME_CONFIG.weapons[weaponIndex];
    if (!weapon) return false;
    const count = tank.ammo[weapon.id];
    return count === -1 || count > 0;
  }

  private ensureSelectableWeapon(tank: TankState): void {
    if (this.tankHasAmmo(tank, tank.selectedWeaponIndex)) return;
    for (let i = 0; i < GAME_CONFIG.weapons.length; i += 1) {
      if (this.tankHasAmmo(tank, i)) {
        tank.selectedWeaponIndex = i;
        return;
      }
    }
  }

  private activeWeapon(): WeaponDefinition {
    const activeTank = this.tanks[this.turn.activePlayerId];
    return GAME_CONFIG.weapons[activeTank.selectedWeaponIndex];
  }

  private fireActiveWeapon(): void {
    const activeTank = this.tanks[this.turn.activePlayerId];
    const weapon = this.activeWeapon();
    if (!this.tankHasAmmo(activeTank, activeTank.selectedWeaponIndex)) return;

    if (activeTank.ammo[weapon.id] !== -1) {
      activeTank.ammo[weapon.id] -= 1;
    }

    this.activeProjectiles = this.projectileSystem.launch(activeTank, weapon, this.tankSystem);
    this.turn.phase = 'projectileInFlight';
    soundSystem.playFire();
    this.renderTanksAndHud();
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);
  }

  // -------- PROJECTILE TICK --------

  private tickProjectiles(delta: number): void {
    const remaining: ProjectileState[] = [];
    const spawnedThisFrame: ProjectileState[] = [];

    for (const projectile of this.activeProjectiles) {
      const tick = this.projectileSystem.update(
        projectile,
        delta,
        this.turn.wind,
        this.terrainSystem,
        this.terrainData,
        this.tankSystem,
        this.tanks
      );

      if (tick.spawned.length) spawnedThisFrame.push(...tick.spawned);

      if (tick.impact) {
        this.applyImpact(projectile, tick.impact);
      } else {
        remaining.push(projectile);
      }
    }

    this.activeProjectiles = [...remaining, ...spawnedThisFrame];
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);

    if (this.activeProjectiles.length === 0) {
      this.endTurn();
    }
  }

  private applyImpact(projectile: ProjectileState, impact: ImpactResult): void {
    const weapon = projectile.weapon;
    const shooter = this.tanks[projectile.ownerId];
    let terrainChanged = false;

    if (impact.kind === 'terrain' || impact.kind === 'tank') {
      if (weapon.behavior === 'dirt') {
        const radius = weapon.moundRadius ?? weapon.craterRadius ?? 30;
        this.terrainSystem.applyMound(this.terrainData, impact.x, impact.y, radius);
        terrainChanged = true;
      } else if (weapon.craterRadius > 0) {
        this.terrainSystem.applyCrater(this.terrainData, impact.x, impact.y, weapon.craterRadius);
        terrainChanged = true;
      }
    }

    if (impact.kind === 'tank' && impact.targetTankId !== undefined && weapon.damage > 0) {
      const target = this.tanks[impact.targetTankId];

      // Shield absorbs up to shieldAbsorbAmount and is consumed on any hit.
      let incoming = weapon.damage;
      let shieldUsed = false;
      if (target.shields > 0) {
        const absorbed = Math.min(incoming, GAME_CONFIG.match.shieldAbsorbAmount);
        incoming -= absorbed;
        target.shields -= 1;
        shieldUsed = true;
      }

      const damageDealt = Math.min(incoming, target.health);
      this.tankSystem.applyDamage(target, incoming);
      // Don't credit the shooter for damaging themselves.
      if (target.id !== shooter.id) {
        shooter.damageDealt += damageDealt;
      }

      if (shieldUsed) soundSystem.playShieldHit();
      if (incoming > 0) soundSystem.playTankHit();
    } else if (impact.kind === 'terrain') {
      soundSystem.playExplosion(weapon.craterRadius > 40 ? 1.3 : 0.85);
    } else if (impact.kind === 'outOfBounds') {
      soundSystem.playMiss();
    }

    if (terrainChanged) {
      const falls = this.tankSystem.settleTanksAfterTerrainChange(
        this.tanks,
        this.terrainSystem,
        this.terrainData
      );
      falls.forEach((fall) => {
        if (fall.damage > 0 && fall.tankId !== shooter.id) {
          shooter.damageDealt += fall.damage;
        }
        if (fall.damage > 0 || fall.usedParachute) soundSystem.playFall();
      });
    }
  }

  private endTurn(): void {
    this.activeProjectiles = [];
    this.projectileSystem.drawAll(this.projectileGraphics, []);

    const winnerId = this.turnSystem.findWinner(this.tanks);
    if (winnerId !== null) {
      this.resolveRoundEnd(winnerId);
      return;
    }

    this.turn.activePlayerId = this.turnSystem.nextActivePlayer(this.turn.activePlayerId, this.tanks);
    this.turn.wind = this.turnSystem.rollWind();
    this.tankSystem.refillMovement(this.tanks[this.turn.activePlayerId]);
    this.ensureSelectableWeapon(this.tanks[this.turn.activePlayerId]);
    this.turn.phase = 'aiming';

    this.renderAll();
  }

  // -------- RENDERING --------

  private renderAll(): void {
    this.drawRetroBattlefieldBackground();
    this.terrainSystem.draw(this.terrainGraphics, this.terrainData, this.visualSystem);
    this.updateRetroLayerVisibility();
    this.renderTanksAndHud();
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);
  }

  private updateRetroLayerVisibility(): void {
    const retro = this.visualSystem === 'retroPixel';
    this.retroBackdrop.visible = retro;
    this.retroCacti.forEach((cactus) => (cactus.visible = retro));
    this.retroTankBodies.forEach((tankImg) => (tankImg.visible = retro));

    if (retro && this.terrainData) {
      RETRO_CACTUS_POSITIONS.forEach((t, idx) => {
        const cactus = this.retroCacti[idx];
        if (!cactus) return;
        // Skip cacti that would land on tank spawn columns
        if (Math.abs(t - 0.16) < 0.06 || Math.abs(t - 0.86) < 0.06) {
          cactus.visible = false;
          return;
        }
        const x = t * GAME_CONFIG.width;
        const y = this.terrainSystem.getHeightAtX(this.terrainData, x);
        cactus.setPosition(Math.round(x), Math.round(y) + 2);
      });

      // Position tank sprites at each tank's current position.
      this.tanks.forEach((tank, idx) => {
        const tankImg = this.retroTankBodies[idx];
        if (!tankImg) return;
        if (!tank.alive) {
          tankImg.visible = false;
          return;
        }
        tankImg.setPosition(Math.round(tank.x), Math.round(tank.y) + 2);
      });
    }
  }

  private renderTanksAndHud(): void {
    this.tankSystem.draw(this.tankGraphics, this.tanks, this.turn.activePlayerId, this.visualSystem);
    this.hudSystem.render(
      this.turn,
      this.tanks,
      this.activeWeapon(),
      this.match,
      this.statusMessage,
      this.visualSystem,
      {
        pendingFor: (key) => this.pendingFor(key),
        effectiveCash: (p) => this.effectiveCash(p as PlayerProfile),
        hasPending: () => Object.keys(this.pendingShopBuys).length > 0
      }
    );
  }

  private drawRetroBattlefieldBackground(): void {
    const colors = GAME_CONFIG.colors;

    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(colors.black, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // Console divider line is shared by both visual systems.
    this.backgroundGraphics.lineStyle(2, this.visualSystem === 'retroPixel' ? colors.steelLight : colors.white, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.lineTo(GAME_CONFIG.width, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.strokePath();

    if (this.visualSystem === 'classic') {
      // Classic sky: faint deterministic starfield.
      this.backgroundGraphics.fillStyle(colors.white, 0.45);
      const starSeed = 1337;
      for (let i = 0; i < 60; i += 1) {
        const px = (i * 73 + starSeed) % GAME_CONFIG.width;
        const py = ((i * 41 + starSeed) % 150) + 12;
        this.backgroundGraphics.fillRect(px, py, 1, 1);
      }
    }
    // Retro mode: backdrop is supplied by retroSky / retroFarMountains /
    // retroMidMountains image game objects; no procedural drawing needed.
  }

}
