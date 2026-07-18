// Deterministic lockstep scheduler (plan.md §Phase 4).
//
// Time is divided into net-steps of `stepTicks` sim ticks. Commands a player
// issues during step N execute at step N + delaySteps — on BOTH clients, at
// the exact same tick. The sim may only advance into a step once both sides'
// command bundles for it have arrived; otherwise the loop holds (the renderer
// keeps drawing) and the UI shows "waiting for opponent".
//
// The class is pure bookkeeping: no timers, no transport of its own, no game
// knowledge beyond SimCommand being opaque JSON. GameCanvas drives it from
// the rAF loop; App wires its `send` to a Transport and feeds incoming
// `cmds` messages back in. That keeps it unit-testable without a browser.
//
// Cross-client ordering rule: within an execution step, the HOST's commands
// always run before the guest's. "Local vs remote" differs per client and
// would diverge the sims; host-before-guest is the same on both.

import type { SimCommand } from '../types';

export interface StepBundle { host?: SimCommand[]; guest?: SimCommand[] }

export class LockstepScheduler {
  readonly role: 'host' | 'guest';
  readonly stepTicks: number;
  readonly delaySteps: number;

  private outgoing: SimCommand[] = [];
  private steps = new Map<number, StepBundle>();
  private sentThrough = -1;      // highest exec step our bundle has been sent for
  private lowestKept = 0;        // GC watermark
  private send: (step: number, commands: SimCommand[]) => void;
  /** Wall-clock ms when the loop first found itself blocked (0 = not blocked) */
  waitingSince = 0;

  constructor(opts: {
    role: 'host' | 'guest';
    stepTicks: number;
    delaySteps: number;
    send: (step: number, commands: SimCommand[]) => void;
  }) {
    this.role = opts.role;
    this.stepTicks = opts.stepTicks;
    this.delaySteps = opts.delaySteps;
    this.send = opts.send;
    // Bootstrapping: nobody can have sent bundles for the first `delaySteps`
    // steps (they'd have had to be sent before the match existed). Both
    // clients agree they are empty.
    for (let s = 0; s < this.delaySteps; s++) this.steps.set(s, { host: [], guest: [] });
  }

  /** Queue a local intent; it rides the next outgoing bundle. */
  localInput(cmd: SimCommand) { this.outgoing.push(cmd); }

  /** Feed a peer 'cmds' message in. Idempotent (reliable channel may not dedupe a reconnect replay). */
  onRemote(step: number, commands: SimCommand[]) {
    const b = this.steps.get(step) ?? {};
    b[this.role === 'host' ? 'guest' : 'host'] ??= commands;
    this.steps.set(step, b);
  }

  private confirmedThrough(): number {
    let s = this.lowestKept;
    // Bundles arrive in order on a reliable channel, so scanning forward from
    // the watermark is O(new steps), not O(match length).
    while (true) {
      const b = this.steps.get(s);
      if (!b || !b.host || !b.guest) return s - 1;
      s++;
    }
  }

  /**
   * The loop is about to run `nextTick` (0-based). Returns how many ticks may
   * run right now (0 = hold). Also flushes our outgoing bundle for the step
   * this tick opens — sending even when empty is what lets the peer advance.
   */
  ticksAllowed(nextTick: number): number {
    const curStep = Math.floor(nextTick / this.stepTicks);
    // Flush our bundle(s) up to curStep + delay. The while covers held loops:
    // if we stalled, several flush points may have queued up.
    while (this.sentThrough < curStep + this.delaySteps) {
      const step = ++this.sentThrough;
      if (step < this.delaySteps) continue; // pre-agreed empty bootstrap steps
      const commands = step === curStep + this.delaySteps ? this.outgoing.splice(0) : [];
      const b = this.steps.get(step) ?? {};
      b[this.role] = commands;
      this.steps.set(step, b);
      this.send(step, commands);
    }
    const confirmed = this.confirmedThrough();
    const allowed = (confirmed + 1) * this.stepTicks - nextTick;
    if (allowed <= 0) {
      if (!this.waitingSince) this.waitingSince = Date.now();
      return 0;
    }
    this.waitingSince = 0;
    return allowed;
  }

  /** Commands to execute at `tick` (only step-opening ticks carry any). Host's first — same order on both clients. */
  commandsFor(tick: number): SimCommand[] {
    if (tick % this.stepTicks !== 0) return [];
    const b = this.steps.get(tick / this.stepTicks);
    if (!b) return [];
    return [...(b.host ?? []), ...(b.guest ?? [])];
  }

  /** Drop bundles the sim has fully executed (call occasionally with the current tick). */
  gc(executedTick: number) {
    const keepFrom = Math.floor(executedTick / this.stepTicks);
    for (; this.lowestKept < keepFrom; this.lowestKept++) this.steps.delete(this.lowestKept);
  }

  /** How far the peer is behind us in confirmed steps — drives the ping/stall UI. */
  status(nextTick: number) {
    const curStep = Math.floor(nextTick / this.stepTicks);
    return {
      confirmedStep: this.confirmedThrough(),
      currentStep: curStep,
      waitingMs: this.waitingSince ? Date.now() - this.waitingSince : 0,
    };
  }
}
