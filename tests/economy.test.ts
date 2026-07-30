import { describe, it, expect } from 'vitest';
import { EconomySystem } from '../src/game/systems/EconomySystem';
import { GAME_CONFIG } from '../src/game/types/GameTypes';
import { makeProfile } from './helpers';

describe('EconomySystem', () => {
  const system = new EconomySystem();

  it('effectivePrice: round 1 no sale returns base price', () => {
    const price = system.effectivePrice(3500, 'big-missile', 1, null);
    expect(price).toBe(3500);
  });

  it('effectivePrice: round 5 no sale applies inflation', () => {
    const basePrice = 3500;
    const round = 5;
    const inflated = basePrice * (1 + (round - 1) * GAME_CONFIG.match.roundPriceInflation);
    const price = system.effectivePrice(basePrice, 'big-missile', round, null);
    expect(price).toBe(Math.max(1, Math.round(inflated)));
  });

  it('effectivePrice: sale on different key returns inflated price', () => {
    const price = system.effectivePrice(3500, 'big-missile', 1, { itemKey: 'shield', discount: 0.5 });
    expect(price).toBe(3500);
  });

  it('effectivePrice: sale on same key applies discount', () => {
    const basePrice = 3500;
    const inflated = basePrice * (1 + (1 - 1) * GAME_CONFIG.match.roundPriceInflation);
    const discounted = inflated * (1 - 0.5);
    const price = system.effectivePrice(basePrice, 'big-missile', 1, { itemKey: 'big-missile', discount: 0.5 });
    expect(price).toBe(Math.max(1, Math.round(discounted)));
  });

  it('effectivePrice: basePrice 0 returns 0', () => {
    const price = system.effectivePrice(0, 'small-missile', 1, null);
    expect(price).toBe(0);
  });

  it('basePriceFor looks up weapons and items', () => {
    expect(system.basePriceFor('big-missile')).toBe(3500);
    expect(system.basePriceFor('parachute')).toBe(10000);
    expect(system.basePriceFor('shield')).toBe(20000);
    expect(system.basePriceFor('unknown')).toBe(0);
  });

  it('basePriceFor looks up scorched earth missiles', () => {
    expect(system.basePriceFor('missile')).toBe(1875);
    expect(system.basePriceFor('baby-nuke')).toBe(10000);
    expect(system.basePriceFor('nuke')).toBe(12000);
    expect(system.basePriceFor('leapfrog')).toBe(10000);
  });

  it('bundleSizeFor looks up weapons and items', () => {
    expect(system.bundleSizeFor('parachute')).toBe(8);
    expect(system.bundleSizeFor('shield')).toBe(3);
    expect(system.bundleSizeFor('big-missile')).toBe(1);
    expect(system.bundleSizeFor('unknown')).toBe(1);
  });

  it('bundleSizeFor looks up scorched earth missiles', () => {
    expect(system.bundleSizeFor('missile')).toBe(5);
    expect(system.bundleSizeFor('baby-nuke')).toBe(3);
    expect(system.bundleSizeFor('nuke')).toBe(1);
    expect(system.bundleSizeFor('leapfrog')).toBe(2);
  });

  it('basePriceFor looks up M1 weapons', () => {
    expect(system.basePriceFor('mirv')).toBe(10000);
    expect(system.basePriceFor('deaths-head')).toBe(20000);
    expect(system.basePriceFor('funky-bomb')).toBe(7000);
  });

  it('bundleSizeFor looks up M1 weapons', () => {
    expect(system.bundleSizeFor('mirv')).toBe(3);
    expect(system.bundleSizeFor('deaths-head')).toBe(1);
    expect(system.bundleSizeFor('funky-bomb')).toBe(2);
  });

  it('basePriceFor looks up roller weapons', () => {
    expect(system.basePriceFor('baby-roller')).toBe(5000);
    expect(system.basePriceFor('roller')).toBe(6750);
    expect(system.basePriceFor('heavy-roller')).toBe(6750);
  });

  it('bundleSizeFor looks up roller weapons', () => {
    expect(system.bundleSizeFor('baby-roller')).toBe(10);
    expect(system.bundleSizeFor('roller')).toBe(5);
    expect(system.bundleSizeFor('heavy-roller')).toBe(2);
  });

  it('basePriceFor looks up tunneling weapons', () => {
    expect(system.basePriceFor('baby-digger')).toBe(3000);
    expect(system.basePriceFor('digger')).toBe(5000);
    expect(system.basePriceFor('heavy-digger')).toBe(6750);
    expect(system.basePriceFor('baby-sandhog')).toBe(10000);
    expect(system.basePriceFor('sandhog')).toBe(16750);
    expect(system.basePriceFor('heavy-sandhog')).toBe(25000);
  });

  it('bundleSizeFor looks up tunneling weapons', () => {
    expect(system.bundleSizeFor('baby-digger')).toBe(10);
    expect(system.bundleSizeFor('digger')).toBe(5);
    expect(system.bundleSizeFor('heavy-digger')).toBe(2);
    expect(system.bundleSizeFor('baby-sandhog')).toBe(10);
    expect(system.bundleSizeFor('sandhog')).toBe(5);
    expect(system.bundleSizeFor('heavy-sandhog')).toBe(2);
  });

  it('totalPendingCost sums pending costs', () => {
    const pending = { parachute: 2, 'big-missile': 1 };
    const cost = system.totalPendingCost(pending, 1, null);
    expect(cost).toBe(2 * 10000 + 3500);
  });

  it('effectiveCash subtracts pending cost from profile cash', () => {
    const profile = makeProfile({ cash: 30000 });
    const pending = { parachute: 1, 'big-missile': 1 };
    const effective = system.effectiveCash(profile, pending, 1, null);
    expect(effective).toBe(30000 - 10000 - 3500);
  });

  it('applyPurchases applies purchases to profile', () => {
    const profile = makeProfile({ cash: 30000 });
    const pending = { parachute: 1, 'big-missile': 2 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.cash).toBe(30000 - 10000 - 7000);
    expect(profile.parachutes).toBe(1 + 8);
    expect(profile.ammo['big-missile']).toBe(8 + 2);
  });

  it('applyPurchases converts unlimited ammo to 0 before adding', () => {
    const profile = makeProfile({ ammo: { 'big-missile': -1 } });
    const pending = { 'big-missile': 1 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.ammo['big-missile']).toBe(0 + 1);
  });

  it('rollSale generates valid sales', () => {
    for (let i = 0; i < 200; i += 1) {
      const sale = system.rollSale();
      if (sale === null) {
        expect(sale).toBeNull();
      } else {
        expect(typeof sale.itemKey).toBe('string');
        expect(typeof sale.discount).toBe('number');
        expect(sale.discount).toBeGreaterThanOrEqual(GAME_CONFIG.match.minSaleDiscount);
        expect(sale.discount).toBeLessThanOrEqual(GAME_CONFIG.match.maxSaleDiscount);

        const isWeapon = GAME_CONFIG.weapons.some((w) => w.id === sale.itemKey && w.price > 0);
        const isItem = GAME_CONFIG.items.some((i) => i.id === sale.itemKey);
        expect(isWeapon || isItem).toBe(true);
      }
    }
  });

  it('catalog returns weapons then items', () => {
    const entries = system.catalog();
    expect(entries.length).toBe(GAME_CONFIG.weapons.length + GAME_CONFIG.items.length);
    expect(entries[0].key).toBe('small-missile');
    expect(entries[0].kind).toBe('weapon');
    const parachuteEntry = entries.find((e) => e.key === 'parachute');
    expect(parachuteEntry).toBeDefined();
    expect(parachuteEntry!.kind).toBe('item');
    const shieldEntry = entries.find((e) => e.key === 'shield');
    expect(shieldEntry).toBeDefined();
    expect(shieldEntry!.kind).toBe('item');
    entries.forEach((entry) => {
      expect(entry.basePrice).toBe(system.basePriceFor(entry.key));
      expect(entry.bundleSize).toBe(system.bundleSizeFor(entry.key));
    });
  });

  it('ownedCount returns weapon ammo', () => {
    const profile = makeProfile();
    expect(system.ownedCount(profile, 'big-missile')).toBe(8);
  });

  it('ownedCount returns parachutes', () => {
    const profile = makeProfile();
    expect(system.ownedCount(profile, 'parachute')).toBe(1);
  });

  it('ownedCount returns shields', () => {
    const profile = makeProfile();
    expect(system.ownedCount(profile, 'shield')).toBe(0);
  });

  it('ownedCount returns 0 for unknown', () => {
    const profile = makeProfile();
    expect(system.ownedCount(profile, 'unknown')).toBe(0);
  });

  it('pageCount calculates correct page count', () => {
    const total = GAME_CONFIG.weapons.length + GAME_CONFIG.items.length;
    expect(system.pageCount(10)).toBe(Math.ceil(total / 10));
    expect(system.pageCount(4)).toBe(Math.ceil(total / 4));
    expect(system.pageCount(100)).toBe(1);
  });

  it('pageSlice returns correct entries per page', () => {
    const page0 = system.pageSlice(0, 4);
    expect(page0.length).toBe(4);
    const total = GAME_CONFIG.weapons.length + GAME_CONFIG.items.length;
    const lastPageNum = system.pageCount(4) - 1;
    const lastPage = system.pageSlice(lastPageNum, 4);
    expect(lastPage.length).toBe(total - 4 * lastPageNum);
  });

  it('pageSlice clamps out-of-range page to last page', () => {
    const total = GAME_CONFIG.weapons.length + GAME_CONFIG.items.length;
    const lastPageNum = system.pageCount(4) - 1;
    const lastPageFromClamp = system.pageSlice(99, 4);
    const lastPageDirect = system.pageSlice(lastPageNum, 4);
    expect(lastPageFromClamp).toEqual(lastPageDirect);
  });

  it('pageSlice clamps negative page to 0', () => {
    const page0 = system.pageSlice(-1, 4);
    expect(page0[0].key).toBe('small-missile');
  });

  it('basePriceFor looks up riot weapons', () => {
    expect(system.basePriceFor('riot-charge')).toBe(2000);
    expect(system.basePriceFor('riot-blast')).toBe(5000);
    expect(system.basePriceFor('riot-bomb')).toBe(5000);
    expect(system.basePriceFor('heavy-riot-bomb')).toBe(8750);
  });

  it('bundleSizeFor looks up riot weapons', () => {
    expect(system.bundleSizeFor('riot-charge')).toBe(10);
    expect(system.bundleSizeFor('riot-blast')).toBe(5);
    expect(system.bundleSizeFor('riot-bomb')).toBe(5);
    expect(system.bundleSizeFor('heavy-riot-bomb')).toBe(2);
  });

  it('riot weapons have zero damage', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-charge')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-blast')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-bomb')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'heavy-riot-bomb')!.damage).toBe(0);
  });

  it('riot-charge and riot-blast have forward bias', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-charge')!.craterForwardBias).toBe(0.6);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-blast')!.craterForwardBias).toBe(0.6);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'riot-bomb')!.craterForwardBias).toBeUndefined();
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'heavy-riot-bomb')!.craterForwardBias).toBeUndefined();
  });

  it('basePriceFor looks up dirt arsenal weapons', () => {
    expect(system.basePriceFor('dirt-clod')).toBe(5000);
    expect(system.basePriceFor('dirt-ball')).toBe(5000);
    expect(system.basePriceFor('ton-of-dirt')).toBe(6750);
    expect(system.basePriceFor('liquid-dirt')).toBe(5000);
    expect(system.basePriceFor('earth-disrupter')).toBe(5000);
  });

  it('bundleSizeFor looks up dirt arsenal weapons', () => {
    expect(system.bundleSizeFor('dirt-clod')).toBe(10);
    expect(system.bundleSizeFor('dirt-ball')).toBe(5);
    expect(system.bundleSizeFor('ton-of-dirt')).toBe(2);
    expect(system.bundleSizeFor('liquid-dirt')).toBe(10);
    expect(system.bundleSizeFor('earth-disrupter')).toBe(10);
  });

  it('dirt arsenal weapons have zero damage and correct special properties', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'dirt-clod')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'dirt-ball')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'ton-of-dirt')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'liquid-dirt')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'liquid-dirt')!.liquidVolume).toBe(2600);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'earth-disrupter')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'earth-disrupter')!.settleRadius).toBe(80);
  });

  it('basePriceFor looks up tracer weapons', () => {
    expect(system.basePriceFor('tracer')).toBe(10);
    expect(system.basePriceFor('smoke-tracer')).toBe(500);
  });

  it('bundleSizeFor looks up tracer weapons', () => {
    expect(system.bundleSizeFor('tracer')).toBe(20);
    expect(system.bundleSizeFor('smoke-tracer')).toBe(10);
  });

  it('basePriceFor looks up napalm weapons', () => {
    expect(system.basePriceFor('napalm')).toBe(10000);
    expect(system.basePriceFor('hot-napalm')).toBe(20000);
  });

  it('bundleSizeFor looks up napalm weapons', () => {
    expect(system.bundleSizeFor('napalm')).toBe(10);
    expect(system.bundleSizeFor('hot-napalm')).toBe(5);
  });

  it('tracers have zero damage and zero crater radius', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'tracer')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'tracer')!.craterRadius).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'smoke-tracer')!.damage).toBe(0);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'smoke-tracer')!.craterRadius).toBe(0);
  });

  it('napalm weapons have correct flame counts', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'napalm')!.flameCount).toBe(7);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'hot-napalm')!.flameCount).toBe(10);
  });
});
