import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type FallEvent,
  type PlayerId,
  type PlayerProfile,
  type TankState,
  type TerrainData,
  type VisualSystem
} from '../types/GameTypes';
import { TerrainSystem } from './TerrainSystem';

export interface PlayerPalette {
  primary: number;
  accent: number;
  dark: number;
}

/**
 * Single source of truth for "what color is player N in visual mode M".
 * P1 is always the cool color, P2 is always the warm color. The hue family
 * changes with the visual system, but the player identity does not swap.
 */
export function getPlayerPalette(id: PlayerId, visualSystem: VisualSystem): PlayerPalette {
  const c = GAME_CONFIG.colors;
  if (visualSystem === 'retroPixel') {
    return id === 0
      ? { primary: c.retroBlue, accent: 0x7fc4ff, dark: 0x073c86 }
      : { primary: c.retroOrange, accent: 0xff9b53, dark: 0x8f2106 };
  }
  return id === 0
    ? { primary: c.cyan, accent: 0x8effff, dark: 0x0c8c98 }
    : { primary: c.magenta, accent: 0xffa6ff, dark: 0x8c1b8c };
}

export class TankSystem {
  createTanks(
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    profiles: [PlayerProfile, PlayerProfile]
  ): TankState[] {
    const tankXs = [terrainData.width * 0.16, terrainData.width * 0.86];

    return tankXs.map((x, index) => {
      const id = index as PlayerId;
      const profile = profiles[id];

      return {
        id,
        x,
        y: terrainSystem.getHeightAtX(terrainData, x) - GAME_CONFIG.tank.placementOffsetY,
        color: id === 0 ? GAME_CONFIG.colors.cyan : GAME_CONFIG.colors.magenta,
        accentColor: id === 0 ? 0x8effff : 0xffa6ff,
        label: id === 0 ? 'PLAYER 1' : 'PLAYER 2',
        health: GAME_CONFIG.tank.maxHealth,
        angle: GAME_CONFIG.aiming.initialAngles[id],
        power: GAME_CONFIG.aiming.initialPower,
        alive: true,
        ammo: { ...profile.ammo },
        selectedWeaponIndex: this.firstAvailableWeapon(profile.ammo),
        moveRemaining: GAME_CONFIG.movement.perTurn,
        parachutes: profile.parachutes,
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
    otherTank: TankState
  ): boolean {
    if (tank.moveRemaining <= 0) return false;

    const stepDistance = Math.min(
      tank.moveRemaining,
      GAME_CONFIG.movement.speedPxPerSec * deltaSeconds
    );
    if (stepDistance <= 0.01) return false;

    const minX = 12;
    const maxX = terrainData.width - 12;
    let targetX = tank.x + direction * stepDistance;
    targetX = Phaser.Math.Clamp(targetX, minX, maxX);

    if (otherTank.alive) {
      const minSep = GAME_CONFIG.movement.minTankSeparation;
      if (direction === 1 && otherTank.x > tank.x) {
        targetX = Math.min(targetX, otherTank.x - minSep);
      } else if (direction === -1 && otherTank.x < tank.x) {
        targetX = Math.max(targetX, otherTank.x + minSep);
      }
    }

    const actualStep = Math.abs(targetX - tank.x);
    if (actualStep <= 0.01) return false;

    tank.x = targetX;
    tank.y = terrainSystem.getHeightAtX(terrainData, tank.x) - GAME_CONFIG.tank.placementOffsetY;
    tank.moveRemaining = Math.max(0, tank.moveRemaining - actualStep);

    return true;
  }

  settleTanksAfterTerrainChange(
    tanks: TankState[],
    terrainSystem: TerrainSystem,
    terrainData: TerrainData
  ): FallEvent[] {
    const events: FallEvent[] = [];

    tanks.forEach((tank) => {
      if (!tank.alive) return;

      const groundY = terrainSystem.getHeightAtX(terrainData, tank.x) - GAME_CONFIG.tank.placementOffsetY;
      const fallDistance = groundY - tank.y;

      if (fallDistance > GAME_CONFIG.fall.threshold) {
        let damage = 0;
        let usedParachute = false;

        if (tank.parachutes > 0) {
          tank.parachutes -= 1;
          usedParachute = true;
        } else {
          damage = Math.min(
            GAME_CONFIG.fall.maxDamage,
            Math.round(fallDistance * GAME_CONFIG.fall.damagePerPixel)
          );
          this.applyDamage(tank, damage);
        }

        events.push({ tankId: tank.id, distance: fallDistance, damage, usedParachute });
      }

      tank.y = groundY;
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

      if (visualSystem === 'retroPixel') {
        this.drawRetroPixelTank(graphics, tank, tank.id === activePlayerId, palette);
        return;
      }

      const isActive = tank.id === activePlayerId;
      const bodyX = tank.x - GAME_CONFIG.tank.width / 2;
      const bodyY = tank.y - GAME_CONFIG.tank.height;
      const turretStart = this.getTurretStart(tank);
      const turretTip = this.getTurretTip(tank);

      if (isActive) {
        graphics.lineStyle(2, GAME_CONFIG.colors.white, 1);
        graphics.strokeRect(bodyX - 4, bodyY - 5, GAME_CONFIG.tank.width + 8, GAME_CONFIG.tank.height + 7);
      }

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

      if (tank.parachutes > 0) {
        graphics.fillStyle(GAME_CONFIG.colors.yellow, 1);
        graphics.fillRect(bodyX - 8, bodyY - 9, 4, 4);
      }
    });
  }

  private drawRetroPixelTank(
    graphics: Phaser.GameObjects.Graphics,
    tank: TankState,
    isActive: boolean,
    palette: PlayerPalette
  ): void {
    const colors = GAME_CONFIG.colors;
    const facing = tank.id === 0 ? 1 : -1;
    const baseColor = palette.primary;
    const darkColor = palette.dark;
    const lightColor = palette.accent;
    const bodyX = Math.round(tank.x - 20);
    const bodyY = Math.round(tank.y - 19);
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

    graphics.fillStyle(darkColor, 1);
    graphics.fillRect(bodyX + 2, bodyY + 16, 38, 8);
    graphics.fillStyle(baseColor, 1);
    graphics.fillRect(bodyX + 7, bodyY + 7, 28, 10);
    graphics.fillRect(bodyX + 13, bodyY + 1, 14, 8);
    graphics.fillStyle(lightColor, 1);
    graphics.fillRect(bodyX + 10, bodyY + 9, 20, 3);
    graphics.fillStyle(colors.black, 1);
    for (let i = 0; i < 5; i += 1) {
      graphics.fillRect(bodyX + 6 + i * 7, bodyY + 18, 4, 4);
    }

    graphics.lineStyle(4, baseColor, 1);
    graphics.beginPath();
    graphics.moveTo(turretStart.x, turretStart.y);
    graphics.lineTo(turretTip.x, turretTip.y);
    graphics.strokePath();
    graphics.lineStyle(2, lightColor, 1);
    graphics.beginPath();
    graphics.moveTo(turretStart.x + facing * 1, turretStart.y - 1);
    graphics.lineTo(turretTip.x, turretTip.y - 1);
    graphics.strokePath();

    if (tank.parachutes > 0) {
      graphics.fillStyle(colors.yellow, 1);
      graphics.fillRect(bodyX - 8, bodyY + 2, 5, 5);
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

  findHitTank(tanks: TankState[], projectileX: number, projectileY: number, ownerId: PlayerId): TankState | null {
    return (
      tanks.find((tank) => {
        if (!tank.alive || tank.id === ownerId) return false;

        return Phaser.Math.Distance.Between(projectileX, projectileY, tank.x, tank.y - GAME_CONFIG.tank.height / 2) <= GAME_CONFIG.tank.hitRadius;
      }) ?? null
    );
  }

  applyDamage(tank: TankState, damage: number): void {
    tank.health = Math.max(0, tank.health - damage);
    tank.alive = tank.health > 0;
  }
}
