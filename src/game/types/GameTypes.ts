export type PlayerId = 0 | 1;
export type GamePhase = 'aiming' | 'projectileInFlight' | 'resolvingImpact' | 'gameOver';
export type ImpactKind = 'terrain' | 'tank' | 'outOfBounds';

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
}

export interface WeaponDefinition {
  id: string;
  name: string;
  ammoLabel: string;
  damage: number;
  craterRadius: number;
  projectileSpeedScale: number;
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
    purple: 0x79217d
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
    maxAgeMs: 12000,
    launchSpeedBase: 80
  },
  wind: {
    min: 0,
    max: 18
  },
  weapons: [
    {
      id: 'small-missile',
      name: 'Small Missile',
      ammoLabel: '10',
      damage: 35,
      craterRadius: 25,
      projectileSpeedScale: 1
    }
  ] satisfies WeaponDefinition[]
} as const;
