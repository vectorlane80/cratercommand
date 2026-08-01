import { describe, it, expect } from 'vitest';
import {
  BANANA_WEAPON,
  BANANAS_DISPLAY_CYCLE,
  BANANAS_PHOSPHORS,
  GAME_CONFIG,
  bananasInk,
  bananasIs1Bit,
  nextBananasDisplay,
  setBananasDisplayInk
} from '../src/game/types/GameTypes';

describe('Bananas mode', () => {
  it('BANANA_WEAPON.damage > GAME_CONFIG.tank.maxHealth (one-hit-kill invariant)', () => {
    expect(BANANA_WEAPON.damage).toBeGreaterThan(GAME_CONFIG.tank.maxHealth);
  });

  it('BANANA_WEAPON.craterRadius === 30, behavior "single", id "banana"', () => {
    expect(BANANA_WEAPON.craterRadius).toBe(30);
    expect(BANANA_WEAPON.behavior).toBe('single');
    expect(BANANA_WEAPON.id).toBe('banana');
  });

  it('GAME_CONFIG.weapons.length === 39 and no entry with id "banana"', () => {
    expect(GAME_CONFIG.weapons.length).toBe(39);
    const hasBanana = GAME_CONFIG.weapons.some((w) => w.id === 'banana');
    expect(hasBanana).toBe(false);
  });

  it('BANANAS_DISPLAY_CYCLE is the exact order ["16color","amber","green","white"]', () => {
    expect(BANANAS_DISPLAY_CYCLE).toEqual(['16color', 'amber', 'green', 'white']);
  });

  it('nextBananasDisplay wraps: "16color"→"amber", "white"→"16color"', () => {
    expect(nextBananasDisplay('16color')).toBe('amber');
    expect(nextBananasDisplay('amber')).toBe('green');
    expect(nextBananasDisplay('green')).toBe('white');
    expect(nextBananasDisplay('white')).toBe('16color');
  });

  it('resolves Bananas phosphor inks and restores 16-color identity', () => {
    try {
      setBananasDisplayInk('amber');
      expect(bananasInk(0xffff55)).toBe(0xffb000);
      expect(bananasInk(0x0000aa)).toBe(0x000000);
      expect(bananasInk(0x555555)).toBe(0x000000);
      expect(bananasInk(0xaa5500)).toBe(0xffb000);
      expect(bananasIs1Bit()).toBe(true);

      setBananasDisplayInk('green');
      expect(BANANAS_PHOSPHORS.green).toBe(0x33ff33);
      expect(bananasInk(0xffff55)).toBe(0x33ff33);

      setBananasDisplayInk('white');
      expect(BANANAS_PHOSPHORS.white).toBe(0xf0f0f0);
      expect(bananasInk(0xffff55)).toBe(0xf0f0f0);

      setBananasDisplayInk('16color');
      const egaValues = [
        0x000000, 0x0000aa, 0x00aa00, 0x00aaaa,
        0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
        0x555555, 0x5555ff, 0x55ff55, 0x55ffff,
        0xff5555, 0xff55ff, 0xffff55, 0xffffff
      ];
      egaValues.forEach((color) => expect(bananasInk(color)).toBe(color));
      expect(bananasIs1Bit()).toBe(false);
    } finally {
      setBananasDisplayInk('16color');
    }
  });
});
