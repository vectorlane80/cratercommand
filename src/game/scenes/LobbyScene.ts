import Phaser from 'phaser';
import { networkSystem, type NetworkMessage } from '../systems/NetworkSystem';
import { soundSystem } from '../systems/SoundSystem';
import { GAME_CONFIG, type ControllerKind } from '../types/GameTypes';

type LobbyMode = 'host' | 'join';
type LobbyPhase =
  | 'connecting'      // network setup in progress
  | 'host-waiting'    // host: code displayed, waiting for joiner
  | 'join-prompt'     // joiner: enter the code
  | 'join-connecting' // joiner: code submitted, dialing host
  | 'lobby-ready'     // both connected, host can start
  | 'error';


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

  constructor() {
    super('LobbyScene');
  }

  init(data: { mode: LobbyMode; localName: string; roundsToWin?: number }): void {
    this.mode = data.mode;
    this.localName = data.localName || 'PLAYER 1';
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
      Phaser.Input.Keyboard.KeyCodes.ENTER,
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

    if (this.mode === 'host') {
      this.startHost();
    } else {
      this.phase = 'join-prompt';
      // Prompt is opened on first pointer / Enter — we don't auto-popup
      // because some browsers throttle prompts launched from create()
      // before user interaction.
    }

    this.render();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.bail();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.onEnter();
      return;
    }
    if (this.phase === 'host-waiting' && Phaser.Input.Keyboard.JustDown(this.bKey)) {
      this.cycleMatchLength();
    }
  }

  private cycleMatchLength(): void {
    const options = [2, 3, 4];
    const idx = options.indexOf(this.roundsToWin);
    this.roundsToWin = options[(idx + 1) % options.length];
    soundSystem.playUiClick();
    this.render();
  }

  private onEnter(): void {
    if (this.phase === 'join-prompt') {
      this.promptForCode();
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

  private promptForCode(): void {
    const input = window.prompt('Enter 4-character lobby code:', '');
    if (input === null) {
      this.bail();
      return;
    }
    const code = input.trim().toUpperCase();
    if (code.length !== 4) {
      this.errorMsg = 'Lobby codes are exactly 4 characters.';
      this.phase = 'error';
      this.render();
      return;
    }
    this.phase = 'join-connecting';
    this.render();
    networkSystem.join(code).catch((err) => {
      this.errorMsg = String(err);
      this.phase = 'error';
      this.render();
    });
  }

  private handleMessage(msg: NetworkMessage): void {
    if (msg.type === 'lobby-hello' && networkSystem.isHost) {
      // Joiner introduced themselves to host. Now reply with the lobby
      // config so the joiner can show it on their screen.
      this.remoteName = msg.name;
      this.phase = 'lobby-ready';
      networkSystem.send({
        type: 'lobby-ready',
        controllers: ['human', 'remote'],
        names: [this.localName, msg.name],
        roundsToWin: this.roundsToWin
      });
      this.render();
    } else if (msg.type === 'lobby-ready' && !networkSystem.isHost) {
      // Joiner received lobby config from host.
      this.remoteName = msg.names[0] ?? 'HOST';
      this.roundsToWin = msg.roundsToWin;
      this.phase = 'lobby-ready';
      this.render();
    } else if (msg.type === 'lobby-start' && !networkSystem.isHost) {
      this.startMatch();
    }
  }

  /**
   * When the network state transitions to "connected" for the joiner,
   * fire the lobby-hello introduction.
   */
  private maybeSendHello(): void {
    if (!networkSystem.isHost && networkSystem.state === 'connected') {
      networkSystem.send({ type: 'lobby-hello', name: this.localName });
    }
  }

  private startMatch(): void {
    soundSystem.playUiSelect();
    if (networkSystem.isHost) {
      networkSystem.send({ type: 'lobby-start' });
    }
    // Both sides go to GameScene with an 'online' flag.
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
    // BAIL button (top-left always available)
    if (x < 100 && y < 60) {
      this.bail();
      return;
    }
    if (this.phase === 'join-prompt') {
      // Tap anywhere opens the prompt.
      this.promptForCode();
      return;
    }
    if (this.phase === 'host-waiting') {
      // Match-length button — same position/size as the one in MenuScene.
      const ml = { x: GAME_CONFIG.width / 2 - 130, y: 340, w: 260, h: 36 };
      if (x >= ml.x && x <= ml.x + ml.w && y >= ml.y && y <= ml.y + ml.h) {
        this.cycleMatchLength();
        return;
      }
    }
    if (this.phase === 'lobby-ready' && networkSystem.isHost) {
      // Start button
      const btn = { x: GAME_CONFIG.width / 2 - 130, y: 400, w: 260, h: 46 };
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        this.startMatch();
      }
    }
  }

  private render(): void {
    this.maybeSendHello();
    this.clearTexts();
    this.graphics.clear();
    const colors = GAME_CONFIG.colors;
    const cx = GAME_CONFIG.width / 2;

    // Back button top-left
    this.addText(20, 16, '< MENU', colors.dimGray, GAME_CONFIG.font.small);

    // Title
    this.addText(cx - 174, 30, 'CRATER COMMAND', colors.magenta, GAME_CONFIG.font.title);
    this.addText(cx - (this.mode === 'host' ? 100 : 90), 70, this.mode === 'host' ? 'HOST LOBBY' : 'JOIN LOBBY', colors.cyan, GAME_CONFIG.font.large);

    if (this.phase === 'connecting') {
      this.addText(cx - 130, 200, 'Contacting signaling server…', colors.white, GAME_CONFIG.font.medium);
    }
    if (this.phase === 'host-waiting') {
      this.addText(cx - 130, 140, 'YOUR LOBBY CODE', colors.white, GAME_CONFIG.font.medium);
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(cx - 110, 170, 220, 76);
      this.graphics.lineStyle(3, colors.yellow, 1);
      this.graphics.strokeRect(cx - 110, 170, 220, 76);
      this.addText(cx - 70, 184, this.code, colors.yellow, GAME_CONFIG.font.title);
      this.addText(cx - 154, 264, 'Waiting for second player…', colors.dimGray, GAME_CONFIG.font.medium);

      // Match length button
      const ml = { x: cx - 130, y: 340, w: 260, h: 36 };
      this.graphics.fillStyle(colors.panelDark, 1);
      this.graphics.fillRect(ml.x, ml.y, ml.w, ml.h);
      this.graphics.lineStyle(2, colors.cyan, 1);
      this.graphics.strokeRect(ml.x, ml.y, ml.w, ml.h);
      const label = `BEST OF ${this.roundsToWin === 2 ? 3 : this.roundsToWin === 3 ? 5 : 7}`;
      this.addText(ml.x + 80, ml.y + 8, label, colors.cyan, GAME_CONFIG.font.large);
      this.addText(cx - 130, 384, 'Press B or tap to change.', colors.dimGray, GAME_CONFIG.font.small);
    }
    if (this.phase === 'join-prompt') {
      this.addText(cx - 200, 200, 'Click anywhere or press ENTER', colors.white, GAME_CONFIG.font.medium);
      this.addText(cx - 200, 230, 'to enter the lobby code from your host.', colors.white, GAME_CONFIG.font.medium);
    }
    if (this.phase === 'join-connecting') {
      this.addText(cx - 130, 200, `Connecting to ${this.code}…`, colors.cyan, GAME_CONFIG.font.medium);
    }
    if (this.phase === 'lobby-ready') {
      this.addText(cx - 80, 140, 'CONNECTED', colors.green, GAME_CONFIG.font.large);
      this.addText(cx - 150, 200, `${this.localName}  (you)`, colors.cyan, GAME_CONFIG.font.medium);
      this.addText(cx - 150, 234, `${this.remoteName || '?'}`, colors.magenta, GAME_CONFIG.font.medium);
      this.addText(cx - 130, 290, `BEST OF ${this.roundsToWin === 2 ? 3 : this.roundsToWin === 3 ? 5 : 7}`, colors.cyan, GAME_CONFIG.font.medium);
      if (networkSystem.isHost) {
        // Start button
        const btn = { x: cx - 130, y: 400, w: 260, h: 46 };
        this.graphics.fillStyle(colors.panelDark, 1);
        this.graphics.fillRect(btn.x, btn.y, btn.w, btn.h);
        this.graphics.lineStyle(3, colors.yellow, 1);
        this.graphics.strokeRect(btn.x, btn.y, btn.w, btn.h);
        this.addText(btn.x + 26, btn.y + 10, 'START MATCH', colors.yellow, GAME_CONFIG.font.title);
      } else {
        this.addText(cx - 150, 400, 'Waiting for host to start…', colors.dimGray, GAME_CONFIG.font.medium);
      }
    }
    if (this.phase === 'error') {
      this.addText(cx - 60, 180, 'ERROR', colors.red, GAME_CONFIG.font.large);
      this.addText(40, 230, this.errorMsg.slice(0, 80), colors.red, GAME_CONFIG.font.small);
      this.addText(cx - 120, 380, 'ESC to return to menu.', colors.dimGray, GAME_CONFIG.font.medium);
    }

    // ESC hint at bottom
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
