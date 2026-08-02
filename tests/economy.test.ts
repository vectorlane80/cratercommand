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

  it('battery item: basePriceFor 5000, bundleSizeFor 10', () => {
    expect(system.basePriceFor('battery')).toBe(5000);
    expect(system.bundleSizeFor('battery')).toBe(10);
  });

  it('ownedCount returns batteries for battery item', () => {
    const profile = makeProfile({ batteries: 3 });
    expect(system.ownedCount(profile, 'battery')).toBe(3);
  });

  it('applyPurchases applies battery purchases to profile', () => {
    const profile = makeProfile({ cash: 30000, batteries: 0 });
    const pending = { battery: 1 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.cash).toBe(30000 - 5000);
    expect(profile.batteries).toBe(10);
  });

  it('plasma-blast has batteryCost 1', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'plasma-blast')!.batteryCost).toBe(1);
  });

  it('laser has batteryCost 2 and behavior laser', () => {
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'laser')!.batteryCost).toBe(2);
    expect(GAME_CONFIG.weapons.find((w) => w.id === 'laser')!.behavior).toBe('laser');
  });

  it('new defense items have correct prices and bundles', () => {
    expect(system.basePriceFor('force-shield')).toBe(25000);
    expect(system.bundleSizeFor('force-shield')).toBe(3);
    expect(system.basePriceFor('heavy-shield')).toBe(30000);
    expect(system.bundleSizeFor('heavy-shield')).toBe(2);
    expect(system.basePriceFor('super-mag')).toBe(35000);
    expect(system.bundleSizeFor('super-mag')).toBe(2);
    expect(system.basePriceFor('mag-deflector')).toBe(10000);
    expect(system.bundleSizeFor('mag-deflector')).toBe(2);
    expect(system.basePriceFor('auto-defense')).toBe(1500);
    expect(system.bundleSizeFor('auto-defense')).toBe(1);
  });

  it('defense items have correct absorb values', () => {
    expect(GAME_CONFIG.items.find((i) => i.id === 'shield')!.absorb).toBe(40);
    expect(GAME_CONFIG.items.find((i) => i.id === 'force-shield')!.absorb).toBe(65);
    expect(GAME_CONFIG.items.find((i) => i.id === 'heavy-shield')!.absorb).toBe(90);
    expect(GAME_CONFIG.items.find((i) => i.id === 'super-mag')!.absorb).toBe(100);
  });

  it('deflects shield items have deflects flag', () => {
    expect(GAME_CONFIG.items.find((i) => i.id === 'super-mag')!.deflects).toBe(true);
    expect(GAME_CONFIG.items.find((i) => i.id === 'mag-deflector')!.deflects).toBe(true);
  });

  it('auto-defense has oneTime flag', () => {
    expect(GAME_CONFIG.items.find((i) => i.id === 'auto-defense')!.oneTime).toBe(true);
  });

  it('ownedCount handles defense items', () => {
    const profile = makeProfile({ defenses: { 'shield': 2, 'force-shield': 1 } });
    expect(system.ownedCount(profile, 'shield')).toBe(2);
    expect(system.ownedCount(profile, 'force-shield')).toBe(1);
  });

  it('ownedCount handles auto-defense flag', () => {
    const profile1 = makeProfile({ autoDefense: false });
    const profile2 = makeProfile({ autoDefense: true });
    expect(system.ownedCount(profile1, 'auto-defense')).toBe(0);
    expect(system.ownedCount(profile2, 'auto-defense')).toBe(1);
  });

  it('applyPurchases adds defense items to defenses record', () => {
    const profile = makeProfile({ cash: 100000, defenses: { 'shield': 0 } });
    const pending = { 'force-shield': 1 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.defenses['force-shield']).toBe(3);
  });

  it('applyPurchases sets autoDefense flag when purchasing auto-defense', () => {
    const profile = makeProfile({ autoDefense: false });
    const pending = { 'auto-defense': 1 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.autoDefense).toBe(true);
  });

  it('fuel-tank item: basePriceFor 10000, bundleSizeFor 10', () => {
    expect(system.basePriceFor('fuel-tank')).toBe(10000);
    expect(system.bundleSizeFor('fuel-tank')).toBe(10);
  });

  it('contact-trigger item: basePriceFor 1000, bundleSizeFor 25', () => {
    expect(system.basePriceFor('contact-trigger')).toBe(1000);
    expect(system.bundleSizeFor('contact-trigger')).toBe(25);
  });

  it('ownedCount returns fuel for fuel-tank item', () => {
    const profile = makeProfile({ fuel: 50 });
    expect(system.ownedCount(profile, 'fuel-tank')).toBe(50);
  });

  it('ownedCount returns contactTriggers for contact-trigger item', () => {
    const profile = makeProfile({ contactTriggers: 75 });
    expect(system.ownedCount(profile, 'contact-trigger')).toBe(75);
  });

  it('applyPurchases applies fuel-tank purchases: fuel += qty * bundleSize * 10', () => {
    const profile = makeProfile({ cash: 30000, fuel: 0 });
    const pending = { 'fuel-tank': 2 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.cash).toBe(30000 - 20000);
    expect(profile.fuel).toBe(2 * 10 * 10);
  });

  it('applyPurchases applies contact-trigger purchases: contactTriggers += qty * bundleSize', () => {
    const profile = makeProfile({ cash: 10000, contactTriggers: 0 });
    const pending = { 'contact-trigger': 2 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.cash).toBe(10000 - 2000);
    expect(profile.contactTriggers).toBe(2 * 25);
  });

  it('guidance items: heat-guidance 10000/6, ballistic 10000/2, horizontal 15000/5, vertical 20000/5, lazy-boy 20000/2', () => {
    expect(system.basePriceFor('heat-guidance')).toBe(10000);
    expect(system.bundleSizeFor('heat-guidance')).toBe(6);
    expect(system.basePriceFor('ballistic-guidance')).toBe(10000);
    expect(system.bundleSizeFor('ballistic-guidance')).toBe(2);
    expect(system.basePriceFor('horizontal-guidance')).toBe(15000);
    expect(system.bundleSizeFor('horizontal-guidance')).toBe(5);
    expect(system.basePriceFor('vertical-guidance')).toBe(20000);
    expect(system.bundleSizeFor('vertical-guidance')).toBe(5);
    expect(system.basePriceFor('lazy-boy')).toBe(20000);
    expect(system.bundleSizeFor('lazy-boy')).toBe(2);
  });

  it('ownedCount returns guidance counts from guidance record', () => {
    const profile = makeProfile({ guidance: { 'heat-guidance': 6, 'lazy-boy': 2 } });
    expect(system.ownedCount(profile, 'heat-guidance')).toBe(6);
    expect(system.ownedCount(profile, 'lazy-boy')).toBe(2);
    expect(system.ownedCount(profile, 'ballistic-guidance')).toBe(0);
  });

  it('applyPurchases applies guidance purchases to guidance record', () => {
    const profile = makeProfile({ cash: 100000, guidance: {} });
    const pending = { 'heat-guidance': 1, 'lazy-boy': 2 };
    system.applyPurchases(profile, pending, 1, null);
    expect(profile.guidance['heat-guidance']).toBe(6);
    expect(profile.guidance['lazy-boy']).toBe(4);
    expect(profile.cash).toBe(100000 - 10000 - 40000);
  });

  it('effectivePrice with marketFactor 1.5: base 1000 round 1 no sale → 1500', () => {
    const price = system.effectivePrice(1000, 'nuke', 1, null, 1.5);
    expect(price).toBe(1500);
  });

  it('effectivePrice with marketFactor 1.5 and 50% sale → 750', () => {
    const price = system.effectivePrice(1000, 'nuke', 1, { itemKey: 'nuke', discount: 0.5 }, 1.5);
    expect(price).toBe(750);
  });

  it('updateMarket bump: {} + purchases {nuke: 2} → factors.nuke ≈ 1.16 (drift * bundles)', () => {
    const factors: Record<string, number> = {};
    system.updateMarket(factors, { nuke: 2 });
    expect(Math.abs(factors.nuke - (1 + 0.08 * 2))).toBeLessThan(1e-9);
  });

  it('updateMarket relaxation order: {nuke: 2.0} + purchases {nuke: 1} → nuke ≈ 1.98 (relax first, then bump)', () => {
    const factors: Record<string, number> = { nuke: 2.0 };
    system.updateMarket(factors, { nuke: 1 });
    // Relax first: 2.0 + (1 - 2.0) * 0.1 = 2.0 - 0.1 = 1.9
    // Then bump: 1.9 + 0.08 * 1 = 1.98
    expect(Math.abs(factors.nuke - 1.98)).toBeLessThan(1e-9);
  });

  it('applyPurchases with marketFactors threads drifted prices into cash deduction', () => {
    const profile = makeProfile({ cash: 25000 });
    const pending = { nuke: 1 };
    const marketFactors = { nuke: 1.5 };
    system.applyPurchases(profile, pending, 1, null, marketFactors);
    // nuke base 12000, market factor 1.5 → 18000
    expect(profile.cash).toBe(25000 - 18000);
  });

  it('loadMarket guards against invalid values and returns {} in node (no localStorage)', () => {
    // In node test environment, localStorage is undefined
    const factors = system.loadMarket();
    expect(factors).toEqual({});
  });
});
