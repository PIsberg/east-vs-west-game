// Online session state machine (plan.md §Phase 5).
//
// Owns everything between "player clicked Host/Join" and "the match is over":
// transport lifecycle, version handshake, lobby settings sync, ready/start,
// lockstep scheduler creation, checksum relay, ping, and disconnect/desync
// surfacing. React-free: App subscribes and mirrors `snap` — every mutation
// replaces the snapshot object, so it drops straight into useSyncExternalStore.
//
// Protocol flow (see services/net.ts for the message shapes):
//   guest                     host
//   hello(build)      ──►
//                     ◄──     welcome(build) + lobby(settings)
//   ready(true)       ──►     [host edits settings; each edit → lobby(...)]
//                     ◄──     ready(true)
//                     ◄──     start(config: settings + seed + lockstep params)
//   cmds/checksum/ping ◄─►    cmds/checksum/ping        (the match itself)

import { LockstepScheduler } from './lockstep';
import {
  LoopbackTransport, PeerJsTransport, makeRoomCode,
  PROTOCOL_VERSION, BUILD_ID,
  type Transport, type NetMsg, type LobbySettings, type MatchConfig,
} from './net';
import { randomSeed } from '../utils/rng';

export type OnlinePhase = 'connecting' | 'lobby' | 'playing';

export interface OnlineSnapshot {
  phase: OnlinePhase;
  role: 'host' | 'guest';
  code: string;
  loopback: boolean;
  settings: LobbySettings;
  selfReady: boolean;
  peerReady: boolean;
  config: MatchConfig | null;
  pingMs: number | null;
  /** Fatal pre-match error (broker down, room taken/missing, version mismatch) */
  error: string | null;
  peerLeft: boolean;
  desyncTick: number | null;
  /** Which role resigned (shown as victory/defeat overlay) */
  resignedBy: 'host' | 'guest' | null;
}

const DEFAULT_SETTINGS: LobbySettings = {
  map: 'COUNTRYSIDE', mode: 'points', asymmetry: false, fogOfWar: false, hostTeam: 'WEST',
};

// Lockstep parameters (plan.md §Phase 4). stepTicks 3 ≈ 40ms of sim per
// bundle; delay 2 steps ≈ 80-107ms command latency — under the perception
// threshold for this game's pace, and roomy enough for a 150ms-RTT link.
const STEP_TICKS = 3;
const INPUT_DELAY_STEPS = 2;

export class OnlineSession {
  snap: OnlineSnapshot;
  readonly transport: Transport;
  scheduler: LockstepScheduler | null = null;
  /** Peer checkpoint hashes — GameCanvas compares & deletes via peerChecksumsRef */
  readonly peerChecksums: Record<number, number> = {};
  private listeners = new Set<() => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private lastHeardMs = 0; // wall-clock of the last message from the peer

  static host(opts?: { loopback?: boolean; code?: string }): OnlineSession {
    const code = opts?.code ?? makeRoomCode();
    const loop = !!opts?.loopback;
    const t: Transport = loop ? new LoopbackTransport(code, 'host') : PeerJsTransport.host(code);
    return new OnlineSession(t, 'host', code, loop);
  }

  static join(code: string, opts?: { loopback?: boolean }): OnlineSession {
    const loop = !!opts?.loopback;
    const t: Transport = loop ? new LoopbackTransport(code, 'join') : PeerJsTransport.join(code);
    return new OnlineSession(t, 'guest', code, loop);
  }

  private constructor(transport: Transport, role: 'host' | 'guest', code: string, loopback: boolean) {
    this.transport = transport;
    this.snap = {
      phase: 'connecting', role, code, loopback,
      settings: { ...DEFAULT_SETTINGS },
      selfReady: false, peerReady: false, config: null,
      pingMs: null, error: null, peerLeft: false, desyncTick: null, resignedBy: null,
    };
    transport.onMessage(m => this.onMsg(m));
    transport.onClose(() => this.update(s => { s.peerLeft = true; }));
    transport.opened.then(() => {
      if (role === 'guest') this.send({ v: PROTOCOL_VERSION, type: 'hello', build: BUILD_ID });
      // The host answers the guest's hello — nothing to do until it arrives.
    }).catch((e: unknown) => this.update(s => {
      const msg = String((e as Error)?.message ?? e);
      s.error = msg === 'room-taken' ? 'That room code is already in use — host again for a fresh code.'
        : msg === 'room-not-found' ? 'No game found under that code. Check it with your opponent.'
        : `Can't reach the matchmaking service (${msg}). Your connection or the broker may be down.`;
    }));
  }

