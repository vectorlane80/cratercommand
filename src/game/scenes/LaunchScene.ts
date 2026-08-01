import Phaser from 'phaser';
import { GAME_CONFIG, type VisualSystem } from '../types/GameTypes';
import { soundSystem } from '../systems/SoundSystem';

export class LaunchScene extends Phaser.Scene {
  private visualSystem: VisualSystem = 'classic';
  private backdrop!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Image;
  private graphics!: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private promptText!: Phaser.GameObjects.Text;

  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private vKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('LaunchScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    // Load visual system from storage
    this.loadVisualSystemFromStorage();

    // Backdrop Image (texture per mode)
    this.backdrop = this.add.image(GAME_CONFIG.width / 2, 0, 'retro-backdrop').setOrigin(0.5, 0);
    this.backdrop.setDisplaySize(GAME_CONFIG.width, 260);

    // Logo Image (hiRes only)
    this.logo = this.add.image(480, 190, 'hires-logo').setOrigin(0.5, 0.5).setScale(0.34);

    // Graphics layer
    this.graphics = this.add.graphics();

    // Setup keyboard input
    const keyCodes = [
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.V
    ];
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.vKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.input.keyboard!.addCapture(keyCodes);

    // Pointer input
    this.input.on('pointerdown', () => this.startMenu());

    // Blinking prompt timer
    this.time.addEvent({
      delay: 600,
      loop: true,
      callback: () => {
        if (this.promptText) {
          this.promptText.visible = !this.promptText.visible;
        }
      }
    });

    this.render();
  }

  update(): void {
    // V key cycles visual mode
    if (Phaser.Input.Keyboard.JustDown(this.vKey)) {
      if (this.visualSystem === 'classic') {
        this.visualSystem = 'retroPixel';
      } else if (this.visualSystem === 'retroPixel') {
        this.visualSystem = 'hiRes';
      } else {
        this.visualSystem = 'classic';
      }
      this.saveVisualSystemToStorage();
      this.render();
      soundSystem.playUiClick();
      return;
    }

    // Space or Enter to start
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.startMenu();
    }
  }

  private startMenu(): void {
    soundSystem.playUiSelect();
    this.scene.start('MenuScene');
  }

  private render(): void {
    this.clearTexts();
    this.graphics.clear();
    const c = GAME_CONFIG.colors;

    if (this.visualSystem === 'classic') {
      this.renderClassic();
    } else if (this.visualSystem === 'retroPixel') {
      this.renderRetroPixel();
    } else {
      this.renderHiRes();
    }

    // Mode hint (all modes)
    const modeLabel =
      this.visualSystem === 'classic' ? 'CLASSIC' :
      this.visualSystem === 'retroPixel' ? 'RETRO PIXEL' :
      'HI-RES';
    this.addText(
      GAME_CONFIG.width / 2,
      430,
      `V — VISUALS: ${modeLabel}`,
      c.dimGray,
      GAME_CONFIG.font.small,
      undefined,
      0,
      true
    );
  }

  private renderClassic(): void {
    const c = GAME_CONFIG.colors;

    // Starfield (deterministic seeded)
    this.drawClassicStarfield();

    // Title and subtitle (moved to dark sky region for legibility)
    this.addText(
      GAME_CONFIG.width / 2,
      110,
      'CRATER COMMAND',
      c.magenta,
      GAME_CONFIG.font.title,
      undefined,
      0,
      true
    );
    this.addText(
      GAME_CONFIG.width / 2,
      160,
      'A SCORCHED EARTH HOMAGE',
      c.cyan,
      GAME_CONFIG.font.medium,
      undefined,
      0,
      true
    );

    // Prompt
    this.promptText = this.addText(
      GAME_CONFIG.width / 2,
      380,
      'PRESS SPACE OR TAP TO START',
      c.white,
      GAME_CONFIG.font.small,
      undefined,
      0,
      true
    );

    // Hide backdrop and logo
    this.backdrop.visible = false;
    this.logo.visible = false;
  }

  private renderRetroPixel(): void {
    const c = GAME_CONFIG.colors;

    // Backdrop with scrim
    this.backdrop.setTexture('retro-backdrop').setDisplaySize(GAME_CONFIG.width, 260);
    this.backdrop.visible = true;
    this.graphics.fillStyle(c.black, 0.45);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // Title and subtitle (moved to dark sky region for legibility)
    this.addText(
      GAME_CONFIG.width / 2,
      110,
      'CRATER COMMAND',
      c.desertGold,
      GAME_CONFIG.font.title,
      undefined,
      0,
      true
    );
    this.addText(
      GAME_CONFIG.width / 2,
      160,
      'A SCORCHED EARTH HOMAGE',
      c.white,
      GAME_CONFIG.font.medium,
      undefined,
      0,
      true
    );

    // Prompt
    this.promptText = this.addText(
      GAME_CONFIG.width / 2,
      380,
      'PRESS SPACE OR TAP TO START',
      c.desertGold,
      GAME_CONFIG.font.small,
      undefined,
      0,
      true
    );

    // Hide logo
    this.logo.visible = false;
  }

  private renderHiRes(): void {
    // Backdrop with scrim
    this.backdrop.setTexture('hires-backdrop').setDisplaySize(GAME_CONFIG.width, 260);
    this.backdrop.visible = true;
    this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.45);
    this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    // Logo visible
    this.logo.visible = true;

    // Subtitle only
    this.addText(
      GAME_CONFIG.width / 2,
      280,
      'ARTILLERY DUEL · 1991',
      0xffbe78,
      GAME_CONFIG.font.small,
      'JetBrains Mono',
      3,
      true
    );

    // Prompt
    this.promptText = this.addText(
      GAME_CONFIG.width / 2,
      380,
      'TAP TO START',
      0xffd9a0,
      GAME_CONFIG.font.small,
      'JetBrains Mono',
      2,
      true
    );
  }

  private drawClassicStarfield(): void {
    const seed = 42; // Deterministic seed
    const starCount = 60;

    this.graphics.fillStyle(GAME_CONFIG.colors.white, 0.6);
    for (let i = 0; i < starCount; i += 1) {
      // Seeded pseudo-random using index
      const pseudoRandom = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
      const x = ((pseudoRandom - Math.floor(pseudoRandom)) * GAME_CONFIG.width) | 0;
      const y = ((pseudoRandom * 0.7 - Math.floor(pseudoRandom * 0.7)) * 320) | 0;
      const size = ((pseudoRandom * 1.3 - Math.floor(pseudoRandom * 1.3)) * 1.5) | 0;
      this.graphics.fillRect(x, y, size, size);
    }
  }

  private addText(
    x: number,
    y: number,
    value: string,
    color: number,
    fontSize: string,
    fontFamily?: string,
    letterSpacing?: number,
    centered: boolean = false
  ): Phaser.GameObjects.Text {
    const text = this.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    if (centered) {
      text.setOrigin(0.5, 0);
    }
    text.setResolution(2);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    this.texts.push(text);
    return text;
  }

  private clearTexts(): void {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }

  private loadVisualSystemFromStorage(): void {
    try {
      const stored = localStorage.getItem('cratercmd.visual');
      if (stored && typeof stored === 'string' && (stored === 'classic' || stored === 'retroPixel' || stored === 'hiRes')) {
        this.visualSystem = stored as VisualSystem;
      }
    } catch (e) {
      // If parsing fails, just use default (already initialized)
    }
  }

  private saveVisualSystemToStorage(): void {
    try {
      localStorage.setItem('cratercmd.visual', this.visualSystem);
    } catch (e) {
      // Silently fail if localStorage is not available
    }
  }
}
