import Phaser from 'phaser';
import {
  bananasInk,
  bananasIs1Bit,
  GAME_CONFIG,
  TERRAIN_PALETTES,
  type TerrainData,
  type TerrainKind,
  type VisualSystem
} from '../types/GameTypes';

/** Verbatim xorshift32 from the Bananas design preview — skyline layouts
 * must reproduce the mock exactly for a given seed. */
export function bananasRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export interface BananasBuilding {
  x: number;
  w: number;
  roof: number;
  colorIndex: number; // 0 cyan #00AAAA, 1 red #AA0000, 2 lgray #AAAAAA
  seed: number;
}

export interface TerrainAnchor {
  x: number;
  slope: number;
  y: number;
}

/** Flat-ground anchors: low local slope, clear of tanks and edges, spaced apart.
 * Scans x from 74..W-74 step 4; skips |x-125|<58 and |x-835|<58; slope from
 * three-sample max with 0.8 factor; strict pass slope<=7 spacing 92;
 * loose pass slope<=14 spacing 74; returns sorted by x. */
export function terrainPropAnchors(terrainSystem: TerrainSystem, td: TerrainData, count: number, halfWidth = 22): TerrainAnchor[] {
  const cands: TerrainAnchor[] = [];
  const W = td.width;
  for (let x = 74; x <= W - 74; x += 4) {
    if (Math.abs(x - 125) < 58 || Math.abs(x - 835) < 58) continue;
    const hl = terrainSystem.getHeightAtX(td, x - halfWidth);
    const hc = terrainSystem.getHeightAtX(td, x);
    const hr = terrainSystem.getHeightAtX(td, x + halfWidth);
    const slope = Math.max(Math.abs(hc - hl), Math.abs(hr - hc), Math.abs(hr - hl) * 0.8);
    cands.push({ x, slope, y: Math.max(hl, hc, hr) });
  }
  cands.sort((a, b) => a.slope - b.slope);
  const picked: TerrainAnchor[] = [];
  for (const c of cands) {
    if (picked.length >= count) break;
    if (c.slope > 7) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < 92)) continue;
    picked.push(c);
  }
  // Second, looser pass so the full prop set always gets placed on rough seeds.
  for (const c of cands) {
    if (picked.length >= count) break;
    if (c.slope > 14) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < 74)) continue;
    picked.push(c);
  }
  return picked.sort((a, b) => a.x - b.x);
}

export function bananasBuildings(seed: number, sceneWidth: number): BananasBuilding[] {
  const rand = bananasRng(seed);
  const buildings: BananasBuilding[] = [];
  let x = 0;
  let i = 0;

  while (x < sceneWidth) {
    const w = Math.round(60 + rand() * 60);
    // User-directed deviation from the mock's 120 + rand()*150: cap tower
    // height so roofs (356 - h >= 106) always clear the sun's rays (y <= 96).
    const h = Math.round(120 + rand() * 130);
    buildings.push({
      x,
      w: Math.min(w, sceneWidth - x),
      roof: GAME_CONFIG.layout.battlefieldHeight - h,
      colorIndex: i % 3,
      seed: (x * 7919) | 0
    });
    x += w;
    i += 1;
  }

  return buildings;
}

export class TerrainSystem {
  private bananasBuildingList: BananasBuilding[] = [];

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

  setBananasSkyline(seed: number, sceneWidth: number): void {
    this.bananasBuildingList = bananasBuildings(seed, sceneWidth);
  }

  generateBananasSkyline(sceneWidth: number, battlefieldHeight: number, seed: number): TerrainData {
    const { sampleCount } = GAME_CONFIG.terrain;
    const segmentWidth = sceneWidth / (sampleCount - 1);

    this.setBananasSkyline(seed, sceneWidth);
    const heights = Array.from({ length: sampleCount }, (_, index) => {
      const x = index * segmentWidth;
      const building = this.bananasBuildingList.find((b) => x >= b.x && x < b.x + b.w) || this.bananasBuildingList[0];
      return building.roof;
    });

    return {
      heights,
      width: sceneWidth,
      height: battlefieldHeight,
      segmentWidth
    };
  }

