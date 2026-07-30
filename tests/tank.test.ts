import { describe, it, expect } from 'vitest';
import { TankSystem } from '../src/game/systems/TankSystem';
import { TerrainSystem } from '../src/game/systems/TerrainSystem';
import { GAME_CONFIG } from '../src/game/types/GameTypes';
import { makeFlatTerrain, makeTank, makeProfile } from './helpers';

describe('TankSystem', () => {
  const tankSystem = new TankSystem();
  const terrainSystem = new TerrainSystem();

  it('createTanks positions tanks correctly with 2 profiles', () => {
    const terrain = makeFlatTerrain(250);
    const profiles = [makeProfile(), makeProfile()];

    const tanks = tankSystem.createTanks(terrainSystem, terrain, profiles);

    expect(tanks.length).toBe(2);

    expect(tanks[0].x).toBeCloseTo(0.13 * 960, 0);
    expect(tanks[0].y).toBe(250 - GAME_CONFIG.tank.placementOffsetY);
    expect(tanks[0].angle).toBe(55);

    expect(tanks[1].x).toBeCloseTo(0.87 * 960, 0);
    expect(tanks[1].y).toBe(250 - GAME_CONFIG.tank.placementOffsetY);
    expect(tanks[1].angle).toBe(125);

    tanks.forEach((tank) => {
      expect(tank.health).toBe(GAME_CONFIG.tank.maxHealth);
    });
  });

  it('createTanks copies ammo so mutations do not affect tank', () => {
    const terrain = makeFlatTerrain(250);
    const profiles = [makeProfile()];

    const tanks = tankSystem.createTanks(terrainSystem, terrain, profiles);

    profiles[0].ammo['big-missile'] = 999;

    expect(tanks[0].ammo['big-missile']).not.toBe(999);
  });

  it('getTurretTip at angle 90 points straight up', () => {
    const tank = makeTank({ angle: 90, x: 480, y: 248 });

    const tip = tankSystem.getTurretTip(tank);

    expect(Math.abs(tip.x - tank.x)).toBeLessThan(1e-6);
    expect(Math.abs(tip.y - (tank.y - GAME_CONFIG.tank.barrelInsetY - GAME_CONFIG.tank.turretLength))).toBeLessThan(1e-6);
  });

  it('moveTank respects minimum tank separation', () => {
    const terrain = makeFlatTerrain(250);
    const mover = makeTank({ id: 0, x: 480, y: 248, moveRemaining: 1000 });
    const other = makeTank({ id: 1, x: 520, y: 248, alive: true });

    const moved = tankSystem.moveTank(mover, 1, 10, terrainSystem, terrain, [mover, other]);

    expect(moved).toBe(true);
    expect(mover.x).toBeLessThanOrEqual(520 - GAME_CONFIG.movement.minTankSeparation);
  });

  it('moveTank budget: move consumed and moveRemaining decreased', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ x: 480, y: 248, moveRemaining: 100 });
    const initialX = tank.x;
    const initialMoveRemaining = tank.moveRemaining;

    tankSystem.moveTank(tank, 1, 0.5, terrainSystem, terrain, [tank]);

    const distanceMoved = Math.abs(tank.x - initialX);
    expect(Math.abs(tank.moveRemaining - (initialMoveRemaining - distanceMoved))).toBeLessThan(1e-6);
  });

  it('moveTank with moveRemaining 0 returns false and does not move', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ x: 480, y: 248, moveRemaining: 0 });

    const moved = tankSystem.moveTank(tank, 1, 1, terrainSystem, terrain, [tank]);

    expect(moved).toBe(false);
    expect(tank.x).toBe(480);
  });

  it('settleTanksAfterTerrainChange applies fall damage', () => {
    const newTerrain = makeFlatTerrain(300);
    const tank = makeTank({ id: 0, y: 250 - GAME_CONFIG.tank.placementOffsetY, health: 125, parachutes: 0 });
    const initialTankY = tank.y;

    const events = tankSystem.settleTanksAfterTerrainChange([tank], terrainSystem, newTerrain);

    expect(events.length).toBe(1);
    expect(events[0].usedParachute).toBe(false);

    const newGroundY = 300 - GAME_CONFIG.tank.placementOffsetY;
    const expectedDistance = newGroundY - initialTankY;
    const expectedDamage = Math.min(
      GAME_CONFIG.fall.maxDamage,
      Math.round(expectedDistance * GAME_CONFIG.fall.damagePerPixel)
    );

    expect(events[0].damage).toBe(expectedDamage);
    expect(tank.health).toBe(125 - expectedDamage);
    expect(tank.y).toBe(300 - GAME_CONFIG.tank.placementOffsetY);
  });

  it('settleTanksAfterTerrainChange uses parachute', () => {
    const newTerrain = makeFlatTerrain(300);
    const tank = makeTank({ id: 0, y: 250 - GAME_CONFIG.tank.placementOffsetY, health: 125, parachutes: 1 });

    const events = tankSystem.settleTanksAfterTerrainChange([tank], terrainSystem, newTerrain);

    expect(events.length).toBe(1);
    expect(events[0].usedParachute).toBe(true);
    expect(events[0].damage).toBe(0);
    expect(tank.health).toBe(125);
    expect(tank.parachutes).toBe(0);
  });

  it('findHitTank returns tank at exact position', () => {
    const tank = makeTank({ id: 0, x: 480, y: 248, alive: true });

    const hit = tankSystem.findHitTank([tank], tank.x, tank.y - GAME_CONFIG.tank.height / 2, 1);

    expect(hit).toBe(tank);
  });

  it('findHitTank returns null for dead tank', () => {
    const tank = makeTank({ id: 0, x: 480, y: 248, alive: false });

    const hit = tankSystem.findHitTank([tank], tank.x, tank.y - GAME_CONFIG.tank.height / 2, 1);

    expect(hit).toBeNull();
  });

  it('findHitTank returns null outside hit radius', () => {
    const tank = makeTank({ id: 0, x: 480, y: 248, alive: true });

    const hit = tankSystem.findHitTank([tank], 100, 100, 1);

    expect(hit).toBeNull();
  });

  it('applyDamage reduces health and marks dead at 0', () => {
    const tank = makeTank({ health: 125, alive: true });

    tankSystem.applyDamage(tank, 125);

    expect(tank.health).toBe(0);
    expect(tank.alive).toBe(false);
  });

  it('applyDamage never goes negative', () => {
    const tank = makeTank({ health: 30, alive: true });

    tankSystem.applyDamage(tank, 100);

    expect(tank.health).toBe(0);
    expect(tank.alive).toBe(false);
  });

  it('createTanks copies profile batteries onto tank', () => {
    const terrain = makeFlatTerrain(250);
    const profiles = [makeProfile({ batteries: 5 }), makeProfile({ batteries: 3 })];

    const tanks = tankSystem.createTanks(terrainSystem, terrain, profiles);

    expect(tanks[0].batteries).toBe(5);
    expect(tanks[1].batteries).toBe(3);
  });

  it('createTanks copies defenses record and initializes armed shield fields', () => {
    const terrain = makeFlatTerrain(250);
    const profiles = [makeProfile({ defenses: { 'shield': 2, 'force-shield': 1 } })];

    const tanks = tankSystem.createTanks(terrainSystem, terrain, profiles);

    expect(tanks[0].defenses['shield']).toBe(2);
    expect(tanks[0].defenses['force-shield']).toBe(1);
    expect(tanks[0].armedShieldId).toBeNull();
    expect(tanks[0].armedShieldHp).toBe(0);
  });

  it('createTanks copies profile fuel and contactTriggers', () => {
    const terrain = makeFlatTerrain(250);
    const profiles = [makeProfile({ fuel: 100, contactTriggers: 5 }), makeProfile({ fuel: 50, contactTriggers: 3 })];

    const tanks = tankSystem.createTanks(terrainSystem, terrain, profiles);

    expect(tanks[0].fuel).toBe(100);
    expect(tanks[0].contactTriggers).toBe(5);
    expect(tanks[1].fuel).toBe(50);
    expect(tanks[1].contactTriggers).toBe(3);
  });

  it('moveTank with fuel: when moveRemaining sufficient, does not touch fuel', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ x: 480, y: 248, moveRemaining: 200, fuel: 100 });
    const initialFuel = tank.fuel;
    const speedPerDelta = GAME_CONFIG.movement.speedPxPerSec * 0.5;

    tankSystem.moveTank(tank, 1, 0.5, terrainSystem, terrain, [tank]);

    expect(tank.moveRemaining).toBe(200 - speedPerDelta);
    expect(tank.fuel).toBe(initialFuel);
  });

  it('moveTank with fuel: draws from fuel when moveRemaining exhausted', () => {
    const terrain = makeFlatTerrain(250);
    const tank = makeTank({ x: 480, y: 248, moveRemaining: 20, fuel: 100 });
    const speedPerDelta = GAME_CONFIG.movement.speedPxPerSec * 1;

    tankSystem.moveTank(tank, 1, 1, terrainSystem, terrain, [tank]);

    expect(tank.moveRemaining).toBe(0);
    expect(tank.fuel).toBeLessThan(100);
  });

  it('settleTanksAfterTerrainChange: safe fall distance has no damage, no parachute, no event', () => {
    const safeDistance = GAME_CONFIG.fall.safeDistance;
    const newTerrain = makeFlatTerrain(250 + safeDistance - 1);
    const tank = makeTank({ id: 0, y: 250 - GAME_CONFIG.tank.placementOffsetY, health: 125, parachutes: 5 });

    const events = tankSystem.settleTanksAfterTerrainChange([tank], terrainSystem, newTerrain);

    expect(events.length).toBe(0);
    expect(tank.health).toBe(125);
    expect(tank.parachutes).toBe(5);
  });

  it('settleTanksAfterTerrainChange with tanksFall=false: tank snapped to ground but no fall events generated', () => {
    const fallDistance = GAME_CONFIG.fall.safeDistance + 50;
    const newTerrain = makeFlatTerrain(250 + fallDistance);
    const tank = makeTank({ id: 0, y: 250 - GAME_CONFIG.tank.placementOffsetY, health: 125, parachutes: 5 });
    const originalY = tank.y;

    const events = tankSystem.settleTanksAfterTerrainChange([tank], terrainSystem, newTerrain, false);

    expect(tank.y).toBe(250 + fallDistance - GAME_CONFIG.tank.placementOffsetY);
    expect(tank.y).not.toBe(originalY);
    expect(events.length).toBe(0);
    expect(tank.health).toBe(125);
    expect(tank.parachutes).toBe(5);
  });

  it('settleTanksAfterTerrainChange with tanksFall=true: tank falls and takes damage', () => {
    const fallDistance = GAME_CONFIG.fall.safeDistance + 50;
    const newTerrain = makeFlatTerrain(250 + fallDistance);
    const tank = makeTank({ id: 0, y: 250 - GAME_CONFIG.tank.placementOffsetY, health: 125, parachutes: 0 });

    const events = tankSystem.settleTanksAfterTerrainChange([tank], terrainSystem, newTerrain, true);

    expect(events.length).toBeGreaterThan(0);
    expect(tank.health).toBeLessThan(125);
  });
});