  // ── Public API (App calls these) ──────────────────────────────────────────

  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };

  /** Host-only: edit lobby settings; every change streams to the guest.
   *  Legal while still waiting for the guest too — the hello handler sends the
   *  current settings, so anything staged before the knock still arrives. */
  setSettings(patch: Partial<LobbySettings>) {
    if (this.snap.role !== 'host' || this.snap.phase === 'playing') return;
    this.update(s => { s.settings = { ...s.settings, ...patch }; });
    this.send({ v: PROTOCOL_VERSION, type: 'lobby', settings: this.snap.settings });
  }

  setReady(ready: boolean) {
    if (this.snap.phase !== 'lobby') return;
    this.update(s => { s.selfReady = ready; });
    this.send({ v: PROTOCOL_VERSION, type: 'ready', ready });
    this.maybeStart();
  }

  resign() {
    if (this.snap.phase !== 'playing') return;
    this.send({ v: PROTOCOL_VERSION, type: 'resign', team: this.snap.role });
    this.update(s => { s.resignedBy = s.role; });
  }

  /** Which side this client commands, as a plain team string. */
  localTeam(): 'WEST' | 'EAST' {
    const host = (this.snap.config ?? this.snap.settings).hostTeam;
    const other = host === 'WEST' ? 'EAST' : 'WEST';
    return this.snap.role === 'host' ? host : other;
  }

  /** GameCanvas checkpoint hook — ship our hash to the peer. */
  reportChecksum = (tick: number, hash: number) => {
    this.send({ v: PROTOCOL_VERSION, type: 'checksum', tick, hash });
  };

  /** GameCanvas found a mismatched checkpoint — surface the diverged screen. */
  markDesync = (tick: number) => this.update(s => { s.desyncTick = tick; });

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.send({ v: PROTOCOL_VERSION, type: 'bye' }); } catch { /* link may be gone */ }
    this.transport.close();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private send(m: NetMsg) { this.transport.send(m); }

  private update(fn: (draft: OnlineSnapshot) => void) {
    const draft = { ...this.snap };
    fn(draft);
    this.snap = draft;
    this.listeners.forEach(cb => cb());
  }

  private startPing() {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      this.send({ v: PROTOCOL_VERSION, type: 'ping', sentAt: performance.now() });
      // Heartbeat: a peer can vanish WITHOUT a close event — a tab killed
      // mid-frame, a NAT mapping that silently died, the loopback channel's
      // other side gone. Pings flow every 2s, so >10s of total silence means
      // the peer is unreachable (spec §4.5's ten-second rule).
      if (this.lastHeardMs && !this.snap.peerLeft &&
          Date.now() - this.lastHeardMs > 10000) {
        this.update(s => { s.peerLeft = true; });
      }
    }, 2000);
  }

  private maybeStart() {
    const s = this.snap;
    if (s.role !== 'host' || s.phase !== 'lobby' || !s.selfReady || !s.peerReady) return;
    const config: MatchConfig = {
      ...s.settings,
      seed: randomSeed(),
      stepTicks: STEP_TICKS,
      inputDelaySteps: INPUT_DELAY_STEPS,
    };
    this.send({ v: PROTOCOL_VERSION, type: 'start', config });
    this.beginMatch(config);
  }

  private beginMatch(config: MatchConfig) {
    this.scheduler = new LockstepScheduler({
      role: this.snap.role,
      stepTicks: config.stepTicks,
      delaySteps: config.inputDelaySteps,
      send: (step, commands) => this.send({ v: PROTOCOL_VERSION, type: 'cmds', step, commands }),
    });
    this.update(s => { s.config = config; s.phase = 'playing'; });
  }

  private onMsg(m: NetMsg) {
    this.lastHeardMs = Date.now();
    if (m.v !== PROTOCOL_VERSION) {
      this.update(s => { s.error = 'Protocol mismatch — both players should hard-refresh to the latest version.'; });
      return;
    }
    switch (m.type) {
      case 'hello':
        if (this.snap.role !== 'host') return;
        if (m.build !== BUILD_ID) {
          this.send({ v: PROTOCOL_VERSION, type: 'reject', reason: 'version' });
          this.update(s => { s.error = 'Opponent is on a different game version — both players should hard-refresh.'; });
          return;
        }
        this.send({ v: PROTOCOL_VERSION, type: 'welcome', build: BUILD_ID });
        this.send({ v: PROTOCOL_VERSION, type: 'lobby', settings: this.snap.settings });
        this.update(s => { s.phase = 'lobby'; });
        this.startPing();
        break;
      case 'welcome':
        if (m.build !== BUILD_ID) {
          this.update(s => { s.error = 'Host is on a different game version — both players should hard-refresh.'; });
          return;
        }
        this.update(s => { s.phase = 'lobby'; });
        this.startPing();
        break;
      case 'reject':
        this.update(s => {
          s.error = m.reason === 'version'
            ? 'Host is on a different game version — both players should hard-refresh.'
            : `Host declined the connection (${m.reason}).`;
        });
        break;
      case 'lobby':
        if (this.snap.role === 'guest') this.update(s => { s.settings = m.settings; });
        break;
      case 'ready':
        this.update(s => { s.peerReady = m.ready; });
        this.maybeStart();
        break;
      case 'start':
        if (this.snap.role === 'guest') this.beginMatch(m.config);
        break;
      case 'cmds':
        this.scheduler?.onRemote(m.step, m.commands);
        break;
      case 'checksum':
        this.peerChecksums[m.tick] = m.hash;
        break;
      case 'ping':
        this.send({ v: PROTOCOL_VERSION, type: 'pong', sentAt: m.sentAt });
        break;
      case 'pong':
        this.update(s => { s.pingMs = Math.max(0, Math.round(performance.now() - m.sentAt)); });
        break;
      case 'resign':
        this.update(s => { s.resignedBy = s.role === 'host' ? 'guest' : 'host'; });
        break;
      case 'bye':
        this.update(s => { s.peerLeft = true; });
        break;
    }
  }
}
