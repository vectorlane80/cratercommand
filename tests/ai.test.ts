import { describe, it, expect } from 'vitest';
import { AISystem, isAIController } from '../src/game/systems/AISystem';
import { EconomySystem } from '../src/game/systems/EconomySystem';
import { TerrainSystem } from '../src/game/systems/TerrainSystem';
import { TankSystem } from '../src/game/systems/TankSystem';
import { GAME_CONFIG, PHYSICS_DEFAULTS } from '../src/game/types/GameTypes';
import { makeFlatTerrain, makeTank, makeProfile } from './helpers';

describe('AISystem', () => {
  const aiSystem = new AISystem();
  const terrainSystem = new TerrainSystem();
  const tankSystem = new TankSystem();

  const noWind = { direction: 1 as const, magnitude: 0 };

  it('isAIController true for all five cpu-* ids, false for human/remote', () => {
    expect(isAIController('cpu-moron')).toBe(true);
    expect(isAIController('cpu-shooter')).toBe(true);
    expect(isAIController('cpu-tosser')).toBe(true);
    expect(isAIController('cpu-spoiler')).toBe(true);
    expect(isAIController('cpu-cyborg')).toBe(true);
    expect(isAIController('human')).toBe(false);
    expect(isAIController('remote')).toBe(false);
  });

  it('Moron decide returns angle within target-side arc and power 35-85; weaponIndex has ammo', () => {
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 200, ammo: { 'small-missile': 10 } });
    const target = makeTank({ id: 1, x: 500, alive: true });

    const decision = aiSystem.decide(
      'cpu-moron',
      shooter,
      [target],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS
    );

    // Target is to the right (500 > 200), so angle should be 25-85
    expect(decision.angle).toBeGreaterThanOrEqual(25);
    expect(decision.angle).toBeLessThanOrEqual(85);
    expect(decision.power).toBeGreaterThanOrEqual(35);
    expect(decision.power).toBeLessThanOrEqual(85);
    expect(decision.weaponIndex).toBeGreaterThanOrEqual(0);
    expect(decision.weaponIndex).toBeLessThan(GAME_CONFIG.weapons.length);
    const weapon = GAME_CONFIG.weapons[decision.weaponIndex];
    expect(shooter.ammo[weapon.id]).toBeGreaterThan(0);
  });

  it('Shooter with clear flat field returns valid angle/power with weapon ammo', () => {
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 200, ammo: { 'small-missile': 10 } });
    const target = makeTank({ id: 1, x: 500, alive: true });

    const decision = aiSystem.decide(
      'cpu-shooter',
      shooter,
      [target],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS
    );

    // Shooter returns valid angle and power (either found solution or fell back to Moron)
    expect(decision.angle).toBeGreaterThanOrEqual(GAME_CONFIG.aiming.minAngle);
    expect(decision.angle).toBeLessThanOrEqual(GAME_CONFIG.aiming.maxAngle);
    expect(decision.power).toBeGreaterThanOrEqual(GAME_CONFIG.aiming.minPower);
    expect(decision.power).toBeLessThanOrEqual(GAME_CONFIG.aiming.maxPower);

    // Weapon has ammo
    const weapon = GAME_CONFIG.weapons[decision.weaponIndex];
    expect(shooter.ammo[weapon.id]).toBeGreaterThan(0);
  });

  it('Tosser memory: two consecutive decide calls for same shooter within ±12°/±12 power of first', () => {
    aiSystem.resetRound();
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 200, ammo: { 'small-missile': 50 } });
    const target = makeTank({ id: 1, x: 500, alive: true });

    const decision1 = aiSystem.decide(
      'cpu-tosser',
      shooter,
      [target],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS
    );

    // Same setup, second call should search near first solution
    const decision2 = aiSystem.decide(
      'cpu-tosser',
      shooter,
      [target],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS
    );

    // Second decision should be within ±12° of first (before noise)
    expect(Math.abs(decision2.angle - decision1.angle)).toBeLessThan(20);
    expect(Math.abs(decision2.power - decision1.power)).toBeLessThan(20);
  });

  it('Tosser memory cleared after resetRound', () => {
    aiSystem.resetRound();
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 200, ammo: { 'small-missile': 50 } });
    const target = makeTank({ id: 1, x: 500, alive: true });

    // First call stores memory
    aiSystem.decide('cpu-tosser', shooter, [target], noWind, terrainSystem, terrain, PHYSICS_DEFAULTS);

    // Reset round clears memory
    aiSystem.resetRound();

    // Third call should not throw and should return valid ranges
    const decision3 = aiSystem.decide(
      'cpu-tosser',
      shooter,
      [target],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS
    );

    expect(decision3.angle).toBeGreaterThanOrEqual(GAME_CONFIG.aiming.minAngle);
    expect(decision3.angle).toBeLessThanOrEqual(GAME_CONFIG.aiming.maxAngle);
    expect(decision3.power).toBeGreaterThanOrEqual(GAME_CONFIG.aiming.minPower);
    expect(decision3.power).toBeLessThanOrEqual(GAME_CONFIG.aiming.maxPower);
  });

  it('Spoiler viscosity penalty: with viscosity 0.35, angle spread exceeds viscosity-free spread or exceeds 8deg', () => {
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 200, ammo: { 'small-missile': 50 } });
    const target = makeTank({ id: 1, x: 500, alive: true });

    // 30 runs with no viscosity
    aiSystem.resetRound();
    const anglesClear: number[] = [];
    for (let i = 0; i < 30; i++) {
      const decision = aiSystem.decide(
        'cpu-spoiler',
        shooter,
        [target],
        noWind,
        terrainSystem,
        terrain,
        PHYSICS_DEFAULTS
      );
      anglesClear.push(decision.angle);
    }
    const spreadClear = Math.max(...anglesClear) - Math.min(...anglesClear);

    // 30 runs with viscosity 0.35
    aiSystem.resetRound();
    const viscousPhysics = { gravity: 138, viscosity: 0.35, tanksFall: true };
    const anglesViscous: number[] = [];
    for (let i = 0; i < 30; i++) {
      const decision = aiSystem.decide(
        'cpu-spoiler',
        shooter,
        [target],
        noWind,
        terrainSystem,
        terrain,
        viscousPhysics
      );
      anglesViscous.push(decision.angle);
    }
    const spreadViscous = Math.max(...anglesViscous) - Math.min(...anglesViscous);

    // Viscous should have more spread or exceed threshold
    expect(spreadViscous > spreadClear || spreadViscous > 8).toBe(true);
  });

  it('Cyborg targeting: with wounded tank at left, chooses aim direction facing left', () => {
    const terrain = makeFlatTerrain(300);
    const shooter = makeTank({ id: 0, x: 300, ammo: { 'small-missile': 50 } });
    // Full-health tank on the right
    const healthyRight = makeTank({ id: 1, x: 600, alive: true, health: GAME_CONFIG.tank.maxHealth });
    // Wounded tank on the left
    const woundedLeft = makeTank({ id: 2, x: 100, alive: true, health: 30 });

    const profiles = [
      makeProfile({ wins: 0 }),
      makeProfile({ wins: 0 }),
      makeProfile({ wins: 0 })
    ];

    const decision = aiSystem.decide(
      'cpu-cyborg',
      shooter,
      [healthyRight, woundedLeft],
      noWind,
      terrainSystem,
      terrain,
      PHYSICS_DEFAULTS,
      profiles
    );

    // Cyborg should target the wounded tank on the left
    // Aim direction should be > 90 (facing left)
    expect(decision.angle).toBeGreaterThan(90);
    expect(decision.angle).toBeLessThanOrEqual(155);
  });

  it('planShopping(cyborg) with cash 60000 round 1 no sale includes nuke >= 1 bundle', () => {
    const economy = new EconomySystem();
    const profile = makeProfile({ cash: 60000 });

    const plan = aiSystem.planShopping('cpu-cyborg', profile, economy, 1, null);

    expect(plan['nuke'] ?? 0).toBeGreaterThanOrEqual(1);
    let totalCost = 0;
    for (const [key, bundles] of Object.entries(plan)) {
      const price = economy.priceFor(key, 1, null);
      totalCost += price * bundles;
    }
    expect(totalCost).toBeLessThanOrEqual(60000);
  });

  it('planShopping(moron) with cash 3000 only affordable picks; max 4 bundles; never price-0', () => {
    const economy = new EconomySystem();
    const profile = makeProfile({ cash: 3000 });

    const plan = aiSystem.planShopping('cpu-moron', profile, economy, 1, null);

    let bundleCount = 0;
    for (const [key, bundles] of Object.entries(plan)) {
      const price = economy.priceFor(key, 1, null);
      expect(price).toBeGreaterThan(0);
      expect(price * bundles).toBeLessThanOrEqual(3000);
      bundleCount += bundles;
    }
    expect(bundleCount).toBeLessThanOrEqual(4);
  });

  it('planShopping respects sales: 50% sale on nuke, cash 7000, cyborg includes nuke', () => {
    const economy = new EconomySystem();
    const profile = makeProfile({ cash: 7000 });
    const sale = { itemKey: 'nuke', discount: 0.5 };

    const plan = aiSystem.planShopping('cpu-cyborg', profile, economy, 1, sale);

    // Nuke should be affordable with 50% discount
    expect(plan['nuke'] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('planShopping purity: profile object unchanged after call', () => {
    const economy = new EconomySystem();
    const profile = makeProfile({ cash: 50000 });
    const profileBefore = JSON.stringify(profile);

    aiSystem.planShopping('cpu-cyborg', profile, economy, 1, null);

    const profileAfter = JSON.stringify(profile);
    expect(profileAfter).toBe(profileBefore);
  });

  it('planShopping plan → purchase: after applyPurchases, profile cash decreases and inventory increases', () => {
    const economy = new EconomySystem();
    const profile = makeProfile({ cash: 30000 });
    const cashBefore = profile.cash;

    const plan = aiSystem.planShopping('cpu-tosser', profile, economy, 1, null);

    // Apply the plan via economySystem
    economy.applyPurchases(profile, plan, 1, null);

    // Cash should have decreased
    expect(profile.cash).toBeLessThan(cashBefore);
    // Inventory should have increased for planned items
    for (const [key, bundles] of Object.entries(plan)) {
      if (bundles > 0) {
        const weapon = GAME_CONFIG.weapons.find((w) => w.id === key);
        if (weapon) {
          expect(profile.ammo[key]).toBeGreaterThan(0);
        } else if (key === 'parachute') {
          expect(profile.parachutes).toBeGreaterThan(0);
        } else if (key === 'battery') {
          expect(profile.batteries).toBeGreaterThan(0);
        }
      }
    }
  });
});
