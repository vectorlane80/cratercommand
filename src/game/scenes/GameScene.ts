import Phaser from 'phaser';
import { HudSystem } from '../systems/HudSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TankSystem } from '../systems/TankSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { TurnSystem } from '../systems/TurnSystem';
import {
  GAME_CONFIG,
  type ImpactResult,
  type ProjectileState,
  type TankState,
  type TerrainData,
  type TurnState,
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
  private activeProjectiles: ProjectileState[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
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

    this.turn = this.turnSystem.createInitialState();
    this.terrainData = this.terrainSystem.generate(this.scale.width, GAME_CONFIG.layout.battlefieldHeight);
    this.tanks = this.tankSystem.createTanks(this.terrainSystem, this.terrainData);
    this.ensureSelectableWeapon(this.tanks[this.turn.activePlayerId]);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
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
      ...numberKeyCodes
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.renderAll();
  }

  update(_time: number, delta: number): void {
    if (this.turn.phase === 'gameOver') {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
        this.scene.restart();
      }
      return;
    }

    if (this.turn.phase === 'aiming') {
      const changed = this.handleAimingInput();
      const switched = this.handleWeaponSelection();
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.fireActiveWeapon();
        return;
      }

      if (changed || switched) {
        this.renderTanksAndHud();
      }
      return;
    }

    if (this.turn.phase === 'projectileInFlight') {
      this.tickProjectiles(delta);
    }
  }

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
    if (!this.tankHasAmmo(activeTank, activeTank.selectedWeaponIndex)) {
      return;
    }

    if (activeTank.ammo[weapon.id] !== -1) {
      activeTank.ammo[weapon.id] -= 1;
    }

    this.activeProjectiles = this.projectileSystem.launch(activeTank, weapon, this.tankSystem);
    this.turn.phase = 'projectileInFlight';
    this.renderTanksAndHud();
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);
  }

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

      if (tick.spawned.length) {
        spawnedThisFrame.push(...tick.spawned);
      }

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

    if (impact.kind === 'terrain' || impact.kind === 'tank') {
      if (weapon.behavior === 'dirt') {
        const radius = weapon.moundRadius ?? weapon.craterRadius ?? 30;
        this.terrainSystem.applyMound(this.terrainData, impact.x, impact.y, radius);
      } else if (weapon.craterRadius > 0) {
        this.terrainSystem.applyCrater(this.terrainData, impact.x, impact.y, weapon.craterRadius);
      }
    }

    if (impact.kind === 'tank' && impact.targetTankId !== undefined && weapon.damage > 0) {
      this.tankSystem.applyDamage(this.tanks[impact.targetTankId], weapon.damage);
    }
  }

  private endTurn(): void {
    this.activeProjectiles = [];
    this.projectileSystem.drawAll(this.projectileGraphics, []);
    this.tankSystem.updateTerrainPositions(this.tanks, this.terrainSystem, this.terrainData);

    const winnerId = this.turnSystem.findWinner(this.tanks);
    if (winnerId !== null) {
      this.turn.phase = 'gameOver';
      this.turn.winnerId = winnerId;
    } else {
      this.turn.activePlayerId = this.turnSystem.nextActivePlayer(this.turn.activePlayerId, this.tanks);
      this.turn.wind = this.turnSystem.rollWind();
      this.ensureSelectableWeapon(this.tanks[this.turn.activePlayerId]);
      this.turn.phase = 'aiming';
    }

    this.renderAll();
  }

  private renderAll(): void {
    this.drawRetroBattlefieldBackground();
    this.terrainSystem.draw(this.terrainGraphics, this.terrainData);
    this.renderTanksAndHud();
    this.projectileSystem.drawAll(this.projectileGraphics, this.activeProjectiles);
  }

  private renderTanksAndHud(): void {
    this.tankSystem.draw(this.tankGraphics, this.tanks, this.turn.activePlayerId);
    this.hudSystem.render(this.turn, this.tanks, this.activeWeapon());
  }

  private drawRetroBattlefieldBackground(): void {
    const colors = GAME_CONFIG.colors;
    const battlefieldHeight = GAME_CONFIG.layout.battlefieldHeight;

    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(colors.black, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

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
}
