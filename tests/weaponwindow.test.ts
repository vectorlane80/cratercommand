import { describe, it, expect } from 'vitest';
import { adjustWindow, cycleWeapon, WEAPON_WINDOW_SIZE } from '../src/game/systems/WeaponWindow';

describe('WeaponWindow', () => {
  it('adjustWindow: selection inside window → start unchanged', () => {
    const start = adjustWindow(2, 4, 20, 8);
    expect(start).toBe(2);
  });

  it('adjustWindow: selection below start → start = selected', () => {
    const start = adjustWindow(5, 2, 20, 8);
    expect(start).toBe(2);
  });

  it('adjustWindow: selection past window end → start adjusted', () => {
    const start = adjustWindow(0, 9, 20, 8);
    expect(start).toBe(2);
  });

  it('adjustWindow: start clamped when total ≤ 8', () => {
    const start = adjustWindow(10, 3, 5, 8);
    expect(start).toBe(0);
  });

  it('adjustWindow: start clamped at total - 8 for large starts', () => {
    const start = adjustWindow(100, 15, 20, 8);
    expect(start).toBe(12);
  });

  it('cycleWeapon: skips an empty middle weapon', () => {
    const hasAmmo = (i: number) => i !== 2;
    const result = cycleWeapon(1, 1, hasAmmo, 5);
    expect(result).toBe(3);
  });

  it('cycleWeapon: wraps from last to first', () => {
    const hasAmmo = () => true;
    const result = cycleWeapon(4, 1, hasAmmo, 5);
    expect(result).toBe(0);
  });

  it('cycleWeapon: direction -1 wraps from 0 to total-1', () => {
    const hasAmmo = () => true;
    const result = cycleWeapon(0, -1, hasAmmo, 5);
    expect(result).toBe(4);
  });

  it('cycleWeapon: returns current when every other index has no ammo', () => {
    const hasAmmo = (i: number) => i === 2;
    const result = cycleWeapon(2, 1, hasAmmo, 5);
    expect(result).toBe(2);
  });

  it('cycleWeapon: with all ammo, +1 returns current+1', () => {
    const hasAmmo = () => true;
    const result = cycleWeapon(2, 1, hasAmmo, 8);
    expect(result).toBe(3);
  });
});
