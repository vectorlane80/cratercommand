import { describe, it, expect } from 'vitest';
// Pinned against the design mock's xorshift32 stream (seed 90210) — a wrong
// port would still be self-consistent, so determinism alone can't catch it.
const MOCK_STREAM_90210 = [0.6784054571762681, 0.5472011861857027, 0.1378268119879067, 0.1302190322894603];
import { TerrainSystem, bananasRng, bananasBuildings } from '../src/game/systems/TerrainSystem';
import { GAME_CONFIG } from '../src/game/types/GameTypes';

describe('Bananas terrain', () => {
  const system = new TerrainSystem();

  it('bananasRng is deterministic and stays in range', () => {
    const first = bananasRng(90210);
    const second = bananasRng(90210);
    const firstOutputs = Array.from({ length: 5 }, () => first());
    const secondOutputs = Array.from({ length: 5 }, () => second());

    expect(firstOutputs).toEqual(secondOutputs);
    firstOutputs.forEach((output) => {
      expect(output).toBeGreaterThanOrEqual(0);
      expect(output).toBeLessThan(1);
    });
  });

  it('bananasRng reproduces the design mock stream exactly (seed 90210)', () => {
    const rand = bananasRng(90210);
    MOCK_STREAM_90210.forEach((expected) => {
      expect(rand()).toBe(expected);
    });
  });

  it('first buildings match the capped formula for seed 90210: w 101 h 191, then w 68 h 137', () => {
    const buildings = bananasBuildings(90210, 960);
    expect(buildings[0].w).toBe(101);
    expect(buildings[0].roof).toBe(356 - 191);
    expect(buildings[1].x).toBe(101);
    expect(buildings[1].w).toBe(68);
    expect(buildings[1].roof).toBe(356 - 137);
  });

  it('bananasBuildings covers the skyline with preview dimensions and metadata', () => {
    const buildings = bananasBuildings(90210, 960);

    expect(buildings[0].x).toBe(0);
    for (let i = 1; i < buildings.length; i += 1) {
      expect(buildings[i].x).toBe(buildings[i - 1].x + buildings[i - 1].w);
    }
    const last = buildings[buildings.length - 1];
    expect(last.x + last.w).toBe(960);

    buildings.forEach((building, index) => {
      expect(building.w).toBeGreaterThanOrEqual(1);
      expect(building.w).toBeLessThanOrEqual(120);
      expect(building.roof).toBeGreaterThanOrEqual(106);
      expect(building.roof).toBeLessThanOrEqual(236);
      expect(building.seed).toBe((building.x * 7919) | 0);
      expect(building.colorIndex).toBe(index % 3);
    });
  });

  it('generateBananasSkyline is deterministic with flat building roofs', () => {
    const buildings = bananasBuildings(90210, 960);
    const first = system.generateBananasSkyline(960, 356, 90210);
    const second = system.generateBananasSkyline(960, 356, 90210);

    expect(first.heights.length).toBe(GAME_CONFIG.terrain.sampleCount);
    expect(second.heights).toEqual(first.heights);

    first.heights.forEach((height, index) => {
      const x = index * first.segmentWidth;
      const building = buildings.find((b) => x > b.x + first.segmentWidth && x < b.x + b.w - first.segmentWidth);
      if (building) expect(height).toBe(building.roof);
    });
  });

  it('applyCrater carves skyline terrain without changing distant heights', () => {
    const buildings = bananasBuildings(90210, 960);
    const building = buildings[Math.floor(buildings.length / 2)];
    const terrain = system.generateBananasSkyline(960, 356, 90210);
    const originalHeights = terrain.heights.slice();
    const centerX = building.x + building.w / 2;
    const centerIndex = Math.round(centerX / terrain.segmentWidth);

    system.applyCrater(terrain, centerX, building.roof, 30);

    expect(terrain.heights[centerIndex]).toBeGreaterThan(building.roof);
    expect(terrain.heights[0]).toBe(originalHeights[0]);
    expect(terrain.heights[terrain.heights.length - 1]).toBe(originalHeights[originalHeights.length - 1]);
  });
});
