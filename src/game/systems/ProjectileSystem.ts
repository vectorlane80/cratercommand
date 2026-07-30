import Phaser from 'phaser';
import {
  GAME_CONFIG,
  PHYSICS_DEFAULTS,
  type ImpactResult,
  type PhysicsSettings,
  type ProjectileState,
  type TankState,
  type TerrainData,
  type WallMode,
  type WeaponDefinition,
  type WindState
} from '../types/GameTypes';
import { TankSystem } from './TankSystem';
import { TerrainSystem } from './TerrainSystem';

export interface ProjectileTick {
  impact: ImpactResult | null;
  spawned: ProjectileState[];
  terrainChanged?: boolean;
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
    if (weapon.behavior === 'leapfrog') {
      projectile.hopsLeft = (weapon.hopCount ?? 1) - 1;
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
    wallMode: Exclude<WallMode, 'random' | 'erratic'> = 'none',
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    tankSystem: TankSystem,
    tanks: TankState[],
    physics: PhysicsSettings = PHYSICS_DEFAULTS
  ): ProjectileTick {
    const deltaSeconds = deltaMs / 1000;
    projectile.ageMs += deltaMs;
    const spawned: ProjectileState[] = [];
    const weapon = projectile.weapon;

    // Tunneling physics: takes priority over rolling and ballistic
    if (projectile.tunneling === true) {
      return this.updateTunneling(projectile, deltaSeconds, terrainSystem, terrainData, tankSystem, tanks);
    }

    // Rolling physics: takes priority over ballistic
    if (projectile.rolling === true) {
      return this.updateRolling(projectile, deltaSeconds, wallMode, terrainSystem, terrainData, tankSystem, tanks, physics);
    }

    // Ballistic projectile physics
    projectile.velocityX += wind.direction * wind.magnitude * GAME_CONFIG.projectile.windAccelerationScale * deltaSeconds;
    projectile.velocityY += physics.gravity * deltaSeconds;
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y += projectile.velocityY * deltaSeconds;

    // Viscosity drag
    if (physics.viscosity > 0) {
      const drag = 1 - physics.viscosity * deltaSeconds;
      projectile.velocityX *= drag;
      projectile.velocityY *= drag;
    }

    // Mag deflection: push projectiles upward when near enemy tanks with mag-deflectors
    tanks.forEach((tank) => {
      if (!tank.alive || tank.id === projectile.ownerId) return; // Skip dead tanks and owner
      const dx = tank.x - projectile.x;
      const dy = (tank.y - GAME_CONFIG.tank.height / 2) - projectile.y;
      const distanceSq = dx * dx + dy * dy;
      const deflectRadiusSq = GAME_CONFIG.projectile.deflectRadius * GAME_CONFIG.projectile.deflectRadius;
      if (distanceSq <= deflectRadiusSq) {
        const hasMagDeflector = (tank.defenses['mag-deflector'] ?? 0) > 0;
        const hasSuperMag = tank.armedShieldId === 'super-mag';
        if (hasMagDeflector || hasSuperMag) {
          projectile.velocityY -= GAME_CONFIG.projectile.deflectAcceleration * deltaSeconds;
        }
      }
    });

    // Guidance steering
    if (projectile.guidanceId && projectile.guidanceId !== 'ballistic-guidance') {
      // Find nearest alive enemy tank (not owner)
      let nearestTank: TankState | null = null;
      let nearestDistance = Infinity;
      for (let i = 0; i < tanks.length; i++) {
        const tank = tanks[i];
        if (!tank.alive || tank.id === projectile.ownerId) continue;
        const dx = tank.x - projectile.x;
        const dy = (tank.y - GAME_CONFIG.tank.height / 2) - projectile.y;
        const distance = Math.hypot(dx, dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestTank = tank;
        }
      }

      if (nearestTank !== null) {
        const targetX = nearestTank.x;
        const targetY = nearestTank.y - GAME_CONFIG.tank.height / 2;
        const dx = targetX - projectile.x;
        const dy = targetY - projectile.y;

        if (projectile.guidanceId === 'heat-guidance' || projectile.guidanceId === 'lazy-boy') {
          // Heat seeking: accelerate toward target if within range
          const distance = Math.hypot(dx, dy);
          if (distance <= GAME_CONFIG.projectile.heatSeekRadius) {
            const d = distance || 1;
            projectile.velocityX += ((dx / d) * GAME_CONFIG.projectile.heatSeekAcceleration * deltaSeconds);
            projectile.velocityY += ((dy / d) * GAME_CONFIG.projectile.heatSeekAcceleration * deltaSeconds);
          }
        } else if (projectile.guidanceId === 'horizontal-guidance') {
          // Horizontal: level off toward target once past apex
          if (projectile.velocityY >= 0 && Math.abs(dx) > 6) {
            projectile.velocityY = 0;
            projectile.velocityX = Math.sign(dx) * GAME_CONFIG.projectile.horizontalSpeed;
          }
        } else if (projectile.guidanceId === 'vertical-guidance') {
          // Vertical: dive when roughly above target
          if (Math.abs(dx) < 14) {
            projectile.velocityX = 0;
            projectile.velocityY = Math.max(projectile.velocityY, GAME_CONFIG.projectile.verticalDiveSpeed);
          }
        }
      }
    }

    this.trailTimerMs += deltaMs;
    if (this.trailTimerMs >= GAME_CONFIG.projectile.trailSpacingMs) {
      projectile.trail.push({ x: projectile.x, y: projectile.y });
      this.trailTimerMs = 0;
    }

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

    // Side wall handling (when wallMode is not 'none')
    if (wallMode !== 'none') {
      if (projectile.x < 0 || projectile.x > terrainData.width) {
        const isLeftWall = projectile.x < 0;
        const clampedX = isLeftWall ? 0 : terrainData.width;

        if (wallMode === 'concrete') {
          // Concrete: impact at the wall
          return { impact: { kind: 'terrain', x: clampedX, y: projectile.y }, spawned };
        } else if (wallMode === 'padded' || wallMode === 'rubber' || wallMode === 'spring') {
          // Reflect with restitution
          const restitution = wallMode === 'padded'
            ? GAME_CONFIG.walls.paddedRestitution
            : wallMode === 'rubber'
              ? GAME_CONFIG.walls.rubberRestitution
              : GAME_CONFIG.walls.springRestitution;
          projectile.x = clampedX + (isLeftWall ? 1 : -1);
          projectile.velocityX = -projectile.velocityX * restitution;
          projectile.wallBounces = (projectile.wallBounces ?? 0) + 1;

          // If max bounces exceeded, fall through to OOB
          if ((projectile.wallBounces ?? 0) > GAME_CONFIG.walls.maxBounces) {
            return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned };
          }
          // Continue normally (no impact)
          return { impact: null, spawned };
        } else if (wallMode === 'wraparound') {
          // Wraparound: teleport to opposite side
          projectile.x = projectile.x < 0 ? projectile.x + terrainData.width : projectile.x - terrainData.width;
          projectile.trail.push({ x: projectile.x, y: projectile.y });
          return { impact: null, spawned };
        }
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
      this.spawnOnImpact(projectile, spawned);
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
      // Roller transition: start rolling instead of impacting
      if (weapon.behavior === 'roller') {
        projectile.rolling = true;
        projectile.y = terrainSystem.getHeightAtX(terrainData, projectile.x) - 3;
        projectile.velocityX = Phaser.Math.Clamp(
          projectile.velocityX,
          -GAME_CONFIG.projectile.rollerMaxSpeed,
          GAME_CONFIG.projectile.rollerMaxSpeed
        );
        projectile.velocityY = 0;
        return { impact: null, spawned };
      }
      // Digger/Sandhog transition: start tunneling instead of impacting
      if (weapon.behavior === 'digger' || weapon.behavior === 'sandhog') {
        // Contact triggers: if owner tank has them, detonate immediately instead of tunneling
        const ownerTank = tanks.find((t) => t.id === projectile.ownerId);
        if (ownerTank && ownerTank.contactTriggers > 0) {
          ownerTank.contactTriggers -= 1;
          this.spawnOnImpact(projectile, spawned);
          return { impact: { kind: 'terrain', x: projectile.x, y: projectile.y }, spawned };
        }
        projectile.tunneling = true;
        projectile.tunnelRemaining = weapon.tunnelLength ?? 60;
        const speed = Math.hypot(projectile.velocityX, projectile.velocityY) || 1;
        projectile.velocityX = (projectile.velocityX / speed) * GAME_CONFIG.projectile.tunnelSpeed;
        projectile.velocityY = (projectile.velocityY / speed) * GAME_CONFIG.projectile.tunnelSpeed;
        return { impact: null, spawned, terrainChanged: false };
      }
      this.spawnOnImpact(projectile, spawned);
      return { impact: { kind: 'terrain', x: projectile.x, y: projectile.y }, spawned };
    }

    return { impact: null, spawned };
  }

