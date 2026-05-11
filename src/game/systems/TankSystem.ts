import Phaser from 'phaser';
import { GAME_CONFIG, type PlayerId, type TankState, type TerrainData } from '../types/GameTypes';
import { TerrainSystem } from './TerrainSystem';

export class TankSystem {
  createTanks(terrainSystem: TerrainSystem, terrainData: TerrainData): TankState[] {
    const tankXs = [terrainData.width * 0.16, terrainData.width * 0.86];

    return tankXs.map((x, index) => {
      const id = index as PlayerId;

      const ammo: Record<string, number> = {};
      GAME_CONFIG.weapons.forEach((weapon) => {
        ammo[weapon.id] = weapon.startingAmmo;
      });

      return {
        id,
        x,
        y: terrainSystem.getHeightAtX(terrainData, x) - GAME_CONFIG.tank.placementOffsetY,
        color: id === 0 ? GAME_CONFIG.colors.magenta : GAME_CONFIG.colors.cyan,
        accentColor: id === 0 ? 0xffa6ff : 0x8effff,
        label: id === 0 ? 'PLAYER 1' : 'PLAYER 2',
        health: GAME_CONFIG.tank.maxHealth,
        angle: GAME_CONFIG.aiming.initialAngles[id],
        power: GAME_CONFIG.aiming.initialPower,
        alive: true,
        ammo,
        selectedWeaponIndex: 0
      };
    });
  }

  updateTerrainPositions(tanks: TankState[], terrainSystem: TerrainSystem, terrainData: TerrainData): void {
    tanks.forEach((tank) => {
      tank.y = terrainSystem.getHeightAtX(terrainData, tank.x) - GAME_CONFIG.tank.placementOffsetY;
    });
  }

  draw(graphics: Phaser.GameObjects.Graphics, tanks: TankState[], activePlayerId: PlayerId): void {
    graphics.clear();

    tanks.forEach((tank) => {
      const isActive = tank.id === activePlayerId && tank.alive;
      const bodyX = tank.x - GAME_CONFIG.tank.width / 2;
      const bodyY = tank.y - GAME_CONFIG.tank.height;
      const turretStart = this.getTurretStart(tank);
      const turretTip = this.getTurretTip(tank);

      if (isActive) {
        graphics.lineStyle(2, GAME_CONFIG.colors.white, 1);
        graphics.strokeRect(bodyX - 4, bodyY - 5, GAME_CONFIG.tank.width + 8, GAME_CONFIG.tank.height + 7);
      }

      graphics.fillStyle(tank.color, 1);
      graphics.fillRect(bodyX, bodyY, GAME_CONFIG.tank.width, GAME_CONFIG.tank.height);
      graphics.fillStyle(tank.accentColor, 1);
      graphics.fillRect(tank.x - 9, bodyY - 5, 18, 5);
      graphics.lineStyle(4, tank.color, 1);
      graphics.beginPath();
      graphics.moveTo(turretStart.x, turretStart.y);
      graphics.lineTo(turretTip.x, turretTip.y);
      graphics.strokePath();
      graphics.lineStyle(1, GAME_CONFIG.colors.black, 1);
      graphics.strokeRect(bodyX + 4, bodyY + 4, GAME_CONFIG.tank.width - 8, 4);
    });
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
