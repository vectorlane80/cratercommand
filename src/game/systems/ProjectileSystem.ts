import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type ImpactResult,
  type ProjectileState,
  type TankState,
  type TerrainData,
  type WeaponDefinition,
  type WindState
} from '../types/GameTypes';
import { TankSystem } from './TankSystem';
import { TerrainSystem } from './TerrainSystem';

export class ProjectileSystem {
  private trailTimerMs = 0;

  launch(owner: TankState, weapon: WeaponDefinition, tankSystem: TankSystem): ProjectileState {
    const tip = tankSystem.getTurretTip(owner);
    const radians = Phaser.Math.DegToRad(owner.angle);
    const speed = (GAME_CONFIG.projectile.launchSpeedBase + owner.power * 3.4) * weapon.projectileSpeedScale;

    this.trailTimerMs = 0;

    return {
      ownerId: owner.id,
      weapon,
      x: tip.x,
      y: tip.y,
      velocityX: Math.cos(radians) * speed,
      velocityY: -Math.sin(radians) * speed,
      trail: [{ x: tip.x, y: tip.y }],
      ageMs: 0
    };
  }

  update(
    projectile: ProjectileState,
    deltaMs: number,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    tankSystem: TankSystem,
    tanks: TankState[]
  ): ImpactResult | null {
    const deltaSeconds = deltaMs / 1000;
    projectile.ageMs += deltaMs;
    projectile.velocityX += wind.direction * wind.magnitude * GAME_CONFIG.projectile.windAccelerationScale * deltaSeconds;
    projectile.velocityY += GAME_CONFIG.projectile.gravity * deltaSeconds;
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y += projectile.velocityY * deltaSeconds;

    this.trailTimerMs += deltaMs;
    if (this.trailTimerMs >= GAME_CONFIG.projectile.trailSpacingMs) {
      projectile.trail.push({ x: projectile.x, y: projectile.y });
      this.trailTimerMs = 0;
    }

    if (
      projectile.x < -40 ||
      projectile.x > terrainData.width + 40 ||
      projectile.y < -80 ||
      projectile.y > terrainData.height + 40 ||
      projectile.ageMs > GAME_CONFIG.projectile.maxAgeMs
    ) {
      return { kind: 'outOfBounds', x: projectile.x, y: projectile.y };
    }

    const hitTank = tankSystem.findHitTank(tanks, projectile.x, projectile.y, projectile.ownerId);
    if (hitTank) {
      return { kind: 'tank', x: projectile.x, y: projectile.y, targetTankId: hitTank.id };
    }

    if (terrainSystem.isBelowTerrain(terrainData, projectile.x, projectile.y)) {
      return { kind: 'terrain', x: projectile.x, y: projectile.y };
    }

    return null;
  }

  draw(graphics: Phaser.GameObjects.Graphics, projectile: ProjectileState | null): void {
    graphics.clear();
    if (!projectile) return;

    graphics.fillStyle(GAME_CONFIG.colors.white, 1);
    projectile.trail.forEach((point, index) => {
      if (index % 2 === 0) {
        graphics.fillRect(Math.round(point.x), Math.round(point.y), 3, 3);
      }
    });

    graphics.fillStyle(GAME_CONFIG.colors.yellow, 1);
    graphics.fillRect(Math.round(projectile.x) - 3, Math.round(projectile.y) - 3, 6, 6);
  }
}