  /** Rolling physics: projectile rolls along terrain surface until it hits a tank or comes to rest. */
  private updateRolling(
    projectile: ProjectileState,
    deltaSeconds: number,
    wallMode: Exclude<WallMode, 'random' | 'erratic'> = 'none',
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    tankSystem: TankSystem,
    tanks: TankState[],
    physics: PhysicsSettings = PHYSICS_DEFAULTS
  ): ProjectileTick {
    const spawned: ProjectileState[] = [];

    // Trail update on same timer as ballistic
    this.trailTimerMs += deltaSeconds * 1000;
    if (this.trailTimerMs >= GAME_CONFIG.projectile.trailSpacingMs) {
      projectile.trail.push({ x: projectile.x, y: projectile.y });
      this.trailTimerMs = 0;
    }

    // Sample slope at current position
    const h1 = terrainSystem.getHeightAtX(terrainData, projectile.x - 4);
    const h2 = terrainSystem.getHeightAtX(terrainData, projectile.x + 4);
    const slope = (h2 - h1) / 8;

    // Accelerate downhill, apply friction, clamp speed
    projectile.velocityX += slope * physics.gravity * deltaSeconds;
    projectile.velocityX *= Math.max(0, 1 - GAME_CONFIG.projectile.rollerFriction * deltaSeconds);
    projectile.velocityX = Phaser.Math.Clamp(
      projectile.velocityX,
      -GAME_CONFIG.projectile.rollerMaxSpeed,
      GAME_CONFIG.projectile.rollerMaxSpeed
    );

    // Move along surface
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y = terrainSystem.getHeightAtX(terrainData, projectile.x) - 3;

    // Tank check
    const hitTank = tankSystem.findHitTank(tanks, projectile.x, projectile.y, projectile.ownerId);
    if (hitTank) {
      this.spawnOnImpact(projectile, spawned);
      return {
        impact: { kind: 'tank', x: projectile.x, y: projectile.y, targetTankId: hitTank.id },
        spawned
      };
    }

    // Wall handling for rolling projectiles
    if (wallMode !== 'none' && (projectile.x < 0 || projectile.x > terrainData.width)) {
      const isLeftWall = projectile.x < 0;
      const clampedX = isLeftWall ? 0 : terrainData.width;

      if (wallMode === 'concrete') {
        return { impact: { kind: 'terrain', x: clampedX, y: projectile.y }, spawned };
      } else if (wallMode === 'padded' || wallMode === 'rubber' || wallMode === 'spring') {
        projectile.velocityX = -projectile.velocityX * 0.6;
        projectile.x = clampedX + (isLeftWall ? 1 : -1);
        return { impact: null, spawned };
      } else if (wallMode === 'wraparound') {
        projectile.x = projectile.x < 0 ? projectile.x + terrainData.width : projectile.x - terrainData.width;
        return { impact: null, spawned };
      }
    }

    // Off-field check
    if (projectile.x < -40 || projectile.x > terrainData.width + 40) {
      return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned };
    }

