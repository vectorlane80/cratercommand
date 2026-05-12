import Phaser from 'phaser';
import { networkSystem, type NetworkMessage } from '../systems/NetworkSystem';
import { soundSystem } from '../systems/SoundSystem';
import { GAME_CONFIG, type ControllerKind } from '../types/GameTypes';

type LobbyMode = 'host' | 'join';
type LobbyPhase =
  | 'connecting'      // network setup in progress (host allocating code)
  | 'host-waiting'    // host: code displayed, waiting for joiner
  | 'join-prompt'     // joiner: enter the code in the input
  | 'join-connecting' // joiner: code submitted, dialing host
  | 'lobby-ready'     // both connected, host can start
  | 'error';

const MAX_NAME_LEN = 12;

export class LobbyScene extends Phaser.Scene {
  private mode: LobbyMode = 'host';
  private phase: LobbyPhase = 'connecting';
  private localName: string = '';
  private remoteName: string = '';
  private code: string = '';
  private errorMsg: string = '';
  private roundsToWin = 2;
  private texts: Phaser.GameObjects.Text[] = [];
  private graphics!: Phaser.GameObjects.Graphics;

  private escKey!: Phaser.Input.Keyboard.Key;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private bKey!: Phaser.Input.Keyboard.Key;

  // DOM inputs. Positioned as `position: fixed` overlays anchored to the
  // canvas's bounding rect — Phaser's DOM container doesn't align cleanly
  // with scale.zoom + Scale.FIT, so we manage placement ourselves.
  private nameInput: HTMLInputElement | null = null;
  private codeInput: HTMLInputElement | null = null;
  private inputAnchors: Array<{
    el: HTMLElement;
    worldX: number;
    worldY: number;
    widthWorld: number;
    heightWorld: number;
    baseFontPx: number;
  }> = [];
  private resizeListener: (() => void) | null = null;
  private helloSent = false;

  constructor() {
    super('LobbyScene');
  }

