'use strict';

import { canonicalKey } from './flow-key';
import InvalidCooldownDurationError from './invalid-cooldown-duration-error';
import { parseMaxCount } from './max-count';
import normalizeLastRunAt from './last-run-at.js';
import Mutex from './mutex';

export { default as InvalidCooldownDurationError } from './invalid-cooldown-duration-error';

export const COOLDOWN_SETTINGS_KEY = 'cooldownState';

/** Marks a key as suspended; blocks all allow-up-to checks until reset. */
export const SUSPENDED_USED_COUNT = -1;

export interface CooldownEntry {
  lastRunAt: number | null;
  blockCount: number;
  usedCount: number;
}

export type CooldownState = Record<string, CooldownEntry>;

export interface CooldownStore {
  getState(): CooldownState;
  setState(state: CooldownState): void;
}

function defaultEntry(): CooldownEntry {
  return { lastRunAt: null, blockCount: 0, usedCount: 0 };
}

function readEntry(existing: CooldownEntry | undefined): CooldownEntry {
  return {
    lastRunAt: existing?.lastRunAt ?? null,
    blockCount: existing?.blockCount ?? 0,
    usedCount: existing?.usedCount ?? 0,
  };
}

export class CooldownManager {
  private readonly store: CooldownStore;

  private readonly stateMutex = new Mutex();

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
   * Allow execution when the cooldown has elapsed, under an exclusive lock so
   * concurrent Flows cannot both pass for the same key. Updates lastRunAt and
   * usedCount when allowed.
   */
  tryAllow(key: string, durationMs: number, now: number): Promise<boolean> {
    return this.stateMutex.runExclusive(() => this.tryAllowUnlocked(key, durationMs, now));
  }

  private tryAllowUnlocked(key: string, durationMs: number, now: number): boolean {
    if (durationMs <= 0) {
      throw new InvalidCooldownDurationError();
    }

    const normalizedKey = canonicalKey(key);
    const state = this.store.getState();
    let entry = readEntry(state[normalizedKey]);
    const effectiveLastRunAt = normalizeLastRunAt(entry.lastRunAt, now);

    if (effectiveLastRunAt !== entry.lastRunAt) {
      const wasFuture = entry.lastRunAt !== null && entry.lastRunAt > now;
      entry = {
        ...entry,
        lastRunAt: effectiveLastRunAt,
        usedCount: wasFuture ? Math.max(entry.usedCount, 1) : entry.usedCount,
      };
      state[normalizedKey] = entry;
      this.store.setState(state);
    }

    if (entry.usedCount === SUSPENDED_USED_COUNT) {
      const blockCount = entry.blockCount + 1;
      state[normalizedKey] = {
        lastRunAt: effectiveLastRunAt,
        blockCount,
        usedCount: SUSPENDED_USED_COUNT,
      };
      this.store.setState(state);
      return false;
    }

    const windowExpired = effectiveLastRunAt === null
      || (now - effectiveLastRunAt) >= durationMs;

    if (windowExpired) {
      state[normalizedKey] = { lastRunAt: now, blockCount: 0, usedCount: 1 };
      this.store.setState(state);
      return true;
    }

    if (entry.usedCount < 1) {
      state[normalizedKey] = {
        lastRunAt: effectiveLastRunAt,
        blockCount: 0,
        usedCount: 1,
      };
      this.store.setState(state);
      return true;
    }

    const blockCount = entry.blockCount + 1;
    state[normalizedKey] = {
      lastRunAt: effectiveLastRunAt,
      blockCount,
      usedCount: entry.usedCount,
    };
    this.store.setState(state);
    return false;
  }

  /**
   * Allow execution up to maxCount times within a rolling window anchored at the
   * first allowed run in that window.
   */
  tryAllowUpTo(
    key: string,
    maxCount: number,
    durationMs: number,
    now: number,
  ): Promise<boolean> {
    return this.stateMutex.runExclusive(
      () => this.tryAllowUpToUnlocked(key, maxCount, durationMs, now),
    );
  }

