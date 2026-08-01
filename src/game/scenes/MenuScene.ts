import Phaser from 'phaser';
import { soundSystem } from '../systems/SoundSystem';
import { getPlayerPalette } from '../systems/TankSystem';
import {
  CONTROLLER_CYCLE,
  CONTROLLER_LABELS,
  GAME_CONFIG,
  GRAVITY_LABELS,
  GRAVITY_STEPS,
  PHYSICS_DEFAULTS,
  VISCOSITY_LABELS,
  VISCOSITY_STEPS,
  WALL_LABELS,
  WALL_MODES,
  type ControllerKind,
  type PhysicsSettings,
  type VisualSystem,
  type WallMode
} from '../types/GameTypes';

type Slot = ControllerKind;

export interface MenuResult {
  controllers: ControllerKind[];
  roundsToWin: number;
  /** Parallel to controllers — null means "use default (PLAYER N)". */
  names: Array<string | null>;
  wallMode: WallMode;
  physics: PhysicsSettings;
}

const MAX_NAME_LEN = 12;

const MATCH_LENGTHS: Array<{ label: string; roundsToWin: number }> = [
  { label: 'BEST OF 3', roundsToWin: 2 },
  { label: 'BEST OF 5', roundsToWin: 3 },
  { label: 'BEST OF 7', roundsToWin: 4 }
];

const SLOT_CYCLE_REQUIRED: ControllerKind[] = CONTROLLER_CYCLE; // human + CPU personalities

