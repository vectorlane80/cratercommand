export type PlayerId = 0 | 1;
export type GamePhase =
  | 'aiming'
  | 'projectileInFlight'
  | 'roundOver'
  | 'shopping'
  | 'matchOver';
export type ImpactKind = 'terrain' | 'tank' | 'outOfBounds';
export type WeaponBehavior = 'single' | 'split' | 'bounce' | 'dirt' | 'salvo';
export type VisualSystem = 'classic' | 'retroPixel';

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
  damageDealt: number;
}

export interface PlayerProfile {
  cash: number;
  wins: number;
  ammo: Record<string, number>;
  parachutes: number;
}

export interface MatchState {
  round: number;
  roundsToWin: number;
  profiles: [PlayerProfile, PlayerProfile];
  shoppingPlayerId: PlayerId | null;
  shopVisitsRemaining: number;
  matchWinnerId: PlayerId | null;
}

export interface WeaponDefinition {
  id: string;
  name: string;
  startingAmmo: number; // -1 means unlimited
  price: number; // 0 means cannot be bought (e.g. unlimited freebie)
  damage: number;
  craterRadius: number;
  projectileSpeedScale: number;
  behavior: WeaponBehavior;
  splitCount?: number;
  splitAngleSpread?: number;
  bounceCount?: number;
  salvoCount?: number;
  salvoAngleSpread?: number;
  salvoPowerSpread?: number;
  moundRadius?: number;
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
    threshold: 8,
    damagePerPixel: 0.85,
    maxDamage: 75
  },
  match: {
    roundsToWin: 2,
    startingCash: 1500,
    startingParachutes: 1,
    parachutePrice: 250,
    damageCashMultiplier: 3,
    roundWinBonus: 500,
    survivalBonus: 150
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
      behavior: 'single'
    },
    {
      id: 'big-missile',
      name: 'Big Missile',
      startingAmmo: 8,
      price: 350,
      damage: 55,
      craterRadius: 38,
      projectileSpeedScale: 1,
      behavior: 'single'
    },
    {
      id: 'triple-missile',
      name: 'Triple Missile',
      startingAmmo: 6,
      price: 1000,
      damage: 30,
      craterRadius: 22,
      projectileSpeedScale: 1,
      behavior: 'split',
      splitCount: 3,
      splitAngleSpread: 18
    },
    {
      id: 'huge-missile',
      name: 'Huge Missile',
      startingAmmo: 3,
      price: 1800,
      damage: 90,
      craterRadius: 60,
      projectileSpeedScale: 1,
      behavior: 'single'
    },
    {
      id: 'dirt-mover',
      name: 'Dirt Mover',
      startingAmmo: 4,
      price: 500,
      damage: 0,
      craterRadius: 0,
      projectileSpeedScale: 1,
      behavior: 'dirt',
      moundRadius: 42
    },
    {
      id: 'bouncing-bomb',
      name: 'Bouncing Bomb',
      startingAmmo: 5,
      price: 800,
      damage: 50,
      craterRadius: 32,
      projectileSpeedScale: 1,
      behavior: 'bounce',
      bounceCount: 1
    },
    {
      id: 'bullet',
      name: 'Bullet',
      startingAmmo: 12,
      price: 150,
      damage: 22,
      craterRadius: 12,
      projectileSpeedScale: 1.7,
      behavior: 'single'
    },
    {
      id: 'stream',
      name: 'Stream',
      startingAmmo: 4,
      price: 1300,
      damage: 18,
      craterRadius: 14,
      projectileSpeedScale: 0.95,
      behavior: 'salvo',
      salvoCount: 5,
      salvoAngleSpread: 5,
      salvoPowerSpread: 12
    }
  ] satisfies WeaponDefinition[]
} as const;
