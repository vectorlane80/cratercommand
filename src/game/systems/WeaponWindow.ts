export const WEAPON_WINDOW_SIZE = 8;

/** Scroll `start` the minimum amount needed to keep `selected` visible, clamped to valid range. */
export function adjustWindow(start: number, selected: number, total: number, size: number = WEAPON_WINDOW_SIZE): number {
  const maxStart = Math.max(0, total - size);
  let result = Math.max(0, Math.min(start, maxStart));
  if (selected < result) {
    result = selected;
  } else if (selected > result + size - 1) {
    result = selected - size + 1;
  }
  return Math.max(0, Math.min(result, maxStart));
}

/** Next selectable weapon index cycling from `current` in `direction`, skipping
 *  indices where hasAmmo(i) is false, wrapping around `total`. Returns `current`
 *  when no other selectable weapon exists. */
export function cycleWeapon(current: number, direction: 1 | -1, hasAmmo: (index: number) => boolean, total: number): number {
  for (let k = 1; k < total; k += 1) {
    const candidate = ((current + direction * k) % total + total) % total;
    if (hasAmmo(candidate)) return candidate;
  }
  return current;
}
