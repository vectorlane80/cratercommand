import { describe, it, expect } from 'vitest';
import { TerrainSystem } from '../src/game/systems/TerrainSystem';
import { GAME_CONFIG } from '../src/game/types/GameTypes';
import { makeFlatTerrain } from './helpers';

describe('TerrainSystem', () => {
  const system = new TerrainSystem();

  it('generate produces correct dimensions and bounds', () => {
    const terrain = system.generate(960, 356);

    expect(terrain.heights.length).toBe(GAME_CONFIG.terrain.sampleCount);
    expect(terrain.width).toBe(960);
    expect(terrain.height).toBe(356);
    expect(terrain.segmentWidth).toBe(960 / (GAME_CONFIG.terrain.sampleCount - 1));

    terrain.heights.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(GAME_CONFIG.terrain.minY);
      expect(h).toBeLessThanOrEqual(GAME_CONFIG.terrain.maxY);
    });
  });

  it('getHeightAtX interpolates linearly', () => {
    const terrain = {
      heights: [100, 200],
      width: 12,
      height: 356,
      segmentWidth: 6
    };

    const heightAtMidpoint = system.getHeightAtX(terrain, 3);
    expect(heightAtMidpoint).toBe(150);
  });

  it('isBelowTerrain on flat terrain at y=250', () => {
    const terrain = makeFlatTerrain(250);

    expect(system.isBelowTerrain(terrain, 480, 240)).toBe(false);
    expect(system.isBelowTerrain(terrain, 480, 260)).toBe(true);
    expect(system.isBelowTerrain(terrain, -5, 260)).toBe(false);
  });

  it('applyCrater deepens terrain at impact and stays within bounds', () => {
    const terrain = makeFlatTerrain(250);
    const centerIndex = 80;

    system.applyCrater(terrain, 480, 250, 30);

    expect(terrain.heights[centerIndex]).toBeGreaterThan(250);
    expect(terrain.heights[centerIndex]).toBeLessThanOrEqual(GAME_CONFIG.terrain.craterMaxY);
    expect(terrain.heights[0]).toBe(250);
    expect(terrain.heights[160]).toBe(250);

    terrain.heights.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(250);
    });
  });

  it('applyMound raises terrain at impact', () => {
    const terrain = makeFlatTerrain(250);
    const centerIndex = 80;

    system.applyMound(terrain, 480, 250, 42);

    expect(terrain.heights[centerIndex]).toBeLessThan(250);
    expect(terrain.heights[0]).toBe(250);
    expect(terrain.heights[160]).toBe(250);

    terrain.heights.forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(GAME_CONFIG.terrain.minY);
    });
  });

  it('applyCrater clamps to craterMaxY', () => {
    const terrain = makeFlatTerrain(340);

    system.applyCrater(terrain, 480, 350, 60);

    terrain.heights.forEach((h) => {
      expect(h).toBeLessThanOrEqual(GAME_CONFIG.terrain.craterMaxY);
    });
  });

  it('applyTunnel carves surface near bore point and returns true', () => {
    const terrain = makeFlatTerrain(250);

    const changed = system.applyTunnel(terrain, 480, 250, 8);

    expect(changed).toBe(true);
    // Surface collapses DOWN to the tunnel floor: height value increases to y + radius.
    expect(terrain.heights[80]).toBeCloseTo(258, 5);
    expect(terrain.heights[80]).toBeGreaterThan(250);
    // Heights far from tunnel should be unchanged
    expect(terrain.heights[0]).toBe(250);
    expect(terrain.heights[160]).toBe(250);
  });

  it('applyTunnel deep underground does not change surface and returns false', () => {
    const terrain = makeFlatTerrain(250);

    const changed = system.applyTunnel(terrain, 480, 320, 8);

    expect(changed).toBe(false);
    terrain.heights.forEach((h) => {
      expect(h).toBe(250);
    });
  });
});
