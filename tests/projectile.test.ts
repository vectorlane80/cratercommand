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

  it('launch roller creates 1 projectile without rolling flag', () => {
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;

    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);

    expect(projectiles.length).toBe(1);
    expect(projectiles[0].rolling).toBeUndefined();
  });

  it('ballistic roller transitions to rolling on terrain contact', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).toBeNull();
    expect(projectile.rolling).toBe(true);
    expect(projectile.y).toBe(247);
    expect(projectile.velocityY).toBe(0);
  });

  it('rolling projectile accelerates downhill', () => {
    const terrain: typeof import('../src/game/types/GameTypes').TerrainData = {
      heights: Array.from({ length: 161 }, (_, i) => 200 + i),
      width: 960,
      height: 356,
      segmentWidth: 6
    };
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.rolling = true;
    projectile.x = 480;
    projectile.y = terrainSystem.getHeightAtX(terrain, projectile.x) - 3;
    projectile.velocityX = 0;

    let velocityAfterTicks = projectile.velocityX;
    for (let i = 0; i < 5; i += 1) {
      projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);
      velocityAfterTicks = projectile.velocityX;
    }

    expect(velocityAfterTicks).toBeGreaterThan(0);
    expect(projectile.x).toBeGreaterThan(480);
    expect(projectile.rolling).toBe(true);
  });

  it('rolling projectile detonates at rest in valley', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.rolling = true;
    projectile.velocityX = 5;
    projectile.y = 247;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
  });

  it('rolling projectile keeps rolling on steep slope despite slow speed', () => {
    const terrain: typeof import('../src/game/types/GameTypes').TerrainData = {
      heights: Array.from({ length: 161 }, (_, i) => 200 + i * 2),
      width: 960,
      height: 356,
      segmentWidth: 6
    };
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.rolling = true;
    projectile.x = 480;
    projectile.y = terrainSystem.getHeightAtX(terrain, projectile.x) - 3;
    projectile.velocityX = 5;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).toBeNull();
  });

  it('rolling projectile hits tank', () => {
    const terrain = makeFlatTerrain(250);
    const targetTank = makeTank({ id: 2, x: 482, y: 248, alive: true });
    const attacker = makeTank({ id: 0, angle: 0, power: 50, x: 100, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(attacker, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.rolling = true;
    projectile.x = 480;
    projectile.y = 247;
    projectile.velocityX = 100;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [targetTank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('tank');
  });

  it('rolling projectile ignores wind', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'roller')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.rolling = true;
    projectile.y = 247;
    projectile.velocityX = 0;
    const wind = { direction: 1 as const, magnitude: 18 };

    projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);
    const velocityAfterNoWind = projectile.velocityX;
    projectile.velocityX = 0;
    projectileSystem.update(projectile, 16, wind, terrainSystem, terrain, tankSystem, []);
    const velocityAfterWind = projectile.velocityX;

    expect(Math.abs(velocityAfterWind - velocityAfterNoWind)).toBeLessThan(0.5);
  });

  it('digger transitions to tunneling on terrain contact', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).toBeNull();
    expect(projectile.tunneling).toBe(true);
    expect(projectile.tunnelRemaining).toBe(100);
    const speed = Math.hypot(projectile.velocityX, projectile.velocityY);
    expect(Math.abs(speed - GAME_CONFIG.projectile.tunnelSpeed)).toBeLessThan(1e-6);
  });

  it('tunneling digger hits tank and fizzles (terrain impact)', () => {
    const terrain = makeFlatTerrain(250);
    const targetTank = makeTank({ id: 2, x: 482, y: 250, alive: true });
    const attacker = makeTank({ id: 0, angle: 0, power: 50, x: 100, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(attacker, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.tunneling = true;
    projectile.tunnelRemaining = 50;
    projectile.x = 480;
    projectile.y = 250;
    projectile.velocityX = 90;
    projectile.velocityY = 0;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [targetTank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
  });

  it('tunneling sandhog hits tank with tank impact', () => {
    const terrain = makeFlatTerrain(250);
    const targetTank = makeTank({ id: 2, x: 482, y: 250, alive: true });
    const attacker = makeTank({ id: 0, angle: 0, power: 50, x: 100, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'sandhog')!;
    const projectiles = projectileSystem.launch(attacker, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.tunneling = true;
    projectile.tunnelRemaining = 50;
    projectile.x = 480;
    projectile.y = 250;
    projectile.velocityX = 90;
    projectile.velocityY = 0;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [targetTank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('tank');
    expect(tick.impact!.targetTankId).toBe(2);
  });

  it('tunneling projectile detonates when tunnel budget exhausted', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.tunneling = true;
    projectile.tunnelRemaining = 1;
    projectile.x = 480;
    projectile.y = 250;
    projectile.velocityX = 90;
    projectile.velocityY = 0;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
  });

  it('tunneling tick with bore near surface reports terrainChanged true', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 0, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.tunneling = true;
    projectile.tunnelRemaining = 50;
    projectile.x = 480;
    projectile.y = 250;
    projectile.velocityX = 90;
    projectile.velocityY = 0;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.terrainChanged).toBe(true);
    expect(tick.impact).toBeNull();
  });

  it('update napalm below terrain with hasSplit falsy spawns flame children', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'napalm')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(weapon.flameCount ?? 7);
    tick.spawned.forEach((child) => {
      expect(child.rolling).toBe(true);
      expect(child.hasSplit).toBe(true);
      expect(child.damageScale).toBe(0.3);
      expect(child.velocityY).toBe(0);
    });
    // Verify velocityX values span negative to positive
    const velocityXValues = tick.spawned.map((c) => c.velocityX);
    const minVelocityX = Math.min(...velocityXValues);
    const maxVelocityX = Math.max(...velocityXValues);
    expect(minVelocityX).toBeLessThan(-50);
    expect(maxVelocityX).toBeGreaterThan(50);
  });

  it('update flame child (hasSplit true, rolling true) on flat terrain with low velocity detonates at rest', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ angle: 45, power: 50, x: 480, y: 248 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'napalm')!;
    const projectiles = projectileSystem.launch(tank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.hasSplit = true;
    projectile.rolling = true;
    projectile.velocityX = 5;
    projectile.y = 247;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, []);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(tick.spawned.length).toBe(0);
  });

  it('tracer and smoke-tracer have zero damage and zero crater radius', () => {
    const tracer = GAME_CONFIG.weapons.find((w) => w.id === 'tracer')!;
    const smokeTracer = GAME_CONFIG.weapons.find((w) => w.id === 'smoke-tracer')!;
    expect(tracer.damage).toBe(0);
    expect(tracer.craterRadius).toBe(0);
    expect(smokeTracer.damage).toBe(0);
    expect(smokeTracer.craterRadius).toBe(0);
  });

  it('ballistic deflection: projectile deflects upward when near enemy tank with mag-deflector', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, angle: 90, power: 50, x: 400, y: 248 });
    const defenderTank = makeTank({ id: 1, x: 480, y: 200, alive: true, defenses: { 'mag-deflector': 1 } });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.x = 480;
    projectile.y = 150;
    projectile.velocityY = 50;

    const initialVelocityY = projectile.velocityY;
    const tick = projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, defenderTank]);

    expect(projectile.velocityY).toBeLessThan(initialVelocityY);
    expect(tick.impact).toBeNull();
  });

  it('ballistic deflection: dead tank with mag-deflector does not deflect', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, angle: 90, power: 50, x: 400, y: 248 });
    const deadDefenderTank = makeTank({ id: 1, x: 480, y: 200, alive: false, defenses: { 'mag-deflector': 1 } });
    const liveDefenderTank = makeTank({ id: 2, x: 500, y: 300, alive: true, defenses: {} });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.x = 480;
    projectile.y = 150;
    projectile.velocityY = 50;

    const initialVelocityY = projectile.velocityY;
    const tick = projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, deadDefenderTank, liveDefenderTank]);

    const gravity = GAME_CONFIG.projectile.gravity * 0.1;
    const expectedVelocityY = initialVelocityY + gravity;
    expect(Math.abs(projectile.velocityY - expectedVelocityY)).toBeLessThan(1e-6);
    expect(tick.impact).toBeNull();
  });

  it('contact-trigger: digger with contactTriggers detonates on terrain contact instead of tunneling', () => {
    const terrain = makeFlatTerrain(250);
    const ownerTank = makeTank({ id: 0, angle: 0, power: 50, x: 480, y: 248, contactTriggers: 1 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [ownerTank]);

    expect(tick.impact).not.toBeNull();
    expect(tick.impact!.kind).toBe('terrain');
    expect(projectile.tunneling).not.toBe(true);
    expect(ownerTank.contactTriggers).toBe(0);
  });

  it('contact-trigger: digger without contactTriggers enters tunneling mode on terrain contact', () => {
    const terrain = makeFlatTerrain(250);
    const ownerTank = makeTank({ id: 0, angle: 0, power: 50, x: 480, y: 248, contactTriggers: 0 });
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'digger')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.y = 260;

    const tick = projectileSystem.update(projectile, 16, noWind, terrainSystem, terrain, tankSystem, [ownerTank]);

    expect(tick.impact).toBeNull();
    expect(projectile.tunneling).toBe(true);
    expect(projectile.tunnelRemaining).toBe(weapon.tunnelLength ?? 60);
  });

  it('heat-guidance: projectile homing toward nearby target', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, x: 400, y: 300 });
    const targetTank = makeTank({ id: 1, x: 500, y: 200, alive: true });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.guidanceId = 'heat-guidance';
    projectile.x = 420;
    projectile.y = 280;
    projectile.velocityX = 50;
    projectile.velocityY = 50;

    const initialVelocityX = projectile.velocityX;
    const initialVelocityY = projectile.velocityY;
    const tick = projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, targetTank]);

    // Projectile should accelerate toward target (500, 200-6=194)
    expect(projectile.velocityX).toBeGreaterThan(initialVelocityX);
    expect(tick.impact).toBeNull();
  });

  it('heat-guidance: no homing when target is out of range', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, x: 100, y: 300 });
    const targetTank = makeTank({ id: 1, x: 800, y: 200, alive: true });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.guidanceId = 'heat-guidance';
    projectile.x = 200;
    projectile.y = 280;
    projectile.velocityX = 50;
    projectile.velocityY = 50;

    const initialVelocityX = projectile.velocityX;
    projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, targetTank]);

    // Distance > heatSeekRadius (130), so no guidance acceleration — velocityX stays the same
    expect(projectile.velocityX).toBe(initialVelocityX);
  });

  it('horizontal-guidance: post-apex level-off toward target', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, x: 300, y: 300 });
    const targetTank = makeTank({ id: 1, x: 500, y: 300, alive: true });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.guidanceId = 'horizontal-guidance';
    projectile.x = 400;
    projectile.y = 200;
    projectile.velocityX = 50;
    projectile.velocityY = 10;

    projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, targetTank]);

    expect(projectile.velocityY).toBe(0);
    expect(Math.abs(projectile.velocityX - GAME_CONFIG.projectile.horizontalSpeed)).toBeLessThan(1e-6);
  });

  it('vertical-guidance: dive when above target', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, x: 300, y: 300 });
    const targetTank = makeTank({ id: 1, x: 310, y: 300, alive: true });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.guidanceId = 'vertical-guidance';
    projectile.x = 310;
    projectile.y = 200;
    projectile.velocityX = 10;
    projectile.velocityY = 50;

    projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, targetTank]);

    expect(projectile.velocityX).toBe(0);
    expect(projectile.velocityY).toBe(GAME_CONFIG.projectile.verticalDiveSpeed);
  });

  it('heat-guidance: dead target not used for homing', () => {
    const terrain = makeFlatTerrain(340);
    const ownerTank = makeTank({ id: 0, x: 400, y: 300 });
    const deadTank = makeTank({ id: 1, x: 500, y: 200, alive: false });
    const liveTank = makeTank({ id: 2, x: 550, y: 330, alive: true });

    const weapon = GAME_CONFIG.weapons.find((w) => w.id === 'small-missile')!;
    const projectiles = projectileSystem.launch(ownerTank, weapon, tankSystem);
    const projectile = projectiles[0];
    projectile.guidanceId = 'heat-guidance';
    projectile.x = 550;
    projectile.y = 280;
    projectile.velocityX = 50;
    projectile.velocityY = 50;

    const tick = projectileSystem.update(projectile, 100, noWind, terrainSystem, terrain, tankSystem, [ownerTank, deadTank, liveTank]);

    // Should home toward liveTank (nearby), not deadTank (dead)
    expect(tick.impact).toBeNull();
  });
});
