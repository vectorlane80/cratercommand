export type PlayerId = 0 | 1 | 2 | 3;
export type GamePhase =
  | 'aiming'
  | 'projectileInFlight'
  | 'roundOver'
  | 'shopping'
  | 'matchOver';
export type ImpactKind = 'terrain' | 'tank' | 'outOfBounds';
export type WeaponBehavior = 'single' | 'split' | 'bounce' | 'dirt' | 'salvo' | 'leapfrog' | 'funky' | 'roller' | 'digger' | 'sandhog' | 'liquid' | 'settle' | 'napalm' | 'laser';
export type VisualSystem = 'classic' | 'retroPixel' | 'hiRes' | 'bananas';
export type BananasDisplay = '16color' | 'amber' | 'green' | 'white';

export const BANANAS_DISPLAY_CYCLE: BananasDisplay[] = ['16color', 'amber', 'green', 'white'];

export const BANANAS_PHOSPHORS: Record<Exclude<BananasDisplay, '16color'>, number> = {
  amber: 0xffb000,
  green: 0x33ff33,
  white: 0xf0f0f0
};

// The mock resolves every EGA name to unlit-or-ink in phosphor displays.
// Unlit set (by value): black, blue (sky + panel fills), dgray (unlit
// windows). Everything else is lit.
const BANANAS_UNLIT = new Set([0x000000, 0x0000aa, 0x555555]);

let bananasActiveDisplay: BananasDisplay = '16color';

export function setBananasDisplayInk(display: BananasDisplay): void {
  bananasActiveDisplay = display;
}

export function bananasIs1Bit(): boolean {
  return bananasActiveDisplay !== '16color';
}

export function bananasInk(color: number): number {
  if (bananasActiveDisplay === '16color') return color;
  return BANANAS_UNLIT.has(color) ? 0x000000 : BANANAS_PHOSPHORS[bananasActiveDisplay];
}

export function nextBananasDisplay(display: BananasDisplay): BananasDisplay {
  const idx = BANANAS_DISPLAY_CYCLE.indexOf(display);
  return BANANAS_DISPLAY_CYCLE[(idx + 1) % BANANAS_DISPLAY_CYCLE.length];
}

export type ItemCategory = 'missile' | 'terrain' | 'fire' | 'energy' | 'defense' | 'utility';
export type WallMode = 'none' | 'concrete' | 'padded' | 'rubber' | 'spring' | 'wraparound' | 'random' | 'erratic';
export type TerrainKind = 'desert' | 'forest' | 'snow' | 'volcanic' | 'lunar' | 'urban' | 'alien';
export type TerrainSetting = 'random' | TerrainKind;
export type Sale = { itemKey: string; discount: number } | null;

export const WALL_MODES: WallMode[] = ['none', 'concrete', 'padded', 'rubber', 'spring', 'wraparound', 'random', 'erratic'];

export const WALL_LABELS: Record<WallMode, string> = {
  none: 'NO WALLS',
  concrete: 'CONCRETE',
  padded: 'PADDED',
  rubber: 'RUBBER',
  spring: 'SPRING',
  wraparound: 'WRAPAROUND',
  random: 'RANDOM',
  erratic: 'ERRATIC'
};

// Order matches the pack's TERRAIN_IDS.
export const TERRAIN_KINDS: TerrainKind[] = ['desert', 'forest', 'snow', 'volcanic', 'lunar', 'urban', 'alien'];

export const TERRAIN_SETTINGS: TerrainSetting[] = ['random', ...TERRAIN_KINDS];

export const TERRAIN_LABELS: Record<TerrainSetting, string> = {
  random: 'RANDOM',
  desert: 'DESERT',
  forest: 'FOREST',
  snow: 'SNOW',
  volcanic: 'VOLCANIC',
  lunar: 'LUNAR',
  urban: 'URBAN',
  alien: 'ALIEN'
};

export interface TerrainPalette {
  classic: { flat: number; ridge: number; hatch: number };
  retro: { dirt: number; dark: number; lip: number; hi: number; specks: [number, number, number] };
  hires: { top: number; mid: number; deep: number; glow: { color: number; alpha: number }; spec: { color: number; alpha: number }; rubble: { color: number; alpha: number } };
}

