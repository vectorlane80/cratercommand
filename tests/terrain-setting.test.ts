import { describe, it, expect } from 'vitest';
import {
  TERRAIN_KINDS,
  TERRAIN_LABELS,
  TERRAIN_SETTINGS,
  TERRAIN_PALETTES,
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

  it('TERRAIN_PALETTES has all 7 keys', () => {
    for (const kind of TERRAIN_KINDS) {
      expect(TERRAIN_PALETTES[kind]).toBeDefined();
    }
    expect(Object.keys(TERRAIN_PALETTES).length).toBe(7);
  });

  it('desert palette has exact identity colors', () => {
    expect(TERRAIN_PALETTES.desert.retro.dirt).toBe(0x4b2b10);
    expect(TERRAIN_PALETTES.desert.retro.lip).toBe(0xc68417);
    expect(TERRAIN_PALETTES.desert.hires.top).toBe(0x9a5f26);
  });

  it('snow palette has exact identity colors', () => {
    expect(TERRAIN_PALETTES.snow.retro.dirt).toBe(0xdfe9f2);
  });

  it('alien palette has exact identity colors', () => {
    expect(TERRAIN_PALETTES.alien.classic.ridge).toBe(0x00ffc6);
  });

  it('every palette has classic, retro, and hires sections', () => {
    for (const kind of TERRAIN_KINDS) {
      const palette = TERRAIN_PALETTES[kind];
      expect(palette.classic).toBeDefined();
      expect(palette.retro).toBeDefined();
      expect(palette.hires).toBeDefined();
    }
  });

  it('all numeric palette colors are valid 24-bit hex values', () => {
    for (const kind of TERRAIN_KINDS) {
      const palette = TERRAIN_PALETTES[kind];

      // Classic colors
      expect(typeof palette.classic.flat).toBe('number');
      expect(typeof palette.classic.ridge).toBe('number');
      expect(typeof palette.classic.hatch).toBe('number');
      expect(palette.classic.flat).toBeGreaterThanOrEqual(0);
      expect(palette.classic.flat).toBeLessThanOrEqual(0xffffff);
      expect(palette.classic.ridge).toBeGreaterThanOrEqual(0);
      expect(palette.classic.ridge).toBeLessThanOrEqual(0xffffff);
      expect(palette.classic.hatch).toBeGreaterThanOrEqual(0);
      expect(palette.classic.hatch).toBeLessThanOrEqual(0xffffff);

      // Retro colors
      expect(typeof palette.retro.dirt).toBe('number');
      expect(typeof palette.retro.dark).toBe('number');
      expect(typeof palette.retro.lip).toBe('number');
      expect(typeof palette.retro.hi).toBe('number');
      expect(palette.retro.dirt).toBeGreaterThanOrEqual(0);
      expect(palette.retro.dirt).toBeLessThanOrEqual(0xffffff);
      expect(palette.retro.dark).toBeGreaterThanOrEqual(0);
      expect(palette.retro.dark).toBeLessThanOrEqual(0xffffff);
      expect(palette.retro.lip).toBeGreaterThanOrEqual(0);
      expect(palette.retro.lip).toBeLessThanOrEqual(0xffffff);
      expect(palette.retro.hi).toBeGreaterThanOrEqual(0);
      expect(palette.retro.hi).toBeLessThanOrEqual(0xffffff);

      // Retro specks (array of 3 colors)
      expect(Array.isArray(palette.retro.specks)).toBe(true);
      expect(palette.retro.specks.length).toBe(3);
      for (const speck of palette.retro.specks) {
        expect(typeof speck).toBe('number');
        expect(speck).toBeGreaterThanOrEqual(0);
        expect(speck).toBeLessThanOrEqual(0xffffff);
      }

      // Hires numeric colors
      expect(typeof palette.hires.top).toBe('number');
      expect(typeof palette.hires.mid).toBe('number');
      expect(typeof palette.hires.deep).toBe('number');
      expect(palette.hires.top).toBeGreaterThanOrEqual(0);
      expect(palette.hires.top).toBeLessThanOrEqual(0xffffff);
      expect(palette.hires.mid).toBeGreaterThanOrEqual(0);
      expect(palette.hires.mid).toBeLessThanOrEqual(0xffffff);
      expect(palette.hires.deep).toBeGreaterThanOrEqual(0);
      expect(palette.hires.deep).toBeLessThanOrEqual(0xffffff);

      // Hires glow/spec/rubble color+alpha objects
      expect(typeof palette.hires.glow).toBe('object');
      expect(typeof palette.hires.spec).toBe('object');
      expect(typeof palette.hires.rubble).toBe('object');
      expect(palette.hires.glow.color).toBeGreaterThanOrEqual(0);
      expect(palette.hires.glow.color).toBeLessThanOrEqual(0xffffff);
      expect(palette.hires.glow.alpha).toBeGreaterThanOrEqual(0);
      expect(palette.hires.glow.alpha).toBeLessThanOrEqual(1);
      expect(palette.hires.spec.color).toBeGreaterThanOrEqual(0);
      expect(palette.hires.spec.color).toBeLessThanOrEqual(0xffffff);
      expect(palette.hires.spec.alpha).toBeGreaterThanOrEqual(0);
      expect(palette.hires.spec.alpha).toBeLessThanOrEqual(1);
      expect(palette.hires.rubble.color).toBeGreaterThanOrEqual(0);
      expect(palette.hires.rubble.color).toBeLessThanOrEqual(0xffffff);
      expect(palette.hires.rubble.alpha).toBeGreaterThanOrEqual(0);
      expect(palette.hires.rubble.alpha).toBeLessThanOrEqual(1);
    }
  });
});
