import Phaser from 'phaser';
import { GAME_CONFIG, type TerrainData, type VisualSystem } from '../types/GameTypes';

export class TerrainSystem {
  generate(sceneWidth: number, battlefieldHeight: number): TerrainData {
    const { sampleCount, baseY, variation, minY, maxY } = GAME_CONFIG.terrain;
    const segmentWidth = sceneWidth / (sampleCount - 1);

    const phaseA = Math.random() * Math.PI * 2;
    const phaseB = Math.random() * Math.PI * 2;
    const phaseC = Math.random() * Math.PI * 2;
    const freqA = 2.4 + Math.random() * 2.4;
    const freqB = 5.5 + Math.random() * 5;
    const freqC = 16 + Math.random() * 10;
    const valleyCenter = 0.25 + Math.random() * 0.5;
    const valleyDepth = 40 + Math.random() * 70;
    const valleyWidth = 0.1 + Math.random() * 0.08;

    const heights = Array.from({ length: sampleCount }, (_, index) => {
      const t = index / (sampleCount - 1);
      const ridge =
        Math.sin(t * Math.PI * freqA + phaseA) * 0.48 +
        Math.sin(t * Math.PI * freqB + phaseB) * 0.25 +
        Math.sin(t * Math.PI * freqC + phaseC) * 0.18;
      const jag = (Math.random() - 0.5) * 12;
      const valley = Math.exp(-Math.pow((t - valleyCenter) / valleyWidth, 2)) * valleyDepth;
      const y = baseY - ridge * variation + valley + jag;

      return Phaser.Math.Clamp(y, minY, maxY);
    });

    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 1; index < heights.length - 1; index += 1) {
        heights[index] = (heights[index - 1] + heights[index] * 2 + heights[index + 1]) / 4;
      }
    }

    return {
      heights,
      width: sceneWidth,
      height: battlefieldHeight,
      segmentWidth
    };
  }

  draw(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData, visualSystem: VisualSystem = 'classic'): void {
    const { heights, width, height, segmentWidth } = terrainData;

    graphics.clear();
    if (visualSystem === 'retroPixel') {
      this.drawRetroPixel(graphics, terrainData);
      return;
    }

    graphics.fillStyle(GAME_CONFIG.colors.darkGreen, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);

    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });

    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(3, GAME_CONFIG.colors.ridgeGreen, 1);
    graphics.beginPath();
    heights.forEach((sampleHeight, index) => {
      const x = index * segmentWidth;
      if (index === 0) {
        graphics.moveTo(x, sampleHeight);
      } else {
        graphics.lineTo(x, sampleHeight);
      }
    });
    graphics.strokePath();

    graphics.fillStyle(0x00881a, 0.45);
    for (let index = 0; index < heights.length; index += 2) {
      const x = index * segmentWidth;
      const y = heights[index] + 12;
      graphics.fillRect(x, y, 2, Math.max(0, height - y));
    }
  }

  private drawRetroPixel(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData): void {
    const { heights, width, height, segmentWidth } = terrainData;
    const colors = GAME_CONFIG.colors;

    graphics.fillStyle(colors.desertDark, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);
    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(colors.desertBrown, 0.78);
    for (let index = 0; index < heights.length - 1; index += 1) {
      const x = index * segmentWidth;
      const nextX = (index + 1) * segmentWidth;
      const y = heights[index] + 10;
      graphics.fillRect(x, y, Math.ceil(nextX - x) + 1, Math.max(0, height - y));
    }

    graphics.lineStyle(4, colors.desertGold, 1);
    graphics.beginPath();
    heights.forEach((sampleHeight, index) => {
      const x = index * segmentWidth;
      if (index === 0) {
        graphics.moveTo(x, sampleHeight);
      } else {
        graphics.lineTo(x, sampleHeight);
      }
    });
    graphics.strokePath();

    graphics.lineStyle(2, 0xffb22e, 0.9);
    graphics.beginPath();
    heights.forEach((sampleHeight, index) => {
      const x = index * segmentWidth;
      const y = sampleHeight + 5;
      if (index === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    });
    graphics.strokePath();

    for (let y = 0; y < height; y += 10) {
      for (let x = (y * 7) % 17; x < width; x += 17) {
        const groundY = this.getHeightAtX(terrainData, x);
        if (y > groundY + 12) {
          const shade = (x + y) % 4 === 0 ? 0x0c0703 : 0x2d1a0b;
          graphics.fillStyle(shade, 0.72);
          graphics.fillRect(x, y, 3, 2);
        }
      }
    }
  }

  applyMound(terrainData: TerrainData, x: number, y: number, radius: number): void {
    const { heights, segmentWidth } = terrainData;
    const centerIndex = Math.round(x / segmentWidth);
    const sampleRadius = Math.ceil(radius / segmentWidth);

    for (let index = centerIndex - sampleRadius; index <= centerIndex + sampleRadius; index += 1) {
      if (index < 0 || index >= heights.length) continue;

      const sampleX = index * segmentWidth;
      const dx = sampleX - x;
      if (Math.abs(dx) > radius) continue;

      const domeHeight = Math.sqrt(radius * radius - dx * dx);
      const liftedY = y - domeHeight;
      heights[index] = Phaser.Math.Clamp(Math.min(heights[index], liftedY), GAME_CONFIG.terrain.minY, GAME_CONFIG.terrain.craterMaxY);
    }

    this.relaxCraterEdges(terrainData, centerIndex, sampleRadius + 4);
  }

  applyCrater(terrainData: TerrainData, x: number, y: number, radius: number): void {
    const { heights, segmentWidth } = terrainData;
    const centerIndex = Math.round(x / segmentWidth);
    const sampleRadius = Math.ceil(radius / segmentWidth);

    for (let index = centerIndex - sampleRadius; index <= centerIndex + sampleRadius; index += 1) {
      if (index < 0 || index >= heights.length) continue;

      const sampleX = index * segmentWidth;
      const dx = sampleX - x;
      if (Math.abs(dx) > radius) continue;

      const circleDepth = Math.sqrt(radius * radius - dx * dx);
      const craterY = Phaser.Math.Clamp(y + circleDepth, 0, GAME_CONFIG.terrain.craterMaxY);
      heights[index] = Math.max(heights[index], craterY);
    }

    this.relaxCraterEdges(terrainData, centerIndex, sampleRadius + 4);
  }

  getHeightAtX(terrainData: TerrainData, x: number): number {
    const { heights, segmentWidth } = terrainData;
    const index = Phaser.Math.Clamp(Math.floor(x / segmentWidth), 0, heights.length - 2);
    const t = (x - index * segmentWidth) / segmentWidth;

    return Phaser.Math.Linear(heights[index], heights[index + 1], t);
  }

  isBelowTerrain(terrainData: TerrainData, x: number, y: number): boolean {
    if (x < 0 || x > terrainData.width) return false;

    return y >= this.getHeightAtX(terrainData, x);
  }

  private relaxCraterEdges(terrainData: TerrainData, centerIndex: number, range: number): void {
    const { heights } = terrainData;
    const start = Math.max(1, centerIndex - range);
    const end = Math.min(heights.length - 2, centerIndex + range);

    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = start; index <= end; index += 1) {
        heights[index] = (heights[index - 1] + heights[index] * 2 + heights[index + 1]) / 4;
      }
    }
  }
}
