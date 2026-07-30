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

  it('applyLiquid fills a pit toward surface level', () => {
    const terrain = makeFlatTerrain(250);
    // Create a rectangular pit: indices 76-84 are 50px deeper
    for (let i = 76; i <= 84; i += 1) {
      terrain.heights[i] = 300;
    }

    // Fill with volume that should roughly fill the pit
    // 9 samples * 50 deep * 6 segmentWidth = 2700
    system.applyLiquid(terrain, 480, 2700);

    // Pit columns should rise close to 250
    for (let i = 76; i <= 84; i += 1) {
      expect(terrain.heights[i]).toBeLessThan(300);
      expect(terrain.heights[i]).toBeGreaterThan(249);
      expect(terrain.heights[i]).toBeLessThan(252);
    }
    // Flat columns outside pit stay 250
    expect(terrain.heights[0]).toBe(250);
    expect(terrain.heights[160]).toBe(250);
  });

  it('applyLiquid partially fills a pit with less volume', () => {
    const terrain = makeFlatTerrain(250);
    // Create the same pit
    for (let i = 76; i <= 84; i += 1) {
      terrain.heights[i] = 300;
    }

    // Fill with partial volume
    system.applyLiquid(terrain, 480, 600);

    // Pit columns should rise but stay > 250 (partially filled)
    for (let i = 76; i <= 84; i += 1) {
      expect(terrain.heights[i]).toBeLessThan(300);
      expect(terrain.heights[i]).toBeGreaterThan(250);
    }
    // Outside columns untouched
    expect(terrain.heights[0]).toBe(250);
  });

  it('applySettle smooths terrain within radius', () => {
    const terrain = makeFlatTerrain(250);
    // Create alternating heights across window
    for (let i = 40; i < 120; i += 2) {
      terrain.heights[i] = 240;
      terrain.heights[i + 1] = 260;
    }

    // Store some original values to verify they changed
    const origAtCenter = terrain.heights[80];

    system.applySettle(terrain, 480, 80);

    // Settling should have changed center values toward average
    const settledAtCenter = terrain.heights[80];
    expect(settledAtCenter).not.toBe(origAtCenter);
    expect(settledAtCenter).toBeCloseTo(250, 0);

    // Far columns outside settle radius should be unchanged
    expect(terrain.heights[0]).toBe(250);
    expect(terrain.heights[160]).toBe(250);
  });
});
