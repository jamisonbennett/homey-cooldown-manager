'use strict';

import { canonicalKey } from './flow-key';

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
    return this.store.getState()[canonicalKey(key)];
  }

  /**
   * Atomically allow execution when the cooldown has elapsed.
   * Updates lastRunAt when allowed.
   */
  tryAllow(key: string, durationMs: number, now: number): boolean {
    if (durationMs <= 0) {
      return false;
    }

    const normalizedKey = canonicalKey(key);
    const state = this.store.getState();
    const entry = state[normalizedKey] ?? { lastRunAt: null };

    if (entry.lastRunAt === null || (now - entry.lastRunAt) >= durationMs) {
      state[normalizedKey] = { lastRunAt: now };
      this.store.setState(state);
      return true;
    }

    return false;
  }

  reset(key: string): void {
    const state = this.store.getState();
    state[canonicalKey(key)] = { lastRunAt: null };
    this.store.setState(state);
  }

  /**
   * Mark the cooldown as active without allowing a Flow to continue.
   */
  suspend(key: string, now: number): void {
    const state = this.store.getState();
    state[canonicalKey(key)] = { lastRunAt: now };
    this.store.setState(state);
  }

  /**
   * Drop keys no longer used in Flows and ensure every used key exists in state
   * (with `lastRunAt: null` when it has never triggered).
   */
  cleanup(usedKeys: ReadonlySet<string>): void {
    if (usedKeys.size === 0) {
      return;
    }

    const normalizedUsedKeys = new Set([...usedKeys].map(canonicalKey));
    const state = this.store.getState();
    let changed = false;

    for (const key of Object.keys(state)) {
      if (!normalizedUsedKeys.has(key)) {
        delete state[key];
        changed = true;
      }
    }

    for (const key of normalizedUsedKeys) {
      if (!state[key]) {
        state[key] = { lastRunAt: null };
        changed = true;
      }
    }

    if (changed) {
      this.store.setState(state);
    }
  }
}

export { loadCooldownState } from '../settings/load-cooldown-state.js';
