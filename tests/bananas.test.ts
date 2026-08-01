import { describe, it, expect } from 'vitest';
import {
  BANANA_WEAPON,
  BANANAS_DISPLAY_CYCLE,
  GAME_CONFIG,
  nextBananasDisplay
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
});
