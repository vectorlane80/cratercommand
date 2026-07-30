import Phaser from 'phaser';
import { AISystem, isAIController, isRemoteController, type AIDecision } from '../systems/AISystem';
import { EconomySystem } from '../systems/EconomySystem';
import { HudSystem, SHOP_LAYOUT } from '../systems/HudSystem';
import { networkSystem, type GameSnapshot, type NetInput, type NetworkMessage } from '../systems/NetworkSystem';
import { soundSystem } from '../systems/SoundSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TankSystem } from '../systems/TankSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { TurnSystem } from '../systems/TurnSystem';
import { adjustWindow, cycleWeapon } from '../systems/WeaponWindow';
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
  private economySystem = new EconomySystem();

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
  private pendingNames: Array<string | null> = [];
  private pendingRoundsToWin: number = GAME_CONFIG.match.roundsToWin;

  // Tentative shop purchases for the current shopper. Committed on ENTER,
  // discarded on ESC. Keys: weapon ids + 'parachute' + 'shield'.
  private pendingShopBuys: Record<string, number> = {};
  private pendingShopHistory: string[] = [];
  private shopPage = 0;
  private weaponWindowStart = 0;

  // Ephemeral top-banner toast for fall events. Lives ~2s so the human can
  // see it. Cleared lazily during render.
  private topToast: { text: string; color: number; expiresAt: number } | null = null;

  // Forfeit-to-menu confirmation. When true, a full-screen modal blocks all
  // other input until the player picks YES or NO.
  private quitConfirmActive = false;
  private yesKey!: Phaser.Input.Keyboard.Key;
  private noKey!: Phaser.Input.Keyboard.Key;

  // Online mode. If isOnlineHost is true we run the sim and broadcast.
  // If isOnlineJoiner is true we run no sim; we just render snapshots and
  // forward local inputs (when it's our turn) to the host.
  private isOnlineHost = false;
  private isOnlineJoiner = false;
  /**
   * For the joiner: the PlayerId that "we" control. Inputs apply only when
   * turn.activePlayerId === localPlayerId.
   */
  private localPlayerId: PlayerId = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private moveLeftKey!: Phaser.Input.Keyboard.Key;
  private moveRightKey!: Phaser.Input.Keyboard.Key;
  private itemHotkeys: Array<{ key: Phaser.Input.Keyboard.Key; itemId: string }> = [];
  private soundToggleKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private backspaceKey!: Phaser.Input.Keyboard.Key;
  private weaponKeys: Phaser.Input.Keyboard.Key[] = [];
  private weaponPrevKey!: Phaser.Input.Keyboard.Key;
  private weaponNextKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  init(data: {
    controllers?: ControllerKind[];
    names?: Array<string | null>;
    roundsToWin?: number;
    online?: { isHost: boolean };
  }): void {
    if (data?.controllers && data.controllers.length >= 2) {
      this.pendingControllers = data.controllers;
    }
    if (data?.names) this.pendingNames = data.names;
    if (typeof data?.roundsToWin === 'number' && data.roundsToWin >= 1) {
      this.pendingRoundsToWin = data.roundsToWin;
    }
    if (data?.online) {
      this.isOnlineHost = data.online.isHost;
      this.isOnlineJoiner = !data.online.isHost;
      // Joiner is always slot index where 'human' (their own controller) is.
      this.localPlayerId = this.pendingControllers.indexOf('human') as PlayerId;
    } else {
      this.isOnlineHost = false;
      this.isOnlineJoiner = false;
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    // Phaser keeps keyboard Key state across scene transitions. If the user
    // pressed a number key in MenuScene (e.g. "4" to cycle slot 4) and the
    // GameScene's first update() polls JustDown on that same code, the stale
    // press fires here — flipping selectedWeaponIndex to whatever digit was
    // last typed. Clearing state at scene entry keeps each match starting
    // fresh.
    this.input.keyboard?.resetKeys();

    // Class fields persist across scene.start() because Phaser reuses the
    // scene instance. Explicitly clear anything that could leak from a prior
    // match.
    this.pendingShopBuys = {};
    this.pendingShopHistory = [];
    this.shopPage = 0;
    this.weaponWindowStart = 0;
    this.topToast = null;
    this.quitConfirmActive = false;
    this.aiDecision = null;
    this.aiHasFired = false;
    this.aiTurnElapsedMs = 0;
    this.aiShopElapsedMs = 0;
    this.activeProjectiles = [];
    this.statusMessage = null;

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

    this.match = this.turnSystem.createMatchState(this.pendingControllers, this.pendingRoundsToWin, this.pendingNames);
    this.beginRound(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.moveLeftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.moveRightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.soundToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F10);
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.backspaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE);
    this.yesKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Y);
    this.noKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    const numberKeyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
      Phaser.Input.Keyboard.KeyCodes.ZERO
    ];
    this.weaponKeys = numberKeyCodes.map((code) => this.input.keyboard!.addKey(code));
    this.weaponPrevKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.weaponNextKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    GAME_CONFIG.items.forEach((item) => {
      const keyCode = Phaser.Input.Keyboard.KeyCodes[item.hotkey as keyof typeof Phaser.Input.Keyboard.KeyCodes];
      this.itemHotkeys.push({ key: this.input.keyboard!.addKey(keyCode), itemId: item.id });
    });
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
      Phaser.Input.Keyboard.KeyCodes.Y,
      Phaser.Input.Keyboard.KeyCodes.N,
      ...numberKeyCodes
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    // Mouse/touch routing.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y));

    // Online networking.
    if (this.isOnlineHost || this.isOnlineJoiner) {
      networkSystem.setEvents({
        onMessage: (msg) => this.handleNetworkMessage(msg),
        onStateChange: (s) => {
          if (s === 'disconnected' || s === 'error') {
            // Drop back to menu on connection loss.
            this.scene.start('MenuScene');
          }
        }
      });
    }

    this.renderAll();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.soundToggleKey)) {
      soundSystem.toggle();
      this.renderTanksAndHud();
    }

    // Forfeit-confirm modal. When the modal is open it owns all input —
    // Y / Enter / click YES = forfeit, N / Esc / click NO = dismiss.
    if (this.quitConfirmActive) {
      if (
        Phaser.Input.Keyboard.JustDown(this.yesKey) ||
        Phaser.Input.Keyboard.JustDown(this.enterKey)
      ) {
        this.returnToMenu();
        return;
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.noKey) ||
        Phaser.Input.Keyboard.JustDown(this.escapeKey) ||
        Phaser.Input.Keyboard.JustDown(this.spaceKey)
      ) {
        this.quitConfirmActive = false;
        soundSystem.playUiClick();
        this.renderTanksAndHud();
        return;
      }
      // Block all other input while the modal is up.
      return;
    }

    // ESC anywhere opens the forfeit-confirm modal.
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.quitConfirmActive = true;
      soundSystem.playUiClick();
      this.renderTanksAndHud();
      return;
    }

    // Joiner runs no sim — it just forwards inputs to the host and renders
    // whatever snapshots come back. All sim/AI/projectile/shop logic below
    // belongs to the local + host paths.
    if (this.isOnlineJoiner) {
      this.updateJoiner();
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
      // Host: when the remote player is shopping, wait for their NetInputs.
      if (this.isCurrentShopperRemote()) return;
      const changed = this.handleShoppingInput();
      if (changed) this.renderAll();
      return;
    }

    if (this.turn.phase === 'aiming') {
      if (this.isActivePlayerAI()) {
        this.tickAITurn(delta);
        return;
      }
      // Host: when the remote player is aiming, wait for their NetInputs.
      if (this.isActivePlayerRemote()) return;

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

  private isActivePlayerRemote(): boolean {
    return isRemoteController(this.match.profiles[this.turn.activePlayerId].controller);
  }

  private isCurrentShopperAI(): boolean {
    const id = this.match.shoppingPlayerId;
    return id !== null && isAIController(this.match.profiles[id].controller);
  }

  private isCurrentShopperRemote(): boolean {
    const id = this.match.shoppingPlayerId;
    return id !== null && isRemoteController(this.match.profiles[id].controller);
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
    this.ensureWeaponVisible();
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
    this.weaponWindowStart = 0;
    if (this.terrainGraphics) this.renderAll();
  }

  private resolveRoundEnd(winnerId: PlayerId | null): void {
    this.turnSystem.saveTanksToProfiles(this.tanks, this.match);

    this.tanks.forEach((tank) => {
      const earned = tank.damageDealt * GAME_CONFIG.match.damageCashMultiplier;
      this.match.profiles[tank.id].cash += earned;
    });

    if (winnerId !== null) {
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
        this.statusMessage = `${this.playerName(winnerId)} WINS ROUND ${this.match.round}`;
        soundSystem.playRoundWin();
      }
    } else {
      this.turn.winnerId = null;
      this.turn.phase = 'roundOver';
      this.statusMessage = `NO SURVIVORS — ROUND ${this.match.round} IS A DRAW`;
      soundSystem.playMiss();
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
    this.rollShopSale();
    this.shopPage = 0;
    // Drop any lingering fall toast from the round that just ended so it
    // doesn't bleed into the shop overlay.
    this.topToast = null;
    this.renderAll();
  }

  /**
   * Roll a fresh sale for the shop the players are about to enter. Picks a
   * uniformly-random *purchasable* item (weapon with price > 0, or
   * parachute / shield), applies a random discount in the configured range.
   * Stored in match.currentSale so the same sale is visible to every shopper
   * in this round's shop session.
   */
  private rollShopSale(): void {
    this.match.currentSale = this.economySystem.rollSale();
  }

  /**
   * Effective price of an item given the current round and any active sale.
   * Base price scales by (1 + (round-1) * roundPriceInflation), then any
   * active sale on this exact item knocks off (discount) of the inflated
   * price. Minimum 1 to keep it a real transaction.
   */
  private effectivePrice(basePrice: number, itemKey: string): number {
    return this.economySystem.effectivePrice(basePrice, itemKey, this.match.round, this.match.currentSale);
  }

  private returnToMenu(): void {
    soundSystem.playUiClick();
    this.scene.start('MenuScene');
  }

  /** Display name for a tank — custom name from the menu or default. */
  private playerName(id: PlayerId): string {
    return this.match.profiles[id]?.displayName ?? `PLAYER ${id + 1}`;
  }

  // -------- ONLINE NETWORKING --------

  /**
   * Inbound message handler shared by host and joiner. Host gets 'input'
   * messages from the joiner and applies them to its local sim. Joiner gets
   * 'snapshot' messages from the host and replays them as the new state.
   */
  private handleNetworkMessage(msg: NetworkMessage): void {
    if (this.isOnlineHost && msg.type === 'input') {
      this.applyRemoteInput(msg.action);
    } else if (this.isOnlineJoiner && msg.type === 'snapshot') {
      this.applySnapshot(msg.data);
    }
  }

  /** Host: apply an input action received from the remote player. */
  private applyRemoteInput(action: NetInput): void {
    // Inputs are only valid when it's the remote player's turn. The remote
    // player's id is the slot index whose controller === 'remote'.
    const remoteId = this.match.profiles.findIndex((p) => p.controller === 'remote') as PlayerId;
    if (this.turn.activePlayerId !== remoteId && action.kind !== 'shop-buy' && action.kind !== 'shop-remove' && action.kind !== 'shop-undo' && action.kind !== 'shop-finish' && action.kind !== 'advance-round') {
      return; // ignore aim/move/fire if not their turn
    }
    const activeTank = this.tanks[remoteId];

    switch (action.kind) {
      case 'aim': {
        activeTank.angle = Phaser.Math.Clamp(action.angle, GAME_CONFIG.aiming.minAngle, GAME_CONFIG.aiming.maxAngle);
        activeTank.power = Phaser.Math.Clamp(action.power, GAME_CONFIG.aiming.minPower, GAME_CONFIG.aiming.maxPower);
        this.renderTanksAndHud();
        break;
      }
      case 'move-step': {
        const others = this.tanks.filter((t) => t.id !== activeTank.id);
        this.tankSystem.moveTank(activeTank, action.direction, 0.06, this.terrainSystem, this.terrainData, others);
        this.renderTanksAndHud();
        break;
      }
      case 'select-weapon':
        if (this.tankHasAmmo(activeTank, action.index)) {
          activeTank.selectedWeaponIndex = action.index;
          this.ensureWeaponVisible();
          this.renderTanksAndHud();
        }
        break;
      case 'fire':
        if (this.turn.phase === 'aiming') this.fireActiveWeapon();
        break;
      case 'shop-buy':
        if (this.turn.phase === 'shopping' && this.match.shoppingPlayerId === remoteId) {
          this.tryQueueShopBuy(this.match.profiles[remoteId], action.itemKey);
          this.renderAll();
        }
        break;
      case 'shop-remove':
        if (this.turn.phase === 'shopping' && this.match.shoppingPlayerId === remoteId) {
          this.removeFromCart(action.itemKey);
          this.renderAll();
        }
        break;
      case 'shop-undo':
        if (this.turn.phase === 'shopping' && this.match.shoppingPlayerId === remoteId) {
          this.undoLastShopBuy();
          this.renderAll();
        }
        break;
      case 'shop-finish':
        if (this.turn.phase === 'shopping' && this.match.shoppingPlayerId === remoteId) {
          this.commitPendingShop(this.match.profiles[remoteId]);
          this.finishShoppingForCurrentPlayer();
        }
        break;
      case 'advance-round':
        if (this.turn.phase === 'roundOver') this.enterShoppingPhase();
        break;
    }
  }

  /** Send a snapshot of the current state to the joiner (host only). */
  private broadcastSnapshot(): void {
    if (!this.isOnlineHost) return;
    const snapshot: GameSnapshot = {
      match: JSON.parse(JSON.stringify(this.match)),
      turn: JSON.parse(JSON.stringify(this.turn)),
      tanks: JSON.parse(JSON.stringify(this.tanks)),
      terrainHeights: this.terrainData.heights.slice(),
      projectiles: this.activeProjectiles.map((p) => ({
        ownerId: p.ownerId,
        weaponId: p.weapon.id,
        x: p.x,
        y: p.y,
        velocityX: p.velocityX,
        velocityY: p.velocityY,
        trail: p.trail.slice(),
        ageMs: p.ageMs,
        bouncesLeft: p.bouncesLeft,
        hasSplit: p.hasSplit
      })),
      statusMessage: this.statusMessage,
      topToast: this.topToast,
      quitConfirmActive: this.quitConfirmActive,
      pendingShopBuys: { ...this.pendingShopBuys }
    };
    networkSystem.send({ type: 'snapshot', data: snapshot });
  }

  /** Joiner: replace local state with a snapshot received from the host. */
  private applySnapshot(snap: GameSnapshot): void {
    // Build new tanks/match/turn references in place so any objects that
    // captured them keep working.
    this.match = snap.match;
    this.turn = snap.turn;
    this.tanks = snap.tanks;
    if (!this.terrainData) {
      // Joiner hasn't run beginRound — fake one up from the snapshot.
      this.terrainData = {
        width: this.scale.width,
        height: GAME_CONFIG.layout.battlefieldHeight,
        segmentWidth: this.scale.width / (snap.terrainHeights.length - 1),
        heights: snap.terrainHeights.slice()
      };
    } else {
      this.terrainData.heights = snap.terrainHeights.slice();
    }
    this.activeProjectiles = snap.projectiles.map((p) => {
      const weapon = GAME_CONFIG.weapons.find((w) => w.id === p.weaponId)!;
      return {
        ownerId: p.ownerId as PlayerId,
        weapon,
        x: p.x,
        y: p.y,
        velocityX: p.velocityX,
        velocityY: p.velocityY,
        trail: p.trail,
        ageMs: p.ageMs,
        bouncesLeft: p.bouncesLeft,
        hasSplit: p.hasSplit
      };
    });
    this.statusMessage = snap.statusMessage;
    this.topToast = snap.topToast;
    this.pendingShopBuys = snap.pendingShopBuys;
    this.renderAll();
  }

  /** Joiner-side: send an input action to the host. */
  private sendInput(action: NetInput): void {
    if (this.isOnlineJoiner) networkSystem.send({ type: 'input', action });
  }

  /**
   * Joiner-side update tick. Only forwards local inputs to the host as
   * NetInput messages; never mutates local state directly.
   */
  private updateJoiner(): void {
    if (this.turn.phase === 'matchOver') {
      // Host owns restart. Joiner can ESC out to menu.
      return;
    }
    if (this.turn.phase === 'roundOver') {
      if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.sendInput({ kind: 'advance-round' });
      }
      return;
    }
    if (this.turn.phase === 'shopping' && this.match.shoppingPlayerId === this.localPlayerId) {
      this.handleJoinerShoppingInput();
      return;
    }
    if (this.turn.phase === 'aiming' && this.turn.activePlayerId === this.localPlayerId) {
      this.handleJoinerAimingInput();
      return;
    }
  }

  private handleJoinerAimingInput(): void {
    const tank = this.tanks[this.localPlayerId];
    if (!tank) return;

    // Continuous aim/power: re-send the desired (clamped) values whenever
    // an arrow key is held. Host applies and the snapshot rebroadcasts.
    let nextAngle = tank.angle;
    let nextPower = tank.power;
    let aimChanged = false;
    if (this.cursors.left.isDown) { nextAngle -= GAME_CONFIG.aiming.angleStep; aimChanged = true; }
    if (this.cursors.right.isDown) { nextAngle += GAME_CONFIG.aiming.angleStep; aimChanged = true; }
    if (this.cursors.up.isDown) { nextPower += GAME_CONFIG.aiming.powerStep; aimChanged = true; }
    if (this.cursors.down.isDown) { nextPower -= GAME_CONFIG.aiming.powerStep; aimChanged = true; }
    if (aimChanged) {
      nextAngle = Phaser.Math.Clamp(nextAngle, GAME_CONFIG.aiming.minAngle, GAME_CONFIG.aiming.maxAngle);
      nextPower = Phaser.Math.Clamp(nextPower, GAME_CONFIG.aiming.minPower, GAME_CONFIG.aiming.maxPower);
      this.sendInput({ kind: 'aim', angle: nextAngle, power: nextPower });
    }

    // Discrete events: weapon select, fire, movement (one step per frame
    // while key is held).
    for (let i = 0; i < this.weaponKeys.length; i += 1) {
      if (Phaser.Input.Keyboard.JustDown(this.weaponKeys[i])) {
        const weaponIndex = this.weaponWindowStart + i;
        if (weaponIndex < GAME_CONFIG.weapons.length) {
          this.sendInput({ kind: 'select-weapon', index: weaponIndex });
          this.weaponWindowStart = adjustWindow(this.weaponWindowStart, weaponIndex, GAME_CONFIG.weapons.length);
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.weaponPrevKey)) {
      const next = cycleWeapon(tank.selectedWeaponIndex, -1, (i) => this.tankHasAmmo(tank, i), GAME_CONFIG.weapons.length);
      if (next !== tank.selectedWeaponIndex) {
        this.sendInput({ kind: 'select-weapon', index: next });
        this.weaponWindowStart = adjustWindow(this.weaponWindowStart, next, GAME_CONFIG.weapons.length);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.weaponNextKey)) {
      const next = cycleWeapon(tank.selectedWeaponIndex, 1, (i) => this.tankHasAmmo(tank, i), GAME_CONFIG.weapons.length);
      if (next !== tank.selectedWeaponIndex) {
        this.sendInput({ kind: 'select-weapon', index: next });
        this.weaponWindowStart = adjustWindow(this.weaponWindowStart, next, GAME_CONFIG.weapons.length);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.sendInput({ kind: 'fire' });
    }
    if (this.moveLeftKey.isDown) this.sendInput({ kind: 'move-step', direction: -1 });
    if (this.moveRightKey.isDown) this.sendInput({ kind: 'move-step', direction: 1 });
  }

  private handleJoinerShoppingInput(): void {
    for (let i = 0; i < this.weaponKeys.length; i += 1) {
      if (Phaser.Input.Keyboard.JustDown(this.weaponKeys[i])) {
        const key = this.shopSlotKey(i);
        if (key) this.sendInput({ kind: 'shop-buy', itemKey: key });
      }
    }
    for (const hotkey of this.itemHotkeys) {
      if (Phaser.Input.Keyboard.JustDown(hotkey.key)) {
        this.sendInput({ kind: 'shop-buy', itemKey: hotkey.itemId });
      }
    }
    const pageCount = this.economySystem.pageCount(SHOP_LAYOUT.pageSize);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.shopPage = Math.max(0, this.shopPage - 1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.shopPage = Math.min(pageCount - 1, this.shopPage + 1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.backspaceKey)) {
      this.sendInput({ kind: 'shop-undo' });
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.sendInput({ kind: 'shop-finish' });
    }
  }

  // -------- PENDING SHOP HELPERS --------

  private basePriceFor(key: string): number {
    return this.economySystem.basePriceFor(key);
  }

  /**
   * Returns the player's "effective" cash — what's left after applying every
   * pending purchase in the cart, so the shop overlay's running balance and
   * affordability checks both stay consistent.
   */
  effectiveCash(profile: PlayerProfile): number {
    return this.economySystem.effectiveCash(profile, this.pendingShopBuys, this.match.round, this.match.currentSale);
  }

  /** Pending count of an item — what's in the cart but not yet committed. */
  pendingFor(key: string): number {
    return this.pendingShopBuys[key] ?? 0;
  }

  private shopSlotKey(slotIndex: number): string | null {
    const slice = this.economySystem.pageSlice(this.shopPage, SHOP_LAYOUT.pageSize);
    return slice[slotIndex]?.key ?? null;
  }

  /**
   * Try to add one unit to the shopping cart. Returns true if it fit within
   * the shopper's remaining cash budget after applying round-inflation and
   * any active sale. Free items (base price 0) are rejected because they
   * aren't purchasable anyway (the unlimited Small Missile).
   */
  private tryQueueShopBuy(profile: PlayerProfile, key: string): boolean {
    const basePrice = this.basePriceFor(key);
    if (basePrice <= 0) return false;
    const price = this.effectivePrice(basePrice, key);
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
    this.economySystem.applyPurchases(profile, this.pendingShopBuys, this.match.round, this.match.currentSale);
    this.clearPendingShop();
  }

  private finishShoppingForCurrentPlayer(): void {
    // Note: caller is responsible for either commitPendingShop or
    // clearPendingShop BEFORE calling this. We always clear pending here
    // after transitioning to make sure stale buys don't leak between
    // shoppers.
    this.clearPendingShop();
    this.shopPage = 0;
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
        const weaponIndex = this.weaponWindowStart + i;
        if (weaponIndex < GAME_CONFIG.weapons.length && this.tankHasAmmo(activeTank, weaponIndex)) {
          activeTank.selectedWeaponIndex = weaponIndex;
          this.ensureWeaponVisible();
          soundSystem.playUiClick();
          return true;
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.weaponPrevKey)) {
      const next = cycleWeapon(activeTank.selectedWeaponIndex, -1, (i) => this.tankHasAmmo(activeTank, i), GAME_CONFIG.weapons.length);
      if (next !== activeTank.selectedWeaponIndex) {
        activeTank.selectedWeaponIndex = next;
        this.ensureWeaponVisible();
        soundSystem.playUiClick();
        return true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.weaponNextKey)) {
      const next = cycleWeapon(activeTank.selectedWeaponIndex, 1, (i) => this.tankHasAmmo(activeTank, i), GAME_CONFIG.weapons.length);
      if (next !== activeTank.selectedWeaponIndex) {
        activeTank.selectedWeaponIndex = next;
        this.ensureWeaponVisible();
        soundSystem.playUiClick();
        return true;
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
        const key = this.shopSlotKey(i);
        if (key && this.tryQueueShopBuy(profile, key)) {
          soundSystem.playUiSelect();
          changed = true;
        }
      }
    }

    for (const hotkey of this.itemHotkeys) {
      if (Phaser.Input.Keyboard.JustDown(hotkey.key)) {
        if (this.tryQueueShopBuy(profile, hotkey.itemId)) {
          soundSystem.playUiSelect();
          changed = true;
        }
      }
    }

    const pageCount = this.economySystem.pageCount(SHOP_LAYOUT.pageSize);
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.shopPage = Math.max(0, this.shopPage - 1);
      changed = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.shopPage = Math.min(pageCount - 1, this.shopPage + 1);
      changed = true;
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
    // Forfeit-confirm modal owns the pointer when open.
    if (this.quitConfirmActive) {
      this.handleQuitConfirmPointer(x, y);
      return;
    }
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

  /**
   * Modal hit-test: two buttons centered side by side. Geometry must match
   * HudSystem.drawQuitConfirm so taps line up with the rendered buttons.
   */
  private handleQuitConfirmPointer(x: number, y: number): void {
    const W = GAME_CONFIG.width;
    const H = GAME_CONFIG.height;
    const cx = W / 2;
    const cardH = 240;
    const cardY = (H - cardH) / 2;
    const btnH = 44;
    const btnW = 140;
    const gap = 24;
    const btnY = cardY + cardH - btnH - 20;
    // YES button is left, NO button is right.
    const yesX = cx - btnW - gap / 2;
    const noX = cx + gap / 2;
    if (y >= btnY && y < btnY + btnH) {
      if (x >= yesX && x < yesX + btnW) {
        this.returnToMenu();
        return;
      }
      if (x >= noX && x < noX + btnW) {
        this.quitConfirmActive = false;
        soundSystem.playUiClick();
        this.renderTanksAndHud();
        return;
      }
    }
    // Taps outside the buttons do nothing — modal remains open.
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
      const weaponIndex = this.weaponWindowStart + rowIdx;
      if (weaponIndex >= 0 && weaponIndex < GAME_CONFIG.weapons.length) {
        if (this.tankHasAmmo(activeTank, weaponIndex)) {
          activeTank.selectedWeaponIndex = weaponIndex;
          this.ensureWeaponVisible();
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

    // FINISH button (top-right corner of the panel).
    if (
      x >= SHOP_LAYOUT.finishX &&
      x < SHOP_LAYOUT.finishX + SHOP_LAYOUT.finishW &&
      y >= SHOP_LAYOUT.finishY &&
      y < SHOP_LAYOUT.finishY + SHOP_LAYOUT.finishH
    ) {
      this.commitPendingShop(profile);
      soundSystem.playUiClick();
      this.finishShoppingForCurrentPlayer();
      return;
    }

    // UNDO button (bottom of the left sidebar; only rendered when there's
    // something to undo — but the hitbox is cheap regardless).
    if (
      x >= SHOP_LAYOUT.undoX &&
      x < SHOP_LAYOUT.undoX + SHOP_LAYOUT.undoW &&
      y >= SHOP_LAYOUT.undoY &&
      y < SHOP_LAYOUT.undoY + SHOP_LAYOUT.undoH
    ) {
      if (this.undoLastShopBuy()) {
        soundSystem.playUiClick();
        this.renderAll();
      }
      return;
    }

    // Page navigation buttons
    const pageCount = this.economySystem.pageCount(SHOP_LAYOUT.pageSize);
    if (
      x >= SHOP_LAYOUT.pagePrevX &&
      x < SHOP_LAYOUT.pagePrevX + SHOP_LAYOUT.pageBtnW &&
      y >= SHOP_LAYOUT.pageY &&
      y < SHOP_LAYOUT.pageY + SHOP_LAYOUT.pageBtnH &&
      pageCount > 1
    ) {
      this.shopPage = Math.max(0, this.shopPage - 1);
      this.renderAll();
      return;
    }
    if (
      x >= SHOP_LAYOUT.pageNextX &&
      x < SHOP_LAYOUT.pageNextX + SHOP_LAYOUT.pageBtnW &&
      y >= SHOP_LAYOUT.pageY &&
      y < SHOP_LAYOUT.pageY + SHOP_LAYOUT.pageBtnH &&
      pageCount > 1
    ) {
      this.shopPage = Math.min(pageCount - 1, this.shopPage + 1);
      this.renderAll();
      return;
    }

    // Item rows from visible slice
    const visibleRows = this.economySystem.pageSlice(this.shopPage, SHOP_LAYOUT.pageSize);
    for (let i = 0; i < visibleRows.length; i += 1) {
      const entry = visibleRows[i];
      const rowY = SHOP_LAYOUT.listYStart + i * SHOP_LAYOUT.rowH;
      const inRowYBounds = y >= rowY - 6 && y < rowY + SHOP_LAYOUT.rowH - 4;
      if (!inRowYBounds) continue;

      // Minus button
      if (x >= SHOP_LAYOUT.colMinus && x < SHOP_LAYOUT.colMinus + SHOP_LAYOUT.buttonW) {
        if (this.removeFromCart(entry.key)) {
          soundSystem.playUiClick();
          this.renderAll();
        }
        return;
      }
      // Plus button
      if (x >= SHOP_LAYOUT.colPlus && x < SHOP_LAYOUT.colPlus + SHOP_LAYOUT.buttonW) {
        if (this.tryQueueShopBuy(profile, entry.key)) {
          soundSystem.playUiSelect();
          this.renderAll();
        }
        return;
      }
      // Quick-add for taps on the row's left half (name/price area).
      if (x >= SHOP_LAYOUT.rowClickX && x < SHOP_LAYOUT.colMinus - 4) {
        if (this.tryQueueShopBuy(profile, entry.key)) {
          soundSystem.playUiSelect();
          this.renderAll();
        }
        return;
      }
    }
  }


  /**
   * Decrement the cart count for the given item. Used by the "-" rocker
   * button in the shop overlay. Removes the LAST occurrence of this item
   * from the history so the BACKSPACE undo behavior stays consistent.
   */
  private removeFromCart(key: string): boolean {
    const cur = this.pendingShopBuys[key] ?? 0;
    if (cur <= 0) return false;
    if (cur === 1) delete this.pendingShopBuys[key];
    else this.pendingShopBuys[key] = cur - 1;
    for (let i = this.pendingShopHistory.length - 1; i >= 0; i -= 1) {
      if (this.pendingShopHistory[i] === key) {
        this.pendingShopHistory.splice(i, 1);
        break;
      }
    }
    return true;
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

  private ensureWeaponVisible(): void {
    this.weaponWindowStart = adjustWindow(this.weaponWindowStart, this.tanks[this.turn.activePlayerId].selectedWeaponIndex, GAME_CONFIG.weapons.length);
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
    if (this.isOnlineHost) this.broadcastSnapshot();

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
        if (fall.damage > 0 || fall.usedParachute) {
          soundSystem.playFall();
          const name = this.playerName(fall.tankId);
          const text = fall.usedParachute
            ? `${name} CHUTE DEPLOYED`
            : `${name} FELL · ${fall.damage} DAMAGE`;
          this.topToast = {
            text,
            color: fall.usedParachute ? GAME_CONFIG.colors.yellow : GAME_CONFIG.colors.red,
            expiresAt: Date.now() + 2200
          };
        }
      });
    }
  }

  private endTurn(): void {
    this.activeProjectiles = [];
    this.projectileSystem.drawAll(this.projectileGraphics, []);

    if (this.turnSystem.isRoundOver(this.tanks)) {
      this.resolveRoundEnd(this.turnSystem.findWinner(this.tanks));
      return;
    }

    this.turn.activePlayerId = this.turnSystem.nextActivePlayer(this.turn.activePlayerId, this.tanks);
    this.turn.wind = this.turnSystem.rollWind();
    this.tankSystem.refillMovement(this.tanks[this.turn.activePlayerId]);
    this.ensureSelectableWeapon(this.tanks[this.turn.activePlayerId]);
    this.ensureWeaponVisible();
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
    // Clear expired fall toast before rendering.
    if (this.topToast && Date.now() > this.topToast.expiresAt) {
      this.topToast = null;
    }
    // Host broadcasts a snapshot every time the state would re-render.
    if (this.isOnlineHost) this.broadcastSnapshot();
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
        hasPending: () => Object.keys(this.pendingShopBuys).length > 0,
        effectivePrice: (basePrice, key) => this.effectivePrice(basePrice, key),
        saleItem: () => this.match.currentSale?.itemKey ?? null,
        saleDiscount: () => this.match.currentSale?.discount ?? 0,
        bundleSize: (key) => this.economySystem.bundleSizeFor(key),
        ownedFor: (key) => {
          const id = this.match.shoppingPlayerId;
          return id === null ? 0 : this.economySystem.ownedCount(this.match.profiles[id], key);
        },
        visibleRows: () => this.economySystem.pageSlice(this.shopPage, SHOP_LAYOUT.pageSize),
        pageLabel: () => `PAGE ${this.shopPage + 1}/${this.economySystem.pageCount(SHOP_LAYOUT.pageSize)}`,
        shopPageCount: () => this.economySystem.pageCount(SHOP_LAYOUT.pageSize)
      },
      this.weaponWindowStart,
      this.topToast,
      this.quitConfirmActive
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