    // Max age check
    if (projectile.ageMs > GAME_CONFIG.projectile.maxAgeMs) {
      return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned };
    }

    // Detonation at rest: must be slow AND on a gentle slope
    if (
      Math.abs(projectile.velocityX) < GAME_CONFIG.projectile.rollerMinSpeed &&
      Math.abs(slope) < 0.08
    ) {
      return { impact: { kind: 'terrain', x: projectile.x, y: projectile.y }, spawned };
    }

    return { impact: null, spawned };
  }

  /** Tunneling physics: projectile bores through terrain in a straight line. */
  private updateTunneling(
    projectile: ProjectileState,
    deltaSeconds: number,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    tankSystem: TankSystem,
    tanks: TankState[]
  ): ProjectileTick {
    const spawned: ProjectileState[] = [];
    const weapon = projectile.weapon;
    let terrainChanged = false;

    // Trail update on same timer as ballistic
    this.trailTimerMs += deltaSeconds * 1000;
    if (this.trailTimerMs >= GAME_CONFIG.projectile.trailSpacingMs) {
      projectile.trail.push({ x: projectile.x, y: projectile.y });
      this.trailTimerMs = 0;
    }

    // Move in straight line
    const distanceMoved = Math.hypot(projectile.velocityX, projectile.velocityY) * deltaSeconds;
    projectile.x += projectile.velocityX * deltaSeconds;
    projectile.y += projectile.velocityY * deltaSeconds;

    // Carve tunnel
    if (terrainSystem.applyTunnel(terrainData, projectile.x, projectile.y, weapon.tunnelRadius ?? 7)) {
      terrainChanged = true;
    }

    // Decrement tunnel budget
    projectile.tunnelRemaining = (projectile.tunnelRemaining ?? 0) - distanceMoved;

    // Tank check
    const hitTank = tankSystem.findHitTank(tanks, projectile.x, projectile.y, projectile.ownerId);
    if (hitTank) {
      this.spawnOnImpact(projectile, spawned);
      // Digger fizzles on tank hit (terrain-kind impact means no tank damage applied)
      if (weapon.behavior === 'digger') {
        return {
          impact: { kind: 'terrain', x: projectile.x, y: projectile.y },
          spawned,
          terrainChanged
        };
      }
      // Sandhog blasts the tank (tank-kind impact)
      return {
        impact: { kind: 'tank', x: projectile.x, y: projectile.y, targetTankId: hitTank.id },
        spawned,
        terrainChanged
      };
    }

    // Tunnel exhausted: detonate
    if ((projectile.tunnelRemaining ?? 0) <= 0) {
      return {
        impact: { kind: 'terrain', x: projectile.x, y: projectile.y },
        spawned,
        terrainChanged
      };
    }

    // Off-field check
    if (projectile.x < -40 || projectile.x > terrainData.width + 40 || projectile.y > terrainData.height + 40 || projectile.y < -40) {
      return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned, terrainChanged };
    }

    // Max age check
    if (projectile.ageMs > GAME_CONFIG.projectile.maxAgeMs) {
      return { impact: { kind: 'outOfBounds', x: projectile.x, y: projectile.y }, spawned, terrainChanged };
    }

    return { impact: null, spawned, terrainChanged };
  }

  /** Continuation/child projectiles spawned when a special weapon detonates. */
  private spawnOnImpact(projectile: ProjectileState, spawned: ProjectileState[]): void {
    const weapon = projectile.weapon;

    // Leapfrog: spawn continuation hop
    if (weapon.behavior === 'leapfrog' && (projectile.hopsLeft ?? 0) > 0) {
      spawned.push({
        ownerId: projectile.ownerId,
        weapon,
        x: projectile.x,
        y: projectile.y - 4,
        velocityX: projectile.velocityX * 0.85,
        velocityY: -Math.abs(projectile.velocityY) * 0.55,
        trail: [{ x: projectile.x, y: projectile.y - 4 }],
        ageMs: 0,
        hopsLeft: (projectile.hopsLeft ?? 0) - 1
      });
    }

    // Funky: spawn bomblet chain reaction
    if (weapon.behavior === 'funky' && !projectile.hasSplit) {
      const count = weapon.funkySpawnCount ?? 6;
      for (let i = 0; i < count; i += 1) {
        spawned.push({
          ownerId: projectile.ownerId,
          weapon,
          x: projectile.x,
          y: projectile.y - 6,
          velocityX: (Math.random() * 2 - 1) * 160,
          velocityY: -(60 + Math.random() * 150),
          trail: [{ x: projectile.x, y: projectile.y - 6 }],
          ageMs: 0,
          hasSplit: true,
          damageScale: 0.5
        });
      }
    }

    // Napalm: spawn downhill-flowing flame children
    if (weapon.behavior === 'napalm' && !projectile.hasSplit) {
      const n = weapon.flameCount ?? 7;
      for (let i = 0; i < n; i += 1) {
        spawned.push({
          ownerId: projectile.ownerId,
          weapon,
          x: projectile.x,
          y: projectile.y - 3,
          velocityX: ((i - (n - 1) / 2) / Math.max(1, (n - 1) / 2)) * 120 + (Math.random() * 2 - 1) * 15,
          velocityY: 0,
          trail: [{ x: projectile.x, y: projectile.y - 3 }],
          ageMs: 0,
          hasSplit: true,
          damageScale: 0.3,
          rolling: true
        });
      }
    }
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
