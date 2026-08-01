import { describe, expect, it } from 'vitest';
import { bananaSpinStep } from '../src/game/systems/ProjectileSystem';

describe('Bananas look', () => {
  it('advances the banana spin every 90ms and wraps after four steps', () => {
    expect(bananaSpinStep(0)).toBe(0);
    expect(bananaSpinStep(89)).toBe(0);
    expect(bananaSpinStep(90)).toBe(1);
    expect(bananaSpinStep(180)).toBe(2);
    expect(bananaSpinStep(270)).toBe(3);
    expect(bananaSpinStep(360)).toBe(0);
  });

  it('fills velocity meter segments using floor(power / 10)', () => {
    expect(Math.floor(62 / 10)).toBe(6);
    expect(Math.floor(100 / 10)).toBe(10);
    expect(Math.floor(15 / 10)).toBe(1);
  });
});
