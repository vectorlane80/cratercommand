import Phaser from 'phaser';
import { soundSystem } from '../systems/SoundSystem';
import {
  CONTROLLER_CYCLE,
  CONTROLLER_LABELS,
  GAME_CONFIG,
  MAX_PLAYERS,
  type ControllerKind
} from '../types/GameTypes';

/** Slot 3 and 4 can be empty (no participant) via `undefined`. */
type Slot = ControllerKind | undefined;

export interface MenuResult {
  controllers: ControllerKind[];
  roundsToWin: number;
  /** Parallel to controllers — null means "use default (PLAYER N)". */
  names: Array<string | null>;
}

const MAX_NAME_LEN = 12;

const MATCH_LENGTHS: Array<{ label: string; roundsToWin: number }> = [
  { label: 'BEST OF 3', roundsToWin: 2 },
  { label: 'BEST OF 5', roundsToWin: 3 },
  { label: 'BEST OF 7', roundsToWin: 4 }
];

const SLOT_CYCLE_REQUIRED: ControllerKind[] = CONTROLLER_CYCLE; // human + 3 CPU tiers
const SLOT_CYCLE_OPTIONAL: Array<ControllerKind | undefined> = [undefined, ...CONTROLLER_CYCLE];

export class MenuScene extends Phaser.Scene {
  private slots: Slot[] = ['human', 'cpu-veteran', undefined, undefined];
  // Per-slot display names. null means "use default (PLAYER N)". Set via
  // tap on the label to the left of the controller box, which fires
  // window.prompt() for input.
  private names: Array<string | null> = [null, null, null, null];
  private matchLengthIndex = 0; // index into MATCH_LENGTHS, default first
  private texts: Phaser.GameObjects.Text[] = [];
  private graphics!: Phaser.GameObjects.Graphics;

