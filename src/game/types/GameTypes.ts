export type PlayerId = 0 | 1 | 2 | 3;
export type GamePhase =
  | 'aiming'
  | 'projectileInFlight'
  | 'roundOver'
  | 'shopping'
  | 'matchOver';
export type ImpactKind = 'terrain' | 'tank' | 'outOfBounds';
export type WeaponBehavior = 'single' | 'split' | 'bounce' | 'dirt' | 'salvo' | 'leapfrog';
export type VisualSystem = 'classic' | 'retroPixel';
export type ItemCategory = 'missile' | 'terrain' | 'fire' | 'energy' | 'defense' | 'utility';

export interface TerrainData {
  heights: number[];
  width: number;
  height: number;
  segmentWidth: number;
}

export interface TankState {
  id: PlayerId;
  x: number;
  y: number;
  color: number;
  accentColor: number;
  label: string;
  health: number;
  angle: number;
  power: number;
  alive: boolean;
  ammo: Record<string, number>;
  selectedWeaponIndex: number;
  moveRemaining: number;
  parachutes: number;
  shields: number;
  damageDealt: number;
}

/**
 * Who is driving a tank. `human` is local keyboard. `cpu-*` is local AI at
 * the given difficulty tier. `remote` is reserved for future online play
 * where decisions arrive over the network — not yet implemented.
 */
export type ControllerKind = 'human' | 'cpu-cadet' | 'cpu-veteran' | 'cpu-marshal' | 'remote';

export const CONTROLLER_LABELS: Record<ControllerKind, string> = {
  'human': 'HUMAN',
  'cpu-cadet': 'CPU: CADET',
  'cpu-veteran': 'CPU: VETERAN',
  'cpu-marshal': 'CPU: MARSHAL',
  'remote': 'REMOTE'
};

// Menu cycle does NOT include 'remote' — that's set by the lobby flow.
export const CONTROLLER_CYCLE: ControllerKind[] = [
  'human',
  'cpu-cadet',
  'cpu-veteran',
  'cpu-marshal'
];

export interface PlayerProfile {
  cash: number;
  wins: number;
  ammo: Record<string, number>;
  parachutes: number;
  shields: number;
  controller: ControllerKind;
  /** Custom display name. Falls back to "PLAYER N" when null. */
  displayName: string | null;
}

export interface MatchState {
  round: number;
  roundsToWin: number;
  // 2 to MAX_PLAYERS entries. Index in this array is the player's PlayerId.
  // Players that are 'none' in the menu are excluded — they don't get a slot
  // and don't participate.
  profiles: PlayerProfile[];
  shoppingPlayerId: PlayerId | null;
  shopVisitsRemaining: number;
  matchWinnerId: PlayerId | null;
  /**
   * Item key (weapon.id / 'parachute' / 'shield') that is on sale this
   * round's shop, plus the discount fraction (0..1). Re-rolled in
   * enterShoppingPhase. Null when there's no sale.
   */
  currentSale: { itemKey: string; discount: number } | null;
}

export const MAX_PLAYERS = 4;

export interface WeaponDefinition {
  id: string;
  name: string;
  startingAmmo: number; // -1 means unlimited
  price: number; // 0 means cannot be bought (e.g. unlimited freebie)
  damage: number;
  craterRadius: number;
  projectileSpeedScale: number;
  behavior: WeaponBehavior;
  category: ItemCategory;
  bundleSize: number;
  splitCount?: number;
  splitAngleSpread?: number;
  bounceCount?: number;
  salvoCount?: number;
  salvoAngleSpread?: number;
  salvoPowerSpread?: number;
  moundRadius?: number;
  hopCount?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  price: number;
  bundleSize: number;
  hotkey: string;
  description: string;
  category: ItemCategory;
}

export interface ProjectileState {
  ownerId: PlayerId;
  weapon: WeaponDefinition;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  trail: Array<{ x: number; y: number }>;
  ageMs: number;
  bouncesLeft?: number;
  hasSplit?: boolean;
  hopsLeft?: number;
}

