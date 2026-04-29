export interface TerrainData {
  heights: number[];
  width: number;
  height: number;
  segmentWidth: number;
}

export interface TankData {
  x: number;
  y: number;
  color: number;
  label: string;
}

export const GAME_CONFIG = {
  width: 960,
  height: 540,
  backgroundColor: 0x8ecae6,
  terrain: {
    baseHeightRatio: 0.68,
    variation: 130,
    smoothingPasses: 2,
    sampleCount: 120,
    color: 0x395a3a
  },
  tank: {
    width: 28,
    height: 14,
    turretLength: 20,
    yOffset: 7
  },
  aiming: {
    minAngle: 5,
    maxAngle: 175,
    initialAngle: 45,
    angleStep: 1,
    minPower: 10,
    maxPower: 100,
    initialPower: 55,
    powerStep: 1,
    lineLength: 80
  }
} as const;