  private slotKeys: Phaser.Input.Keyboard.Key[] = [];
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private bKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);
    this.graphics = this.add.graphics();

    const keyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR
    ];
    this.slotKeys = keyCodes.map((c) => this.input.keyboard!.addKey(c));
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.bKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.input.keyboard!.addCapture([
      ...keyCodes,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.B
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y));

    this.render();
  }

  update(): void {
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
    if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) && this.canStart()) {
      soundSystem.playUiSelect();
      this.startMatch();
    }
  }

  private cycleMatchLength(): void {
    this.matchLengthIndex = (this.matchLengthIndex + 1) % MATCH_LENGTHS.length;
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
    // Player NAME label area sits to the LEFT of each controller box. Tapping
    // there opens a prompt to set a display name. We check this BEFORE the
    // controller-cycle box test below so the regions don't conflict.
    const rows = this.slotRowRects();
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const labelHit = x >= 100 && x < r.x && y >= r.y && y <= r.y + r.h;
      if (labelHit) {
        if (i >= 2 && this.slots[i] === undefined) {
          // Empty slot — name input doesn't make sense yet.
          return;
        }
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
    // Match length selector — see drawMatchLength for geometry
    const mlBtn = this.matchLengthRect();
    if (x >= mlBtn.x && x <= mlBtn.x + mlBtn.w && y >= mlBtn.y && y <= mlBtn.y + mlBtn.h) {
      this.cycleMatchLength();
      soundSystem.playUiClick();
      this.render();
      return;
    }
    // Start button hitbox — see render() for matching geometry.
    const btnX = GAME_CONFIG.width / 2 - 130;
    const btnY = 400;
    if (x >= btnX && x <= btnX + 260 && y >= btnY && y <= btnY + 46 && this.canStart()) {
      soundSystem.playUiSelect();
      this.startMatch();
    }
    // Online buttons sit beneath the START MATCH button.
    const hostBtn = this.hostButtonRect();
    if (x >= hostBtn.x && x <= hostBtn.x + hostBtn.w && y >= hostBtn.y && y <= hostBtn.y + hostBtn.h) {
      soundSystem.playUiSelect();
      this.scene.start('LobbyScene', {
        mode: 'host',
        localName: this.names[0] ?? 'PLAYER 1',
        roundsToWin: MATCH_LENGTHS[this.matchLengthIndex].roundsToWin
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

  private hostButtonRect() {
    return { x: GAME_CONFIG.width / 2 - 260, y: 458, w: 240, h: 32 };
  }

  private joinButtonRect() {
    return { x: GAME_CONFIG.width / 2 + 20, y: 458, w: 240, h: 32 };
  }

  private matchLengthRect() {
    return { x: GAME_CONFIG.width / 2 - 130, y: 340, w: 260, h: 36 };
  }

  /**
   * Slots 0 and 1 are required: they cycle human → cpu-cadet → cpu-veteran →
   * cpu-marshal → human. Slots 2 and 3 are optional: their cycle starts at
   * `undefined` (empty) so the user can leave them out. Cycling slot 2 to
   * empty also empties slot 3 (no gaps allowed — keeps PlayerId contiguous).
   */
  private cycleSlot(idx: number): void {
    const cycle = idx <= 1 ? SLOT_CYCLE_REQUIRED : SLOT_CYCLE_OPTIONAL;
    const current = this.slots[idx];
    const ci = cycle.indexOf(current as ControllerKind);
    const next = cycle[(ci + 1) % cycle.length] as Slot;
    this.slots[idx] = next;
    // Cascade: if slot 2 went empty, slot 3 must also be empty.
    if (idx === 2 && next === undefined) this.slots[3] = undefined;
    // Cascade: if slot 3 was just made non-empty but slot 2 is empty, fill slot 2 first instead.
    if (idx === 3 && next !== undefined && this.slots[2] === undefined) {
      this.slots[2] = next;
      this.slots[3] = undefined;
    }
  }

  private participants(): ControllerKind[] {
    return this.slots.filter((c): c is ControllerKind => c !== undefined);
  }

  /** Names parallel to participants() — same length, same order. */
  private participantNames(): Array<string | null> {
    const out: Array<string | null> = [];
    this.slots.forEach((slot, i) => {
      if (slot !== undefined) out.push(this.names[i] ?? null);
    });
    return out;
  }

  private canStart(): boolean {
    const active = this.participants();
    if (active.length < 2) return false;
    if (!active.includes('human')) return false;
    return true;
  }

  private startMatch(): void {
    const result: MenuResult = {
      controllers: this.participants(),
      names: this.participantNames(),
      roundsToWin: MATCH_LENGTHS[this.matchLengthIndex].roundsToWin
    };
    this.scene.start('GameScene', result);
  }

  private slotRowRects(): Array<{ x: number; y: number; w: number; h: number }> {
    const ys = [120, 170, 220, 270];
    return ys.map((y) => ({ x: 240, y: y - 6, w: 480, h: 46 }));
  }

  private render(): void {
    this.clearTexts();
    this.graphics.clear();
    const colors = GAME_CONFIG.colors;

    // Title — shifted up to leave room for everything below within 540 px.
    this.addText(GAME_CONFIG.width / 2 - 174, 20, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.title);
    this.addText(GAME_CONFIG.width / 2 - 80, 60, 'MATCH SETUP', colors.cyan, GAME_CONFIG.font.large);

    const labels = ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'];
    const rowYs = [120, 170, 220, 270];
    const palettes = [colors.cyan, colors.magenta, colors.green, colors.yellow];
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      this.drawSlotRow(i, rowYs[i], labels[i], this.slots[i], palettes[i], i >= 2);
    }

    // Hint
    this.addText(
      GAME_CONFIG.width / 2 - 310,
      318,
      'Tap name to rename · Tap box to cycle controller · B = match length',
      colors.white,
      GAME_CONFIG.font.small
    );

    // Match length button (B to cycle, also clickable)
    const ml = this.matchLengthRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(ml.x, ml.y, ml.w, ml.h);
    this.graphics.lineStyle(2, colors.cyan, 1);
    this.graphics.strokeRect(ml.x, ml.y, ml.w, ml.h);
    const mlLabel = MATCH_LENGTHS[this.matchLengthIndex].label;
    this.addText(ml.x + 60, ml.y + 8, mlLabel, colors.cyan, GAME_CONFIG.font.large);

    // Start button (gated on canStart())
    const enabled = this.canStart();
    const btnX = GAME_CONFIG.width / 2 - 130;
    const btnY = 400;
    const btnW = 260;
    const btnH = 46;
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(btnX, btnY, btnW, btnH);
    this.graphics.lineStyle(3, enabled ? colors.yellow : colors.dimGray, 1);
    this.graphics.strokeRect(btnX, btnY, btnW, btnH);
    this.addText(btnX + 26, btnY + 10, 'START MATCH', enabled ? colors.yellow : colors.dimGray, GAME_CONFIG.font.title);

    if (!enabled) {
      this.addText(
        GAME_CONFIG.width / 2 - 222,
        434,
        'Need at least 2 participants and 1 human.',
        colors.red,
        GAME_CONFIG.font.small
      );
    }

    // Online buttons (always available — they open the lobby scene, which
    // ignores the local slot config).
    const host = this.hostButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(host.x, host.y, host.w, host.h);
    this.graphics.lineStyle(2, colors.cyan, 1);
    this.graphics.strokeRect(host.x, host.y, host.w, host.h);
    this.addText(host.x + 50, host.y + 6, 'HOST ONLINE', colors.cyan, GAME_CONFIG.font.medium);

    const join = this.joinButtonRect();
    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(join.x, join.y, join.w, join.h);
    this.graphics.lineStyle(2, colors.magenta, 1);
    this.graphics.strokeRect(join.x, join.y, join.w, join.h);
    this.addText(join.x + 50, join.y + 6, 'JOIN ONLINE', colors.magenta, GAME_CONFIG.font.medium);
  }

  private drawSlotRow(idx: number, y: number, label: string, slot: Slot, accent: number, optional: boolean): void {
    const colors = GAME_CONFIG.colors;
    const boxX = 280;
    const boxY = y - 6;
    const boxW = 400;
    const boxH = 40;

    this.graphics.fillStyle(colors.panelDark, 1);
    this.graphics.fillRect(boxX, boxY, boxW, boxH);
    this.graphics.lineStyle(2, accent, 1);
    this.graphics.strokeRect(boxX, boxY, boxW, boxH);

    // Player label is either the default "PLAYER N" or the custom name.
    // Tappable area is x=100..280 (handlePointerDown).
    const customName = this.names[idx];
    const displayName = customName ?? label;
    this.addText(120, y, displayName, accent, GAME_CONFIG.font.large);

    if (slot === undefined) {
      this.addText(boxX + 16, y + 4, optional ? '— EMPTY —' : '???', colors.dimGray, GAME_CONFIG.font.medium);
    } else {
      this.addText(boxX + 16, y + 4, CONTROLLER_LABELS[slot], colors.white, GAME_CONFIG.font.medium);
    }
  }

  private addText(x: number, y: number, value: string, color: number, fontSize: string): void {
    const text = this.add.text(x, y, value, {
      color: Phaser.Display.Color.IntegerToColor(color).rgba,
      fontFamily: GAME_CONFIG.font.family,
      fontSize,
      fontStyle: 'bold'
    });
    text.setResolution(2);
    this.texts.push(text);
  }

  private clearTexts(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];
  }
}
