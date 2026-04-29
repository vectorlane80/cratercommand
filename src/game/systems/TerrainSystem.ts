import Phaser from 'phaser';
import { GAME_CONFIG, type TerrainData } from '../types/GameTypes';

export class TerrainSystem {
  generate(sceneWidth: number, sceneHeight: number): TerrainData {
    const { sampleCount, baseHeightRatio, variation, smoothingPasses } = GAME_CONFIG.terrain;
    const segmentWidth = sceneWidth / (sampleCount - 1);
    const baseHeight = sceneHeight * baseHeightRatio;

    const heights = Array.from({ length: sampleCount }, () => baseHeight + Phaser.Math.Between(-variation, variation));

    for (let pass = 0; pass < smoothingPasses; pass += 1) {
      for (let i = 1; i < heights.length - 1; i += 1) {
        heights[i] = (heights[i - 1] + heights[i] + heights[i + 1]) / 3;
      }
    }

    return {
      heights,
      width: sceneWidth,
      height: sceneHeight,
      segmentWidth
    };
  }

  draw(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData): void {
    const { heights, width, height, segmentWidth } = terrainData;

    graphics.clear();
    graphics.fillStyle(GAME_CONFIG.terrain.color, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);

    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });

    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();
  }

  getHeightAtX(terrainData: TerrainData, x: number): number {
    const { heights, segmentWidth } = terrainData;
    const index = Phaser.Math.Clamp(Math.floor(x / segmentWidth), 0, heights.length - 2);
    const t = (x - index * segmentWidth) / segmentWidth;

    return Phaser.Math.Linear(heights[index], heights[index + 1], t);
  }
}
