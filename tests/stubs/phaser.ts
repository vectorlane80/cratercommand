// Minimal Phaser stand-in for node tests. Only the pure-math surface the
// game systems touch. Never add rendering objects here.
const Clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
const Linear = (p0: number, p1: number, t: number): number => (p1 - p0) * t + p0;
const DegToRad = (deg: number): number => (deg * Math.PI) / 180;
const Between = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.hypot(x2 - x1, y2 - y1);

export default {
  Math: { Clamp, Linear, DegToRad, Distance: { Between } }
};
