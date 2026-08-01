import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type FallEvent,
  type PlayerId,
  type PlayerProfile,
  type TankState,
  type TerrainData,
  type VisualSystem,
  PHYSICS_DEFAULTS
} from '../types/GameTypes';
import { TerrainSystem } from './TerrainSystem';

export interface PlayerPalette {
  primary: number;
  accent: number;
  dark: number;
}

/**
 * Single source of truth for "what color is player N in visual mode M".
 * Each PlayerId gets its own distinctive palette so identity is consistent
 * across the HUD, the active-turn down arrow, and the tank body itself.
 */
export function getPlayerPalette(id: PlayerId, visualSystem: VisualSystem): PlayerPalette {
  const c = GAME_CONFIG.colors;
  if (visualSystem === 'hiRes') {
    // Hi-res mode has two illustrated tanks; rotate them for ids 2/3.
    return id % 2 === 0
      ? { primary: 0x3f9dff, accent: 0x8ed0ff, dark: 0x0a2b5c }
      : { primary: 0xff7a3c, accent: 0xffc08a, dark: 0x5c1503 };
  }
  if (visualSystem === 'retroPixel') {
    // Retro mode only has two hand-pixeled tanks; rotate them for ids 2/3.
    return id % 2 === 0
      ? { primary: c.retroBlue, accent: 0x7fc4ff, dark: 0x073c86 }
      : { primary: c.retroOrange, accent: 0xff9b53, dark: 0x8f2106 };
  }
  switch (id) {
    case 0:
      return { primary: c.cyan, accent: 0x8effff, dark: 0x0c8c98 };
    case 1:
      return { primary: c.magenta, accent: 0xffa6ff, dark: 0x8c1b8c };
    case 2:
      return { primary: c.green, accent: 0x6cfa6c, dark: 0x0c8c0c };
    case 3:
      return { primary: c.yellow, accent: 0xfff388, dark: 0x8c8c0c };
    default:
      return { primary: c.white, accent: 0xffffff, dark: 0x666666 };
  }
}

export class TankSystem {
  createTanks(
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    profiles: PlayerProfile[]
  ): TankState[] {
    const n = profiles.length;
    const startT = 0.13;
    const endT = 0.87;
    const span = endT - startT;

    return profiles.map((profile, index) => {
      const id = index as PlayerId;
      const t = n === 1 ? 0.5 : startT + (index / (n - 1)) * span;
      const x = terrainData.width * t;
      const palette = getPlayerPalette(id, 'classic');
      // Leftmost half aims right, rightmost half aims left. Middle starts up.
      const initialAngle = t < 0.5 ? 55 : t > 0.5 ? 125 : 90;

      return {
        id,
        x,
        y: terrainSystem.getHeightAtX(terrainData, x) - GAME_CONFIG.tank.placementOffsetY,
        color: palette.primary,
        accentColor: palette.accent,
        label: `PLAYER ${id + 1}`,
        health: GAME_CONFIG.tank.maxHealth,
        angle: initialAngle,
        power: GAME_CONFIG.aiming.initialPower,
        alive: true,
        ammo: { ...profile.ammo },
        selectedWeaponIndex: this.firstAvailableWeapon(profile.ammo),
        moveRemaining: GAME_CONFIG.movement.perTurn,
        parachutes: profile.parachutes,
        defenses: { ...profile.defenses },
        armedShieldId: null,
        armedShieldHp: 0,
        batteries: profile.batteries,
        fuel: profile.fuel,
        contactTriggers: profile.contactTriggers,
        guidance: { ...profile.guidance },
        selectedGuidanceId: null,
        damageDealt: 0
      };
    });
  }

  private firstAvailableWeapon(ammo: Record<string, number>): number {
    for (let i = 0; i < GAME_CONFIG.weapons.length; i += 1) {
      const w = GAME_CONFIG.weapons[i];
      const count = ammo[w.id];
      if (count === -1 || count > 0) return i;
    }
    return 0;
  }

  refillMovement(tank: TankState): void {
    tank.moveRemaining = GAME_CONFIG.movement.perTurn;
  }

