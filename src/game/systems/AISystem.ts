import Phaser from 'phaser';
import {
  GAME_CONFIG,
  type ControllerKind,
  type PlayerId,
  type TankState,
  type TerrainData,
  type WeaponDefinition,
  type WindState
} from '../types/GameTypes';
import { TerrainSystem } from './TerrainSystem';

export interface AIDecision {
  angle: number;
  power: number;
  weaponIndex: number;
}

interface SimulationResult {
  landX: number;
  landY: number;
  hitOutOfBounds: boolean;
  hitTank: boolean;
}

export class AISystem {
  /**
   * Compute the AI's intended firing solution for the active tank.
   *
   * The decision is returned synchronously; GameScene animates the active
   * tank's angle/power toward the target values and then fires, giving the
   * human a chance to see what the AI is doing.
   */
  decide(
    controller: ControllerKind,
    shooter: TankState,
    opponents: TankState[],
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData
  ): AIDecision {
    const target = this.pickTarget(controller, shooter, opponents);
    if (controller === 'cpu-cadet') {
      return this.decideCadet(shooter, target);
    }
    if (controller === 'cpu-veteran') {
      return this.decideVeteran(shooter, target, wind, terrainSystem, terrainData);
    }
    return this.decideMarshal(shooter, target, wind, terrainSystem, terrainData);
  }

  /**
   * Pick which opponent to aim at. Cadet rolls random; Veteran/Marshal pick
   * the nearest alive opponent. Falls back to the shooter (a self-target) if
   * there are no opponents available, which the caller will turn into a stalled
   * shot rather than crash.
   */
  private pickTarget(controller: ControllerKind, shooter: TankState, opponents: TankState[]): TankState {
    const alive = opponents.filter((t) => t.alive);
    if (alive.length === 0) return shooter;
    if (controller === 'cpu-cadet') {
      return alive[Math.floor(Math.random() * alive.length)];
    }
    // Nearest-by-x for Veteran and Marshal.
    return alive.reduce((closest, t) =>
      Math.abs(t.x - shooter.x) < Math.abs(closest.x - shooter.x) ? t : closest
    );
  }

  // -------- DIFFICULTY: CADET --------
  // Random angle/power within sane bounds, random weapon. Mostly misses.
  private decideCadet(shooter: TankState, target: TankState): AIDecision {
    // Bias firing arc based on which direction the target sits.
    const facingLeft = target.x < shooter.x;
    const minA = facingLeft ? 95 : 25;
    const maxA = facingLeft ? 155 : 85;
    const angle = minA + Math.random() * (maxA - minA);
    const power = 35 + Math.random() * 50;
    const weaponIndex = this.pickRandomAvailableWeapon(shooter);
    return { angle, power, weaponIndex };
  }

