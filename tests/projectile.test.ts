import { describe, it, expect } from 'vitest';
import { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { TankSystem } from '../src/game/systems/TankSystem';
import { TerrainSystem } from '../src/game/systems/TerrainSystem';
import { GAME_CONFIG } from '../src/game/types/GameTypes';
import { makeFlatTerrain, makeTank } from './helpers';

describe('ProjectileSystem', () => {
  const projectileSystem = new ProjectileSystem();
  const tankSystem = new TankSystem();
  const terrainSystem = new TerrainSystem();

  const noWind = { direction: 1 as const, magnitude: 0 };

  it('launch small-missile creates exactly 1 projectile with correct velocity', () => {
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(1);
    expect(Math.abs(projectiles[0].velocityX)).toBeLessThan(1e-6);

    const expectedVelocityY = -(GAME_CONFIG.projectile.launchSpeedBase + 50 * 3.4);
    expect(Math.abs(projectiles[0].velocityY - expectedVelocityY)).toBeLessThan(1e-6);
  });

  it('launch stream creates exactly salvoCount projectiles', () => {
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'stream')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(weapon.salvoCount);
    expect(projectiles.length).toBe(5);
  });

  it('launch bouncing-bomb has bouncesLeft set', () => {
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'bouncing-bomb')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(1);
    expect(projectiles[0].bouncesLeft).toBe(weapon.bounceCount);
  });

  it('update applies gravity correctly', () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 50;

    const initialVelocityY = projectile.velocityY;
    const tick = projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, []);

    expect(Math.abs(projectile.velocityY - (initialVelocityY + GAME_CONFIG.projectile.gravity * 0.1))).toBeLessThan(1e-6);
    expect(tick.impact).toBeNull();
  });

  it('update detects out-of-bounds', () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.x = -50;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('outOfBounds');
  });

  it('update detects terrain impact', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
  });

  it('update splits at apex for split weapon', () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'triple-missile')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.velocityY = 1;
    projectile.y = 100;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.spawned.length).toBe(weapon.splitCount! - 1);
    expect(projectile.hasSplit).toBe(true);
    tick.spawned.forEach((p) => {
      expect(p.hasSplit).toBe(true);
    });
  });

  it('update detects tank hit', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ id: 2, x: 480, y: 248, alive: true });
    const attacker = makeTank({ id: 0, angle: 90, power: 50, x: 100, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(attacker, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.x = tank.x;
    projectile.y = tank.y - GAME_CONFIG.tank.height / 2;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [tank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('tank');
    expect(tick.impact!.targetTankId).toBe(2);
  });

  it('update bounces bouncing-bomb and decreases bouncesLeft', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'bouncing-bomb')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.bouncesLeft = 1;
    projectile.y = 260;
    projectile.velocityY = 10;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).toBeNull();
    expect(projectile.bouncesLeft).toBe(0);
    expect(projectile.y).toBeLessThan(250);
  });

  it('update detects max age', () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.ageMs = GAME_CONFIG.projectile.maxAgeMs + 1;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('outOfBounds');
  });

  it('launch leapfrog creates 1 projectile with hopsLeft = hopCount - 1', () => {
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'leapfrog')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(1);
    expect(projectiles[0].hopsLeft).toBe(weapon.hopCount! - 1);
    expect(projectiles[0].hopsLeft).toBe(2);
  });

  it('update leapfrog below terrain with hopsLeft 2 spawns continuation', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'leapfrog')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.hopsLeft = 2;
    projectile.y = 260;
    projectile.velocityX = 100;
    projectile.velocityY = 50;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(1);
    expect(tick.spawned[0].hopsLeft).toBe(1);
    expect(tick.spawned[0].velocityY).toBeLessThan(0);
    expect(Math.abs(tick.spawned[0].velocityX - 100 * 0.85)).toBeLessThan(1e-6);
  });

  it('update leapfrog below terrain with hopsLeft 0 does not spawn', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'leapfrog')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.hopsLeft = 0;
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(0);
  });

  it('update leapfrog tank hit with hopsLeft 1 spawns continuation', () => {
    const terrain = makeFlatTerrain(250);
    const targetTank = makeTank({ id: 2, x: 480, y: 248, alive: true });
    const attacker = makeTank({ id: 0, angle: 45, power: 50, x: 100, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'leapfrog')!;
    const projectiles = projectileSystem.launch(attacker, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.hopsLeft = 1;
    projectile.x = targetTank.x;
    projectile.y = targetTank.y - GAME_CONFIG.tank.height / 2;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [targetTank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('tank');
    expect(tick.spawned.length).toBe(1);
    expect(tick.spawned[0].hopsLeft).toBe(0);
  });

  it('launch mirv creates 1 projectile with split behavior', () => {
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'mirv')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(1);
    expect(projectiles[0].weapon.behavior).toBe('split');
  });

  it('update mirv at apex spawns split children', () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'mirv')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.velocityY = 1;
    projectile.y = 100;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.spawned.length).toBe(weapon.splitCount! - 1);
    tick.spawned.forEach((p) => {
      expect(p.hasSplit).toBe(true);
    });
  });

  it("update death's head at apex spawns 8 split children", () => {
    const terrain = makeFlatTerrain(340);
    const tank = makeTank({ angle: 90, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'deaths-head')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.velocityY = 1;
    projectile.y = 100;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.spawned.length).toBe(8);
    tick.spawned.forEach((p) => {
      expect(p.hasSplit).toBe(true);
    });
  });

  it('update funky bomb below terrain spawns bomblets', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'funky-bomb')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(weapon.funkySpawnCount ?? 6);
    tick.spawned.forEach((bomblet) => {
      expect(bomblet.hasSplit).toBe(true);
      expect(bomblet.damageScale).toBe(0.5);
      expect(bomblet.velocityY).toBeLessThan(0);
      expect(Math.abs(bomblet.velocityX)).toBeLessThanOrEqual(160);
      expect(bomblet.ageMs).toBe(0);
    });
  });

  it('update funky bomblet (hasSplit true) does not re-chain', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'funky-bomb')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.hasSplit = true;
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(0);
  });
});
