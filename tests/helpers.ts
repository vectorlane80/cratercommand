import { GAME_CONFIG, type TerrainData, type TankState, type PlayerProfile } from '../src/game/types/GameTypes';

export function makeFlatTerrain(surfaceY: number, width = 960): TerrainData {
  const { sampleCount } = GAME_CONFIG.terrain;
  const segmentWidth = width / (sampleCount - 1);
  return {
    heights: Array(sampleCount).fill(surfaceY),
    width,
    height: 356,
    segmentWidth
  };
}

export function makeTank(overrides: Partial<TankState> = {}): TankState {
  return {
    id: 0,
    x: 480,
    y: 248,
    health: 125,
    angle: 90,
    power: 50,
    alive: true,
    ammo: { 'small-missile': -1 },
    selectedWeaponIndex: 0,
    moveRemaining: 70,
    parachutes: 0,
    defenses: {},
    armedShieldId: null,
    armedShieldHp: 0,
    batteries: 0,
    fuel: 0,
    contactTriggers: 0,
    damageDealt: 0,
    color: 0,
    accentColor: 0,
    label: 'T',
    ...overrides
  };
}

export function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  const ammo: Record<string, number> = {};
  GAME_CONFIG.weapons.forEach((w) => {
    ammo[w.id] = w.startingAmmo;
  });
  return {
    cash: 1500,
    wins: 0,
    ammo,
    parachutes: 1,
    defenses: {},
    autoDefense: false,
    batteries: 0,
    fuel: 0,
    contactTriggers: 0,
    controller: 'human',
    displayName: null,
    ...overrides
  };
}