export const TERRAIN_PALETTES: Record<TerrainKind, TerrainPalette> = {
  desert: {
    classic: { flat: 0x4b2b10, ridge: 0xc68417, hatch: 0x6b3a17 },
    retro: { dirt: 0x4b2b10, dark: 0x1f1208, lip: 0xc68417, hi: 0xffb22e, specks: [0x6b3a17, 0x2a160a, 0x361f0d] },
    hires: { top: 0x9a5f26, mid: 0x5a3113, deep: 0x0d0702, glow: { color: 0xffb347, alpha: 0.24 }, spec: { color: 0xffd68c, alpha: 0.6 }, rubble: { color: 0x2c180a, alpha: 0.45 } }
  },
  forest: {
    classic: { flat: 0x1d3a17, ridge: 0x5ae04a, hatch: 0x2f5c25 },
    retro: { dirt: 0x3f2a14, dark: 0x170e05, lip: 0x3fa845, hi: 0x7fd06a, specks: [0x5a3a1a, 0x150c05, 0x2b1a0b] },
    hires: { top: 0x4d7a37, mid: 0x33210f, deep: 0x0a0602, glow: { color: 0x7ed678, alpha: 0.22 }, spec: { color: 0xcdffb9, alpha: 0.55 }, rubble: { color: 0x1e160a, alpha: 0.45 } }
  },
  snow: {
    classic: { flat: 0x4c6f8c, ridge: 0xe8f6ff, hatch: 0x7f9fbb },
    retro: { dirt: 0xdfe9f2, dark: 0x8ea8c0, lip: 0xffffff, hi: 0xa9c8e2, specks: [0xffffff, 0x7f9ab4, 0xb9cfe2] },
    hires: { top: 0xf4f9ff, mid: 0xa8c0d6, deep: 0x3d4e61, glow: { color: 0xbee1ff, alpha: 0.3 }, spec: { color: 0xffffff, alpha: 0.8 }, rubble: { color: 0x6e8caa, alpha: 0.3 } }
  },
  volcanic: {
    classic: { flat: 0x3a120c, ridge: 0xff5a1f, hatch: 0x6b2210 },
    retro: { dirt: 0x3a1a12, dark: 0x160805, lip: 0xff6b1f, hi: 0xffc04a, specks: [0x7a2a10, 0x120504, 0x2a0f08] },
    hires: { top: 0x803114, mid: 0x2c1109, deep: 0x0a0302, glow: { color: 0xff6e28, alpha: 0.3 }, spec: { color: 0xffbe78, alpha: 0.65 }, rubble: { color: 0x280c06, alpha: 0.5 } }
  },
  lunar: {
    classic: { flat: 0x4a4a48, ridge: 0xdcdcd8, hatch: 0x6e6e6a },
    retro: { dirt: 0x8d8b86, dark: 0x3b3a38, lip: 0xe8e6e0, hi: 0xb5b3ad, specks: [0xc9c7c1, 0x2c2b29, 0x5c5a56] },
    hires: { top: 0xbcb9b1, mid: 0x5b5954, deep: 0x141413, glow: { color: 0xcde1ff, alpha: 0.2 }, spec: { color: 0xffffff, alpha: 0.6 }, rubble: { color: 0x2d2d2d, alpha: 0.4 } }
  },
  urban: {
    classic: { flat: 0x2b2f33, ridge: 0x7de3ff, hatch: 0x4a5157 },
    retro: { dirt: 0x6a6a68, dark: 0x26262a, lip: 0xc9c6bd, hi: 0x8f8d86, specks: [0x9a978d, 0x1a1a1c, 0x3d3d40] },
    hires: { top: 0x8e8a80, mid: 0x42403c, deep: 0x101012, glow: { color: 0x7de3ff, alpha: 0.2 }, spec: { color: 0xe2f4ff, alpha: 0.55 }, rubble: { color: 0x141416, alpha: 0.5 } }
  },
  alien: {
    classic: { flat: 0x2e0b46, ridge: 0x00ffc6, hatch: 0x7a1fb0 },
    retro: { dirt: 0x3b0f57, dark: 0x170421, lip: 0xc33cff, hi: 0xff9bf2, specks: [0x8a2bc4, 0x20063a, 0x4a0f6b] },
    hires: { top: 0x7d2fae, mid: 0x3a1052, deep: 0x0f0418, glow: { color: 0xc45cff, alpha: 0.3 }, spec: { color: 0xebafff, alpha: 0.65 }, rubble: { color: 0x5a198c, alpha: 0.4 } }
  }
};

export function resolveTerrainSetting(setting: TerrainSetting): TerrainKind {
  if (setting !== 'random') return setting;
  return TERRAIN_KINDS[Math.floor(Math.random() * TERRAIN_KINDS.length)];
}