export interface WindState {
  direction: -1 | 1;
  magnitude: number;
}

export interface TurnState {
  activePlayerId: PlayerId;
  phase: GamePhase;
  winnerId: PlayerId | null;
  wind: WindState;
}

export interface ImpactResult {
  kind: ImpactKind;
  x: number;
  y: number;
  targetTankId?: PlayerId;
}

export interface FallEvent {
  tankId: PlayerId;
  distance: number;
  damage: number;
  usedParachute: boolean;
}

export const GAME_CONFIG = {
  width: 960,
  height: 540,
  layout: {
    battlefieldTop: 0,
    battlefieldHeight: 356,
    consoleTop: 358,
    consoleHeight: 182,
    bottomStatusTop: 520
  },
  colors: {
    black: 0x000000,
    white: 0xf2f2f2,
    panelGray: 0x767676,
    panelDark: 0x050505,
    panelLight: 0xc7c7c7,
    magenta: 0xff4dff,
    cyan: 0x27f4ff,
    green: 0x19f419,
    darkGreen: 0x006d10,
    ridgeGreen: 0x28ff34,
    yellow: 0xffee33,
    red: 0xe43d21,
    blue: 0x0837ff,
    purple: 0x79217d,
    dimGray: 0x707070,
    overlayDim: 0x000000,
    retroBlue: 0x238cff,
    retroOrange: 0xff4b16,
    steelDark: 0x171717,
    steelMid: 0x3b3b3b,
    steelLight: 0xa8a8a8,
    desertGold: 0xc68417,
    desertBrown: 0x4b2b10,
    desertDark: 0x1f1208,
    sunsetPurple: 0x26114c,
    sunsetRed: 0xb52f22,
    sunsetOrange: 0xf57918,
    sunsetYellow: 0xffd15c
  },
  visuals: {
    defaultSystem: 'classic' as VisualSystem,
    systems: {
      classic: {
        label: 'Classic',
        toggleHint: 'V Visual: Classic'
      },
      retroPixel: {
        label: 'Retro Pixel',
        toggleHint: 'V Visual: Retro Pixel'
      }
    }
  },
  font: {
    family: 'Courier New, monospace',
    tiny: '10px',
    small: '12px',
    medium: '18px',
    large: '24px',
    title: '28px'
  },
  terrain: {
    sampleCount: 161,
    baseY: 292,
    variation: 78,
    minY: 160,
    maxY: 348,
    craterMaxY: 354
  },
  tank: {
    maxHealth: 125,
    width: 30,
    height: 12,
    turretLength: 24,
    barrelInsetY: 13,
    placementOffsetY: 2,
    hitRadius: 18
  },
  aiming: {
    minAngle: 15,
    maxAngle: 165,
    initialAngles: [55, 125] as const,
    angleStep: 1,
    minPower: 15,
    maxPower: 100,
    initialPower: 50,
    powerStep: 1
  },
  projectile: {
    gravity: 138,
    windAccelerationScale: 0.55,
    trailSpacingMs: 70,
    maxAgeMs: 14000,
    launchSpeedBase: 80
  },
  wind: {
    min: 0,
    max: 18
  },
  movement: {
    perTurn: 70,
    speedPxPerSec: 65,
    minTankSeparation: 36
  },
  fall: {
    // Drop distance (game-world px) before a fall event registers. Combined
    // with the 3-point cross-tank sampling in settleTanksAfterTerrainChange,
    // this triggers falls reliably whenever a crater pulls ground out from
    // under any part of the tank's base. Players were "falling in small
    // bits" without seeing the chute deployment / fall damage trigger,
    // because the threshold was too high relative to the typical crater
    // drop at one side of the tank.
    threshold: 6,
    damagePerPixel: 0.85,
    maxDamage: 75
  },
  match: {
    roundsToWin: 2,
    startingCash: 15000,
    startingParachutes: 1,
    startingShields: 0,
    shieldAbsorbAmount: 40,
    damageCashMultiplier: 30,
    roundWinBonus: 5000,
    survivalBonus: 1500,
    // Each round past round 1, every base price is multiplied by
    // (1 + (round - 1) * roundPriceInflation). At 0.15, round 2 prices are
    // 1.15x, round 5 are 1.60x, round 7 are 1.90x.
    roundPriceInflation: 0.15,
    // Chance per round (when entering shop) that a random buyable item gets
    // discounted. Discount fraction is a random value in [minSaleDiscount,
    // maxSaleDiscount]. Sales display alongside the price in the shop.
    saleChance: 0.25,
    minSaleDiscount: 0.3,
    maxSaleDiscount: 0.5
  },
  weapons: [
    {
      id: 'small-missile',
      name: 'Small Missile',
      startingAmmo: -1,
      price: 0,
      damage: 35,
      craterRadius: 25,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 1
    },
    {
      id: 'big-missile',
      name: 'Big Missile',
      startingAmmo: 8,
      price: 3500,
      damage: 55,
      craterRadius: 38,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 1
    },
    {
      id: 'triple-missile',
      name: 'Triple Missile',
      startingAmmo: 6,
      price: 10000,
      damage: 30,
      craterRadius: 22,
      projectileSpeedScale: 1,
      behavior: 'split',
      category: 'missile',
      bundleSize: 1,
      splitCount: 3,
      splitAngleSpread: 18
    },
    {
      id: 'huge-missile',
      name: 'Huge Missile',
      startingAmmo: 3,
      price: 18000,
      damage: 90,
      craterRadius: 60,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 1
    },
    {
      id: 'dirt-mover',
      name: 'Dirt Mover',
      startingAmmo: 4,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'dirt',
      category: 'terrain',
      bundleSize: 1,
      moundRadius: 42
    },
    {
      id: 'bouncing-bomb',
      name: 'Bouncing Bomb',
      startingAmmo: 5,
      price: 8000,
      damage: 50,
      craterRadius: 32,
      projectileSpeedScale: 1,
      behavior: 'bounce',
      category: 'missile',
      bundleSize: 1,
      bounceCount: 1
    },
    {
      id: 'bullet',
      name: 'Bullet',
      startingAmmo: 12,
      price: 1500,
      damage: 22,
      craterRadius: 12,
      projectileSpeedScale: 1.7,
      behavior: 'single',
      category: 'missile',
      bundleSize: 1
    },
    {
      id: 'stream',
      name: 'Stream',
      startingAmmo: 4,
      price: 13000,
      damage: 18,
      craterRadius: 14,
      projectileSpeedScale: 0.95,
      behavior: 'salvo',
      category: 'missile',
      bundleSize: 1,
      salvoCount: 5,
      salvoAngleSpread: 5,
      salvoPowerSpread: 12
    },
    {
      id: 'missile',
      name: 'Missile',
      startingAmmo: 0,
      price: 1875,
      damage: 45,
      craterRadius: 30,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 5
    },
    {
      id: 'baby-nuke',
      name: 'Baby Nuke',
      startingAmmo: 0,
      price: 10000,
      damage: 70,
      craterRadius: 46,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 3
    },
    {
      id: 'nuke',
      name: 'Nuke',
      startingAmmo: 0,
      price: 12000,
      damage: 110,
      craterRadius: 75,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'missile',
      bundleSize: 1
    },
    {
      id: 'leapfrog',
      name: 'Leapfrog',
      startingAmmo: 0,
      price: 10000,
      damage: 40,
      craterRadius: 26,
      projectileSpeedScale: 1,
      behavior: 'leapfrog',
      category: 'missile',
      bundleSize: 2,
      hopCount: 3
    }
  ] satisfies WeaponDefinition[],
  items: [
    { id: 'parachute', name: 'Parachute', price: 10000, bundleSize: 8, hotkey: 'P', description: 'Auto-deploys on falls', category: 'defense' },
    { id: 'shield', name: 'Shield', price: 20000, bundleSize: 3, hotkey: 'S', description: 'Absorbs up to 40 damage', category: 'defense' }
  ] satisfies ItemDefinition[]
} as const;