  moveTank(
    tank: TankState,
    direction: -1 | 1,
    deltaSeconds: number,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    otherTanks: TankState[]
  ): boolean {
    const budget = tank.moveRemaining + tank.fuel;
    if (budget <= 0) return false;

    const stepDistance = Math.min(
      budget,
      GAME_CONFIG.movement.speedPxPerSec * deltaSeconds
    );
    if (stepDistance <= 0.01) return false;

    const minX = 12;
    const maxX = terrainData.width - 12;
    let targetX = tank.x + direction * stepDistance;
    targetX = Phaser.Math.Clamp(targetX, minX, maxX);

    // Keep at least minTankSeparation from every other alive tank.
    const minSep = GAME_CONFIG.movement.minTankSeparation;
    otherTanks.forEach((other) => {
      if (!other.alive || other.id === tank.id) return;
      if (direction === 1 && other.x > tank.x) {
        targetX = Math.min(targetX, other.x - minSep);
      } else if (direction === -1 && other.x < tank.x) {
        targetX = Math.max(targetX, other.x + minSep);
      }
    });

    const actualStep = Math.abs(targetX - tank.x);
    if (actualStep <= 0.01) return false;

    tank.x = targetX;
    tank.y = terrainSystem.getHeightAtX(terrainData, tank.x) - GAME_CONFIG.tank.placementOffsetY;

    // Deduct from moveRemaining first, overflow from fuel
    if (actualStep <= tank.moveRemaining) {
      tank.moveRemaining -= actualStep;
    } else {
      const overflow = actualStep - tank.moveRemaining;
      tank.moveRemaining = 0;
      tank.fuel = Math.max(0, tank.fuel - overflow);
    }

    return true;
  }

  settleTanksAfterTerrainChange(
    tanks: TankState[],
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    tanksFall: boolean = PHYSICS_DEFAULTS.tanksFall
  ): FallEvent[] {
    const events: FallEvent[] = [];

    tanks.forEach((tank) => {
      if (!tank.alive) return;

      // Single-sample at tank.x. Previous multi-sample max-y logic was
      // wrong physics (tank "fell" to the deepest dip in its footprint),
      // and it produced phantom falls on the first impact from natural
      // terrain shape rather than actual destruction.
      const groundY = terrainSystem.getHeightAtX(terrainData, tank.x) - GAME_CONFIG.tank.placementOffsetY;
      const fallDistance = groundY - tank.y;

      // Snap tank to ground
      tank.y = groundY;

      // Only process fall events if tanksFall is enabled
      if (!tanksFall) return;

      if (fallDistance > GAME_CONFIG.fall.threshold) {
        // SE parachute logic: only deploy on falls that would cause damage
        if (fallDistance <= GAME_CONFIG.fall.safeDistance) {
          // Harmless drop band - no damage, no parachute, no event
        } else if (tank.parachutes > 0) {
          // Fall exceeds safe distance and parachutes available - deploy
          tank.parachutes -= 1;
          events.push({ tankId: tank.id, distance: fallDistance, damage: 0, usedParachute: true });
        } else {
          // Fall exceeds safe distance and no parachutes - take damage
          const damage = Math.min(
            GAME_CONFIG.fall.maxDamage,
            Math.round(fallDistance * GAME_CONFIG.fall.damagePerPixel)
          );
          this.applyDamage(tank, damage);
          events.push({ tankId: tank.id, distance: fallDistance, damage, usedParachute: false });
        }
      }
    });

    return events;
  }

  draw(
    graphics: Phaser.GameObjects.Graphics,
    tanks: TankState[],
    activePlayerId: PlayerId,
    visualSystem: VisualSystem = 'classic'
  ): void {
    graphics.clear();

    tanks.forEach((tank) => {
      if (!tank.alive) return;
      const palette = getPlayerPalette(tank.id, visualSystem);

      // Bananas interim: classic vector tanks until the ape figures land in
      // slice C. retroPixel/hiRes draw sprite bodies + procedural barrels.
      if (visualSystem === 'retroPixel' || visualSystem === 'hiRes') {
        this.drawRetroPixelTank(graphics, tank, tank.id === activePlayerId, palette, visualSystem);
        return;
      }

      const isActive = tank.id === activePlayerId;
      const bodyX = tank.x - GAME_CONFIG.tank.width / 2;
      const bodyY = tank.y - GAME_CONFIG.tank.height;
      const turretStart = this.getTurretStart(tank);
      const turretTip = this.getTurretTip(tank);

      graphics.fillStyle(palette.primary, 1);
      graphics.fillRect(bodyX, bodyY, GAME_CONFIG.tank.width, GAME_CONFIG.tank.height);
      graphics.fillStyle(palette.accent, 1);
      graphics.fillRect(tank.x - 9, bodyY - 5, 18, 5);
      graphics.lineStyle(4, palette.primary, 1);
      graphics.beginPath();
      graphics.moveTo(turretStart.x, turretStart.y);
      graphics.lineTo(turretTip.x, turretTip.y);
      graphics.strokePath();
      graphics.lineStyle(1, GAME_CONFIG.colors.black, 1);
      graphics.strokeRect(bodyX + 4, bodyY + 4, GAME_CONFIG.tank.width - 8, 4);

      // Faint cyan dome above the tank while shields are armed — the at-a-glance
      // "I'm protected" cue. Armed shield HP still lives in the status panel.
      if (tank.armedShieldHp > 0) {
        graphics.lineStyle(2, GAME_CONFIG.colors.cyan, 0.55);
        graphics.beginPath();
        graphics.arc(tank.x, tank.y - GAME_CONFIG.tank.height / 2, GAME_CONFIG.tank.hitRadius + 4, Math.PI, 0);
        graphics.strokePath();
      }

      // Active-player indicator: filled down-arrow above the tank in the
      // player's own palette color so it doubles as identity at a glance.
      // Sits well above the tank (and above the shield dome arc when present)
      // for clear separation.
      if (isActive) {
        const tipX = tank.x;
        const tipY = bodyY - 16;
        const baseY = bodyY - 34;
        graphics.fillStyle(palette.primary, 1);
        graphics.beginPath();
        graphics.moveTo(tipX, tipY);
        graphics.lineTo(tipX - 8, baseY);
        graphics.lineTo(tipX + 8, baseY);
        graphics.closePath();
        graphics.fillPath();
        graphics.lineStyle(2, GAME_CONFIG.colors.white, 1);
        graphics.strokeTriangle(tipX, tipY, tipX - 8, baseY, tipX + 8, baseY);
      }
    });
  }

