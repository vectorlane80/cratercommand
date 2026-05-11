import Phaser from 'phaser';
import { HudSystem } from '../systems/HudSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TankSystem } from '../systems/TankSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { TurnSystem } from '../systems/TurnSystem';
import {
  GAME_CONFIG,
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

export class GameScene extends Phaser.Scene {
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private tankGraphics!: Phaser.GameObjects.Graphics;
  private projectileGraphics!: Phaser.GameObjects.Graphics;

  private terrainSystem!: TerrainSystem;
  private tankSystem!: TankSystem;
  private projectileSystem!: ProjectileSystem;
  private turnSystem!: TurnSystem;
  private hudSystem!: HudSystem;

  private terrainData!: TerrainData;
  private tanks: TankState[] = [];
  private turn!: TurnState;
  private match!: MatchState;
  private activeProjectiles: ProjectileState[] = [];
  private statusMessage: string | null = null;
  private visualSystem: VisualSystem = GAME_CONFIG.visuals.defaultSystem;
  private visualToggleButton: HTMLButtonElement | null = null;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private moveLeftKey!: Phaser.Input.Keyboard.Key;
  private moveRightKey!: Phaser.Input.Keyboard.Key;
  private parachuteBuyKey!: Phaser.Input.Keyboard.Key;
  private visualToggleKey!: Phaser.Input.Keyboard.Key;
  private weaponKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    this.backgroundGraphics = this.add.graphics();
    this.terrainGraphics = this.add.graphics();
    this.tankGraphics = this.add.graphics();
    this.projectileGraphics = this.add.graphics();

    this.terrainSystem = new TerrainSystem();
    this.tankSystem = new TankSystem();
    this.projectileSystem = new ProjectileSystem();
    this.turnSystem = new TurnSystem();
    this.hudSystem = new HudSystem(this);

    this.match = this.turnSystem.createMatchState();
    this.beginRound(0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.moveLeftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.moveRightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.parachuteBuyKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.visualToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.V);
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
      Phaser.Input.Keyboard.KeyCodes.V,
      ...numberKeyCodes
    ]);
    this.input.keyboard!.on('keydown-V', () => {
      this.toggleVisualSystem();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= GAME_CONFIG.layout.bottomStatusTop - 8 && pointer.x >= 680) {
        this.toggleVisualSystem();
      }
    });
    this.visualToggleButton = document.querySelector<HTMLButtonElement>('#visual-toggle');
    if (this.visualToggleButton) {
      this.visualToggleButton.onclick = () => this.toggleVisualSystem();
      this.syncVisualToggleButton();
    }
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.renderAll();
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.visualToggleKey)) {
      this.toggleVisualSystem();
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
      const changed = this.handleShoppingInput();
      if (changed) this.renderAll();
      return;
    }

    if (this.turn.phase === 'aiming') {
      const moved = this.handleMovementInput(delta);
      const changed = this.handleAimingInput();
      const switched = this.handleWeaponSelection();

      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.fireActiveWeapon();
        return;
      }

      if (moved || changed || switched) {
        this.renderTanksAndHud();
      }
      return;
    }

    if (this.turn.phase === 'projectileInFlight') {
      this.tickProjectiles(delta);
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
    } else {
      this.turn.phase = 'roundOver';
      this.statusMessage = `PLAYER ${winnerId + 1} WINS ROUND ${this.match.round}`;
    }

    this.renderAll();
  }

  private enterShoppingPhase(): void {
    const winnerId = this.turn.winnerId ?? 0;
    this.match.shoppingPlayerId = winnerId;
    this.match.shopVisitsRemaining = 2;
    this.turn.phase = 'shopping';
    this.statusMessage = null;
    this.renderAll();
  }

  private finishShoppingForCurrentPlayer(): void {
    this.match.shopVisitsRemaining -= 1;
    if (this.match.shopVisitsRemaining <= 0) {
      this.match.shoppingPlayerId = null;
      this.match.round += 1;
      const nextStarter: PlayerId = this.turn.winnerId === 0 ? 1 : 0;
      this.beginRound(nextStarter);
      return;
    }
    this.match.shoppingPlayerId = (this.match.shoppingPlayerId === 0 ? 1 : 0) as PlayerId;
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
    const other = this.tanks[activeTank.id === 0 ? 1 : 0];
    const deltaSeconds = delta / 1000;
    let moved = false;

    if (this.moveLeftKey.isDown) {
      if (this.tankSystem.moveTank(activeTank, -1, deltaSeconds, this.terrainSystem, this.terrainData, other)) {
        moved = true;
      }
    }
    if (this.moveRightKey.isDown) {
      if (this.tankSystem.moveTank(activeTank, 1, deltaSeconds, this.terrainSystem, this.terrainData, other)) {
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
        if (weapon.price > 0 && profile.cash >= weapon.price) {
          profile.cash -= weapon.price;
          if (profile.ammo[weapon.id] === -1) profile.ammo[weapon.id] = 0;
          profile.ammo[weapon.id] += 1;
          changed = true;
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.parachuteBuyKey)) {
      const price = GAME_CONFIG.match.parachutePrice;
      if (profile.cash >= price) {
        profile.cash -= price;
        profile.parachutes += 1;
        changed = true;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.finishShoppingForCurrentPlayer();
      return true;
    }

    return changed;
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
      const damageDealt = Math.min(weapon.damage, target.health);
      this.tankSystem.applyDamage(target, weapon.damage);
      shooter.damageDealt += damageDealt;
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
    this.renderTanksAndHud();
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);
  }

  private renderTanksAndHud(): void {
    this.tankSystem.draw(this.tankGraphics, this.tanks, this.turn.activePlayerId, this.visualSystem);
    this.hudSystem.render(
      this.turn,
      this.tanks,
      this.activeWeapon(),
      this.match,
      this.statusMessage,
      this.visualSystem
    );
  }

  private toggleVisualSystem(): void {
    this.visualSystem = this.visualSystem === 'classic' ? 'retroPixel' : 'classic';
    this.syncVisualToggleButton();
    this.renderAll();
  }

  private syncVisualToggleButton(): void {
    if (!this.visualToggleButton) return;
    this.visualToggleButton.textContent = `Visual: ${GAME_CONFIG.visuals.systems[this.visualSystem].label}`;
  }

  private drawRetroBattlefieldBackground(): void {
    const colors = GAME_CONFIG.colors;
    const battlefieldHeight = GAME_CONFIG.layout.battlefieldHeight;

    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(colors.black, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    if (this.visualSystem === 'retroPixel') {
      this.drawRetroPixelBattlefieldBackground();
      return;
    }

    this.backgroundGraphics.fillStyle(colors.purple, 0.45);
    for (let y = 166; y < 260; y += 8) {
      for (let x = (y / 2) % 10; x < GAME_CONFIG.width; x += 10) {
        this.backgroundGraphics.fillRect(x, y, 2, 2);
      }
    }

    this.backgroundGraphics.fillStyle(colors.red, 0.7);
    for (let y = 246; y < battlefieldHeight; y += 6) {
      for (let x = (y * 3) % 14; x < GAME_CONFIG.width; x += 14) {
        this.backgroundGraphics.fillRect(x, y, 3, 2);
      }
    }

    this.backgroundGraphics.fillStyle(colors.blue, 0.8);
    this.backgroundGraphics.fillRect(352, 318, 208, 48);
    this.backgroundGraphics.fillStyle(0x508bff, 0.9);
    for (let x = 356; x < 556; x += 9) {
      this.backgroundGraphics.fillRect(x, 318 + ((x / 9) % 2), 5, 3);
    }

    this.backgroundGraphics.lineStyle(2, colors.white, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.lineTo(GAME_CONFIG.width, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.strokePath();
  }

  private drawRetroPixelBattlefieldBackground(): void {
    const colors = GAME_CONFIG.colors;
    const width = GAME_CONFIG.width;
    const height = GAME_CONFIG.layout.battlefieldHeight;

    const bands = [
      colors.black,
      0x05061a,
      colors.sunsetPurple,
      0x4b1952,
      colors.sunsetRed,
      colors.sunsetOrange,
      colors.sunsetYellow
    ];
    const bandHeight = Math.ceil(height / bands.length);
    bands.forEach((color, index) => {
      this.backgroundGraphics.fillStyle(color, 1);
      this.backgroundGraphics.fillRect(0, index * bandHeight, width, bandHeight + 1);
    });

    this.backgroundGraphics.fillStyle(colors.sunsetYellow, 1);
    this.backgroundGraphics.fillCircle(width / 2, 292, 18);

    this.drawMountainLayer(0x1b1644, 248, 0.55, 36, 7);
    this.drawMountainLayer(0x39205b, 278, 0.65, 42, 11);
    this.drawMountainLayer(0x5a2544, 306, 0.75, 48, 17);

    this.backgroundGraphics.fillStyle(0x2b7bff, 0.75);
    this.backgroundGraphics.fillRect(438, 332, 116, 26);
    this.backgroundGraphics.fillStyle(0x62b7ff, 0.9);
    for (let x = 442; x < 552; x += 8) {
      this.backgroundGraphics.fillRect(x, 333 + ((x / 8) % 2), 6, 2);
    }

    this.backgroundGraphics.fillStyle(colors.retroBlue, 0.9);
    for (let i = 0; i < 62; i += 1) {
      const x = (i * 73) % width;
      const y = 18 + ((i * 41) % 92);
      const size = i % 11 === 0 ? 3 : 2;
      this.backgroundGraphics.fillRect(x, y, size, size);
      if (i % 17 === 0) {
        this.backgroundGraphics.fillRect(x - 3, y + 1, size + 6, 1);
        this.backgroundGraphics.fillRect(x + 1, y - 3, 1, size + 6);
      }
    }

    this.backgroundGraphics.lineStyle(2, colors.steelLight, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.lineTo(width, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.strokePath();
  }

  private drawMountainLayer(color: number, baseY: number, alpha: number, amplitude: number, seed: number): void {
    this.backgroundGraphics.fillStyle(color, alpha);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, GAME_CONFIG.layout.battlefieldHeight);
    for (let x = 0; x <= GAME_CONFIG.width; x += 24) {
      const wave =
        Math.sin((x + seed * 11) / 52) * amplitude +
        Math.sin((x + seed * 29) / 29) * amplitude * 0.36;
      this.backgroundGraphics.lineTo(x, baseY + wave);
    }
    this.backgroundGraphics.lineTo(GAME_CONFIG.width, GAME_CONFIG.layout.battlefieldHeight);
    this.backgroundGraphics.closePath();
    this.backgroundGraphics.fillPath();
  }
}
