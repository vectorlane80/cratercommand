import { describe, it, expect } from 'vitest';
import {
  TERRAIN_KINDS,
  TERRAIN_LABELS,
  TERRAIN_SETTINGS,
  quadPoints,
  TERRAIN_PALETTES,
  TERRAIN_PROPS,
  resolveTerrainSetting,
  type TerrainKind
} from '../src/game/types/GameTypes';
import { TerrainSystem, terrainPropAnchors } from '../src/game/systems/TerrainSystem';
import { makeFlatTerrain } from './helpers';

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

  it('TERRAIN_PROPS has all 7 keys, each a 4-entry list', () => {
    for (const kind of TERRAIN_KINDS) {
      expect(TERRAIN_PROPS[kind]).toBeDefined();
      expect(Array.isArray(TERRAIN_PROPS[kind])).toBe(true);
      expect(TERRAIN_PROPS[kind].length).toBe(4);
    }
    expect(Object.keys(TERRAIN_PROPS).length).toBe(7);
  });

  it('TERRAIN_PROPS snow is exactly [conifer_snow, boulder_snow, log_snow, conifer_snow]', () => {
    expect(TERRAIN_PROPS.snow).toEqual(['conifer_snow', 'boulder_snow', 'log_snow', 'conifer_snow']);
  });

  it('terrainPropAnchors returns 4 anchors on flat terrain, all x in [74, 886]', () => {
    const terrain = makeFlatTerrain(300);
    const terrainSystem = new TerrainSystem();
    const anchors = terrainPropAnchors(terrainSystem, terrain, 4, 22);

    expect(anchors.length).toBe(4);
    for (const anchor of anchors) {
      expect(anchor.x).toBeGreaterThanOrEqual(74);
      expect(anchor.x).toBeLessThanOrEqual(886);
    }
  });

  it('terrainPropAnchors: none within 58 of x=125 or x=835', () => {
    const terrain = makeFlatTerrain(300);
    const terrainSystem = new TerrainSystem();
    const anchors = terrainPropAnchors(terrainSystem, terrain, 4, 22);

    for (const anchor of anchors) {
      expect(Math.abs(anchor.x - 125)).toBeGreaterThanOrEqual(58);
      expect(Math.abs(anchor.x - 835)).toBeGreaterThanOrEqual(58);
    }
  });

  it('terrainPropAnchors: pairwise spacing >= 74', () => {
    const terrain = makeFlatTerrain(300);
    const terrainSystem = new TerrainSystem();
    const anchors = terrainPropAnchors(terrainSystem, terrain, 4, 22);

    for (let i = 0; i < anchors.length - 1; i += 1) {
      const spacing = anchors[i + 1].x - anchors[i].x;
      expect(spacing).toBeGreaterThanOrEqual(74);
    }
  });

  it('terrainPropAnchors: returns sorted by x', () => {
    const terrain = makeFlatTerrain(300);
    const terrainSystem = new TerrainSystem();
    const anchors = terrainPropAnchors(terrainSystem, terrain, 4, 22);

    for (let i = 0; i < anchors.length - 1; i += 1) {
      expect(anchors[i].x).toBeLessThanOrEqual(anchors[i + 1].x);
    }
  });

  it('scale formula computes to [0.85, 1.06, 0.99, 0.92] for i=[0,1,2,3]', () => {
    const scales: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const scale = 0.85 + ((i * 7) % 4) * 0.07;
      scales.push(scale);
    }
    // Verify the formula: i=0: (0*7)%4=0 → 0.85+0*0.07=0.85
    //                     i=1: (1*7)%4=3 → 0.85+3*0.07=0.85+0.21=1.06
    //                     i=2: (2*7)%4=2 → 0.85+2*0.07=0.85+0.14=0.99
    //                     i=3: (3*7)%4=1 → 0.85+1*0.07=0.85+0.07=0.92
    expect(scales[0]).toBeCloseTo(0.85, 5);
    expect(scales[1]).toBeCloseTo(1.06, 5);
    expect(scales[2]).toBeCloseTo(0.99, 5);
    expect(scales[3]).toBeCloseTo(0.92, 5);
  });
});

describe('quadPoints', () => {
  it('returns n+1 points', () => {
    const pts = quadPoints(0, 0, 10, 20, 20, 0, 8);
    expect(pts.length).toBe(9);
  });

  it('endpoints are exact', () => {
    const pts = quadPoints(0, 0, 10, 20, 20, 0, 8);
    expect(pts[0].x).toBe(0);
    expect(pts[0].y).toBe(0);
    expect(pts[8].x).toBe(20);
    expect(pts[8].y).toBe(0);
  });

  it('midpoint of a symmetric quad lies on the expected axis', () => {
    // Symmetric quadratic: P0=(0,0), CP=(10,20), P1=(20,0).
    // The curve is symmetric about x=10, and t=0.5 gives (10, 10).
    const pts = quadPoints(0, 0, 10, 20, 20, 0, 4);
    const mid = pts[2]; // t = 2/4 = 0.5
    expect(mid.x).toBeCloseTo(10, 5);
    expect(mid.y).toBeCloseTo(10, 5);
  });
});

describe('latitude-line half-length formula', () => {
  const R = 38;

  it('i=0 gives half === R', () => {
    const half = Math.sqrt(Math.max(0, R * R - (0 * R * 0.3) * (0 * R * 0.3)));
    expect(half).toBe(R);
  });

  it('i=3 gives ~0.436R', () => {
    const i = 3;
    const half = Math.sqrt(Math.max(0, R * R - (i * R * 0.3) * (i * R * 0.3)));
    // R*0.3*3 = R*0.9. sqrt(R² - (0.9R)²) = sqrt(R²(1-0.81)) = R*sqrt(0.19) ≈ R * 0.43589
    expect(half).toBeCloseTo(R * Math.sqrt(0.19), 5);
    expect(half).toBeCloseTo(38 * 0.43589, 3);
  });
});