  // -------- DIFFICULTY: VETERAN --------
  // Coarse grid search over angle/power, picks the closest landing to the
  // opponent and adds small random noise so the AI is good but not perfect.
  private decideVeteran(
    shooter: TankState,
    target: TankState,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData
  ): AIDecision {
    const weaponIndex = this.pickBestDamageWeapon(shooter);
    const weapon = GAME_CONFIG.weapons[weaponIndex];

    // Bias firing arc toward the target's direction.
    const facingLeft = target.x < shooter.x;
    const angleStart = facingLeft ? 95 : 25;
    const angleEnd = facingLeft ? 155 : 85;
    let bestAngle = (angleStart + angleEnd) / 2;
    let bestPower = 60;
    let bestDistSq = Infinity;

    for (let angle = angleStart; angle <= angleEnd; angle += 8) {
      for (let power = 30; power <= 95; power += 8) {
        const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData);
        if (result.hitOutOfBounds) continue;
        const dx = result.landX - target.x;
        const dy = result.landY - target.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestAngle = angle;
          bestPower = power;
        }
      }
    }

    // Veteran noise: ±6° angle, ±8 power → still good but humanly imperfect.
    const angle = Phaser.Math.Clamp(
      bestAngle + (Math.random() * 2 - 1) * 6,
      GAME_CONFIG.aiming.minAngle,
      GAME_CONFIG.aiming.maxAngle
    );
    const power = Phaser.Math.Clamp(
      bestPower + (Math.random() * 2 - 1) * 8,
      GAME_CONFIG.aiming.minPower,
      GAME_CONFIG.aiming.maxPower
    );

    return { angle, power, weaponIndex };
  }

  // -------- DIFFICULTY: MARSHAL --------
  // Fine grid search, evaluates every weapon the shooter actually has, picks
  // the (weapon, angle, power) triple with the best damage-weighted score.
  private decideMarshal(
    shooter: TankState,
    target: TankState,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData
  ): AIDecision {
    // Bias firing arc toward the target's direction.
    const facingLeft = target.x < shooter.x;
    const angleStart = facingLeft ? 95 : 25;
    const angleEnd = facingLeft ? 155 : 85;

    let bestAngle = (angleStart + angleEnd) / 2;
    let bestPower = 60;
    let bestWeaponIndex = 0;
    let bestScore = -Infinity;

    GAME_CONFIG.weapons.forEach((weapon, weaponIndex) => {
      const ammo = shooter.ammo[weapon.id];
      if (ammo !== -1 && ammo <= 0) return;
      // Skip Dirt Mover for direct attacks — it doesn't damage tanks.
      if (weapon.damage <= 0) return;

      for (let angle = angleStart; angle <= angleEnd; angle += 4) {
        for (let power = 25; power <= 100; power += 5) {
          const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData);
          if (result.hitOutOfBounds) continue;
          const dx = result.landX - target.x;
          const dy = result.landY - target.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximityScore = 200 / (dist + 10);
          // Reward higher damage weapons but only if they actually land close.
          const score = proximityScore * (weapon.damage / 35);
          if (score > bestScore) {
            bestScore = score;
            bestAngle = angle;
            bestPower = power;
            bestWeaponIndex = weaponIndex;
          }
        }
      }
    });

    // Marshal noise: very small (±1.5°, ±2 power) so it feels reactive, not
    // surgical-perfect — still beats a careless human.
    const angle = Phaser.Math.Clamp(
      bestAngle + (Math.random() * 2 - 1) * 1.5,
      GAME_CONFIG.aiming.minAngle,
      GAME_CONFIG.aiming.maxAngle
    );
    const power = Phaser.Math.Clamp(
      bestPower + (Math.random() * 2 - 1) * 2,
      GAME_CONFIG.aiming.minPower,
      GAME_CONFIG.aiming.maxPower
    );

    return { angle, power, weaponIndex: bestWeaponIndex };
  }

  // -------- HELPERS --------

  private pickRandomAvailableWeapon(tank: TankState): number {
    const available: number[] = [];
    GAME_CONFIG.weapons.forEach((w, i) => {
      const count = tank.ammo[w.id];
      if (count === -1 || count > 0) available.push(i);
    });
    return available[Math.floor(Math.random() * available.length)] ?? 0;
  }

  private pickBestDamageWeapon(tank: TankState): number {
    let bestIdx = 0;
    let bestDamage = -1;
    GAME_CONFIG.weapons.forEach((w, i) => {
      const count = tank.ammo[w.id];
      if (count !== -1 && count <= 0) return;
      if (w.damage <= 0) return;
      if (w.damage > bestDamage) {
        bestDamage = w.damage;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  /**
   * Fast forward-simulate a single shot using the same physics as
   * ProjectileSystem.update, stepping at a fixed dt until the projectile
   * lands, leaves the playfield, or hits the target tank's bounding circle.
   *
   * Note: we deliberately ignore split/bounce/salvo special behaviors for
   * the AI's targeting model — those would complicate the simulation. The
   * AI aims with the assumption it's a plain ballistic shot, which is good
   * enough for placement and lets the special weapons' damage scoring
   * still bias choice.
   */
  private simulateShot(
    shooter: TankState,
    angleDeg: number,
    power: number,
    weapon: WeaponDefinition,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData
  ): SimulationResult {
    const dt = 0.05; // seconds per step (~20 Hz; fast enough, plenty accurate)
    const rad = Phaser.Math.DegToRad(angleDeg);
    const speed = (GAME_CONFIG.projectile.launchSpeedBase + power * 3.4) * weapon.projectileSpeedScale;

    // Approximate launch position at the turret tip.
    let x = shooter.x + Math.cos(rad) * GAME_CONFIG.tank.turretLength;
    let y = shooter.y - GAME_CONFIG.tank.barrelInsetY - Math.sin(rad) * GAME_CONFIG.tank.turretLength;
    let vx = Math.cos(rad) * speed;
    let vy = -Math.sin(rad) * speed;
    let age = 0;

    const maxAge = GAME_CONFIG.projectile.maxAgeMs / 1000;
    const widthLimit = terrainData.width + 40;
    const heightLimit = terrainData.height + 40;

    while (age < maxAge) {
      vx += wind.direction * wind.magnitude * GAME_CONFIG.projectile.windAccelerationScale * dt;
      vy += GAME_CONFIG.projectile.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      age += dt;

      if (x < -40 || x > widthLimit || y > heightLimit) {
        return { landX: x, landY: y, hitOutOfBounds: true, hitTank: false };
      }
      if (terrainSystem.isBelowTerrain(terrainData, x, y)) {
        return { landX: x, landY: y, hitOutOfBounds: false, hitTank: false };
      }
    }
    return { landX: x, landY: y, hitOutOfBounds: true, hitTank: false };
  }
}

export function isAIController(kind: ControllerKind): boolean {
  return kind === 'cpu-cadet' || kind === 'cpu-veteran' || kind === 'cpu-marshal';
}

export function isRemoteController(kind: ControllerKind): boolean {
  return kind === 'remote';
}

export function controllerForPlayer(profiles: { controller: ControllerKind }[], id: PlayerId): ControllerKind {
  return profiles[id]?.controller ?? 'human';
}