export interface PhysicsSettings {
  gravity: number;
  viscosity: number;
  tanksFall: boolean;
}

export const PHYSICS_DEFAULTS: PhysicsSettings = {
  gravity: 138,
  viscosity: 0,
  tanksFall: true
};

export const GRAVITY_STEPS = [70, 100, 138, 180, 240];
export const GRAVITY_LABELS: Record<number, string> = {
  70: 'LOW',
  100: 'LIGHT',
  138: 'NORMAL',
  180: 'HEAVY',
  240: 'CRUSHING'
};

export const VISCOSITY_STEPS = [0, 0.15, 0.35, 0.6];
export const VISCOSITY_LABELS: Record<number, string> = {
  0: 'NONE',
  0.15: 'THIN',
  0.35: 'THICK',
  0.6: 'SOUP'
};

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
  defenses: Record<string, number>;
  armedShieldId: string | null;
  armedShieldHp: number;
  batteries: number;
  fuel: number;
  contactTriggers: number;
  guidance: Record<string, number>;
  selectedGuidanceId: string | null;
  damageDealt: number;
}

/**
 * Who is driving a tank. `human` is local keyboard. `cpu-*` is local AI at
 * the given difficulty tier. `remote` is reserved for future online play
 * where decisions arrive over the network — not yet implemented.
 */
export type ControllerKind = 'human' | 'cpu-moron' | 'cpu-shooter' | 'cpu-tosser' | 'cpu-spoiler' | 'cpu-cyborg' | 'remote';

export const CONTROLLER_LABELS: Record<ControllerKind, string> = {
  'human': 'HUMAN',
  'cpu-moron': 'CPU: MORON',
  'cpu-shooter': 'CPU: SHOOTER',
  'cpu-tosser': 'CPU: TOSSER',
  'cpu-spoiler': 'CPU: SPOILER',
  'cpu-cyborg': 'CPU: CYBORG',
  'remote': 'REMOTE'
};

// Menu cycle does NOT include 'remote' — that's set by the lobby flow.
export const CONTROLLER_CYCLE: ControllerKind[] = [
  'human',
  'cpu-moron',
  'cpu-shooter',
  'cpu-tosser',
  'cpu-spoiler',
  'cpu-cyborg'
];

