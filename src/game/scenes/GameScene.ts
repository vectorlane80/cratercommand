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
    this.renderAll();
  }

  private drawRetroBattlefieldBackground(): void {
    const colors = GAME_CONFIG.colors;

    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillStyle(colors.black, 1);
    this.backgroundGraphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    if (this.visualSystem === 'retroPixel') {
      this.drawRetroPixelBattlefieldBackground();
      return;
    }

    // Classic: black sky with a faint deterministic starfield.
    this.backgroundGraphics.fillStyle(colors.white, 0.45);
    const starSeed = 1337;
    for (let i = 0; i < 60; i += 1) {
      const px = (i * 73 + starSeed) % GAME_CONFIG.width;
      const py = ((i * 41 + starSeed) % 150) + 12;
      this.backgroundGraphics.fillRect(px, py, 1, 1);
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

    // Smooth sunset gradient: interpolate per-row between color stops.
    const stops: Array<{ y: number; color: number }> = [
      { y: 0, color: 0x0a0820 },
      { y: 72, color: 0x2a1148 },
      { y: 140, color: 0x5e1c5a },
      { y: 198, color: 0x9d2848 },
      { y: 248, color: 0xd14d2a },
      { y: 290, color: 0xf28d1a },
      { y: 326, color: 0xffd15c },
      { y: height, color: 0xfdba3a }
    ];
    for (let y = 0; y < height; y += 1) {
      const color = sampleGradient(stops, y);
      this.backgroundGraphics.fillStyle(color, 1);
      this.backgroundGraphics.fillRect(0, y, width, 1);
    }

    // Sparse starfield in the upper sky.
    this.backgroundGraphics.fillStyle(colors.white, 0.9);
    for (let i = 0; i < 38; i += 1) {
      const x = (i * 173 + 91) % width;
      const y = ((i * 47 + 23) % 110) + 8;
      const size = i % 9 === 0 ? 2 : 1;
      this.backgroundGraphics.fillRect(x, y, size, size);
    }

    // Synthwave sun: yellow disc with horizontal dark cuts on the lower half.
    const sunX = width / 2;
    const sunY = 298;
    const sunR = 26;
    this.backgroundGraphics.fillStyle(0xffe06a, 1);
    this.backgroundGraphics.fillCircle(sunX, sunY, sunR);
    this.backgroundGraphics.fillStyle(0xffb347, 1);
    this.backgroundGraphics.fillCircle(sunX, sunY + 4, sunR - 6);
    // dark cuts
    this.backgroundGraphics.fillStyle(0x8a2a26, 1);
    for (let i = 0; i < 5; i += 1) {
      const cutY = sunY + 4 + i * 4;
      const cutHalfWidth = Math.sqrt(Math.max(0, sunR * sunR - (cutY - sunY) * (cutY - sunY))) - 1;
      if (cutHalfWidth <= 0) continue;
      this.backgroundGraphics.fillRect(sunX - cutHalfWidth, cutY, cutHalfWidth * 2, 2);
    }

    // Mountain silhouettes (back to front, darkest to lightest).
    this.drawMountainLayer(0x1c1438, 232, 0.95, 40, 9, 7);
    this.drawMountainLayer(0x2d1d4a, 264, 0.95, 36, 11, 14);
    this.drawMountainLayer(0x4a2152, 296, 0.95, 30, 13, 22);

    this.backgroundGraphics.lineStyle(2, colors.steelLight, 1);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(0, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.lineTo(width, GAME_CONFIG.layout.consoleTop - 2);
    this.backgroundGraphics.strokePath();
  }

  /**
   * Sharp triangular mountain range. Peaks are placed deterministically from
   * the seed so the silhouette is stable per layer, and each layer offsets
   * its peaks to break up the overlap.
   */
  private drawMountainLayer(
    color: number,
    baseY: number,
    alpha: number,
    amplitude: number,
    peakCount: number,
    seed: number
  ): void {
    const width = GAME_CONFIG.width;
    const battlefieldBottom = GAME_CONFIG.layout.battlefieldHeight;
    const peakSpacing = width / peakCount;

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= peakCount; i += 1) {
      const jitter = ((i * 919 + seed * 71) % 41) - 20;
      const peakHeightVariance = ((i * 313 + seed * 53) % amplitude) - amplitude * 0.25;
      points.push({
        x: i * peakSpacing + jitter,
        y: baseY - amplitude + peakHeightVariance
      });
    }

    this.backgroundGraphics.fillStyle(color, alpha);
    this.backgroundGraphics.beginPath();
    this.backgroundGraphics.moveTo(-12, battlefieldBottom);
    for (let i = 0; i < points.length; i += 1) {
      const peak = points[i];
      if (i > 0) {
        // Valley between peaks at the layer's base elevation.
        const prev = points[i - 1];
        const valleyX = (prev.x + peak.x) / 2;
        const valleyDip = ((i * 199 + seed * 37) % 8) + 2;
        this.backgroundGraphics.lineTo(valleyX, baseY + valleyDip);
      }
      this.backgroundGraphics.lineTo(peak.x, peak.y);
    }
    this.backgroundGraphics.lineTo(width + 12, battlefieldBottom);
    this.backgroundGraphics.closePath();
    this.backgroundGraphics.fillPath();
  }
}

/**
 * Linear-interpolate between adjacent color stops sorted by y. Returns a
 * packed 24-bit RGB int suitable for Phaser fillStyle.
 */
function sampleGradient(stops: Array<{ y: number; color: number }>, y: number): number {
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      const ar = (a.color >> 16) & 0xff;
      const ag = (a.color >> 8) & 0xff;
      const ab = a.color & 0xff;
      const br = (b.color >> 16) & 0xff;
      const bg = (b.color >> 8) & 0xff;
      const bb = b.color & 0xff;
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      return (r << 16) | (g << 8) | bl;
    }
  }
  return stops[stops.length - 1].color;
}