  draw(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData, visualSystem: VisualSystem = 'classic', terrain: TerrainKind = 'desert'): void {
    const { heights, width, height, segmentWidth } = terrainData;

    graphics.clear();
    if (visualSystem === 'retroPixel') {
      this.drawRetroPixel(graphics, terrainData, terrain);
      return;
    }
    if (visualSystem === 'hiRes') {
      this.drawHiRes(graphics, terrainData, terrain);
      return;
    }
    if (visualSystem === 'bananas') {
      this.drawBananas(graphics, terrainData);
      return;
    }

    // Classic path: desert keeps the existing green look, other terrains use per-terrain colors
    const flatColor = terrain === 'desert' ? GAME_CONFIG.colors.darkGreen : TERRAIN_PALETTES[terrain].classic.flat;
    const ridgeColor = terrain === 'desert' ? GAME_CONFIG.colors.ridgeGreen : TERRAIN_PALETTES[terrain].classic.ridge;
    const hatchColor = terrain === 'desert' ? 0x00881a : TERRAIN_PALETTES[terrain].classic.hatch;

    graphics.fillStyle(flatColor, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);

    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });

    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(3, ridgeColor, 1);
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

    graphics.fillStyle(hatchColor, 0.45);
    for (let index = 0; index < heights.length; index += 2) {
      const x = index * segmentWidth;
      const y = heights[index] + 12;
      graphics.fillRect(x, y, 2, Math.max(0, height - y));
    }
  }

  private drawBananas(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData): void {
    const { heights, width, height, segmentWidth } = terrainData;
    const buildingColors = [bananasInk(0x00aaaa), bananasInk(0xaa0000), bananasInk(0xaaaaaa)];
    const is1Bit = bananasIs1Bit();

    graphics.fillStyle(bananasInk(0x0000aa), 1);
    graphics.fillRect(0, 0, width, height);
    if (this.bananasBuildingList.length === 0) return;

    if (is1Bit) graphics.fillStyle(bananasInk(0xffffff), 1);
    for (let x = 0; x < width; x += 2) {
      const sampleIndex = Phaser.Math.Clamp(Math.round(x / segmentWidth), 0, heights.length - 1);
      const surfaceY = heights[sampleIndex];
      if (is1Bit) {
        // Connect each column to its neighbor's surface so crater bites and
        // building steps read as a continuous contour — per-column dots made
        // damaged rooflines look like broken dotted lines.
        const nextIndex = Phaser.Math.Clamp(Math.round((x + 2) / segmentWidth), 0, heights.length - 1);
        const nextY = heights[nextIndex];
        const topY = Math.min(surfaceY, nextY);
        graphics.fillRect(x, topY, 2, Math.max(2, Math.abs(nextY - surfaceY) + 2));
      } else {
        const building = this.bananasBuildingList.find((b) => x >= b.x && x < b.x + b.w)!;
        graphics.fillStyle(buildingColors[building.colorIndex], 1);
        graphics.fillRect(x, surfaceY, 2, height - surfaceY);
      }
    }

    if (is1Bit) {
      graphics.fillStyle(bananasInk(0xffffff), 1);
      this.bananasBuildingList.forEach((building) => {
        const leftSampleIndex = Phaser.Math.Clamp(Math.round(building.x / segmentWidth), 0, heights.length - 1);
        const rightX = building.x + building.w - 2;
        const rightSampleIndex = Phaser.Math.Clamp(Math.round(rightX / segmentWidth), 0, heights.length - 1);
        const edgeTopLeft = heights[leftSampleIndex];
        const edgeTopRight = heights[rightSampleIndex];
        graphics.fillRect(building.x, edgeTopLeft, 2, height - edgeTopLeft);
        graphics.fillRect(rightX, edgeTopRight, 2, height - edgeTopRight);
      });
    }

    this.bananasBuildingList.forEach((building) => {
      const rand = bananasRng(building.seed);
      for (let wy = building.roof + 12; wy < GAME_CONFIG.layout.battlefieldHeight - 12; wy += 18) {
        for (let wx = building.x + 8; wx < building.x + building.w - 12; wx += 12) {
          const lit = rand() < 0.42;
          const sampleIndex = Phaser.Math.Clamp(Math.round((wx + 3) / segmentWidth), 0, heights.length - 1);
          const surfaceY = heights[sampleIndex];
          if (surfaceY > wy) continue;
          if (is1Bit && !lit) continue;
          graphics.fillStyle(bananasInk(lit ? 0xffff55 : 0x555555), 1);
          graphics.fillRect(wx, wy, 6, 9);
        }
      }
    });
  }

  private drawRetroPixel(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData, terrain: TerrainKind = 'desert'): void {
    const { heights, width, height, segmentWidth } = terrainData;
    const palette = TERRAIN_PALETTES[terrain];

    // Solid dirt body
    graphics.fillStyle(palette.retro.dirt, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);
    heights.forEach((sampleHeight, index) => {
      graphics.lineTo(index * segmentWidth, sampleHeight);
    });
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    // Darker lower body, blended in below ~30px from surface
    graphics.fillStyle(palette.retro.dark, 0.62);
    for (let index = 0; index < heights.length - 1; index += 1) {
      const x = index * segmentWidth;
      const nextX = (index + 1) * segmentWidth;
      const y = heights[index] + 30;
      graphics.fillRect(x, y, Math.ceil(nextX - x) + 1, Math.max(0, height - y));
    }

    // Bright lip along the ridge
    graphics.lineStyle(4, palette.retro.lip, 1);
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

    // Highlight band just under the lip
    graphics.lineStyle(2, palette.retro.hi, 0.9);
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
        if (noise === 0) { shade = palette.retro.specks[0]; size = 3; }
        else if (noise < 3) { shade = palette.retro.specks[1]; size = 3; }
        else if (noise < 5) { shade = palette.retro.specks[2]; size = 2; }
        else continue;
        graphics.fillStyle(shade, 0.85);
        graphics.fillRect(x, y, size, 2);
      }
    }

    // Props are now drawn as image sprites by GameScene's retro layer pass.
  }

  private drawHiRes(graphics: Phaser.GameObjects.Graphics, terrainData: TerrainData, terrain: TerrainKind = 'desert'): void {
    const { heights, width, height, segmentWidth } = terrainData;
    const palette = TERRAIN_PALETTES[terrain];

    // Resample heights with Catmull-Rom at 2px steps for smooth curves
    const fineHeights = this.resampleHeightsCatmullRom(heights, segmentWidth);

    // Pass A: Full terrain with gradient from top to mid
    graphics.fillGradientStyle(palette.hires.top, palette.hires.top, palette.hires.mid, palette.hires.mid, 1);
    graphics.beginPath();
    graphics.moveTo(0, height);
    for (let i = 0; i < fineHeights.length; i += 1) {
      graphics.lineTo(i * 2, fineHeights[i]);
    }
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    // Pass B: Lower half only with gradient from mid to deep
    graphics.fillGradientStyle(palette.hires.mid, palette.hires.mid, palette.hires.deep, palette.hires.deep, 0.9);
    graphics.beginPath();
    graphics.moveTo(0, height);
    for (let i = 0; i < fineHeights.length; i += 1) {
      const sampleHeight = fineHeights[i];
      const lowerY = sampleHeight + (height - sampleHeight) * 0.45;
      graphics.lineTo(i * 2, lowerY);
    }
    graphics.lineTo(width, height);
    graphics.closePath();
    graphics.fillPath();

    // Rubble: soft dots using deterministic pseudo-noise (no Math.random)
    // ~40 dots scattered through the terrain
    graphics.fillStyle(palette.hires.rubble.color, palette.hires.rubble.alpha);
    for (let i = 0; i < 40; i += 1) {
      // Pseudo-random hash based on i to get deterministic placement
      const xHash = (i * 73) % Math.floor(width);
      const radiusHash = (i * 53) % 3 + 2; // radius 2-4

      const x = xHash;
      const groundY = this.getHeightAtX(terrainData, x);
      const offset = 6 + ((i * 131) % 75); // 6..80 below surface
      const y = groundY + offset;

      if (y < height) {
        graphics.fillCircle(x, y, radiusHash);
      }
    }

    // Ridge: layered strokes along fine-resampled surface polyline
    // Layer 1: 7px glow
    graphics.lineStyle(7, palette.hires.glow.color, palette.hires.glow.alpha);
    graphics.beginPath();
    for (let i = 0; i < fineHeights.length; i += 1) {
      const x = i * 2;
      if (i === 0) {
        graphics.moveTo(x, fineHeights[i]);
      } else {
        graphics.lineTo(x, fineHeights[i]);
      }
    }
    graphics.strokePath();

    // Layer 2: 4px glow
    graphics.lineStyle(4, palette.hires.glow.color, palette.hires.glow.alpha);
    graphics.beginPath();
    for (let i = 0; i < fineHeights.length; i += 1) {
      const x = i * 2;
      if (i === 0) {
        graphics.moveTo(x, fineHeights[i]);
      } else {
        graphics.lineTo(x, fineHeights[i]);
      }
    }
    graphics.strokePath();

    // Layer 3: 2px specular highlight
    graphics.lineStyle(2, palette.hires.spec.color, palette.hires.spec.alpha);
    graphics.beginPath();
    for (let i = 0; i < fineHeights.length; i += 1) {
      const x = i * 2;
      if (i === 0) {
        graphics.moveTo(x, fineHeights[i]);
      } else {
        graphics.lineTo(x, fineHeights[i]);
      }
    }
    graphics.strokePath();
  }

  private resampleHeightsCatmullRom(heights: number[], segmentWidth: number): number[] {
    // Resample at 2px steps using Catmull-Rom interpolation
    const worldWidth = heights.length * segmentWidth;
    const fineHeights: number[] = [];

    for (let x = 0; x < worldWidth; x += 2) {
      fineHeights.push(this.catmullSample(heights, x / segmentWidth));
    }

    return fineHeights;
  }

  private catmullSample(heights: number[], t: number): number {
    // Catmull-Rom interpolation: t is position in sample space (0..heights.length-1)
    const i = Math.floor(t);
    const u = t - i;

    // Get the 4 neighboring samples (with clamping at boundaries)
    const p0 = heights[Math.max(0, i - 1)];
    const p1 = heights[i];
    const p2 = heights[Math.min(heights.length - 1, i + 1)];
    const p3 = heights[Math.min(heights.length - 1, i + 2)];

    // Catmull-Rom basis functions
    const q = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u
    );

    return q;
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