export interface PlayerProfile {
  cash: number;
  wins: number;
  ammo: Record<string, number>;
  parachutes: number;
  defenses: Record<string, number>;
  autoDefense: boolean;
  batteries: number;
  fuel: number;
  contactTriggers: number;
  guidance: Record<string, number>;
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
  currentSale: Sale;
  wallMode: WallMode;
  activeWallMode: Exclude<WallMode, 'random' | 'erratic'>;
  physics: PhysicsSettings;
  // Free-market price factors: item/weapon key → multiplier. Missing keys default to 1.
  marketFactors: Record<string, number>;
  terrain: TerrainKind;
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
  /** Stagger between salvo launches. 0/absent = all shots fire at once. */
  salvoDelayMs?: number;
  moundRadius?: number;
  hopCount?: number;
  funkySpawnCount?: number;
  tunnelLength?: number;
  tunnelRadius?: number;
  craterForwardBias?: number;
  liquidVolume?: number;
  settleRadius?: number;
  flameCount?: number;
  batteryCost?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  price: number;
  bundleSize: number;
  hotkey: string;
  description: string;
  category: ItemCategory;
  sidebarLabel?: string;
  absorb?: number;
  deflects?: boolean;
  oneTime?: boolean;
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
  damageScale?: number;
  rolling?: boolean;
  tunneling?: boolean;
  tunnelRemaining?: number;
  guidanceId?: string;
  wallBounces?: number;
  /** Remaining ms before this salvo shot leaves the barrel; inert until 0. */
  launchDelayMs?: number;
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
  // Canvas backing-store multiplier. The world stays 960×540; every scene's
  // camera zooms by this factor so vector graphics and text rasterize at the
  // higher density instead of being CSS-upscaled (which pixelates on hi-DPI
  // displays). Pointer handlers must use world coordinates, not canvas ones.
  renderScale: 2,
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
      },
      hiRes: {
        label: 'Hi-Res',
        toggleHint: 'V Visual: Hi-Res'
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
    launchSpeedBase: 80,
    // Roller surface physics — see ProjectileSystem
    rollerFriction: 0.4,
    rollerMinSpeed: 9,
    rollerMaxSpeed: 260,
    // Tunneling weapons bore through terrain at constant speed
    tunnelSpeed: 90,
    // Mag deflector upward push
    deflectRadius: 70,
    deflectAcceleration: 420,
    // Guidance steering
    heatSeekRadius: 130,
    heatSeekAcceleration: 300,
    horizontalSpeed: 140,
    verticalDiveSpeed: 210
  },
  wind: {
    min: 0,
    max: 18
  },
  walls: {
    rubberRestitution: 0.75,
    paddedRestitution: 0.45,
    springRestitution: 1.25,
    maxBounces: 6
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
    // Harmless drop band — falls this short never hurt nor deploy a chute.
    safeDistance: 18,
    damagePerPixel: 0.85,
    maxDamage: 75
  },
  match: {
    roundsToWin: 2,
    startingCash: 15000,
    startingParachutes: 1,
    startingBatteries: 0,
    batteryHealAmount: 10,
    // Tuned for the default best-of-3: a 2-0 sweep sees only one shop, so
    // per-round income must put the expensive tier in reach (was 30/5000/1500).
    damageCashMultiplier: 45,
    roundWinBonus: 8000,
    survivalBonus: 3000,
    // Each round past round 1, every base price is multiplied by
    // (1 + (round - 1) * roundPriceInflation). At 0.15, round 2 prices are
    // 1.15x, round 5 are 1.60x, round 7 are 1.90x.
    roundPriceInflation: 0.15,
    // Chance per round (when entering shop) that a random buyable item gets
    // discounted. Discount fraction is a random value in [minSaleDiscount,
    // maxSaleDiscount]. Sales display alongside the price in the shop.
    saleChance: 0.25,
    minSaleDiscount: 0.3,
    maxSaleDiscount: 0.5,
    // Interest paid on held cash at round end (5% per round).
    interestRate: 0.05,
    // Free-market price drift: demand bumps, neglect decays toward 1.
    freeMarket: {
      drift: 0.08, // per-purchase demand bump
      min: 0.5,    // price-factor floor
      max: 2.0     // price-factor ceiling
    }
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
      // Machine-gun burst: shots walk down the aim line one after another
      // with slight jitter (a simultaneous wide scatter read as random).
      salvoCount: 5,
      salvoAngleSpread: 1.5,
      salvoPowerSpread: 4,
      salvoDelayMs: 150
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
    },
    {
      id: 'mirv',
      name: 'MIRV',
      startingAmmo: 0,
      price: 10000,
      damage: 35,
      craterRadius: 28,
      projectileSpeedScale: 1,
      behavior: 'split',
      category: 'missile',
      bundleSize: 3,
      splitCount: 5,
      splitAngleSpread: 24
    },
    {
      id: 'deaths-head',
      name: "Death's Head",
      startingAmmo: 0,
      price: 20000,
      damage: 60,
      craterRadius: 44,
      projectileSpeedScale: 1,
      behavior: 'split',
      category: 'missile',
      bundleSize: 1,
      splitCount: 9,
      splitAngleSpread: 40
    },
    {
      id: 'funky-bomb',
      name: 'Funky Bomb',
      startingAmmo: 0,
      price: 7000,
      damage: 50,
      craterRadius: 34,
      projectileSpeedScale: 1,
      behavior: 'funky',
      category: 'missile',
      bundleSize: 2,
      funkySpawnCount: 6
    },
    {
      id: 'baby-roller',
      name: 'Baby Roller',
      startingAmmo: 0,
      price: 5000,
      damage: 30,
      craterRadius: 22,
      projectileSpeedScale: 1,
      behavior: 'roller',
      category: 'terrain',
      bundleSize: 10
    },
    {
      id: 'roller',
      name: 'Roller',
      startingAmmo: 0,
      price: 6750,
      damage: 45,
      craterRadius: 32,
      projectileSpeedScale: 1,
      behavior: 'roller',
      category: 'terrain',
      bundleSize: 5
    },
    {
      id: 'heavy-roller',
      name: 'Heavy Roller',
      startingAmmo: 0,
      price: 6750,
      damage: 70,
      craterRadius: 45,
      projectileSpeedScale: 1,
      behavior: 'roller',
      category: 'terrain',
      bundleSize: 2
    },
    {
      id: 'baby-digger',
      name: 'Baby Digger',
      startingAmmo: 0,
      price: 3000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'digger',
      category: 'terrain',
      bundleSize: 10,
      tunnelLength: 60,
      tunnelRadius: 7
    },
    {
      id: 'digger',
      name: 'Digger',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'digger',
      category: 'terrain',
      bundleSize: 5,
      tunnelLength: 100,
      tunnelRadius: 9
    },
    {
      id: 'heavy-digger',
      name: 'Heavy Digger',
      startingAmmo: 0,
      price: 6750,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'digger',
      category: 'terrain',
      bundleSize: 2,
      tunnelLength: 150,
      tunnelRadius: 11
    },
    {
      id: 'baby-sandhog',
      name: 'Baby Sandhog',
      startingAmmo: 0,
      price: 10000,
      damage: 25,
      craterRadius: 14,
      projectileSpeedScale: 1,
      behavior: 'sandhog',
      category: 'terrain',
      bundleSize: 10,
      tunnelLength: 60,
      tunnelRadius: 7
    },
    {
      id: 'sandhog',
      name: 'Sandhog',
      startingAmmo: 0,
      price: 16750,
      damage: 40,
      craterRadius: 18,
      projectileSpeedScale: 1,
      behavior: 'sandhog',
      category: 'terrain',
      bundleSize: 5,
      tunnelLength: 100,
      tunnelRadius: 9
    },
    {
      id: 'heavy-sandhog',
      name: 'Heavy Sandhog',
      startingAmmo: 0,
      price: 25000,
      damage: 60,
      craterRadius: 24,
      projectileSpeedScale: 1,
      behavior: 'sandhog',
      category: 'terrain',
      bundleSize: 2,
      tunnelLength: 150,
      tunnelRadius: 11
    },
    {
      id: 'riot-charge',
      name: 'Riot Charge',
      startingAmmo: 0,
      price: 2000,
      damage: 0,
      craterRadius: 36,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'terrain',
      bundleSize: 10,
      craterForwardBias: 0.6
    },
    {
      id: 'riot-blast',
      name: 'Riot Blast',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 60,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'terrain',
      bundleSize: 5,
      craterForwardBias: 0.6
    },
    {
      id: 'riot-bomb',
      name: 'Riot Bomb',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 40,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'terrain',
      bundleSize: 5
    },
    {
      id: 'heavy-riot-bomb',
      name: 'Heavy Riot Bomb',
      startingAmmo: 0,
      price: 8750,
      damage: 0,
      craterRadius: 60,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'terrain',
      bundleSize: 2
    },
    {
      id: 'dirt-clod',
      name: 'Dirt Clod',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'dirt',
      category: 'terrain',
      bundleSize: 10,
      moundRadius: 24
    },
    {
      id: 'dirt-ball',
      name: 'Dirt Ball',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'dirt',
      category: 'terrain',
      bundleSize: 5,
      moundRadius: 42
    },
    {
      id: 'ton-of-dirt',
      name: 'Ton of Dirt',
      startingAmmo: 0,
      price: 6750,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'dirt',
      category: 'terrain',
      bundleSize: 2,
      moundRadius: 70
    },
    {
      id: 'liquid-dirt',
      name: 'Liquid Dirt',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'liquid',
      category: 'terrain',
      bundleSize: 10,
      liquidVolume: 2600
    },
    {
      id: 'earth-disrupter',
      name: 'Earth Disrupter',
      startingAmmo: 0,
      price: 5000,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'settle',
      category: 'terrain',
      bundleSize: 10,
      settleRadius: 80
    },
    {
      id: 'tracer',
      name: 'Tracer',
      startingAmmo: 0,
      price: 10,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'utility',
      bundleSize: 20
    },
    {
      id: 'smoke-tracer',
      name: 'Smoke Tracer',
      startingAmmo: 0,
      price: 500,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'single',
      category: 'utility',
      bundleSize: 10
    },
    {
      id: 'napalm',
      name: 'Napalm',
      startingAmmo: 0,
      price: 10000,
      damage: 45,
      craterRadius: 20,
      projectileSpeedScale: 1,
      behavior: 'napalm',
      category: 'fire',
      bundleSize: 10,
      flameCount: 7
    },
    {
      id: 'hot-napalm',
      name: 'Hot Napalm',
      startingAmmo: 0,
      price: 20000,
      damage: 70,
      craterRadius: 26,
      projectileSpeedScale: 1,
      behavior: 'napalm',
      category: 'fire',
      bundleSize: 5,
      flameCount: 10
    },
    {
      id: 'plasma-blast',
      name: 'Plasma Blast',
      startingAmmo: 0,
      price: 9000,
      damage: 60,
      craterRadius: 40,
      projectileSpeedScale: 1.15,
      behavior: 'single',
      category: 'energy',
      bundleSize: 5,
      batteryCost: 1
    },
    {
      id: 'laser',
      name: 'Laser',
      startingAmmo: 0,
      price: 5000,
      damage: 45,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'laser',
      category: 'energy',
      bundleSize: 5,
      batteryCost: 2
    }
  ] satisfies WeaponDefinition[],
  items: [
    { id: 'parachute', name: 'Parachute', price: 10000, bundleSize: 8, hotkey: 'P', description: 'Auto-deploys on falls', category: 'defense' },
    { id: 'shield', name: 'Shield', price: 20000, bundleSize: 3, hotkey: 'S', description: 'Absorbs up to 40 damage', category: 'defense', absorb: 40 },
    { id: 'battery', name: 'Battery', price: 5000, bundleSize: 10, hotkey: 'B', description: '+10 HP or fuels energy weapons', category: 'energy', sidebarLabel: 'BATTERIES' },
    { id: 'force-shield', name: 'Force Shield', price: 25000, bundleSize: 3, hotkey: 'F', description: 'Absorbs 65 damage when armed', category: 'defense', absorb: 65 },
    { id: 'heavy-shield', name: 'Heavy Shield', price: 30000, bundleSize: 2, hotkey: 'H', description: 'Absorbs 90 damage when armed', category: 'defense', absorb: 90 },
    { id: 'super-mag', name: 'Super Mag', price: 35000, bundleSize: 2, hotkey: 'M', description: 'Absorbs 100 + deflects shots', category: 'defense', absorb: 100, deflects: true },
    { id: 'mag-deflector', name: 'Mag Deflector', price: 10000, bundleSize: 2, hotkey: 'G', description: 'Deflects nearby shots upward', category: 'defense', deflects: true },
    { id: 'auto-defense', name: 'Auto Defense', price: 1500, bundleSize: 1, hotkey: 'O', description: 'Shields auto-arm each round', category: 'defense', oneTime: true },
    { id: 'fuel-tank', name: 'Fuel Tank', price: 10000, bundleSize: 10, hotkey: 'U', description: '+10 movement fuel each', category: 'utility', sidebarLabel: 'FUEL TANKS' },
    { id: 'contact-trigger', name: 'Contact Trigger', price: 1000, bundleSize: 25, hotkey: 'T', description: 'Warheads explode on contact while tunneling', category: 'utility', sidebarLabel: 'CONTACT TRIGGERS' },
    { id: 'heat-guidance', name: 'Heat Guidance', price: 10000, bundleSize: 6, hotkey: 'J', description: 'Shots home toward nearby tanks', category: 'utility', sidebarLabel: 'HEAT GUIDE' },
    { id: 'ballistic-guidance', name: 'Ballistic Guidance', price: 10000, bundleSize: 2, hotkey: 'K', description: 'Auto-computes the firing solution', category: 'utility', sidebarLabel: 'BALLISTIC' },
    { id: 'horizontal-guidance', name: 'Horizontal Guidance', price: 15000, bundleSize: 5, hotkey: 'L', description: 'Shots level off toward the target', category: 'utility', sidebarLabel: 'HORIZONTAL' },
    { id: 'vertical-guidance', name: 'Vertical Guidance', price: 20000, bundleSize: 5, hotkey: 'I', description: 'Shots dive when above the target', category: 'utility', sidebarLabel: 'VERTICAL' },
    { id: 'lazy-boy', name: 'Lazy Boy', price: 20000, bundleSize: 2, hotkey: 'Y', description: 'Auto-aim plus homing', category: 'utility', sidebarLabel: 'LAZY BOYS' }
  ] satisfies ItemDefinition[],
  taunts: [
    'AAARGH!',
    'MEDIC!',
    "I'LL BE BACK!",
    'SO LONG, WORLD!',
    'THAT LEFT A MARK.',
    'REVENGE WILL BE MINE!',
    'WHY ME?!',
    'BLAST IT!',
    'MY PAINT JOB!',
    'I REGRET NOTHING!',
    'TELL MY STORY!',
    'OUT WITH A BANG!'
  ]
} as const;

// Bananas mode's only weapon. Deliberately NOT in GAME_CONFIG.weapons —
// the Scorched arsenal stays untouched at 39 entries.
export const BANANA_WEAPON: WeaponDefinition = {
  id: 'banana',
  name: 'Banana',
  startingAmmo: -1,
  price: 0,
  damage: 175,
  craterRadius: 30,
  projectileSpeedScale: 1,
  behavior: 'single',
  category: 'missile',
  bundleSize: 1
};