  init(data: { mode: LobbyMode; localName: string; roundsToWin?: number }): void {
    this.mode = data.mode;
    this.localName = (data.localName || 'PLAYER 1').slice(0, MAX_NAME_LEN);
    if (data.roundsToWin) this.roundsToWin = data.roundsToWin;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.colors.black);
    this.graphics = this.add.graphics();

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.bKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.ESC,
      Phaser.Input.Keyboard.KeyCodes.B
    ]);
    this.game.canvas.setAttribute('tabindex', '0');
    this.game.canvas.focus();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y));

    networkSystem.setEvents({
      onStateChange: () => this.render(),
      onMessage: (msg) => this.handleMessage(msg),
      onError: (err) => {
        this.errorMsg = err;
        this.phase = 'error';
        this.render();
      }
    });

    this.createNameInput();
    if (this.mode === 'host') {
      this.startHost();
    } else {
      this.phase = 'join-prompt';
      this.createCodeInput();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyDomInputs());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyDomInputs());

    this.render();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.bail();
      return;
    }
    const inputFocused = document.activeElement === this.nameInput || document.activeElement === this.codeInput;
    if (!inputFocused && Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.onEnter();
      return;
    }
    if (this.phase === 'host-waiting' && !inputFocused && Phaser.Input.Keyboard.JustDown(this.bKey)) {
      this.cycleMatchLength();
    }
  }

  private cycleMatchLength(): void {
    const options = [2, 3, 4];
    const idx = options.indexOf(this.roundsToWin);
    this.roundsToWin = options[(idx + 1) % options.length];
    soundSystem.playUiClick();
    if (this.phase === 'lobby-ready' && networkSystem.isHost) {
      networkSystem.send({
        type: 'lobby-ready',
        controllers: ['human', 'remote'],
        names: [this.localName, this.remoteName],
        roundsToWin: this.roundsToWin
      });
    }
    this.render();
  }

  private onEnter(): void {
    if (this.phase === 'join-prompt') {
      this.submitCode();
    } else if (this.phase === 'lobby-ready' && this.mode === 'host') {
      this.startMatch();
    }
  }

  private async startHost(): Promise<void> {
    try {
      this.code = await networkSystem.host();
      this.phase = 'host-waiting';
      this.render();
    } catch (err: unknown) {
      this.errorMsg = String(err);
      this.phase = 'error';
      this.render();
    }
  }

  private submitCode(): void {
    const raw = (this.codeInput?.value ?? '').trim().toUpperCase();
    if (raw.length !== 4) {
      this.errorMsg = 'Lobby codes are exactly 4 characters.';
      this.phase = 'error';
      this.destroyCodeInput();
      this.render();
      return;
    }
    this.code = raw;
    this.phase = 'join-connecting';
    this.destroyCodeInput();
    this.render();
    networkSystem.join(raw).catch((err) => {
      this.errorMsg = String(err);
      this.phase = 'error';
      this.render();
    });
  }

  private handleMessage(msg: NetworkMessage): void {
    if (msg.type === 'lobby-hello' && networkSystem.isHost) {
      this.remoteName = msg.name;
      this.phase = 'lobby-ready';
      networkSystem.send({
        type: 'lobby-ready',
        controllers: ['human', 'remote'],
        names: [this.localName, msg.name],
        roundsToWin: this.roundsToWin
      });
      this.render();
    } else if (msg.type === 'lobby-name') {
      this.remoteName = msg.name;
      this.render();
    } else if (msg.type === 'lobby-ready' && !networkSystem.isHost) {
      this.remoteName = msg.names[0] ?? 'HOST';
      this.roundsToWin = msg.roundsToWin;
      this.phase = 'lobby-ready';
      this.render();
    } else if (msg.type === 'lobby-start' && !networkSystem.isHost) {
      this.startMatch();
    }
  }

  private maybeSendHello(): void {
    if (!networkSystem.isHost && networkSystem.state === 'connected' && !this.helloSent) {
      networkSystem.send({ type: 'lobby-hello', name: this.localName });
      this.helloSent = true;
    }
  }

  private startMatch(): void {
    soundSystem.playUiSelect();
    if (networkSystem.isHost) {
      networkSystem.send({ type: 'lobby-start' });
    }
    const controllers: ControllerKind[] = networkSystem.isHost
      ? ['human', 'remote']
      : ['remote', 'human'];
    const names: Array<string | null> = networkSystem.isHost
      ? [this.localName, this.remoteName]
      : [this.remoteName, this.localName];
    this.scene.start('GameScene', {
      controllers,
      names,
      roundsToWin: this.roundsToWin,
      online: { isHost: networkSystem.isHost }
    });
  }

  private bail(): void {
    soundSystem.playUiClick();
    networkSystem.disconnect();
    this.scene.start('MenuScene');
  }

  private handlePointerDown(x: number, y: number): void {
    if (x < 100 && y < 60) {
      this.bail();
      return;
    }
    if (this.phase === 'host-waiting') {
      const ml = { x: GAME_CONFIG.width / 2 - 130, y: 380, w: 260, h: 36 };
      if (x >= ml.x && x <= ml.x + ml.w && y >= ml.y && y <= ml.y + ml.h) {
        this.cycleMatchLength();
        return;
      }
    }
    if (this.phase === 'join-prompt') {
      const btn = { x: GAME_CONFIG.width / 2 - 130, y: 320, w: 260, h: 40 };
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.submitCode();
        return;
      }
    }
    if (this.phase === 'lobby-ready' && networkSystem.isHost) {
      const btn = { x: GAME_CONFIG.width / 2 - 130, y: 420, w: 260, h: 46 };
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.startMatch();
      }
    }
  }

  // -------- DOM INPUTS --------

  private createNameInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.localName;
    input.maxLength = MAX_NAME_LEN;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.style.position = 'fixed';
    input.style.padding = '2px 8px';
    input.style.fontFamily = GAME_CONFIG.font.family;
    input.style.fontWeight = 'bold';
    input.style.color = '#ffffff';
    input.style.background = '#101820';
    input.style.border = '2px solid #00ffff';
    input.style.outline = 'none';
    input.style.textAlign = 'center';
    input.style.boxSizing = 'border-box';
    input.style.zIndex = '1000';
    input.addEventListener('input', () => {
      const v = input.value.slice(0, MAX_NAME_LEN);
      if (v !== input.value) input.value = v;
      this.localName = v || 'PLAYER';
      if (networkSystem.state === 'connected') {
        networkSystem.send({ type: 'lobby-name', name: this.localName });
      }
    });
    this.nameInput = input;
    document.body.appendChild(input);
    this.inputAnchors.push({
      el: input,
      worldX: GAME_CONFIG.width / 2,
      worldY: 138,
      widthWorld: 240,
      heightWorld: 32,
      baseFontPx: 18
    });
    this.installResizeListener();
    this.repositionInputs();
  }

  private createCodeInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '';
    input.maxLength = 4;
    input.placeholder = 'ABCD';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.style.position = 'fixed';
    input.style.padding = '2px 8px';
    input.style.fontFamily = GAME_CONFIG.font.family;
    input.style.fontWeight = 'bold';
    input.style.letterSpacing = '8px';
    input.style.color = '#ffff00';
    input.style.background = '#101820';
    input.style.border = '3px solid #ffff00';
    input.style.outline = 'none';
    input.style.textAlign = 'center';
    input.style.boxSizing = 'border-box';
    input.style.textTransform = 'uppercase';
    input.style.zIndex = '1000';
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitCode();
      }
    });
    this.codeInput = input;
    document.body.appendChild(input);
    this.inputAnchors.push({
      el: input,
      worldX: GAME_CONFIG.width / 2,
      worldY: 250,
      widthWorld: 220,
      heightWorld: 56,
      baseFontPx: 32
    });
    this.installResizeListener();
    this.repositionInputs();
    setTimeout(() => input.focus(), 0);
  }

  /**
   * Reposition each DOM input over the canvas. Computed from
   * canvas.getBoundingClientRect() so it follows resizes / letterboxing.
   */
  private repositionInputs(): void {
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = rect.width / GAME_CONFIG.width;
    const sy = rect.height / GAME_CONFIG.height;
    for (const a of this.inputAnchors) {
      const w = a.widthWorld * sx;
      const h = a.heightWorld * sy;
      const cxScreen = rect.left + a.worldX * sx;
      const cyScreen = rect.top + a.worldY * sy;
      a.el.style.width = `${w}px`;
      a.el.style.height = `${h}px`;
      a.el.style.left = `${cxScreen - w / 2}px`;
      a.el.style.top = `${cyScreen - h / 2}px`;
      a.el.style.fontSize = `${a.baseFontPx * sy}px`;
    }
  }

  private installResizeListener(): void {
    if (this.resizeListener) return;
    this.resizeListener = () => this.repositionInputs();
    window.addEventListener('resize', this.resizeListener);
    this.scale.on('resize', this.resizeListener);
  }

  private destroyCodeInput(): void {
    if (this.codeInput) {
      this.inputAnchors = this.inputAnchors.filter((a) => a.el !== this.codeInput);
      this.codeInput.remove();
      this.codeInput = null;
    }
  }

  private destroyDomInputs(): void {
    if (this.nameInput) {
      this.inputAnchors = this.inputAnchors.filter((a) => a.el !== this.nameInput);
      this.nameInput.remove();
      this.nameInput = null;
    }
    this.destroyCodeInput();
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.scale.off('resize', this.resizeListener);
      this.resizeListener = null;
    }
  }

  private render(): void {
    this.maybeSendHello();
    this.clearTexts();
    this.graphics.clear();
    const colors = GAME_CONFIG.colors;
    const cx = GAME_CONFIG.width / 2;

    this.addText(20, 16, '< MENU', colors.dimGray, GAME_CONFIG.font.small);
    this.addText(cx - 174, 30, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.title);
    this.addText(cx - (this.mode === 'host' ? 100 : 90), 70, this.mode === 'host' ? 'HOST LOBBY' : 'JOIN LOBBY', colors.cyan, GAME_CONFIG.font.large);

    // YOUR NAME label above the name input (centered at y=138, height 32 → spans 122..154)
    this.addText(cx - 50, 105, 'YOUR NAME', colors.dimGray, GAME_CONFIG.font.small);

    if (this.phase === 'connecting') {
      this.addText(cx - 130, 220, 'Contacting signaling server…', colors.white, GAME_CONFIG.font.medium);
    }
    if (this.phase === 'host-waiting') {
      this.addText(cx - 90, 175, 'LOBBY CODE', colors.white, GAME_CONFIG.font.medium);
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(cx - 110, 205, 220, 76);
      this.graphics.lineStyle(3, colors.yellow, 1);
      this.graphics.strokeRect(cx - 110, 205, 220, 76);
      this.addText(cx - 70, 219, this.code, colors.yellow, GAME_CONFIG.font.title);
      this.addText(cx - 154, 297, 'Waiting for second player…', colors.dimGray, GAME_CONFIG.font.medium);

      const ml = { x: cx - 130, y: 380, w: 260, h: 36 };
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(ml.x, ml.y, ml.w, ml.h);
      this.graphics.lineStyle(2, colors.cyan, 1);
      this.graphics.strokeRect(ml.x, ml.y, ml.w, ml.h);
      const label = `BEST OF ${this.roundsToWin === 2 ? 3 : this.roundsToWin === 3 ? 5 : 7}`;
      this.addText(ml.x + 80, ml.y + 8, label, colors.cyan, GAME_CONFIG.font.large);
      this.addText(cx - 130, 424, 'Press B or tap to change.', colors.dimGray, GAME_CONFIG.font.small);
    }
    if (this.phase === 'join-prompt') {
      // Code input centered at y=250 (spans ~222..278)
      this.addText(cx - 80, 195, 'LOBBY CODE', colors.white, GAME_CONFIG.font.medium);
      const btn = { x: cx - 130, y: 320, w: 260, h: 40 };
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
      this.graphics.lineStyle(3, colors.yellow, 1);
      this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
      this.addText(btn.x + 70, btn.y + 8, 'CONNECT', colors.yellow, GAME_CONFIG.font.large);
      this.addText(cx - 140, 370, 'Type the code, then press ENTER.', colors.dimGray, GAME_CONFIG.font.small);
    }
    if (this.phase === 'join-connecting') {
      this.addText(cx - 130, 220, `Connecting to ${this.code}…`, colors.cyan, GAME_CONFIG.font.medium);
    }
    if (this.phase === 'lobby-ready') {
      this.addText(cx - 80, 195, 'CONNECTED', colors.green, GAME_CONFIG.font.large);
      this.addText(cx - 150, 240, `${this.localName}  (you)`, colors.cyan, GAME_CONFIG.font.medium);
      this.addText(cx - 150, 274, `${this.remoteName || '?'}`, colors.magenta, GAME_CONFIG.font.medium);
      this.addText(cx - 130, 330, `BEST OF ${this.roundsToWin === 2 ? 3 : this.roundsToWin === 3 ? 5 : 7}`, colors.cyan, GAME_CONFIG.font.medium);
      if (networkSystem.isHost) {
        const btn = { x: cx - 130, y: 420, w: 260, h: 46 };
        this.graphics.fillStyle(colors.panelDark, 1);
        this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
        this.graphics.lineStyle(3, colors.yellow, 1);
        this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
        this.addText(btn.x + 26, btn.y + 10, 'START MATCH', colors.yellow, GAME_CONFIG.font.title);
      } else {
        this.addText(cx - 150, 420, 'Waiting for host to start…', colors.dimGray, GAME_CONFIG.font.medium);
      }
    }
    if (this.phase === 'error') {
      this.addText(cx - 60, 200, 'ERROR', colors.red, GAME_CONFIG.font.large);
      this.addText(40, 250, this.errorMsg.slice(0, 80), colors.red, GAME_CONFIG.font.small);
      this.addText(cx - 120, 400, 'ESC to return to menu.', colors.dimGray, GAME_CONFIG.font.medium);
    }

    this.addText(20, GAME_CONFIG.height - 28, 'ESC: back to menu', colors.dimGray, GAME_CONFIG.font.small);
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

export type { LobbyMode };
