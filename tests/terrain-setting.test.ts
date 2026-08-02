import { describe, it, expect } from 'vitest';
import {
  TERRAIN_KINDS,
  TERRAIN_LABELS,
  TERRAIN_SETTINGS,
  resolveTerrainSetting,
  type TerrainKind
} from '../src/game/types/GameTypes';

describe('Terrain setting', () => {
  it('TERRAIN_KINDS is exactly the 7-entry pack order', () => {
    expect(TERRAIN_KINDS).toEqual(['desert', 'forest', 'snow', 'volcanic', 'lunar', 'urban', 'alien']);
    expect(TERRAIN_KINDS.length).toBe(7);
  });

  it('TERRAIN_SETTINGS is ["random", ...TERRAIN_KINDS] (8 entries)', () => {
    expect(TERRAIN_SETTINGS).toEqual(['random', 'desert', 'forest', 'snow', 'volcanic', 'lunar', 'urban', 'alien']);
    expect(TERRAIN_SETTINGS.length).toBe(8);
  });

  it('resolveTerrainSetting returns identity for every non-random setting', () => {
    for (const kind of TERRAIN_KINDS) {
      expect(resolveTerrainSetting(kind)).toBe(kind);
    }
  });

  it('resolveTerrainSetting("random") returns a member of TERRAIN_KINDS every time', () => {
    for (let i = 0; i < 50; i += 1) {
      const result = resolveTerrainSetting('random');
      expect(TERRAIN_KINDS).toContain(result);
    }
  });

  it('TERRAIN_LABELS covers all 8 settings with non-empty strings', () => {
    for (const setting of TERRAIN_SETTINGS) {
      expect(TERRAIN_LABELS[setting]).toBeDefined();
      expect(typeof TERRAIN_LABELS[setting]).toBe('string');
      expect(TERRAIN_LABELS[setting].length).toBeGreaterThan(0);
    }
  });
});
