import { describe, it, expect } from 'vitest';
import { TurnSystem } from '../src/game/systems/TurnSystem';
import { GAME_CONFIG, WALL_MODES } from '../src/game/types/GameTypes';
import { makeTank } from './helpers';

describe('TurnSystem', () => {
  const system = new TurnSystem();

  it('createMatchState initializes profiles and match state correctly', () => {
    const match = system.createMatchState(['human', 'cpu-cadet', 'cpu-marshal'], 3, ['ALICE', null, null]);

    expect(match.profiles.length).toBe(3);
    expect(match.roundsToWin).toBe(3);
    expect(match.profiles[0].displayName).toBe('ALICE');
    expect(match.profiles[1].displayName).toBeNull();
    expect(match.round).toBe(1);
    expect(match.currentSale).toBeNull();
    expect(match.matchWinnerId).toBeNull();

    match.profiles.forEach((profile) => {
      expect(profile.cash).toBe(GAME_CONFIG.match.startingCash);
      GAME_CONFIG.weapons.forEach((weapon) => {
        expect(profile.ammo[weapon.id]).toBe(weapon.startingAmmo);
      });
    });
  });

  it('nextActivePlayer skips dead tanks', () => {
    const tanks = [
      makeTank({ id: 0, alive: true }),
      makeTank({ id: 1, alive: false }),
      makeTank({ id: 2, alive: true }),
      makeTank({ id: 3, alive: true })
    ];

    const next = system.nextActivePlayer(0, tanks);
    expect(next).toBe(2);
  });

  it('nextActivePlayer wraps around', () => {
    const tanks = [
      makeTank({ id: 0, alive: true }),
      makeTank({ id: 1, alive: false }),
      makeTank({ id: 2, alive: false }),
      makeTank({ id: 3, alive: false })
    ];

    const next = system.nextActivePlayer(3, tanks);
    expect(next).toBe(0);
  });

  it('nextActivePlayer returns current id when all dead', () => {
    const tanks = [
      makeTank({ id: 0, alive: false }),
      makeTank({ id: 1, alive: false }),
      makeTank({ id: 2, alive: false }),
      makeTank({ id: 3, alive: false })
    ];

    const next = system.nextActivePlayer(1, tanks);
    expect(next).toBe(1);
  });

  it('findWinner returns null when two or more alive', () => {
    const tanks = [
      makeTank({ id: 0, alive: true }),
      makeTank({ id: 1, alive: true })
    ];

    const winner = system.findWinner(tanks);
    expect(winner).toBeNull();
  });

  it('findWinner returns the single alive tank', () => {
    const tanks = [
      makeTank({ id: 0, alive: false }),
      makeTank({ id: 1, alive: false }),
      makeTank({ id: 2, alive: true }),
      makeTank({ id: 3, alive: false })
    ];

    const winner = system.findWinner(tanks);
    expect(winner).toBe(2);
  });

  it('rollWind generates valid wind states', () => {
    for (let i = 0; i < 100; i += 1) {
      const wind = system.rollWind();

      expect(wind.direction === -1 || wind.direction === 1).toBe(true);
      expect(Number.isInteger(wind.magnitude)).toBe(true);
      expect(wind.magnitude).toBeGreaterThanOrEqual(GAME_CONFIG.wind.min);
      expect(wind.magnitude).toBeLessThanOrEqual(GAME_CONFIG.wind.max);
    }
  });

  it('saveTanksToProfiles copies ammo and makes it a separate copy', () => {
    const match = system.createMatchState(['human', 'cpu-cadet']);
    const tanks = [
      makeTank({ id: 0, ammo: { 'small-missile': -1, 'big-missile': 5 }, parachutes: 2, defenses: { 'shield': 1 } }),
      makeTank({ id: 1, ammo: { 'small-missile': -1, 'big-missile': 3 }, parachutes: 0, defenses: { 'shield': 2 } })
    ];

    system.saveTanksToProfiles(tanks, match);

    expect(match.profiles[0].ammo['big-missile']).toBe(5);
    expect(match.profiles[0].parachutes).toBe(2);
    expect(match.profiles[0].defenses['shield']).toBe(1);
    expect(match.profiles[1].ammo['big-missile']).toBe(3);
    expect(match.profiles[1].parachutes).toBe(0);
    expect(match.profiles[1].defenses['shield']).toBe(2);

    tanks[0].ammo['big-missile'] = 999;
    expect(match.profiles[0].ammo['big-missile']).toBe(5);
  });

  it('isRoundOver false with 2 alive', () => {
    const tanks = [
      makeTank({ id: 0, alive: true }),
      makeTank({ id: 1, alive: true }),
      makeTank({ id: 2, alive: false }),
      makeTank({ id: 3, alive: false })
    ];

    expect(system.isRoundOver(tanks)).toBe(false);
  });

  it('isRoundOver true with exactly 1 alive', () => {
    const tanks = [
      makeTank({ id: 0, alive: false }),
      makeTank({ id: 1, alive: true }),
      makeTank({ id: 2, alive: false }),
      makeTank({ id: 3, alive: false })
    ];

    expect(system.isRoundOver(tanks)).toBe(true);
  });

  it('isRoundOver true with 0 alive', () => {
    const tanks = [
      makeTank({ id: 0, alive: false }),
      makeTank({ id: 1, alive: false }),
      makeTank({ id: 2, alive: false }),
      makeTank({ id: 3, alive: false })
    ];

    expect(system.isRoundOver(tanks)).toBe(true);
  });

  it('createMatchState profiles have batteries === startingBatteries', () => {
    const match = system.createMatchState(['human', 'cpu-cadet']);
    match.profiles.forEach((profile) => {
      expect(profile.batteries).toBe(GAME_CONFIG.match.startingBatteries);
    });
  });

  it('saveTanksToProfiles copies batteries', () => {
    const match = system.createMatchState(['human', 'cpu-cadet']);
    const tanks = [
      makeTank({ id: 0, batteries: 5 }),
      makeTank({ id: 1, batteries: 3 })
    ];

    system.saveTanksToProfiles(tanks, match);

    expect(match.profiles[0].batteries).toBe(5);
    expect(match.profiles[1].batteries).toBe(3);
  });

  it('createMatchState with default wallMode sets both wallMode and activeWallMode to none', () => {
    const match = system.createMatchState(['human', 'cpu-cadet']);

    expect(match.wallMode).toBe('none');
    expect(match.activeWallMode).toBe('none');
  });

  it('createMatchState with concrete wallMode sets wallMode and activeWallMode correctly', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'concrete');

    expect(match.wallMode).toBe('concrete');
    expect(match.activeWallMode).toBe('concrete');
  });

  it('createMatchState with rubber wallMode sets wallMode and activeWallMode correctly', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'rubber');

    expect(match.wallMode).toBe('rubber');
    expect(match.activeWallMode).toBe('rubber');
  });

  it('createMatchState with random wallMode resolves to a concrete candidate', () => {
    for (let i = 0; i < 50; i += 1) {
      const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'random');
      expect(match.wallMode).toBe('random');
      expect(['concrete', 'padded', 'rubber', 'spring', 'wraparound']).toContain(match.activeWallMode);
      expect(match.activeWallMode).not.toBe('random');
      expect(match.activeWallMode).not.toBe('erratic');
    }
  });

  it('createMatchState with erratic wallMode resolves to a concrete candidate', () => {
    for (let i = 0; i < 50; i += 1) {
      const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'erratic');
      expect(match.wallMode).toBe('erratic');
      expect(['concrete', 'padded', 'rubber', 'spring', 'wraparound']).toContain(match.activeWallMode);
      expect(match.activeWallMode).not.toBe('random');
      expect(match.activeWallMode).not.toBe('erratic');
    }
  });

  it('resolveWallMode with none mode does not change activeWallMode', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'none');
    const initialMode = match.activeWallMode;

    system.resolveWallMode(match);

    expect(match.activeWallMode).toBe(initialMode);
    expect(match.activeWallMode).toBe('none');
  });

  it('resolveWallMode with concrete mode does not change activeWallMode', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'concrete');
    const initialMode = match.activeWallMode;

    system.resolveWallMode(match);

    expect(match.activeWallMode).toBe(initialMode);
    expect(match.activeWallMode).toBe('concrete');
  });

  it('resolveWallMode with random mode re-rolls activeWallMode', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'random');
    const modeSet = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      system.resolveWallMode(match);
      expect(match.wallMode).toBe('random');
      expect(['concrete', 'padded', 'rubber', 'spring', 'wraparound']).toContain(match.activeWallMode);
      modeSet.add(match.activeWallMode);
    }

    // Over 50 iterations, we should see at least 2 different modes (statistically very likely)
    expect(modeSet.size).toBeGreaterThanOrEqual(2);
  });

  it('resolveWallMode with erratic mode re-rolls activeWallMode', () => {
    const match = system.createMatchState(['human', 'cpu-cadet'], 2, [], 'erratic');
    const modeSet = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      system.resolveWallMode(match);
      expect(match.wallMode).toBe('erratic');
      expect(['concrete', 'padded', 'rubber', 'spring', 'wraparound']).toContain(match.activeWallMode);
      modeSet.add(match.activeWallMode);
    }

    // Over 50 iterations, we should see at least 2 different modes (statistically very likely)
    expect(modeSet.size).toBeGreaterThanOrEqual(2);
  });
});
