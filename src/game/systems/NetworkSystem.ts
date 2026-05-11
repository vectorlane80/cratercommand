import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { ControllerKind, MatchState, TankState, TurnState } from '../types/GameTypes';

/**
 * Code prefix that namespaces our peer ids on the shared PeerJS signaling
 * server. The 4-character user-facing code goes after this prefix so a 4-letter
 * collision with someone else's project is impossible.
 */
const PEER_ID_PREFIX = 'cratercmd-';

/** Range of alphanumeric characters used in lobby codes. Unambiguous: no 0/O/I/1. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;

export type ConnectionState =
  | 'idle'
  | 'hosting-waiting'
  | 'joining-connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * Wire format. All traffic between host and joiner flows through these
 * tagged messages. Host -> joiner is mostly snapshots; joiner -> host is
 * mostly inputs. Both sides also send lobby handshakes before the match
 * starts.
 */
export type NetworkMessage =
  | { type: 'lobby-hello'; name: string }
  | { type: 'lobby-ready'; controllers: ControllerKind[]; names: Array<string | null>; roundsToWin: number }
  | { type: 'lobby-start' }
  | { type: 'snapshot'; data: GameSnapshot }
  | { type: 'input'; action: NetInput };

/** Inputs the joiner can send. Mirrors GameScene's local input handling. */
export type NetInput =
  | { kind: 'aim'; angle: number; power: number }
  | { kind: 'move-step'; direction: -1 | 1 }
  | { kind: 'select-weapon'; index: number }
  | { kind: 'fire' }
  | { kind: 'shop-buy'; itemKey: string }
  | { kind: 'shop-remove'; itemKey: string }
  | { kind: 'shop-undo' }
  | { kind: 'shop-finish' }
  | { kind: 'advance-round' };

/**
 * Snapshot of the host's authoritative game state. Sent every render.
 * Keeps the schema flat and JSON-safe (no Phaser refs, weapon stored by id).
 */
export interface GameSnapshot {
  match: MatchState;
  turn: TurnState;
  tanks: TankState[];
  terrainHeights: number[];
  projectiles: Array<{
    ownerId: number;
    weaponId: string;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    trail: Array<{ x: number; y: number }>;
    ageMs: number;
    bouncesLeft?: number;
    hasSplit?: boolean;
  }>;
  statusMessage: string | null;
  topToast: { text: string; color: number; expiresAt: number } | null;
  quitConfirmActive: boolean;
  pendingShopBuys: Record<string, number>;
}

export interface NetworkEvents {
  onStateChange?: (state: ConnectionState) => void;
  onMessage?: (message: NetworkMessage) => void;
  onError?: (error: string) => void;
}

export class NetworkSystem {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private events: NetworkEvents = {};

  state: ConnectionState = 'idle';
  /** Whether this peer is the host. False = joiner. */
  isHost = false;
  /** 4-character lobby code (uppercase alphanumeric, no ambiguous letters). */
  code = '';
  /** Remote player's name received in lobby-hello, if any. */
  remoteName: string | null = null;

  setEvents(events: NetworkEvents): void {
    this.events = events;
  }

  /**
   * Become a host. Generates a random 4-character lobby code, creates a
   * PeerJS peer with that code as the id (prefixed), then resolves when
   * the peer is online and ready to accept incoming connections. Retries
   * with a fresh code if the chosen one is already taken on the signaling
   * server.
   */
  async host(): Promise<string> {
    this.isHost = true;
    this.setState('hosting-waiting');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      const peerId = PEER_ID_PREFIX + code;
      try {
        await this.openPeer(peerId);
        this.code = code;
        // Listen for an incoming joiner.
        this.peer!.on('connection', (conn) => {
          if (this.connection) {
            // We already have a connection; reject extras.
            conn.close();
            return;
          }
          this.connection = conn;
          this.wireConnection(conn);
        });
        return code;
      } catch (err: unknown) {
        // Specific PeerJS error: id taken. Retry with a different code.
        if (String(err).includes('unavailable-id')) continue;
        this.setError(String(err));
        throw err;
      }
    }
    this.setError('Could not allocate a lobby code after 5 tries.');
    throw new Error('Failed to host: signaling server unreachable or all codes taken.');
  }

  /**
   * Join a host by code. Creates a peer with a random id, opens a data
   * channel to the host. Resolves once the channel is open.
   */
  async join(code: string): Promise<void> {
    this.isHost = false;
    this.code = code.toUpperCase();
    this.setState('joining-connecting');
    try {
      // Joiner peer id can be anything random — only the HOST id has to
      // be guessable. We append a random suffix to avoid collisions.
      const joinerId = PEER_ID_PREFIX + 'j-' + randomCode() + randomCode();
      await this.openPeer(joinerId);
      const hostId = PEER_ID_PREFIX + this.code;
      const conn = this.peer!.connect(hostId, { reliable: true });
      this.connection = conn;
      this.wireConnection(conn);
    } catch (err: unknown) {
      this.setError(String(err));
      throw err;
    }
  }

  /** Send a message to the connected peer. No-op if not connected. */
  send(message: NetworkMessage): void {
    if (this.connection && this.connection.open) {
      this.connection.send(message);
    }
  }

  /** Cleanly tear down everything. */
  disconnect(): void {
    if (this.connection) {
      try { this.connection.close(); } catch { /* ignore */ }
      this.connection = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
    this.setState('idle');
    this.isHost = false;
    this.code = '';
    this.remoteName = null;
  }

  // -------- PRIVATE HELPERS --------

  private openPeer(peerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerId, { debug: 0 });
      const onOpen = () => {
        peer.off('error', onError);
        this.peer = peer;
        resolve();
      };
      const onError = (err: unknown) => {
        peer.off('open', onOpen);
        peer.destroy();
        reject(err);
      };
      peer.once('open', onOpen);
      peer.once('error', onError);
    });
  }

  private wireConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.setState('connected');
    });
    conn.on('data', (data: unknown) => {
      if (data && typeof data === 'object' && 'type' in data) {
        const msg = data as NetworkMessage;
        if (msg.type === 'lobby-hello') {
          this.remoteName = msg.name;
        }
        this.events.onMessage?.(msg);
      }
    });
    conn.on('close', () => {
      this.setState('disconnected');
    });
    conn.on('error', (err) => {
      this.setError(String(err));
    });
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.events.onStateChange?.(s);
  }

  private setError(message: string): void {
    this.state = 'error';
    this.events.onError?.(message);
    this.events.onStateChange?.('error');
  }
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Singleton so the network connection survives scene transitions
// (MenuScene → LobbyScene → GameScene).
export const networkSystem = new NetworkSystem();
