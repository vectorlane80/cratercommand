import { GAME_CONFIG, type PlayerProfile, type ItemCategory } from '../types/GameTypes';

export type Sale = { itemKey: string; discount: number } | null;

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

  effectivePrice(basePrice: number, itemKey: string, round: number, sale: Sale): number {
    if (basePrice <= 0) return 0;
    const inflated = basePrice * (1 + (round - 1) * GAME_CONFIG.match.roundPriceInflation);
    const final = sale && sale.itemKey === itemKey ? inflated * (1 - sale.discount) : inflated;
    return Math.max(1, Math.round(final));
  }

  priceFor(key: string, round: number, sale: Sale): number {
    return this.effectivePrice(this.basePriceFor(key), key, round, sale);
  }

  totalPendingCost(pending: Record<string, number>, round: number, sale: Sale): number {
    let total = 0;
    for (const [key, qty] of Object.entries(pending)) {
      total += qty * this.priceFor(key, round, sale);
    }
    return total;
  }

  effectiveCash(profile: PlayerProfile, pending: Record<string, number>, round: number, sale: Sale): number {
    return profile.cash - this.totalPendingCost(pending, round, sale);
  }

  applyPurchases(profile: PlayerProfile, pending: Record<string, number>, round: number, sale: Sale): void {
    for (const [key, qty] of Object.entries(pending)) {
      const cost = qty * this.priceFor(key, round, sale);
      profile.cash -= cost;
      if (key === 'parachute') {
        profile.parachutes += qty * this.bundleSizeFor(key);
      } else if (key === 'shield') {
        profile.shields += qty * this.bundleSizeFor(key);
      } else if (key === 'battery') {
        profile.batteries += qty * this.bundleSizeFor(key);
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
    if (key === 'shield') {
      return profile.shields;
    }
    if (key === 'battery') {
      return profile.batteries;
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
}
