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

    // Solid dirt body
    graphics.fillStyle(colors.desertBrown, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);
    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    // Darker lower body, blended in below ~30px from surface
    graphics.fillStyle(colors.desertDark, 0.62);
    for (let index = 0; index < heights.length - 1; index += 1) {
      const x = index * segmentWidth;
      const nextX = (index + 1) * segmentWidth;
      const y = heights[index] + 30;
      graphics.fillRect(x, y, Math.ceil(nextX - x) + 1, Math.max(0, height - y));
    }

    // Bright gold lip along the ridge
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

    // Highlight band just under the gold lip
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

    // Chunky rock pixels scattered through the dirt body.
    for (let y = 0; y < height; y += 6) {
      for (let x = (y * 11) % 13; x < width; x += 13) {
        const groundY = this.getHeightAtX(terrainData, x);
        if (y <= groundY + 8) continue;
        const noise = (x * 137 + y * 53) % 7;
        let shade: number;
        let size: number;
        if (noise === 0) { shade = 0x6b3a17; size = 3; }
        else if (noise < 3) { shade = 0x2a160a; size = 3; }
        else if (noise < 5) { shade = 0x361f0d; size = 2; }
        else continue;
        graphics.fillStyle(shade, 0.85);
        graphics.fillRect(x, y, size, 2);
      }
    }

    // Cacti are now drawn as image sprites by GameScene's retro layer pass.
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

  /** Carve a narrow channel sample: lower any terrain above the bore point so the
   *  surface opens around (x, y). Only affects columns within `radius` of x whose
   *  surface is ABOVE y + radius (i.e. the bore is underground there). Returns
   *  true when any height changed. */
  applyTunnel(terrainData: TerrainData, x: number, y: number, radius: number): boolean {
    const { heights, segmentWidth } = terrainData;
    const centerIndex = Math.round(x / segmentWidth);
    const sampleRadius = Math.ceil(radius / segmentWidth);
    let changed = false;

    for (let index = centerIndex - sampleRadius; index <= centerIndex + sampleRadius; index += 1) {
      if (index < 0 || index >= heights.length) continue;

      const sampleX = index * segmentWidth;
      const dx = sampleX - x;
      if (Math.abs(dx) > radius) continue;

      const depth = Math.sqrt(radius * radius - dx * dx);
      const floorY = y + depth;

      // Carve if surface is above tunnel ceiling and within tunnel bounds
      if (heights[index] >= y - depth && heights[index] < y + depth) {
        const newHeight = Math.min(GAME_CONFIG.terrain.craterMaxY, Math.max(heights[index], floorY));
        if (newHeight !== heights[index]) {
          heights[index] = newHeight;
          changed = true;
        }
      }
    }

    return changed;
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

  /** Pour `volume` px^2 of liquid dirt at x: raise the surface toward a level
   *  line inside a window, filling the lowest ground first (classic flood fill
   *  on a heightmap). Window is centered on x, up to `maxWidth` px wide. */
  applyLiquid(terrainData: TerrainData, x: number, volume: number, maxWidth = 220): void {
    const { heights, segmentWidth } = terrainData;
    const centerIndex = Math.round(x / segmentWidth);
    const halfWidth = Math.floor(maxWidth / 2 / segmentWidth);

    // Find window bounds
    const startIndex = Math.max(0, centerIndex - halfWidth);
    const endIndex = Math.min(heights.length - 1, centerIndex + halfWidth);

    // Find min and max heights in window
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let i = startIndex; i <= endIndex; i += 1) {
      minHeight = Math.min(minHeight, heights[i]);
      maxHeight = Math.max(maxHeight, heights[i]);
    }

    // Binary search for fill level: find L where filledVolume(L) ≈ volume
    let low = minHeight;
    let high = maxHeight;
    let fillLevel = minHeight;

    for (let iter = 0; iter < 20; iter += 1) {
      const mid = (low + high) / 2;
      let filledVolume = 0;
      for (let i = startIndex; i <= endIndex; i += 1) {
        if (heights[i] > mid) {
          filledVolume += (heights[i] - mid) * segmentWidth;
        }
      }
      if (filledVolume < volume) {
        high = mid;
      } else {
        low = mid;
      }
      fillLevel = mid;
    }

    // Apply liquid: raise terrain to fill level (decrease heights toward fillLevel)
    for (let i = startIndex; i <= endIndex; i += 1) {
      if (heights[i] > fillLevel) {
        heights[i] = Math.min(heights[i], Math.max(fillLevel, GAME_CONFIG.terrain.minY));
      }
    }
  }

  /** Settle/level terrain: heavy smoothing passes over a radius. */
  applySettle(terrainData: TerrainData, x: number, radius: number): void {
    const { heights, segmentWidth } = terrainData;
    const centerIndex = Math.round(x / segmentWidth);
    const sampleRadius = Math.ceil(radius / segmentWidth);

    const start = Math.max(1, centerIndex - sampleRadius);
    const end = Math.min(heights.length - 2, centerIndex + sampleRadius);

    // Heavy smoothing: twelve passes of neighbor averaging
    for (let pass = 0; pass < 12; pass += 1) {
      for (let index = start; index <= end; index += 1) {
        heights[index] = (heights[index - 1] + heights[index] * 2 + heights[index + 1]) / 4;
      }
    }
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
