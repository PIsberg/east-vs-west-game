// Online 1v1 transport layer (plan.md §3).
//
// One tiny interface, two implementations:
// - LoopbackTransport: BroadcastChannel between two tabs on one machine. No
//   network, no accounts — this is what the e2e suite and local development
//   drive. It exercises every part of the netcode except NAT traversal.
// - PeerJsTransport: WebRTC DataChannel brokered by the public PeerJS cloud
//   (signaling only — game traffic is peer-to-peer). Loaded lazily so the
//   dependency never touches local play.
//
// Everything on the wire is a NetMsg (plain JSON). The transport is dumb on
// purpose: ordering/reliability come from the channel itself (BroadcastChannel
// is in-order; the data channel is opened reliable+ordered), and all game
// semantics live in the lockstep scheduler above this.

import type { SimCommand } from '../types';

export const PROTOCOL_VERSION = 1;

// Build identity: two clients must run the same code or they will desync on
// the first divergent tick. Vite inlines import.meta.env at build time; dev
// builds all agree with each other.
export const BUILD_ID: string =
  (import.meta as any).env?.VITE_BUILD_ID ?? `dev-${(import.meta as any).env?.MODE ?? 'unknown'}`;

export type NetMsg =
  | { v: number; type: 'hello'; build: string }
  | { v: number; type: 'welcome'; build: string }
  | { v: number; type: 'reject'; reason: string }
  | { v: number; type: 'lobby'; settings: LobbySettings }
  | { v: number; type: 'ready'; ready: boolean }
  | { v: number; type: 'start'; config: MatchConfig }
  | { v: number; type: 'cmds'; step: number; commands: SimCommand[] }
  | { v: number; type: 'ack'; step: number; sentAt: number }
  | { v: number; type: 'ping'; sentAt: number }
  | { v: number; type: 'pong'; sentAt: number }
  | { v: number; type: 'checksum'; tick: number; hash: number }
  | { v: number; type: 'resign'; team: string }
  | { v: number; type: 'rematch' }
  | { v: number; type: 'bye' };

// What the host configures in the lobby (guest sees it read-only, live)
export interface LobbySettings {
  map: string;          // MapType value
  mode: string;         // GameMode value
  asymmetry: boolean;
  fogOfWar: boolean;
  hostTeam: 'WEST' | 'EAST';
}

// Frozen at start: everything both clients need to boot identical sims
export interface MatchConfig extends LobbySettings {
  seed: number;
  inputDelaySteps: number;
  stepTicks: number;
}

