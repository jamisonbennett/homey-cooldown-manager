'use strict';

import {
  CooldownManager,
  loadCooldownState,
  type CooldownState,
  type CooldownStore,
} from './cooldown';
import normalizeKey from './flow-key';

class MemoryCooldownStore implements CooldownStore {
  private state: CooldownState = {};

  getState(): CooldownState {
    return { ...this.state };
  }

  setState(state: CooldownState): void {
    this.state = { ...state };
  }
}

describe('normalizeKey', () => {
  it('returns trimmed lowercase strings', () => {
    expect(normalizeKey('  Hall_Motion_Alert  ')).toBe('hall_motion_alert');
  });

  it('returns null for empty strings', () => {
    expect(normalizeKey('   ')).toBeNull();
  });

  it('reads autocomplete objects', () => {
    expect(normalizeKey({ name: 'Door_Alert' })).toBe('door_alert');
  });

  it('returns null for invalid values', () => {
    expect(normalizeKey(null)).toBeNull();
    expect(normalizeKey(42)).toBeNull();
  });
});

describe('loadCooldownState', () => {
  it('loads valid persisted state', () => {
    expect(loadCooldownState({
      hall_motion_alert: { lastRunAt: 1000 },
      reset_key: { lastRunAt: null },
    })).toEqual({
      hall_motion_alert: { lastRunAt: 1000 },
      reset_key: { lastRunAt: null },
    });
  });

  it('ignores invalid entries', () => {
    expect(loadCooldownState({
      valid: { lastRunAt: 1000 },
      invalid: { lastRunAt: 'nope' },
      broken: 'value',
    })).toEqual({
      valid: { lastRunAt: 1000 },
    });
  });

  it('returns an empty object for invalid payloads', () => {
    expect(loadCooldownState(null)).toEqual({});
    expect(loadCooldownState([])).toEqual({});
  });

  it('canonicalizes keys and merges case-insensitive duplicates', () => {
    expect(loadCooldownState({
      Door: { lastRunAt: 1_000 },
      door: { lastRunAt: 2_000 },
      '  Hall  ': { lastRunAt: null },
    })).toEqual({
      door: { lastRunAt: 2_000 },
      hall: { lastRunAt: null },
    });
  });
});

describe('CooldownManager', () => {
  let manager: CooldownManager;

  beforeEach(() => {
    manager = new CooldownManager(new MemoryCooldownStore());
  });

  it('allows the first execution and records the timestamp', () => {
    expect(manager.tryAllow('hall_motion_alert', 600_000, 1_000)).toBe(true);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 1_000 });
  });

  it('treats keys as case-insensitive', () => {
    manager.tryAllow('Door', 600_000, 1_000);

    expect(manager.tryAllow('door', 600_000, 1_001)).toBe(false);
    expect(manager.getEntry('DOOR')).toEqual({ lastRunAt: 1_000 });
  });

  it('blocks execution while the cooldown is active', () => {
    manager.tryAllow('hall_motion_alert', 600_000, 1_000);

    expect(manager.tryAllow('hall_motion_alert', 600_000, 600_999)).toBe(false);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 1_000 });
  });

  it('allows execution after the cooldown duration has elapsed', () => {
    manager.tryAllow('hall_motion_alert', 600_000, 1_000);

    expect(manager.tryAllow('hall_motion_alert', 600_000, 601_001)).toBe(true);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 601_001 });
  });

  it('rejects invalid durations', () => {
    expect(manager.tryAllow('hall_motion_alert', 0, 1_000)).toBe(false);
    expect(manager.getEntry('hall_motion_alert')).toBeUndefined();
  });

  it('reset clears the cooldown immediately', () => {
    manager.tryAllow('hall_motion_alert', 600_000, 1_000);
    manager.reset('hall_motion_alert');

    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: null });
    expect(manager.tryAllow('hall_motion_alert', 600_000, 1_001)).toBe(true);
  });

  it('suspend marks the cooldown as active without allowing execution', () => {
    manager.suspend('hall_motion_alert', 5_000);

    expect(manager.tryAllow('hall_motion_alert', 600_000, 5_001)).toBe(false);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 5_000 });
  });

  it('cleanup matches used keys case-insensitively', () => {
    manager.tryAllow('Used_Key', 600_000, 1_000);
    manager.tryAllow('unused_key', 600_000, 1_000);

    manager.cleanup(new Set(['used_key']));

    expect(manager.getKeys()).toEqual(['used_key']);
    expect(manager.getEntry('USED_KEY')).toEqual({ lastRunAt: 1_000 });
    expect(manager.getEntry('unused_key')).toBeUndefined();
  });

  it('cleanup removes keys that are not used in any Flow', () => {
    manager.tryAllow('used_key', 600_000, 1_000);
    manager.tryAllow('unused_key', 600_000, 1_000);

    manager.cleanup(new Set(['used_key']));

    expect(manager.getKeys()).toEqual(['used_key']);
    expect(manager.getEntry('unused_key')).toBeUndefined();
  });

  it('cleanup adds flow keys that have never run', () => {
    manager.cleanup(new Set(['new_flow_key']));

    expect(manager.getKeys()).toEqual(['new_flow_key']);
    expect(manager.getEntry('new_flow_key')).toEqual({ lastRunAt: null });
  });

  it('cleanup does not overwrite existing entries when adding flow keys', () => {
    manager.tryAllow('used_key', 600_000, 1_000);

    manager.cleanup(new Set(['used_key', 'new_flow_key']));

    expect(manager.getEntry('used_key')).toEqual({ lastRunAt: 1_000 });
    expect(manager.getEntry('new_flow_key')).toEqual({ lastRunAt: null });
  });

  it('cleanup removes never-run keys that are no longer referenced', () => {
    manager.reset('orphaned_key');

    manager.cleanup(new Set(['active_key']));

    expect(manager.getKeys()).toEqual(['active_key']);
    expect(manager.getEntry('active_key')).toEqual({ lastRunAt: null });
    expect(manager.getEntry('orphaned_key')).toBeUndefined();
  });
});
