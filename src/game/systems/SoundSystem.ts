/**
 * Procedural audio for Crater Command. Uses the Web Audio API directly
 * (no Phaser audio assets) so there are no files to bundle, no licensing,
 * and no autoplay headaches — the AudioContext is created lazily on first
 * play, which is always preceded by a user click (menu / FIRE / shop).
 *
 * The synthesis is intentionally simple, single-voice and lo-fi to fit the
 * 1990s artillery-game vibe.
 */
export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  enabled = true;

  /** Toggle sound on/off. Returns the new state. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.enabled ? 1 : 0, this.getCtx().currentTime);
    }
    return this.enabled;
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? 1 : 0;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private dest(): AudioNode {
    this.getCtx();
    return this.masterGain!;
  }

  // -------- GAME EVENT SOUNDS --------

  /** Cannon fire — short downward saw sweep with quick decay. */
  playFire(): void {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.28);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(gain).connect(this.dest());
    osc.start(t);
    osc.stop(t + 0.34);
  }

  /** Terrain impact — noise burst through a sweeping low-pass. */
  playExplosion(intensity: number = 1): void {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const dur = 0.45 + 0.15 * intensity;

    const noise = this.makeNoiseBuffer(dur, ctx);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200 * intensity, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45 * intensity, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.dest());
    src.start(t);
  }

  /** Tank hit — same texture as explosion but with a sub-bass thump on top. */
  playTankHit(): void {
    if (!this.enabled) return;
    this.playExplosion(1.2);
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(gain).connect(this.dest());
    osc.start(t);
    osc.stop(t + 0.34);
  }

  /** Quiet pop for a shot that went off-screen with no impact. */
  playMiss(): void {
    if (!this.enabled) return;
    this.playTone(200, 0.06, 'sine', 0.12);
  }

  /** Falling-tank thump after terrain destruction pulls the ground away. */
  playFall(): void {
    if (!this.enabled) return;
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(this.dest());
    osc.start(t);
    osc.stop(t + 0.24);
  }

  /** Shield absorption — short metallic ping. */
  playShieldHit(): void {
    if (!this.enabled) return;
    this.playTone(1400, 0.18, 'square', 0.15);
    setTimeout(() => this.playTone(800, 0.12, 'square', 0.08), 40);
  }

  // -------- UI SOUNDS --------

  playUiClick(): void {
    if (!this.enabled) return;
    this.playTone(840, 0.04, 'square', 0.06);
  }

  playUiSelect(): void {
    if (!this.enabled) return;
    this.playTone(620, 0.06, 'square', 0.08);
    setTimeout(() => this.playTone(940, 0.08, 'square', 0.1), 60);
  }

  playRoundWin(): void {
    if (!this.enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => setTimeout(() => this.playTone(freq, 0.16, 'triangle', 0.18), i * 110));
  }

  playMatchWin(): void {
    if (!this.enabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093]; // ascending fanfare
    notes.forEach((freq, i) => setTimeout(() => this.playTone(freq, 0.2, 'triangle', 0.22), i * 130));
  }

  // -------- HELPERS --------

  private playTone(freq: number, duration: number, type: OscillatorType, peakGain: number): void {
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.dest());
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private makeNoiseBuffer(durSec: number, ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

// One shared instance — every scene calls into it.
export const soundSystem = new SoundSystem();