export interface Transport {
  /** Resolves once the peer link is up (guest connected / host accepted). */
  readonly opened: Promise<void>;
  send(msg: NetMsg): void;
  onMessage(cb: (msg: NetMsg) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

// ── Loopback (two tabs, one machine) ─────────────────────────────────────────

export class LoopbackTransport implements Transport {
  readonly opened: Promise<void>;
  private ch: BroadcastChannel;
  private msgCbs: ((m: NetMsg) => void)[] = [];
  private closeCbs: (() => void)[] = [];
  private closed = false;

  /**
   * Both sides open `ewv-loop-<code>`; the host listens for a knock, the
   * guest knocks. BroadcastChannel does not deliver to the sending tab, so
   * two tabs get a clean full-duplex pipe with zero setup.
   */
  constructor(code: string, role: 'host' | 'join') {
    this.ch = new BroadcastChannel(`ewv-loop-${code}`);
    this.opened = new Promise<void>((resolve) => {
      this.ch.addEventListener('message', (ev) => {
        const d = ev.data;
        if (d === '__knock' && role === 'host') { this.ch.postMessage('__ack'); resolve(); return; }
        if (d === '__ack' && role === 'join') { resolve(); return; }
        if (d === '__bye') { this.fireClose(); return; }
        if (d && typeof d === 'object') this.msgCbs.forEach(cb => cb(d as NetMsg));
      });
      if (role === 'join') this.ch.postMessage('__knock');
    });
  }

  send(msg: NetMsg) { if (!this.closed) this.ch.postMessage(msg); }
  onMessage(cb: (m: NetMsg) => void) { this.msgCbs.push(cb); }
  onClose(cb: () => void) { this.closeCbs.push(cb); }
  close() {
    if (this.closed) return;
    this.ch.postMessage('__bye');
    this.closed = true;
    this.ch.close();
  }
  private fireClose() {
    if (this.closed) return;
    this.closed = true;
    this.closeCbs.forEach(cb => cb());
    this.ch.close();
  }
}

// ── PeerJS (real internet play) ──────────────────────────────────────────────

// Room codes map to namespaced PeerJS ids. Unambiguous alphabet (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeRoomCode = (): string =>
  'EW-' + Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
const peerIdFor = (code: string) => `ewv-1v1-${code.replace(/[^A-Z0-9-]/gi, '')}`;

export class PeerJsTransport implements Transport {
  readonly opened: Promise<void>;
  private peer: any = null;
  private conn: any = null;
  private msgCbs: ((m: NetMsg) => void)[] = [];
  private closeCbs: (() => void)[] = [];
  private closed = false;

  private constructor(opened: Promise<void>) { this.opened = opened; }

  /** Host: claim the room code as a peer id and wait for the guest to dial in. */
  static host(code: string): PeerJsTransport {
    let t: PeerJsTransport;
    const opened = (async () => {
      const Peer = (await import('peerjs')).default;
      await new Promise<void>((resolve, reject) => {
        const peer = new Peer(peerIdFor(code));
        t.peer = peer;
        peer.on('error', (e: any) => reject(new Error(e?.type === 'unavailable-id'
          ? 'room-taken' : `signaling: ${e?.type ?? e}`)));
        peer.on('open', () => {
          peer.on('connection', (conn: any) => {
            if (t.conn) { conn.close(); return; } // 1v1: second knocker is turned away
            t.attach(conn);
            conn.on('open', () => resolve());
          });
        });
      });
    })();
    t = new PeerJsTransport(opened);
    return t;
  }

  /** Guest: dial the host's room code. */
  static join(code: string): PeerJsTransport {
    let t: PeerJsTransport;
    const opened = (async () => {
      const Peer = (await import('peerjs')).default;
      await new Promise<void>((resolve, reject) => {
        const peer = new Peer(); // broker-assigned id for the guest
        t.peer = peer;
        peer.on('error', (e: any) => reject(new Error(e?.type === 'peer-unavailable'
          ? 'room-not-found' : `signaling: ${e?.type ?? e}`)));
        peer.on('open', () => {
          // reliable+ordered: lockstep inputs must all arrive, in order
          const conn = peer.connect(peerIdFor(code), { reliable: true });
          t.attach(conn);
          conn.on('open', () => resolve());
        });
      });
    })();
    t = new PeerJsTransport(opened);
    return t;
  }

  private attach(conn: any) {
    this.conn = conn;
    conn.on('data', (d: any) => { if (d && typeof d === 'object') this.msgCbs.forEach(cb => cb(d as NetMsg)); });
    conn.on('close', () => this.fireClose());
    conn.on('error', () => this.fireClose());
  }

  send(msg: NetMsg) { if (!this.closed && this.conn?.open) this.conn.send(msg); }
  onMessage(cb: (m: NetMsg) => void) { this.msgCbs.push(cb); }
  onClose(cb: () => void) { this.closeCbs.push(cb); }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.conn?.close(); } catch { /* already down */ }
    try { this.peer?.destroy(); } catch { /* already down */ }
  }
  private fireClose() {
    if (this.closed) return;
    this.closed = true;
    this.closeCbs.forEach(cb => cb());
    try { this.peer?.destroy(); } catch { /* already down */ }
  }
}
