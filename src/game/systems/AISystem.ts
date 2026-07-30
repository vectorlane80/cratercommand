import Phaser from 'phaser';
import {
  GAME_CONFIG,
  PHYSICS_DEFAULTS,
  type ControllerKind,
  type PhysicsSettings,
  type PlayerId,
  type PlayerProfile,
  type Sale,
  type TankState,
  type TerrainData,
  type WeaponDefinition,
  type WindState
} from '../types/GameTypes';
import { EconomySystem } from './EconomySystem';
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
  private tosserMemory: Map<PlayerId, { angle: number; power: number; missBy: number } | null> = new Map();

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
    terrainData: TerrainData,
    physics: PhysicsSettings = PHYSICS_DEFAULTS,
    profiles: PlayerProfile[] = []
  ): AIDecision {
    const target = this.pickTarget(controller, shooter, opponents);
    if (controller === 'cpu-moron') {
      return this.decideMoron(shooter, target);
    }
    if (controller === 'cpu-shooter') {
      return this.decideShooter(shooter, target, wind, terrainSystem, terrainData, physics);
    }
    if (controller === 'cpu-tosser') {
      return this.decideTosser(shooter, target, wind, terrainSystem, terrainData, physics);
    }
    if (controller === 'cpu-spoiler') {
      return this.decideSpoiler(shooter, target, wind, terrainSystem, terrainData, physics);
    }
    if (controller === 'cpu-cyborg') {
      return this.decideCyborg(shooter, target, opponents, wind, terrainSystem, terrainData, physics, profiles);
    }
    return this.decideMoron(shooter, target);
  }

  /**
   * Reset per-round AI memory (tosser memory, etc).
   * Called from GameScene.beginRound.
   */
  resetRound(): void {
    this.tosserMemory.clear();
  }

  /**
   * Plan shopping for an AI player. Returns a record of planned buys
   * {key: bundles} that respects affordability and personality strategy.
   * Pure function: does not mutate the profile.
   */
  planShopping(controller: ControllerKind, profile: PlayerProfile, economy: EconomySystem, round: number, sale: Sale, marketFactors?: Record<string, number>): Record<string, number> {
    const plan: Record<string, number> = {};
    let budget = profile.cash;
    let bundleCount = 0;
    const maxBundles = 8;

    // Priority lists by personality
    let priorities: string[];

    if (controller === 'cpu-moron') {
      // Random affordable weapons until < $2000 left
      const affordableWeapons: string[] = [];
      GAME_CONFIG.weapons.forEach(w => {
        if (w.price > 0) {
          const price = economy.priceFor(w.id, round, sale, marketFactors);
          if (price > 0 && price <= budget && price >= 2000) {
            affordableWeapons.push(w.id);
          }
        }
      });
      // Pick up to 4 random entries
      const picks = Math.min(4, affordableWeapons.length);
      for (let i = 0; i < picks; i++) {
        if (budget < 2000) break;
        const randomIdx = Math.floor(Math.random() * affordableWeapons.length);
        const key = affordableWeapons[randomIdx];
        const price = economy.priceFor(key, round, sale);
        if (price <= budget) {
          plan[key] = (plan[key] ?? 0) + 1;
          budget -= price;
          bundleCount++;
        }
      }
      return plan;
    }

    if (controller === 'cpu-shooter') {
      priorities = ['missile', 'big-missile', 'bullet'];
    } else if (controller === 'cpu-tosser') {
      priorities = ['big-missile', 'baby-nuke', 'parachute', 'shield'];
    } else if (controller === 'cpu-spoiler') {
      priorities = ['baby-nuke', 'mirv', 'shield', 'parachute', 'battery'];
    } else if (controller === 'cpu-cyborg') {
      priorities = ['nuke', 'deaths-head', 'super-mag', 'heavy-shield', 'parachute', 'battery'];
    } else {
      return plan;
    }

    // Loop through priority list, buying one bundle of each affordable entry
    while (bundleCount < maxBundles) {
      let boughtInLoop = false;

      for (const key of priorities) {
        if (bundleCount >= maxBundles) break;

        const price = economy.priceFor(key, round, sale);
        if (price > 0 && price <= budget) {
          plan[key] = (plan[key] ?? 0) + 1;
          budget -= price;
          bundleCount++;
          boughtInLoop = true;
        }
      }

      // Stop if nothing was affordable in this loop
      if (!boughtInLoop) break;
    }

    return plan;
  }

  /**
   * Pick which opponent to aim at.
   * - Moron: random
   * - Shooter, Tosser, Spoiler: nearest-by-x
   * - Cyborg: tactical targeting by health and wins
   * Falls back to shooter if no opponents available.
   */
  private pickTarget(controller: ControllerKind, shooter: TankState, opponents: TankState[], profiles: PlayerProfile[] = []): TankState {
    const alive = opponents.filter((t) => t.alive);
    if (alive.length === 0) return shooter;

    if (controller === 'cpu-moron') {
      return alive[Math.floor(Math.random() * alive.length)];
    }

    if (controller === 'cpu-cyborg') {
      // Tactical: (maxHealth - health) * 2 + (is leader ? 60 : 0)
      let maxHealth = 0;
      let maxWins = 0;
      alive.forEach(t => {
        maxHealth = Math.max(maxHealth, GAME_CONFIG.tank.maxHealth);
        const idx = opponents.indexOf(t);
        if (idx !== -1 && profiles[idx]) {
          maxWins = Math.max(maxWins, profiles[idx].wins);
        }
      });

      let bestTarget = alive[0];
      let bestScore = -Infinity;
      alive.forEach(t => {
        const idx = opponents.indexOf(t);
        const profile = idx !== -1 ? profiles[idx] : null;
        const isLeader = profile && profile.wins === maxWins;
        const score = (maxHealth - t.health) * 2 + (isLeader ? 60 : 0);
        const distFromShooter = Math.abs(t.x - shooter.x);
        // Tie-breaking: nearest
        if (score > bestScore || (score === bestScore && distFromShooter < Math.abs(bestTarget.x - shooter.x))) {
          bestScore = score;
          bestTarget = t;
        }
      });
      return bestTarget;
    }

    // Shooter, Tosser, Spoiler: nearest-by-x
    return alive.reduce((closest, t) =>
      Math.abs(t.x - shooter.x) < Math.abs(closest.x - shooter.x) ? t : closest
    );
  }

  // -------- MORON --------
  // Random angle/power within sane bounds, random weapon. Mostly misses.
  private decideMoron(shooter: TankState, target: TankState): AIDecision {
    const facingLeft = target.x < shooter.x;
    const minA = facingLeft ? 95 : 25;
    const maxA = facingLeft ? 155 : 85;
    const angle = minA + Math.random() * (maxA - minA);
    const power = 35 + Math.random() * 50;
    const weaponIndex = this.pickRandomAvailableWeapon(shooter);
    return { angle, power, weaponIndex };
  }

  // -------- SHOOTER --------
  // Line-of-sight specialist: checks direct low-arc paths (flat angles only).
  // If blocked or no clear solution, falls back to Moron.
  private decideShooter(
    shooter: TankState,
    target: TankState,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    physics: PhysicsSettings
  ): AIDecision {
    const weaponIndex = this.pickBestDamageWeapon(shooter);
    const weapon = GAME_CONFIG.weapons[weaponIndex];

    const facingLeft = target.x < shooter.x;
    // Flat angles only: 25-60 (right) or 120-155 (left)
    const angleStart = facingLeft ? 120 : 25;
    const angleEnd = facingLeft ? 155 : 60;
    let bestAngle = (angleStart + angleEnd) / 2;
    let bestPower = 75;
    let bestDist = Infinity;

    // High power only (60-100, step 5)
    for (let angle = angleStart; angle <= angleEnd; angle += 8) {
      for (let power = 60; power <= 100; power += 5) {
        const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData, physics);
        if (result.hitOutOfBounds) continue;
        const dx = result.landX - target.x;
        const dy = result.landY - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestAngle = angle;
          bestPower = power;
        }
      }
    }

    // If no clear line (best landing > 80px away), fall back to Moron
    if (bestDist > 80) {
      return this.decideMoron(shooter, target);
    }

    const angle = Phaser.Math.Clamp(
      bestAngle + (Math.random() * 2 - 1) * 2,
      GAME_CONFIG.aiming.minAngle,
      GAME_CONFIG.aiming.maxAngle
    );
    const power = Phaser.Math.Clamp(
      bestPower + (Math.random() * 2 - 1) * 3,
      GAME_CONFIG.aiming.minPower,
      GAME_CONFIG.aiming.maxPower
    );

    return { angle, power, weaponIndex };
  }

  // -------- TOSSER --------
  // Grid search with PROGRESSIVE memory refinement.
  // Stores best solution per shooter; next decide searches ±12°/±12 power around it.
  private decideTosser(
    shooter: TankState,
    target: TankState,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    physics: PhysicsSettings
  ): AIDecision {
    const weaponIndex = this.pickBestDamageWeapon(shooter);
    const weapon = GAME_CONFIG.weapons[weaponIndex];

    const facingLeft = target.x < shooter.x;
    const angleStart = facingLeft ? 95 : 25;
    const angleEnd = facingLeft ? 155 : 85;

    let searchAngleStart = angleStart;
    let searchAngleEnd = angleEnd;
    let searchPowerStart = 30;
    let searchPowerEnd = 95;

    const memory = this.tosserMemory.get(shooter.id);
    if (memory) {
      // Refine around remembered solution
      searchAngleStart = Math.max(angleStart, memory.angle - 12);
      searchAngleEnd = Math.min(angleEnd, memory.angle + 12);
      searchPowerStart = Math.max(30, memory.power - 12);
      searchPowerEnd = Math.min(95, memory.power + 12);
    }

    let bestAngle = (searchAngleStart + searchAngleEnd) / 2;
    let bestPower = (searchPowerStart + searchPowerEnd) / 2;
    let bestDist = Infinity;

    for (let angle = searchAngleStart; angle <= searchAngleEnd; angle += 4) {
      for (let power = searchPowerStart; power <= searchPowerEnd; power += 4) {
        const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData, physics);
        if (result.hitOutOfBounds) continue;
        const dx = result.landX - target.x;
        const dy = result.landY - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestAngle = angle;
          bestPower = power;
        }
      }
    }

    // Store solution for next call
    this.tosserMemory.set(shooter.id, { angle: bestAngle, power: bestPower, missBy: bestDist });

    // Noise: ±6° angle, ±8 power
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

  // -------- SPOILER --------
  // Fine grid search, all weapons. Cannot compensate for viscosity.
  // When viscosity > 0, add extra noise ±8°/±10 power.
  private decideSpoiler(
    shooter: TankState,
    target: TankState,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    physics: PhysicsSettings
  ): AIDecision {
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
      if (weapon.damage <= 0) return;

      for (let angle = angleStart; angle <= angleEnd; angle += 4) {
        for (let power = 25; power <= 100; power += 5) {
          const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData, physics);
          if (result.hitOutOfBounds) continue;
          const dx = result.landX - target.x;
          const dy = result.landY - target.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximityScore = 200 / (dist + 10);
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

    // Base noise: ±1.5°, ±2 power
    let angleNoise = (Math.random() * 2 - 1) * 1.5;
    let powerNoise = (Math.random() * 2 - 1) * 2;

    // Viscosity penalty: add extra noise
    if (physics.viscosity > 0) {
      angleNoise += (Math.random() * 2 - 1) * 8;
      powerNoise += (Math.random() * 2 - 1) * 10;
    }

    const angle = Phaser.Math.Clamp(
      bestAngle + angleNoise,
      GAME_CONFIG.aiming.minAngle,
      GAME_CONFIG.aiming.maxAngle
    );
    const power = Phaser.Math.Clamp(
      bestPower + powerNoise,
      GAME_CONFIG.aiming.minPower,
      GAME_CONFIG.aiming.maxPower
    );

    return { angle, power, weaponIndex: bestWeaponIndex };
  }

  // -------- CYBORG --------
  // Spoiler's search (with correct viscosity) + tactical targeting.
  // Tactical targeting happens via pickTarget; decideCyborg uses the fine grid search.
  private decideCyborg(
    shooter: TankState,
    target: TankState,
    _opponents: TankState[],
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    physics: PhysicsSettings,
    _profiles: PlayerProfile[]
  ): AIDecision {
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
      if (weapon.damage <= 0) return;

      for (let angle = angleStart; angle <= angleEnd; angle += 4) {
        for (let power = 25; power <= 100; power += 5) {
          const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData, physics);
          if (result.hitOutOfBounds) continue;
          const dx = result.landX - target.x;
          const dy = result.landY - target.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const proximityScore = 200 / (dist + 10);
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

    // Base noise: ±1.5°, ±2 power (same as Spoiler, NO extra viscosity penalty)
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

  /**
   * Public method: solve for the best angle and power for a single weapon
   * to hit a target. Used by ballistic-guidance and lazy-boy auto-aim.
   * Returns angle and power, or null if no solution found.
   */
  solveShot(
    shooter: TankState,
    target: TankState,
    weapon: WeaponDefinition,
    wind: WindState,
    terrainSystem: TerrainSystem,
    terrainData: TerrainData,
    physics: PhysicsSettings = PHYSICS_DEFAULTS
  ): { angle: number; power: number } | null {
    // Bias firing arc toward the target's direction
    const facingLeft = target.x < shooter.x;
    const angleStart = facingLeft ? 95 : 25;
    const angleEnd = facingLeft ? 155 : 85;

    let bestAngle = (angleStart + angleEnd) / 2;
    let bestPower = 60;
    let bestScore = -Infinity;
    let foundSolution = false;

    for (let angle = angleStart; angle <= angleEnd; angle += 4) {
      for (let power = 25; power <= 100; power += 5) {
        const result = this.simulateShot(shooter, angle, power, weapon, wind, terrainSystem, terrainData, physics);
        if (result.hitOutOfBounds) continue;
        const dx = result.landX - target.x;
        const dy = result.landY - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximityScore = 200 / (dist + 10);
        if (proximityScore > bestScore) {
          bestScore = proximityScore;
          bestAngle = angle;
          bestPower = power;
          foundSolution = true;
        }
      }
    }

    return foundSolution ? { angle: bestAngle, power: bestPower } : null;
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
    terrainData: TerrainData,
    physics: PhysicsSettings = PHYSICS_DEFAULTS
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
      vy += physics.gravity * dt;

      // Apply viscosity drag
      if (physics.viscosity > 0) {
        const drag = 1 - physics.viscosity * dt;
        vx *= drag;
        vy *= drag;
      }

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
  return kind === 'cpu-moron' || kind === 'cpu-shooter' || kind === 'cpu-tosser' || kind === 'cpu-spoiler' || kind === 'cpu-cyborg';
}

export function isRemoteController(kind: ControllerKind): boolean {
  return kind === 'remote';
}

export function controllerForPlayer(profiles: { controller: ControllerKind }[], id: PlayerId): ControllerKind {
  return profiles[id]?.controller ?? 'human';
}