  private tryAllowUpToUnlocked(
    key: string,
    maxCount: number,
    durationMs: number,
    now: number,
  ): boolean {
    if (durationMs <= 0 || parseMaxCount(maxCount) === null) {
      throw new InvalidCooldownDurationError();
    }

    const normalizedKey = canonicalKey(key);
    const state = this.store.getState();
    const entry = readEntry(state[normalizedKey]);
    const effectiveLastRunAt = normalizeLastRunAt(entry.lastRunAt, now);

    if (effectiveLastRunAt !== entry.lastRunAt) {
      state[normalizedKey] = { ...entry, lastRunAt: effectiveLastRunAt };
      this.store.setState(state);
    }

    if (entry.usedCount === SUSPENDED_USED_COUNT) {
      const blockCount = entry.blockCount + 1;
      state[normalizedKey] = {
        lastRunAt: effectiveLastRunAt,
        blockCount,
        usedCount: SUSPENDED_USED_COUNT,
      };
      this.store.setState(state);
      return false;
    }

    const windowExpired = effectiveLastRunAt === null
      || (now - effectiveLastRunAt) >= durationMs;

    if (windowExpired) {
      state[normalizedKey] = { lastRunAt: now, blockCount: 0, usedCount: 1 };
      this.store.setState(state);
      return true;
    }

    if (entry.usedCount >= maxCount) {
      const blockCount = entry.blockCount + 1;
      state[normalizedKey] = {
        lastRunAt: effectiveLastRunAt,
        blockCount,
        usedCount: entry.usedCount,
      };
      this.store.setState(state);
      return false;
    }

    state[normalizedKey] = {
      lastRunAt: effectiveLastRunAt,
      blockCount: 0,
      usedCount: entry.usedCount + 1,
    };
    this.store.setState(state);
    return true;
  }

  reset(key: string): Promise<void> {
    return this.stateMutex.runExclusive(() => {
      const state = this.store.getState();
      state[canonicalKey(key)] = defaultEntry();
      this.store.setState(state);
    });
  }

  /**
   * Mark the cooldown as active without allowing a Flow to continue.
   */
  suspend(key: string, now: number): Promise<void> {
    return this.stateMutex.runExclusive(() => {
      const state = this.store.getState();
      const existing = state[canonicalKey(key)];
      state[canonicalKey(key)] = {
        lastRunAt: now,
        blockCount: existing?.blockCount ?? 0,
        usedCount: SUSPENDED_USED_COUNT,
      };
      this.store.setState(state);
    });
  }

  resetTokenCount(key: string): Promise<void> {
    return this.stateMutex.runExclusive(() => {
      const state = this.store.getState();
      const normalizedKey = canonicalKey(key);
      const entry = readEntry(state[normalizedKey]);
      state[normalizedKey] = { ...entry, usedCount: 0 };
      this.store.setState(state);
    });
  }

  grantToken(key: string): Promise<void> {
    return this.grantTokens(key, 1);
  }

  grantTokens(key: string, count: number): Promise<void> {
    return this.stateMutex.runExclusive(() => {
      const state = this.store.getState();
      const normalizedKey = canonicalKey(key);
      const entry = readEntry(state[normalizedKey]);

      if (entry.usedCount === SUSPENDED_USED_COUNT || entry.usedCount <= 0) {
        return;
      }

      state[normalizedKey] = {
        ...entry,
        usedCount: Math.max(0, entry.usedCount - count),
      };
      this.store.setState(state);
    });
  }

  /**
   * Drop keys no longer used in Flows and ensure every used key exists in state
   * (with `lastRunAt: null` when it has never triggered).
   */
  cleanup(usedKeys: ReadonlySet<string>): Promise<void> {
    return this.stateMutex.runExclusive(() => {
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
          state[key] = defaultEntry();
          changed = true;
        }
      }

      if (changed) {
        this.store.setState(state);
      }
    });
  }
}

export { loadCooldownState } from '../settings/load-cooldown-state.js';