  private drawRetroPixelTank(
    graphics: Phaser.GameObjects.Graphics,
    tank: TankState,
    isActive: boolean,
    palette: PlayerPalette,
    visualSystem: VisualSystem = 'retroPixel'
  ): void {
    // The tank BODY is now rendered by a sprite Image game object (placed by
    // GameScene), so this routine only draws the active-player marker, the
    // aim turret/gun, and the parachute pip on top of the sprite.
    const colors = GAME_CONFIG.colors;
    const baseColor = palette.primary;
    const lightColor = palette.accent;
    const bodyY = Math.round(tank.y - 32);
    const turretStart = this.getTurretStart(tank);
    const turretTip = this.getTurretTip(tank);

    if (isActive) {
      const markerX = Math.round(tank.x);
      const markerY = Math.round(bodyY - 18);
      graphics.fillStyle(baseColor, 1);
      graphics.beginPath();
      graphics.moveTo(markerX, markerY);
      graphics.lineTo(markerX - 8, markerY - 16);
      graphics.lineTo(markerX + 8, markerY - 16);
      graphics.closePath();
      graphics.fillPath();
      graphics.lineStyle(2, colors.white, 1);
      graphics.strokeTriangle(markerX, markerY, markerX - 8, markerY - 16, markerX + 8, markerY - 16);
    }

    // In hiRes, barrels are sprite Images; in retroPixel, stroked lines.
    if (visualSystem === 'retroPixel') {
      graphics.lineStyle(4, baseColor, 1);
      graphics.beginPath();
      graphics.moveTo(turretStart.x, turretStart.y);
      graphics.lineTo(turretTip.x, turretTip.y);
      graphics.strokePath();
      graphics.lineStyle(2, lightColor, 1);
      graphics.beginPath();
      graphics.moveTo(turretStart.x, turretStart.y - 1);
      graphics.lineTo(turretTip.x, turretTip.y - 1);
      graphics.strokePath();
    }

    // In retroPixel, parachutes are a 5x5 pip; in hiRes, sprite indicator.
    if (visualSystem === 'retroPixel' && tank.parachutes > 0) {
      graphics.fillStyle(colors.yellow, 1);
      graphics.fillRect(Math.round(tank.x) - 26, bodyY + 8, 5, 5);
    }
  }

  getTurretStart(tank: TankState): { x: number; y: number } {
    return {
      x: tank.x,
      y: tank.y - GAME_CONFIG.tank.barrelInsetY
    };
  }

  getTurretTip(tank: TankState): { x: number; y: number } {
    const start = this.getTurretStart(tank);
    const radians = Phaser.Math.DegToRad(tank.angle);

    return {
      x: start.x + Math.cos(radians) * GAME_CONFIG.tank.turretLength,
      y: start.y - Math.sin(radians) * GAME_CONFIG.tank.turretLength
    };
  }

  findHitTank(tanks: TankState[], projectileX: number, projectileY: number, _ownerId: PlayerId): TankState | null {
    // Self-damage is allowed — if a shot arcs back down onto the shooter, it
    // hits. The turret tip launch position is already well outside the hit
    // radius so the projectile doesn't auto-collide on spawn.
    return (
      tanks.find((tank) => {
        if (!tank.alive) return false;
        return Phaser.Math.Distance.Between(projectileX, projectileY, tank.x, tank.y - GAME_CONFIG.tank.height / 2) <= GAME_CONFIG.tank.hitRadius;
      }) ?? null
    );
  }

  applyDamage(tank: TankState, damage: number): void {
    tank.health = Math.max(0, tank.health - damage);
    tank.alive = tank.health > 0;
  }
}
