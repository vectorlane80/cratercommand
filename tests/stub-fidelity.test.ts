import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import PhaserStub from './stubs/phaser';

const require = createRequire(import.meta.url);
const RealClamp = require('phaser/src/math/Clamp.js');
const RealLinear = require('phaser/src/math/Linear.js');
const RealDegToRad = require('phaser/src/math/DegToRad.js');
const RealBetween = require('phaser/src/math/distance/DistanceBetween.js');

describe('Stub fidelity', () => {
  const values = [-1000, -180, -37.5, -1, -0.25, 0, 0.25, 1, 37.5, 90, 180, 359, 1000];

  it('Clamp matches real Phaser', () => {
    for (const a of values) {
      for (const b of values) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (const v of values) {
          const stub = PhaserStub.Math.Clamp(v, lo, hi);
          const real = RealClamp(v, lo, hi);
          if (Number.isNaN(stub) && Number.isNaN(real)) {
            expect(Number.isNaN(stub)).toBe(true);
          } else {
            expect(stub).toBe(real);
          }
        }
      }
    }
  });

  it('Linear matches real Phaser', () => {
    for (const a of values) {
      for (const b of values) {
        for (const t of [0, 0.37, 0.5, 1, 1.5]) {
          const stub = PhaserStub.Math.Linear(a, b, t);
          const real = RealLinear(a, b, t);
          expect(stub).toBeCloseTo(real, 10);
        }
      }
    }
  });

  it('DegToRad matches real Phaser', () => {
    for (const v of values) {
      const stub = PhaserStub.Math.DegToRad(v);
      const real = RealDegToRad(v);
      expect(stub).toBeCloseTo(real, 10);
    }
  });

  it('Distance.Between matches real Phaser', () => {
    for (let i = 0; i < values.length; i += 1) {
      for (let j = 0; j < values.length; j += 1) {
        const x1 = values[i];
        const y1 = values[j];
        for (let k = 0; k < values.length; k += 1) {
          for (let l = 0; l < values.length; l += 1) {
            const x2 = values[k];
            const y2 = values[l];
            const stub = PhaserStub.Math.Distance.Between(x1, y1, x2, y2);
            const real = RealBetween(x1, y1, x2, y2);
            expect(stub).toBeCloseTo(real, 10);
          }
        }
      }
    }
  });
});
