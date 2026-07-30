import { GAME_CONFIG, type PlayerProfile, type ItemCategory, type Sale } from '../types/GameTypes';

export const GUIDANCE_IDS = ['heat-guidance', 'ballistic-guidance', 'horizontal-guidance', 'vertical-guidance', 'lazy-boy'] as const;

export interface ShopCatalogEntry {
  key: string;
  name: string;
  basePrice: number;
  bundleSize: number;
  kind: 'weapon' | 'item';
  category: ItemCategory;
}

export class EconomySystem {
  basePriceFor(key: string): number {
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === key);
    if (weapon) return weapon.price;
    const item = GAME_CONFIG.items.find((i) => i.id === key);
    if (item) return item.price;
    return 0;
  }

  bundleSizeFor(key: string): number {
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === key);
    if (weapon) return weapon.bundleSize;
    const item = GAME_CONFIG.items.find((i) => i.id === key);
    if (item) return item.bundleSize;
    return 1;
  }

  effectivePrice(basePrice: number, itemKey: string, round: number, sale: Sale, marketFactor: number = 1): number {
    if (basePrice <= 0) return 0;
    const inflated = basePrice * (1 + (round - 1) * GAME_CONFIG.match.roundPriceInflation);
    const withMarket = inflated * marketFactor;
    const final = sale && sale.itemKey === itemKey ? withMarket * (1 - sale.discount) : withMarket;
    return Math.max(1, Math.round(final));
  }

  priceFor(key: string, round: number, sale: Sale, marketFactors?: Record<string, number>): number {
    return this.effectivePrice(this.basePriceFor(key), key, round, sale, marketFactors?.[key] ?? 1);
  }

  totalPendingCost(pending: Record<string, number>, round: number, sale: Sale, marketFactors?: Record<string, number>): number {
    let total = 0;
    for (const [key, qty] of Object.entries(pending)) {
      total += qty * this.priceFor(key, round, sale, marketFactors);
    }
    return total;
  }

  effectiveCash(profile: PlayerProfile, pending: Record<string, number>, round: number, sale: Sale, marketFactors?: Record<string, number>): number {
    return profile.cash - this.totalPendingCost(pending, round, sale, marketFactors);
  }

  applyPurchases(profile: PlayerProfile, pending: Record<string, number>, round: number, sale: Sale, marketFactors?: Record<string, number>): void {
    for (const [key, qty] of Object.entries(pending)) {
      const cost = qty * this.priceFor(key, round, sale, marketFactors);
      profile.cash -= cost;
      if (key === 'parachute') {
        profile.parachutes += qty * this.bundleSizeFor(key);
      } else if (key === 'auto-defense') {
        profile.autoDefense = true;
      } else if (GAME_CONFIG.items.some((i) => i.id === key && i.category === 'defense' && !i.oneTime)) {
        profile.defenses[key] = (profile.defenses[key] ?? 0) + qty * this.bundleSizeFor(key);
      } else if (key === 'battery') {
        profile.batteries += qty * this.bundleSizeFor(key);
      } else if (key === 'fuel-tank') {
        profile.fuel += qty * this.bundleSizeFor(key) * 10;
      } else if (key === 'contact-trigger') {
        profile.contactTriggers += qty * this.bundleSizeFor(key);
      } else if (GUIDANCE_IDS.includes(key as any)) {
        profile.guidance[key] = (profile.guidance[key] ?? 0) + qty * this.bundleSizeFor(key);
      } else {
        if (profile.ammo[key] === -1) profile.ammo[key] = 0;
        profile.ammo[key] = (profile.ammo[key] ?? 0) + (qty * this.bundleSizeFor(key));
      }
    }
  }

  rollSale(): Sale {
    if (Math.random() >= GAME_CONFIG.match.saleChance) {
      return null;
    }
    const candidates: string[] = [];
    GAME_CONFIG.weapons.forEach((w) => {
      if (w.price > 0) candidates.push(w.id);
    });
    GAME_CONFIG.items.forEach((i) => {
      candidates.push(i.id);
    });
    const itemKey = candidates[Math.floor(Math.random() * candidates.length)];
    const range = GAME_CONFIG.match.maxSaleDiscount - GAME_CONFIG.match.minSaleDiscount;
    const discount = GAME_CONFIG.match.minSaleDiscount + Math.random() * range;
    return { itemKey, discount };
  }

  catalog(): ShopCatalogEntry[] {
    const entries: ShopCatalogEntry[] = [];
    GAME_CONFIG.weapons.forEach((w) => {
      entries.push({
        key: w.id,
        name: w.name,
        basePrice: w.price,
        bundleSize: w.bundleSize,
        kind: 'weapon',
        category: w.category
      });
    });
    GAME_CONFIG.items.forEach((i) => {
      entries.push({
        key: i.id,
        name: i.name,
        basePrice: i.price,
        bundleSize: i.bundleSize,
        kind: 'item',
        category: i.category
      });
    });
    return entries;
  }

  ownedCount(profile: PlayerProfile, key: string): number {
    const weapon = GAME_CONFIG.weapons.find((w) => w.id === key);
    if (weapon) {
      return profile.ammo[key] ?? 0;
    }
    if (key === 'parachute') {
      return profile.parachutes;
    }
    if (key === 'auto-defense') {
      return profile.autoDefense ? 1 : 0;
    }
    if (GAME_CONFIG.items.some((i) => i.id === key && i.category === 'defense')) {
      return profile.defenses[key] ?? 0;
    }
    if (key === 'battery') {
      return profile.batteries;
    }
    if (key === 'fuel-tank') {
      return profile.fuel;
    }
    if (key === 'contact-trigger') {
      return profile.contactTriggers;
    }
    if (GUIDANCE_IDS.includes(key as any)) {
      return profile.guidance[key] ?? 0;
    }
    return 0;
  }

  pageCount(pageSize: number): number {
    return Math.max(1, Math.ceil(this.catalog().length / pageSize));
  }

  pageSlice(page: number, pageSize: number): ShopCatalogEntry[] {
    const entries = this.catalog();
    const maxPage = this.pageCount(pageSize) - 1;
    const clampedPage = Math.max(0, Math.min(page, maxPage));
    const start = clampedPage * pageSize;
    return entries.slice(start, start + pageSize);
  }

  /** Bump demand on purchased keys, decay all known factors slightly toward 1, clamp to band. */
  updateMarket(factors: Record<string, number>, purchases: Record<string, number>): void {
    const { drift, min, max } = GAME_CONFIG.match.freeMarket;

    // Relaxation first: 10% decay toward 1 for all known factors (no immediate re-decay on fresh demand)
    for (const key of Object.keys(factors)) {
      factors[key] = Math.max(min, Math.min(max, factors[key] + (1 - factors[key]) * 0.1));
    }

    // Then bump: demand increases on purchased keys
    for (const [key, bundles] of Object.entries(purchases)) {
      if (bundles > 0) {
        factors[key] = Math.max(min, Math.min(max, (factors[key] ?? 1) + drift * bundles));
      }
    }
  }

  /** Load market factors from localStorage. Guards against invalid values; returns {} on any error. */
  loadMarket(): Record<string, number> {
    try {
      if (typeof localStorage === 'undefined') return {};
      const stored = localStorage.getItem('cratercmd.market');
      if (!stored) return {};
      const loaded = JSON.parse(stored) as Record<string, unknown>;
      const { min, max } = GAME_CONFIG.match.freeMarket;
      const factors: Record<string, number> = {};
      for (const [key, value] of Object.entries(loaded)) {
        if (typeof value === 'number' && isFinite(value) && value >= min && value <= max) {
          factors[key] = value;
        }
      }
      return factors;
    } catch {
      return {};
    }
  }

  /** Save market factors to localStorage. Silently fails if unavailable. */
  saveMarket(factors: Record<string, number>): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('cratercmd.market', JSON.stringify(factors));
    } catch {
      // Silently fail
    }
  }
}
