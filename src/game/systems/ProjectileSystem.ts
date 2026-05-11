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

export interface ProjectileTick {
  impact: ImpactResult | null;
  spawned: ProjectileState[];
}

export class ProjectileSystem {
  private trailTimerMs = 0;

  launch(owner: TankState, weapon: WeaponDefinition, tankSystem: TankSystem): ProjectileState[] {
    this.trailTimerMs = 0;

    if (weapon.behavior === 'salvo') {
      const count = weapon.salvoCount ?? 1;
      const aSpread = weapon.salvoAngleSpread ?? 0;
      const pSpread = weapon.salvoPowerSpread ?? 0;
      const projectiles: ProjectileState[] = [];
      for (let i = 0; i < count; i += 1) {
        const angleOffset = (Math.random() * 2 - 1) * aSpread;
        const powerOffset = (Math.random() * 2 - 1) * pSpread;
        projectiles.push(this.buildProjectile(owner, weapon, tankSystem, angleOffset, powerOffset));
      }
      return projectiles;
    }

    const projectile = this.buildProjectile(owner, weapon, tankSystem, 0, 0);
    if (weapon.behavior === 'bounce') {
      projectile.bouncesLeft = weapon.bounceCount ?? 1;
    }
    return [projectile];
  }

  private buildProjectile(
    owner: TankState,
    weapon: WeaponDefinition,
    tankSystem: TankSystem,
    angleOffsetDeg: number,
    powerOffsetPct: number
  ): ProjectileState {
    const tip = tankSystem.getTurretTip(owner);
    const radians = Phaser.Math.DegToRad(owner.angle + angleOffsetDeg);
    const effectivePower = Phaser.Math.Clamp(owner.power + powerOffsetPct, 5, 120);
    const speed = (GAME_CONFIG.projectile.launchSpeedBase + effectivePower * 3.4) * weapon.projectileSpeedScale;

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
  ): ProjectileTick {
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

    const spawned: ProjectileState[] = [];
    const weapon = projectile.weapon;

    // Split at apex
    if (
      weapon.behavior === 'split' &&
      !projectile.hasSplit &&
      projectile.velocityY >= 0 &&
      projectile.y < terrainData.height
    ) {
      projectile.hasSplit = true;
      const additional = (weapon.splitCount ?? 1) - 1;
      const spread = weapon.splitAngleSpread ?? 12;
      for (let i = 1; i <= additional; i += 1) {
        const sign = i % 2 === 1 ? -1 : 1;
        const step = Math.ceil(i / 2);
        const rad = Phaser.Math.DegToRad(sign * spread * step);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        spawned.push({
          ownerId: projectile.ownerId,
          weapon,
          x: projectile.x,
          y: projectile.y,
          velocityX: projectile.velocityX * cos - projectile.velocityY * sin,
          velocityY: projectile.velocityX * sin + projectile.velocityY * cos,
          trail: [{ x: projectile.x, y: projectile.y }],
          ageMs: projectile.ageMs,
          hasSplit: true
        });
      }
    }

    if (
      projectile.x < -40 ||
      projectile.x > terrainData.width + 40 ||
      projectile.y > terrainData.height + 40 ||
      projectile.ageMs > GAME_CONFIG.projectile.maxAgeMs
    ) {
      return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned };
    }

    const hitTank = tankSystem.findHitTank(tanks, projectile.x, projectile.y, projectile.ownerId);
    if (hitTank) {
      return {
        impact: { kind: 'tank', x: projectile.x, y: projectile.y, targetTankId: hitTank.id },
        spawned
      };
    }

    if (terrainSystem.isBelowTerrain(terrainData, projectile.x, projectile.y)) {
      // Bounce handling
      if (weapon.behavior === 'bounce' && (projectile.bouncesLeft ?? 0) > 0) {
        projectile.bouncesLeft = (projectile.bouncesLeft ?? 0) - 1;
        const probe = 4;
        const h1 = terrainSystem.getHeightAtX(terrainData, projectile.x - probe);
        const h2 = terrainSystem.getHeightAtX(terrainData, projectile.x + probe);
        const slope = Math.atan2(h2 - h1, 2 * probe);
        // Surface normal in screen space (y increases downward): rotate (0,-1) by slope
        const nx = Math.sin(slope);
        const ny = -Math.cos(slope);
        const dot = projectile.velocityX * nx + projectile.velocityY * ny;
        const damping = 0.62;
        projectile.velocityX = (projectile.velocityX - 2 * dot * nx) * damping;
        projectile.velocityY = (projectile.velocityY - 2 * dot * ny) * damping;
        // Push above terrain so we don't immediately re-collide
        projectile.y = terrainSystem.getHeightAtX(terrainData, projectile.x) - 6;
        return { impact: null, spawned };
      }
      return { impact: { kind: 'terrain', x: projectile.x, y: projectile.y }, spawned };
    }

    return { impact: null, spawned };
  }

  drawAll(graphics: Phaser.GameObjects.Graphics, projectiles: ProjectileState[]): void {
    graphics.clear();
    projectiles.forEach((projectile) => {
      graphics.fillStyle(GAME_CONFIG.colors.white, 1);
      projectile.trail.forEach((point, index) => {
        if (index % 2 === 0) {
          graphics.fillRect(Math.round(point.x), Math.round(point.y), 3, 3);
        }
      });

      const color = projectile.weapon.behavior === 'dirt' ? GAME_CONFIG.colors.darkGreen : GAME_CONFIG.colors.yellow;
      graphics.fillStyle(color, 1);
      graphics.fillRect(Math.round(projectile.x) - 3, Math.round(projectile.y) - 3, 6, 6);
    });
  }
}