export class MenuScene extends Phaser.Scene {
  private slots: Slot[] = ['human', 'cpu-tosser'];
  // Per-slot display names. null means "use default (PLAYER N)". Set via
  // tap on the label to the left of the controller box, which fires
  // window.prompt() for input.
  private names: Array<string | null> = [null, null];
  private matchLengthIndex = 0; // index into MATCH_LENGTHS, default first
  private wallModeIndex = 0; // index into WALL_MODES, default first
  private gravityIndex = GRAVITY_STEPS.indexOf(PHYSICS_DEFAULTS.gravity);
  private viscosityIndex = VISCOSITY_STEPS.indexOf(PHYSICS_DEFAULTS.viscosity);
  private tanksFall = PHYSICS_DEFAULTS.tanksFall;
  private visualSystem: VisualSystem = 'classic';
  private texts: Phaser.GameObjects.Text[] = [];
  private graphics!: Phaser.GameObjects.Graphics;
  private retroBackdrop!: Phaser.GameObjects.Image;
  private hiresLogo!: Phaser.GameObjects.Image;
  private miniTankBlue!: Phaser.GameObjects.Image;
  private miniTankRed!: Phaser.GameObjects.Image;
  private view: 'main' | 'settings' = 'main';

  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private bKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private gKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private fKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);

    // Retro backdrop — created first so it layers under graphics/text
    this.retroBackdrop = this.add.image(GAME_CONFIG.width / 2, 0, 'retro-backdrop').setOrigin(0.5, 0);
    this.retroBackdrop.setDisplaySize(GAME_CONFIG.width, 260);

    // HiRes logo wordmark — visible only in hiRes
    this.hiresLogo = this.add.image(GAME_CONFIG.width / 2, 6, 'hires-logo').setOrigin(0.5, 0).setScale(0.22);

    this.graphics = this.add.graphics();

    // Mini-tank images for hiRes player rows — created AFTER graphics so they render above
    this.miniTankBlue = this.add.image(0, 0, 'hires-mini-tank-blue').setOrigin(0.5, 0.5).setScale(0.2).setVisible(false);
    this.miniTankRed = this.add.image(0, 0, 'hires-mini-tank-red').setOrigin(0.5, 0.5).setScale(0.2).setVisible(false);

    const keyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO
    ];
    this.slotKeys = keyCodes.map((c) => this.input.keyboard!.addKey(c));
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.bKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.gKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.input.keyboard!.addCapture([
      ...keyCodes,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.ESC,
      Phaser.Input.Keyboard.KeyCodes.B,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.G,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.F
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y));

    this.loadPhysicsFromStorage();
    this.loadVisualSystemFromStorage();
    this.render();
  }

  update(): void {
    // ESC key returns from settings to main
    if (Phaser.Input.Keyboard.JustDown(this.escapeKey) && this.view === 'settings') {
      this.view = 'main';
      soundSystem.playUiClick();
      this.render();
      return;
    }

    for (let i = 0; i < this.slotKeys.length; i += 1) {
      if (Phaser.Input.Keyboard.JustDown(this.slotKeys[i])) {
        this.cycleSlot(i);
        soundSystem.playUiClick();
        this.render();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.bKey)) {
      this.cycleMatchLength();
      soundSystem.playUiClick();
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.wKey)) {
      this.cycleWallMode();
      soundSystem.playUiClick();
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.gKey)) {
      this.cycleGravity();
      soundSystem.playUiClick();
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.aKey)) {
      this.cycleViscosity();
      soundSystem.playUiClick();
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
      this.cycleTanksFall();
      soundSystem.playUiClick();
      this.render();
    }
    if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) && this.view === 'main' && this.canStart()) {
      soundSystem.playUiSelect();
      this.startMatch();
    }
  }

  private cycleMatchLength(): void {
    this.matchLengthIndex = (this.matchLengthIndex + 1) % MATCH_LENGTHS.length;
  }

  private cycleWallMode(): void {
    this.wallModeIndex = (this.wallModeIndex + 1) % WALL_MODES.length;
  }

  private cycleGravity(): void {
    this.gravityIndex = (this.gravityIndex + 1) % GRAVITY_STEPS.length;
  }

  private cycleViscosity(): void {
    this.viscosityIndex = (this.viscosityIndex + 1) % VISCOSITY_STEPS.length;
  }

  private cycleTanksFall(): void {
    this.tanksFall = !this.tanksFall;
  }

  /**
   * Open a browser prompt asking for a display name for slot `idx`.
   * Empty / cancelled → revert to default. Names are trimmed and capped
   * at MAX_NAME_LEN characters to keep them fitting in the HUD.
   */
  private promptForName(idx: number): void {
    const current = this.names[idx] ?? '';
    const input = window.prompt(`Name for Player ${idx + 1} (leave blank for default):`, current);
    if (input === null) return; // cancelled
    const trimmed = input.trim().slice(0, MAX_NAME_LEN);
    this.names[idx] = trimmed.length > 0 ? trimmed : null;
    soundSystem.playUiClick();
    this.render();
  }

  private handlePointerDown(x: number, y: number): void {
    if (this.view === 'main') {
      this.handlePointerDownMain(x, y);
    } else {
      this.handlePointerDownSettings(x, y);
    }
  }

  private handlePointerDownMain(x: number, y: number): void {
    // Player NAME label area sits to the LEFT of each controller box. Tapping
    // there opens a prompt to set a display name. We check this BEFORE the
    // controller-cycle box test below so the regions don't conflict.
    const rows = this.slotRowRects();
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const labelHit = x >= 100 && x < r.x && y >= r.y && y <= r.y + r.h;
      if (labelHit) {
        this.promptForName(i);
        return;
      }
    }
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.cycleSlot(i);
        soundSystem.playUiClick();
        this.render();
        return;
      }
    }
    // Start button hitbox — see render() for matching geometry.
    const btnX = GAME_CONFIG.width / 2 - 170;
    const btnY = 300;
    if (x >= btnX && x <= btnX + 340 && y >= btnY && y <= btnY + 46 && this.canStart()) {
      soundSystem.playUiSelect();
      this.startMatch();
      return;
    }
    // Settings button
    const settingsBtn = this.settingsButtonRect();
    if (x >= settingsBtn.x && x <= settingsBtn.x + settingsBtn.w && y >= settingsBtn.y && y <= settingsBtn.y + settingsBtn.h) {
      this.view = 'settings';
      soundSystem.playUiSelect();
      this.render();
      return;
    }
    // Visuals button
    const visualsBtn = this.visualsButtonRect();
    if (x >= visualsBtn.x && x <= visualsBtn.x + visualsBtn.w && y >= visualsBtn.y && y <= visualsBtn.y + visualsBtn.h) {
      if (this.visualSystem === 'classic') {
        this.visualSystem = 'retroPixel';
      } else if (this.visualSystem === 'retroPixel') {
        this.visualSystem = 'hiRes';
      } else {
        this.visualSystem = 'classic';
      }
      this.saveVisualSystemToStorage();
      soundSystem.playUiSelect();
      this.render();
      return;
    }
    // Online buttons sit at the bottom.
    const hostBtn = this.hostButtonRect();
    if (x >= hostBtn.x && x <= hostBtn.x + hostBtn.w && y >= hostBtn.y && y <= hostBtn.y + hostBtn.h) {
      soundSystem.playUiSelect();
      const physics: PhysicsSettings = {
        gravity: GRAVITY_STEPS[this.gravityIndex],
        viscosity: VISCOSITY_STEPS[this.viscosityIndex],
        tanksFall: this.tanksFall
      };
      this.scene.start('LobbyScene', {
        mode: 'host',
        localName: this.names[0] ?? 'PLAYER 1',
        roundsToWin: MATCH_LENGTHS[this.matchLengthIndex].roundsToWin,
        wallMode: WALL_MODES[this.wallModeIndex],
        physics
      });
      return;
    }
    const joinBtn = this.joinButtonRect();
    if (x >= joinBtn.x && x <= joinBtn.x + joinBtn.w && y >= joinBtn.y && y <= joinBtn.y + joinBtn.h) {
      soundSystem.playUiSelect();
      this.scene.start('LobbyScene', {
        mode: 'join',
        localName: this.names[0] ?? 'PLAYER 1'
      });
      return;
    }
  }

  private handlePointerDownSettings(x: number, y: number): void {
    // Match length button
    const mlBtn = this.settingsMatchLengthRect();
    if (x >= mlBtn.x && x <= mlBtn.x + mlBtn.w && y >= mlBtn.y && y <= mlBtn.y + mlBtn.h) {
      this.cycleMatchLength();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Wall mode button
    const wmBtn = this.settingsWallModeRect();
    if (x >= wmBtn.x && x <= wmBtn.x + wmBtn.w && y >= wmBtn.y && y <= wmBtn.y + wmBtn.h) {
      this.cycleWallMode();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Gravity button
    const gravBtn = this.settingsGravityRect();
    if (x >= gravBtn.x && x <= gravBtn.x + gravBtn.w && y >= gravBtn.y && y <= gravBtn.y + gravBtn.h) {
      this.cycleGravity();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Viscosity button
    const viscBtn = this.settingsViscosityRect();
    if (x >= viscBtn.x && x <= viscBtn.x + viscBtn.w && y >= viscBtn.y && y <= viscBtn.y + viscBtn.h) {
      this.cycleViscosity();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Tanks fall button
    const fallsBtn = this.settingsTanksFallRect();
    if (x >= fallsBtn.x && x <= fallsBtn.x + fallsBtn.w && y >= fallsBtn.y && y <= fallsBtn.y + fallsBtn.h) {
      this.cycleTanksFall();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Back button
    const backBtn = this.backButtonRect();
    if (x >= backBtn.x && x <= backBtn.x + backBtn.w && y >= backBtn.y && y <= backBtn.y + backBtn.h) {
      this.view = 'main';
      soundSystem.playUiSelect();
      this.render();
      return;
    }
  }

  private hostButtonRect() {
    return { x: GAME_CONFIG.width / 2 - 260, y: 452, w: 240, h: 32 };
  }

  private joinButtonRect() {
    return { x: GAME_CONFIG.width / 2 + 20, y: 452, w: 240, h: 32 };
  }

  private settingsButtonRect() {
    return { x: GAME_CONFIG.width / 2 - 170, y: 366, w: 340, h: 36 };
  }

  private visualsButtonRect() {
    return { x: GAME_CONFIG.width / 2 - 170, y: 410, w: 340, h: 28 };
  }

  // Settings view button rects
  private settingsMatchLengthRect() {
    return { x: 480, y: 130, w: 260, h: 36 };
  }

  private settingsWallModeRect() {
    return { x: 480, y: 180, w: 260, h: 36 };
  }

  private settingsGravityRect() {
    return { x: 480, y: 230, w: 260, h: 36 };
  }

  private settingsViscosityRect() {
    return { x: 480, y: 280, w: 260, h: 36 };
  }

  private settingsTanksFallRect() {
    return { x: 480, y: 330, w: 260, h: 36 };
  }

  private backButtonRect() {
    return { x: GAME_CONFIG.width / 2 - 120, y: 400, w: 240, h: 36 };
  }

  private menuPalette() {
    const c = GAME_CONFIG.colors;
    if (this.visualSystem === 'retroPixel') {
      return {
        title: c.desertGold,
        subtitle: c.white,
        hint: c.steelLight,
        startButton: c.desertGold,
        settingsButton: c.steelLight,
        backButton: c.steelLight,
        visualsButton: c.steelLight,
        hostButton: c.retroBlue,
        joinButton: c.retroOrange,
        settingsLabel: c.steelLight,
        settingsValue: c.desertGold
      };
    }
    if (this.visualSystem === 'hiRes') {
      return {
        title: 0xffbe78,
        subtitle: 0xffbe78,
        hint: 0x8a8078,
        startButton: 0xffb347,
        settingsButton: 0xd8cfc4,
        backButton: 0xd8cfc4,
        visualsButton: 0xd8cfc4,
        hostButton: 0x3f9dff,
        joinButton: 0xff7a3c,
        settingsLabel: 0xd8cfc4,
        settingsValue: 0xffb347
      };
    }
    // Classic mode palette
    return {
      title: c.magenta,
      subtitle: c.cyan,
      hint: c.white,
      startButton: c.yellow,
      settingsButton: c.white,
      backButton: c.white,
      visualsButton: c.white,
      hostButton: c.cyan,
      joinButton: c.magenta,
      settingsLabel: c.white,
      settingsValue: c.cyan
    };
  }

  /**
   * All slots cycle through human and the CPU personalities
   * (moron, shooter, tosser, spoiler, cyborg).
   */
  private cycleSlot(idx: number): void {
    const current = this.slots[idx];
    const ci = SLOT_CYCLE_REQUIRED.indexOf(current as ControllerKind);
    const next = SLOT_CYCLE_REQUIRED[(ci + 1) % SLOT_CYCLE_REQUIRED.length];
    this.slots[idx] = next;
  }

  private participants(): ControllerKind[] {
    return this.slots;
  }

  /** Names parallel to participants() — same length, same order. */
  private participantNames(): Array<string | null> {
    return this.slots.map((_, i) => this.names[i] ?? null);
  }

  private canStart(): boolean {
    const active = this.participants();
    if (active.length < 2) return false;
    if (!active.includes('human')) return false;
    return true;
  }

  private startMatch(): void {
    const physics: PhysicsSettings = {
      gravity: GRAVITY_STEPS[this.gravityIndex],
      viscosity: VISCOSITY_STEPS[this.viscosityIndex],
      tanksFall: this.tanksFall
    };
    const result: MenuResult = {
      controllers: this.participants(),
      names: this.participantNames(),
      roundsToWin: MATCH_LENGTHS[this.matchLengthIndex].roundsToWin,
      wallMode: WALL_MODES[this.wallModeIndex],
      physics
    };
    this.savePhysicsToStorage(physics);
    this.scene.start('GameScene', result);
  }

  private slotRowRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const ys = [140, 200];
    return ys.map((y) => ({ x: 240, y: y - 6, w: 480, h: 46 }));
  }

  private render(): void {
    // Apply backdrop image based on visual mode
    const showBackdrop = this.visualSystem !== 'classic';
    this.retroBackdrop.visible = showBackdrop;
    if (showBackdrop) {
      if (this.visualSystem === 'retroPixel') {
        this.retroBackdrop.setTexture('retro-backdrop');
      } else if (this.visualSystem === 'hiRes') {
        this.retroBackdrop.setTexture('hires-backdrop');
      }
      this.retroBackdrop.setDisplaySize(GAME_CONFIG.width, 260);
    }
    // Show logo in hiRes on both main and settings views
    this.hiresLogo.visible = this.visualSystem === 'hiRes';
    if (this.hiresLogo.visible) {
      this.hiresLogo.setOrigin(0, 0).setPosition(88, 10).setScale(0.2);
    }

    // Mini-tank sprites: visible only in hiRes main view
    const showMiniTanks = this.visualSystem === 'hiRes' && this.view === 'main';
    this.miniTankBlue.setVisible(showMiniTanks);
    this.miniTankRed.setVisible(showMiniTanks);

    this.graphics.clear();
    if (this.visualSystem !== 'classic') {
      this.graphics.fillStyle(GAME_CONFIG.colors.black, 0.45);
      this.graphics.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    }
    if (this.view === 'main') {
      this.renderMain();
    } else {
      this.renderSettings();
    }
  }

  private renderMain(): void {
    this.clearTexts();

    if (this.visualSystem === 'retroPixel') {
      this.renderMainRetro();
    } else if (this.visualSystem === 'hiRes') {
      this.renderMainHiRes();
    } else {
      this.renderMainClassic();
    }
  }

  private renderMainClassic(): void {
    const colors = GAME_CONFIG.colors;
    const palette = this.menuPalette();

    // Title
    this.addCenteredText(20, 'CRATER COMMAND', palette.title, GAME_CONFIG.font.title);
    this.addCenteredText(60, 'MATCH SETUP', palette.subtitle, GAME_CONFIG.font.large);

    // Player rows (2-player only)
    const labels = ['PLAYER 1', 'PLAYER 2'];
    const rowYs = [140, 200];
    const palettes = [getPlayerPalette(0, 'classic').primary, getPlayerPalette(1, 'classic').primary];
    for (let i = 0; i < 2; i += 1) {
      this.drawSlotRowClassic(i, rowYs[i], labels[i], this.slots[i], palettes[i]);
    }

    // Hint
    this.addText(
      GAME_CONFIG.width / 2 - 170,
      262,
      'Tap name to rename · Tap box to cycle',
      palette.hint,
      GAME_CONFIG.font.small
    );

    // Start button (gated on canStart())
    const enabled = this.canStart();
    const btnX = GAME_CONFIG.width / 2 - 170;
    const btnY = 300;
    const btnW = 340;
    const btnH = 46;
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(btnX, btnY, btnW, btnH);
    this.graphics.lineStyle(3, enabled ? palette.startButton : colors.dimGray, 1);
    this.graphics.strokeRect(btnX, btnY, btnW, btnH);
    this.addText(btnX + 65, btnY + 10, 'START MATCH', enabled ? palette.startButton : colors.dimGray, GAME_CONFIG.font.title);

    if (!enabled) {
      this.addText(
        GAME_CONFIG.width / 2 - 150,
        352,
        'Need at least 1 human player.',
        colors.red,
        GAME_CONFIG.font.small
      );
    }

    // Settings button
    const settingsBtn = this.settingsButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(settingsBtn.x, settingsBtn.y, settingsBtn.w, settingsBtn.h);
    this.graphics.lineStyle(2, palette.settingsButton, 1);
    this.graphics.strokeRect(settingsBtn.x, settingsBtn.y, settingsBtn.w, settingsBtn.h);
    this.addText(settingsBtn.x + 130, settingsBtn.y + 8, 'SETTINGS', palette.settingsButton, GAME_CONFIG.font.large);

    // Visuals button
    const visualsBtn = this.visualsButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(visualsBtn.x, visualsBtn.y, visualsBtn.w, visualsBtn.h);
    this.graphics.lineStyle(2, palette.visualsButton, 1);
    this.graphics.strokeRect(visualsBtn.x, visualsBtn.y, visualsBtn.w, visualsBtn.h);
    const visualsLabel =
      this.visualSystem === 'classic' ? 'VISUALS: CLASSIC' :
      this.visualSystem === 'retroPixel' ? 'VISUALS: RETRO PIXEL' :
      'VISUALS: HI-RES';
    this.addText(visualsBtn.x + 90, visualsBtn.y + 6, visualsLabel, palette.visualsButton, GAME_CONFIG.font.medium);

    // Online buttons
    const host = this.hostButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(host.x, host.y, host.w, host.h);
    this.graphics.lineStyle(2, palette.hostButton, 1);
    this.graphics.strokeRect(host.x, host.y, host.w, host.h);
    this.addText(host.x + 50, host.y + 6, 'HOST ONLINE', palette.hostButton, GAME_CONFIG.font.medium);

    const join = this.joinButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(join.x, join.y, join.w, join.h);
    this.graphics.lineStyle(2, palette.joinButton, 1);
    this.graphics.strokeRect(join.x, join.y, join.w, join.h);
    this.addText(join.x + 50, join.y + 6, 'JOIN ONLINE', palette.joinButton, GAME_CONFIG.font.medium);
  }

  private renderMainRetro(): void {
    const colors = GAME_CONFIG.colors;

    // Title
    this.addText(306, 20, 'CRATER COMMAND', 0xc68417, '28px', 'Courier New');
    this.addText(400, 60, 'MATCH SETUP', colors.white, '24px', 'Courier New');

    // Player rows
    const p1Color = 0x238cff;
    const p2Color = 0xff4b16;
    this.drawSlotRowRetro(134, 'PLAYER 1', this.slots[0], p1Color);
    this.drawSlotRowRetro(194, 'PLAYER 2', this.slots[1], p2Color);

    // Hint
    this.addText(310, 262, 'Tap name to rename · Tap box to cycle', 0xa8a8a8, '12px', 'Courier New');

    // Start button
    const startX = 310;
    const startY = 300;
    const startW = 334;
    const startH = 40;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(startX, startY, startW, startH);
    this.graphics.lineStyle(3, 0xc68417, 1);
    this.graphics.strokeRect(startX, startY, startW, startH);
    this.addText(375, 310, 'START MATCH', 0xc68417, '28px', 'Courier New');

    // Settings button
    const settingsX = 310;
    const settingsY = 366;
    const settingsW = 336;
    const settingsH = 32;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(settingsX, settingsY, settingsW, settingsH);
    this.graphics.lineStyle(2, 0xa8a8a8, 1);
    this.graphics.strokeRect(settingsX, settingsY, settingsW, settingsH);
    this.addText(440, 374, 'SETTINGS', 0xa8a8a8, '24px', 'Courier New');

    // Visuals button
    const visualsX = 310;
    const visualsY = 410;
    const visualsW = 336;
    const visualsH = 24;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(visualsX, visualsY, visualsW, visualsH);
    this.graphics.lineStyle(2, 0xa8a8a8, 1);
    this.graphics.strokeRect(visualsX, visualsY, visualsW, visualsH);
    this.addText(400, 416, 'VISUALS: RETRO PIXEL', 0xa8a8a8, '18px', 'Courier New');

    // Online buttons
    const hostX = 220;
    const hostY = 452;
    const hostW = 236;
    const hostH = 28;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(hostX, hostY, hostW, hostH);
    this.graphics.lineStyle(2, p1Color, 1);
    this.graphics.strokeRect(hostX, hostY, hostW, hostH);
    this.addText(270, 458, 'HOST ONLINE', p1Color, '18px', 'Courier New');

    const joinX = 500;
    const joinY = 452;
    const joinW = 236;
    const joinH = 28;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(joinX, joinY, joinW, joinH);
    this.graphics.lineStyle(2, p2Color, 1);
    this.graphics.strokeRect(joinX, joinY, joinW, joinH);
    this.addText(550, 458, 'JOIN ONLINE', p2Color, '18px', 'Courier New');
  }

  private renderMainHiRes(): void {
    const colors = GAME_CONFIG.colors;

    // Logo image is positioned in render() method — nothing drawn here

    // MATCH SETUP label below logo
    this.addText(90, 112, 'MATCH SETUP', 0xd8cfc4, '10px', 'JetBrains Mono', 3);

    // Player rows — full-width cards with mini-tank sprites
    this.drawSlotRowHiRes(0, 134, 'PLAYER 1', this.slots[0], getPlayerPalette(0, 'hiRes').primary);
    this.drawSlotRowHiRes(1, 194, 'PLAYER 2', this.slots[1], getPlayerPalette(1, 'hiRes').primary);

    // Hint line
    this.addText(88, 262, '1 / 2 CYCLES CONTROLLER · ENTER STARTS', 0x8a8078, '9px', 'JetBrains Mono', 1.8);

    // Start button — large gold gradient
    const startX = GAME_CONFIG.width / 2 - 170;
    const startY = 300;
    const startW = 340;
    const startH = 46;
    const canStart = this.canStart();
    const buttonColor = canStart ? 0xffb347 : 0x666666;
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(startX, startY, startW, startH);
    this.graphics.lineStyle(2, buttonColor, 1);
    this.graphics.strokeRect(startX, startY, startW, startH);
    this.addText(startX + 65, startY + 10, 'START MATCH', buttonColor, '21px', 'Barlow Condensed');

    if (!canStart) {
      this.addText(
        GAME_CONFIG.width / 2 - 150,
        352,
        'Need at least 1 human player.',
        colors.red,
        '9px'
      );
    }

    // Settings button
    const settingsBtn = this.settingsButtonRect();
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(settingsBtn.x, settingsBtn.y, settingsBtn.w, settingsBtn.h);
    this.graphics.lineStyle(1, 0xd8cfc4, 0.5);
    this.graphics.strokeRect(settingsBtn.x, settingsBtn.y, settingsBtn.w, settingsBtn.h);
    this.addText(settingsBtn.x + 130, settingsBtn.y + 8, 'SETTINGS', 0xd8cfc4, '16px');

    // Visuals row — draw inside hit rect
    const visualsRect = this.visualsButtonRect();
    this.graphics.fillStyle(0x120d09, 1);
    this.graphics.fillRect(visualsRect.x, visualsRect.y, visualsRect.w, visualsRect.h);
    this.graphics.lineStyle(1, 0x3a2d22, 1);
    this.graphics.strokeRect(visualsRect.x, visualsRect.y, visualsRect.w, visualsRect.h);

    this.addText(GAME_CONFIG.width / 2 - 156, 417, 'VISUALS', 0xd8cfc4, '9px', 'JetBrains Mono', 1.8);
    const visualsLabel = this.visualSystem === 'hiRes' ? 'HI-RES' : 'RETRO PIXEL';
    const visualsValueObj = this.add.text(0, 0, visualsLabel, {
      color: Phaser.Display.Color.IntegerToColor(0xffb347).rgba,
      fontFamily: 'JetBrains Mono',
      fontSize: '9px'
    });
    visualsValueObj.setResolution(2);
    const vw = visualsValueObj.width;
    visualsValueObj.destroy();
    this.addText(GAME_CONFIG.width / 2 + 156 - vw, 417, visualsLabel, 0xffb347, '9px', 'JetBrains Mono', 1.8);

    // Online buttons
    const host = this.hostButtonRect();
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(host.x, host.y, host.w, host.h);
    this.graphics.lineStyle(1, 0x3f9dff, 0.5);
    this.graphics.strokeRect(host.x, host.y, host.w, host.h);
    this.addText(host.x + 50, host.y + 6, 'HOST ONLINE', 0x3f9dff, '12px');

    const join = this.joinButtonRect();
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(join.x, join.y, join.w, join.h);
    this.graphics.lineStyle(1, 0xff7a3c, 0.5);
    this.graphics.strokeRect(join.x, join.y, join.w, join.h);
    this.addText(join.x + 50, join.y + 6, 'JOIN ONLINE', 0xff7a3c, '12px');
  }

  private drawSlotRowClassic(idx: number, y: number, label: string, slot: Slot, accent: number): void {
    const colors = GAME_CONFIG.colors;
    const boxX = 280;
    const boxY = y - 6;
    const boxW = 400;
    const boxH = 40;

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(boxX, boxY, boxW, boxH);
    this.graphics.lineStyle(2, accent, 1);
    this.graphics.strokeRect(boxX, boxY, boxW, boxH);

    const customName = this.names[idx];
    const displayName = customName ?? label;
    this.addText(120, y, displayName, accent, GAME_CONFIG.font.large);

    this.addText(boxX + 16, y + 4, CONTROLLER_LABELS[slot], colors.white, GAME_CONFIG.font.medium);
  }

  private drawSlotRowRetro(y: number, label: string, slot: Slot, accent: number): void {
    const boxX = 280;
    const boxY = y;
    const boxW = 396;
    const boxH = 36;

    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(boxX, boxY, boxW, boxH);
    this.graphics.lineStyle(2, accent, 1);
    this.graphics.strokeRect(boxX, boxY, boxW, boxH);

    // Label on the left (outside the box in the design)
    this.addText(120, y + 6, label, accent, '24px', 'Courier New');

    // Value on the right inside the box
    this.addText(296, y + 8, CONTROLLER_LABELS[slot], 0xffffff, '18px', 'Courier New');
  }

  private drawSlotRowHiRes(idx: number, y: number, label: string, slot: Slot, accent: number): void {
    const boxX = 88;
    const boxY = y;
    const boxW = 784;
    const boxH = 40;

    // Card background with gradient
    this.graphics.fillStyle(0x1a1408, 1);
    this.graphics.fillRect(boxX, boxY, boxW, boxH);
    this.graphics.lineStyle(1, 0x3f9dff, 0.34);
    this.graphics.strokeRect(boxX, boxY, boxW, boxH);

    // Mini-tank sprite
    const tank = idx === 0 ? this.miniTankBlue : this.miniTankRed;
    tank.setPosition(100, boxY + 6);
    tank.setVisible(true);

    // Player label
    this.addText(boxX + 70, boxY + 12, label, accent, '16px', 'Barlow Condensed', 0.96);

    // Helper text: row 1 = rename, row 2 = cycle
    const helperText = idx === 0 ? 'TAP NAME TO RENAME' : 'TAP BOX TO CYCLE';
    this.addText(boxX + 70, boxY + 28, helperText, 0x8a8078, '9px', 'JetBrains Mono', 1.8);

    // Right-aligned value chip: size from text width, right edge at x=856
    const valueText = CONTROLLER_LABELS[slot];
    const valueTextObj = this.add.text(0, 0, valueText, {
      color: Phaser.Display.Color.IntegerToColor(accent).rgba,
      fontFamily: 'JetBrains Mono',
      fontSize: '10px'
    });
    valueTextObj.setResolution(2);
    const textW = valueTextObj.width;
    valueTextObj.destroy();
    const chipW = textW + 20;
    const chipX = 856 - chipW;
    this.graphics.fillStyle(0x1a1408, 1);
    this.graphics.fillRect(chipX, boxY + 6, chipW, 28);
    this.graphics.lineStyle(1, accent, 0.5);
    this.graphics.strokeRect(chipX, boxY + 6, chipW, 28);
    this.addText(chipX + chipW / 2, boxY + 22, valueText, accent, '10px', 'JetBrains Mono', 1.6);
  }

  private renderSettings(): void {
    this.clearTexts();

    if (this.visualSystem === 'retroPixel') {
      this.renderSettingsRetro();
    } else if (this.visualSystem === 'hiRes') {
      this.renderSettingsHiRes();
    } else {
      this.renderSettingsClassic();
    }
  }

  private renderSettingsClassic(): void {
    const colors = GAME_CONFIG.colors;
    const palette = this.menuPalette();

    this.addCenteredText(20, 'CRATER COMMAND', palette.title, GAME_CONFIG.font.title);
    this.addCenteredText(60, 'SETTINGS', palette.subtitle, GAME_CONFIG.font.large);

    const settingRows = [
      { label: 'MATCH LENGTH (B)', y: 130, value: MATCH_LENGTHS[this.matchLengthIndex].label, color: palette.settingsValue },
      { label: 'WALLS (W)', y: 180, value: WALL_LABELS[WALL_MODES[this.wallModeIndex]], color: palette.settingsValue },
      { label: 'GRAVITY (G)', y: 230, value: GRAVITY_LABELS[GRAVITY_STEPS[this.gravityIndex]], color: palette.settingsValue },
      { label: 'AIR VISCOSITY (A)', y: 280, value: VISCOSITY_LABELS[VISCOSITY_STEPS[this.viscosityIndex]], color: palette.settingsValue },
      { label: 'TANKS FALL (F)', y: 330, value: this.tanksFall ? 'ON' : 'OFF', color: palette.settingsValue }
    ];

    for (const row of settingRows) {
      this.addText(220, row.y + 8, row.label, palette.settingsLabel, GAME_CONFIG.font.medium);
      const btn = this.settingsButtonForRow(row.y);
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.graphics.lineStyle(2, row.color, 1);
      this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
      this.addText(btn.x + 16, btn.y + 8, row.value, row.color, GAME_CONFIG.font.medium);
    }

    const backBtn = this.backButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.graphics.lineStyle(2, palette.backButton, 1);
    this.graphics.strokeRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.addText(backBtn.x + 60, backBtn.y + 8, 'BACK (ESC)', palette.backButton, GAME_CONFIG.font.large);

    this.addText(
      GAME_CONFIG.width / 2 - 290,
      452,
      'Settings apply to local and hosted online matches',
      palette.hint,
      GAME_CONFIG.font.small
    );
  }

  private renderSettingsRetro(): void {
    this.addText(306, 20, 'CRATER COMMAND', 0xc68417, '28px', 'Courier New');
    this.addText(400, 60, 'SETTINGS', 0xffffff, '24px', 'Courier New');

    const settingRows = [
      { label: 'MATCH LENGTH (B)', y: 130, value: MATCH_LENGTHS[this.matchLengthIndex].label },
      { label: 'WALLS (W)', y: 180, value: WALL_LABELS[WALL_MODES[this.wallModeIndex]] },
      { label: 'GRAVITY (G)', y: 230, value: GRAVITY_LABELS[GRAVITY_STEPS[this.gravityIndex]] },
      { label: 'AIR VISCOSITY (A)', y: 280, value: VISCOSITY_LABELS[VISCOSITY_STEPS[this.viscosityIndex]] },
      { label: 'TANKS FALL (F)', y: 330, value: this.tanksFall ? 'ON' : 'OFF' }
    ];

    for (const row of settingRows) {
      this.addText(220, row.y + 8, row.label, 0xd8cfc4, '12px', 'Courier New');
      const btn = this.settingsButtonForRow(row.y);
      this.graphics.fillStyle(0x050505, 1);
      this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.graphics.lineStyle(2, 0xc68417, 1);
      this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
      this.addText(btn.x + 16, btn.y + 8, row.value, 0xc68417, '12px', 'Courier New');
    }

    const backBtn = this.backButtonRect();
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.graphics.lineStyle(2, 0xa8a8a8, 1);
    this.graphics.strokeRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.addText(backBtn.x + 60, backBtn.y + 8, 'BACK (ESC)', 0xa8a8a8, '24px', 'Courier New');

    this.addText(
      GAME_CONFIG.width / 2 - 290,
      452,
      'Settings apply to local and hosted matches',
      0x8a8a8a,
      '10px',
      'Courier New'
    );
  }

  private renderSettingsHiRes(): void {
    // Logo image is positioned in render() method — nothing drawn here

    // SETTINGS label below logo
    this.addText(90, 112, 'SETTINGS', 0xd8cfc4, '10px', 'JetBrains Mono', 3);

    const settingRows = [
      { label: 'MATCH LENGTH', y: 130, value: MATCH_LENGTHS[this.matchLengthIndex].label, hint: '(B)' },
      { label: 'WALLS', y: 180, value: WALL_LABELS[WALL_MODES[this.wallModeIndex]], hint: '(W)' },
      { label: 'GRAVITY', y: 230, value: GRAVITY_LABELS[GRAVITY_STEPS[this.gravityIndex]], hint: '(G)' },
      { label: 'AIR VISCOSITY', y: 280, value: VISCOSITY_LABELS[VISCOSITY_STEPS[this.viscosityIndex]], hint: '(A)' },
      { label: 'TANKS FALL', y: 330, value: this.tanksFall ? 'ON' : 'OFF', hint: '(F)' }
    ];

    for (const row of settingRows) {
      this.addText(88, row.y + 8, row.label, 0xd8cfc4, '10px', 'Barlow Condensed', 0.96);
      this.addText(260, row.y + 8, row.hint, 0x8a8078, '9px', 'JetBrains Mono', 1.8);
      const btn = this.settingsButtonForRow(row.y);
      this.graphics.fillStyle(0x050505, 1);
      this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.graphics.lineStyle(1, 0xffb347, 0.5);
      this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
      this.addText(btn.x + 16, btn.y + 8, row.value, 0xffb347, '9px', 'JetBrains Mono');
    }

    const backBtn = this.backButtonRect();
    this.graphics.fillStyle(0x050505, 1);
    this.graphics.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.graphics.lineStyle(1, 0xd8cfc4, 0.5);
    this.graphics.strokeRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    this.addText(backBtn.x + 60, backBtn.y + 8, 'BACK', 0xd8cfc4, '12px');
    this.addText(backBtn.x + 180, backBtn.y + 8, '(ESC)', 0x8a8078, '9px', 'JetBrains Mono', 1.8);

    this.addText(
      88,
      452,
      'Settings apply to local and hosted matches',
      0x8a8078,
      '9px',
      'JetBrains Mono',
      1.8
    );
  }

  private settingsButtonForRow(y: number): { x: number; y: number; w: number; h: number } {
    return { x: 480, y, w: 260, h: 36 };
  }


  private addText(
    x: number,
    y: number,
    value: string,
    color: number,
    fontSize: string,
    fontFamily?: string,
    letterSpacing?: number,
    opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }
  ): void {
    let fontStyle: string = 'bold';
    if (opts?.weight === '400') {
      fontStyle = '';
    } else if (opts?.weight === '600') {
      fontStyle = '600';
    }

    const text = this.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle
    });
    text.setResolution(2);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
    if (opts?.originX !== undefined || opts?.originY !== undefined) {
      text.setOrigin(opts?.originX ?? 0, opts?.originY ?? 0);
    }
    this.texts.push(text);
  }

  private addCenteredText(
    y: number,
    value: string,
    color: number,
    fontSize: string,
    fontFamily?: string,
    letterSpacing?: number,
    opts?: { alpha?: number; originX?: number; originY?: number; weight?: '400' | '600' | '700' }
  ): void {
    let fontStyle: string = 'bold';
    if (opts?.weight === '400') {
      fontStyle = '';
    } else if (opts?.weight === '600') {
      fontStyle = '600';
    }

    const text = this.add.text(GAME_CONFIG.width / 2, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: fontFamily ?? GAME_CONFIG.font.family,
      fontSize,
      fontStyle
    });
    text.setOrigin(opts?.originX ?? 0.5, opts?.originY ?? 0);
    text.setResolution(2);
    if (letterSpacing !== undefined) {
      text.setLetterSpacing(letterSpacing);
    }
    if (opts?.alpha !== undefined) {
      text.setAlpha(opts.alpha);
    }
    this.texts.push(text);
  }

  private clearTexts(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }

  private loadPhysicsFromStorage(): void {
    try {
      const stored = localStorage.getItem('cratercmd.physics');
      if (stored) {
        const physics = JSON.parse(stored) as PhysicsSettings;
        // Find the index of the stored gravity in GRAVITY_STEPS
        const gravityIdx = GRAVITY_STEPS.indexOf(physics.gravity);
        if (gravityIdx !== -1) this.gravityIndex = gravityIdx;

        // Find the index of the stored viscosity in VISCOSITY_STEPS
        const viscosityIdx = VISCOSITY_STEPS.indexOf(physics.viscosity);
        if (viscosityIdx !== -1) this.viscosityIndex = viscosityIdx;

        // Set tanksFall
        this.tanksFall = physics.tanksFall;
      }
    } catch (e) {
      // If parsing fails, just use defaults (already initialized)
    }
  }

  private savePhysicsToStorage(physics: PhysicsSettings): void {
    try {
      localStorage.setItem('cratercmd.physics', JSON.stringify(physics));
    } catch (e) {
      // Silently fail if localStorage is not available
    }
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
