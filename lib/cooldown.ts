'use strict';

export const COOLDOWN_SETTINGS_KEY = 'cooldownState';

export interface CooldownEntry {
  lastRunAt: number | null;
}

export type CooldownState = Record<string, CooldownEntry>;

export interface CooldownStore {
  getState(): CooldownState;
  setState(state: CooldownState): void;
}

export class CooldownManager {
  private readonly store: CooldownStore;

  constructor(store: CooldownStore) {
    this.store = store;
  }

  getKeys(): string[] {
    return Object.keys(this.store.getState()).sort();
  }

  getEntry(key: string): CooldownEntry | undefined {
    return this.store.getState()[key];
  }

  /**
   * Atomically allow execution when the cooldown has elapsed.
   * Updates lastRunAt when allowed.
   */
  tryAllow(key: string, durationMs: number, now: number): boolean {
    if (durationMs <= 0) {
      return false;
    }

    const state = this.store.getState();
    const entry = state[key] ?? { lastRunAt: null };

    if (entry.lastRunAt === null || (now - entry.lastRunAt) >= durationMs) {
      state[key] = { lastRunAt: now };
      this.store.setState(state);
      return true;
    }

    return false;
  }

  reset(key: string): void {
    const state = this.store.getState();
    state[key] = { lastRunAt: null };
    this.store.setState(state);
  }

  /**
   * Mark the cooldown as active without allowing a Flow to continue.
   */
  suspend(key: string, now: number): void {
    const state = this.store.getState();
    state[key] = { lastRunAt: now };
    this.store.setState(state);
  }

  /**
   * Remove keys that are no longer referenced by any Flow card.
   */
  cleanup(usedKeys: ReadonlySet<string>): void {
    const state = this.store.getState();
    let changed = false;

    for (const key of Object.keys(state)) {
      if (!usedKeys.has(key)) {
        delete state[key];
        changed = true;
      }
    }

    if (changed) {
      this.store.setState(state);
    }
  }
}

export function loadCooldownState(raw: unknown): CooldownState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const state: CooldownState = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const { lastRunAt } = value as { lastRunAt?: unknown };
    if (lastRunAt === null) {
      state[key] = { lastRunAt: null };
    } else if (typeof lastRunAt === 'number' && Number.isFinite(lastRunAt)) {
      state[key] = { lastRunAt };
    }
  }

  return state;
}
