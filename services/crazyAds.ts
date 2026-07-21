// CrazyGames HTML5 SDK v3 integration (ads + gameplay lifecycle).
// Docs: https://docs.crazygames.com/sdk/
//
// Opt-OUT model, as requested. Whether the integration is active:
//   ?target=crazygames        → ON  (explicit; also handy for local ad testing)
//   ?target=<anything else>   → OFF (e.g. ?target=web for a clean GitHub Pages / itch build)
//   no ?target param          → ON in production builds, OFF on the dev server
// Defaulting OFF in dev keeps the headless e2e harness from ever pulling the
// external SDK script.
//
// The SDK reports SDK.environment as 'disabled' on any non-CrazyGames domain and
// THROWS on every method call there, so besides the enable flag we also gate every
// call on a live environment ('crazygames' or 'local').
import { soundService } from './audio';

const SDK_SRC = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
type CgEnv = 'local' | 'crazygames' | 'disabled' | 'none';

function resolveEnabled(): boolean {
  try {
    const t = new URLSearchParams(window.location.search).get('target');
    if (t != null) return t.toLowerCase() === 'crazygames';
    return !!(import.meta as any).env?.PROD;
  } catch {
    return false;
  }
}

class CrazyGamesAds {
  private enabled = typeof window !== 'undefined' && resolveEnabled();
  private ready = false;
  private env: CgEnv = 'none';
  private initP: Promise<void> | null = null;
  private ducked = false;

  /** True when the integration is switched on for this session (script may still be loading). */
  get isEnabled(): boolean { return this.enabled; }
  get environment(): CgEnv { return this.env; }
  /** True once the SDK is initialized in an environment that actually serves ads. */
  get available(): boolean { return this.live; }

  // Only these environments accept SDK method calls without throwing.
  private get live(): boolean { return this.ready && (this.env === 'crazygames' || this.env === 'local'); }
  private get sdk(): any | null {
    return (typeof window !== 'undefined' && (window as any).CrazyGames?.SDK) || null;
  }

  /** Load + initialize the SDK. Idempotent; a no-op (resolved) when disabled. */
  init(): Promise<void> {
    if (!this.enabled || typeof window === 'undefined') return Promise.resolve();
    if (this.initP) return this.initP;
    this.initP = this.loadScript()
      .then(() => (this.sdk ? this.sdk.init() : undefined))
      .then(() => {
        this.env = (this.sdk?.environment as CgEnv) ?? 'disabled';
        this.ready = true;
      })
      .catch(() => {
        // SDK blocked by an ad blocker, offline, or a load timeout — degrade silently.
        this.ready = false;
      });
    return this.initP;
  }

  private loadScript(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.sdk) return resolve();
      const prior = document.querySelector<HTMLScriptElement>('script[data-cg-sdk]');
      if (prior) {
        prior.addEventListener('load', () => resolve());
        prior.addEventListener('error', () => reject(new Error('CrazyGames SDK failed to load')));
        return;
      }
      const s = document.createElement('script');
      s.src = SDK_SRC;
      s.async = true;
      s.dataset.cgSdk = '1';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('CrazyGames SDK failed to load'));
      document.head.appendChild(s);
      window.setTimeout(() => reject(new Error('CrazyGames SDK load timeout')), 8000);
    });
  }

  private call(fn: () => void): void {
    if (this.live) {
      try { fn(); } catch { /* environment flipped / SDK quirk — ignore */ }
    }
  }

  // ── Gameplay lifecycle (telemetry; required for Full Launch) ────────────────
  loadingStop(): void { this.call(() => this.sdk.game.loadingStop()); }
  gameplayStart(): void { this.call(() => this.sdk.game.gameplayStart()); }
  gameplayStop(): void { this.call(() => this.sdk.game.gameplayStop()); }

  // ── Ads ─────────────────────────────────────────────────────────────────────
  /** Interstitial at a natural break. Resolves when the ad ends (or at once if unavailable). */
  midgame(): Promise<void> {
    if (!this.live) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let done = false;
      const end = () => { if (done) return; done = true; this.duck(false); resolve(); };
      try {
        this.sdk.ad.requestAd('midgame', {
          adStarted: () => this.duck(true),
          adFinished: end,
          adError: end,
        });
      } catch { end(); }
      window.setTimeout(end, 60000); // backstop if no callback ever fires
    });
  }

  /** Opt-in rewarded ad. Resolves TRUE only when the ad finished — grant the reward then. */
  rewarded(): Promise<boolean> {
    if (!this.live) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const settle = (ok: boolean) => { if (done) return; done = true; this.duck(false); resolve(ok); };
      try {
        this.sdk.ad.requestAd('rewarded', {
          adStarted: () => this.duck(true),
          adFinished: () => settle(true),
          adError: () => settle(false),
        });
      } catch { settle(false); }
      window.setTimeout(() => settle(false), 60000);
    });
  }

  private duck(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    try { soundService.duckForAd(on); } catch { /* audio may be unavailable */ }
  }
}

export const crazyAds = new CrazyGamesAds();
