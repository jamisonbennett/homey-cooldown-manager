'use strict';

import {
  CooldownManager,
  InvalidCooldownDurationError,
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

  it('reads autocomplete objects by name', () => {
    expect(normalizeKey({ name: 'Door_Alert' })).toBe('door_alert');
  });

  it('reads autocomplete objects by id when name is absent', () => {
    expect(normalizeKey({ id: 'Hall_Motion_Alert' })).toBe('hall_motion_alert');
  });

  it('prefers name over id when both are present', () => {
    expect(normalizeKey({ name: 'Door_Alert', id: 'other_key' })).toBe('door_alert');
  });

  it('falls back to id when name is empty', () => {
    expect(normalizeKey({ name: '', id: 'my_key' })).toBe('my_key');
  });

  it('returns null for invalid values', () => {
    expect(normalizeKey(null)).toBeNull();
    expect(normalizeKey(42)).toBeNull();
    expect(normalizeKey({ id: '   ' })).toBeNull();
    expect(normalizeKey({ id: 42 })).toBeNull();
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

  it('allows the first execution and records the timestamp', async () => {
    await expect(manager.tryAllow('hall_motion_alert', 600_000, 1_000)).resolves.toBe(true);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 1_000 });
  });

  it('treats keys as case-insensitive', async () => {
    await manager.tryAllow('Door', 600_000, 1_000);

    await expect(manager.tryAllow('door', 600_000, 1_001)).resolves.toBe(false);
    expect(manager.getEntry('DOOR')).toEqual({ lastRunAt: 1_000 });
  });

  it('blocks execution while the cooldown is active', async () => {
    await manager.tryAllow('hall_motion_alert', 600_000, 1_000);

    await expect(manager.tryAllow('hall_motion_alert', 600_000, 600_999)).resolves.toBe(false);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 1_000 });
  });

  it('allows execution after the cooldown duration has elapsed', async () => {
    await manager.tryAllow('hall_motion_alert', 600_000, 1_000);

    await expect(manager.tryAllow('hall_motion_alert', 600_000, 601_001)).resolves.toBe(true);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 601_001 });
  });

  it('rejects invalid durations', async () => {
    await expect(manager.tryAllow('hall_motion_alert', 0, 1_000)).rejects.toThrow(
      InvalidCooldownDurationError,
    );
    await expect(manager.tryAllow('hall_motion_alert', -1, 1_000)).rejects.toThrow(
      InvalidCooldownDurationError,
    );
    expect(manager.getEntry('hall_motion_alert')).toBeUndefined();
  });

  it('reset clears the cooldown immediately', async () => {
    await manager.tryAllow('hall_motion_alert', 600_000, 1_000);
    await manager.reset('hall_motion_alert');

    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: null });
    await expect(manager.tryAllow('hall_motion_alert', 600_000, 1_001)).resolves.toBe(true);
  });

  it('suspend marks the cooldown as active without allowing execution', async () => {
    await manager.suspend('hall_motion_alert', 5_000);

    await expect(manager.tryAllow('hall_motion_alert', 600_000, 5_001)).resolves.toBe(false);
    expect(manager.getEntry('hall_motion_alert')).toEqual({ lastRunAt: 5_000 });
  });

  it('allows only one concurrent tryAllow for the same key', async () => {
    const results = await Promise.all([
      manager.tryAllow('burst_sensor', 60_000, 1_000),
      manager.tryAllow('burst_sensor', 60_000, 1_000),
      manager.tryAllow('burst_sensor', 60_000, 1_000),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(manager.getEntry('burst_sensor')).toEqual({ lastRunAt: 1_000 });
  });

  it('cleanup removes all keys when no flow keys are known', async () => {
    await manager.tryAllow('stored_key', 600_000, 1_000);
    await manager.reset('never_run_key');

    await manager.cleanup(new Set());

    expect(manager.getKeys()).toEqual([]);
    expect(manager.getEntry('stored_key')).toBeUndefined();
    expect(manager.getEntry('never_run_key')).toBeUndefined();
  });

  it('cleanup matches used keys case-insensitively', async () => {
    await manager.tryAllow('Used_Key', 600_000, 1_000);
    await manager.tryAllow('unused_key', 600_000, 1_000);

    await manager.cleanup(new Set(['used_key']));

    expect(manager.getKeys()).toEqual(['used_key']);
    expect(manager.getEntry('USED_KEY')).toEqual({ lastRunAt: 1_000 });
    expect(manager.getEntry('unused_key')).toBeUndefined();
  });

  it('cleanup removes keys that are not used in any Flow', async () => {
    await manager.tryAllow('used_key', 600_000, 1_000);
    await manager.tryAllow('unused_key', 600_000, 1_000);

    await manager.cleanup(new Set(['used_key']));

    expect(manager.getKeys()).toEqual(['used_key']);
    expect(manager.getEntry('unused_key')).toBeUndefined();
  });

  it('cleanup adds flow keys that have never run', async () => {
    await manager.cleanup(new Set(['new_flow_key']));

    expect(manager.getKeys()).toEqual(['new_flow_key']);
    expect(manager.getEntry('new_flow_key')).toEqual({ lastRunAt: null });
  });

  it('cleanup does not overwrite existing entries when adding flow keys', async () => {
    await manager.tryAllow('used_key', 600_000, 1_000);

    await manager.cleanup(new Set(['used_key', 'new_flow_key']));

    expect(manager.getEntry('used_key')).toEqual({ lastRunAt: 1_000 });
    expect(manager.getEntry('new_flow_key')).toEqual({ lastRunAt: null });
  });

  it('cleanup removes never-run keys that are no longer referenced', async () => {
    await manager.reset('orphaned_key');

    await manager.cleanup(new Set(['active_key']));

    expect(manager.getKeys()).toEqual(['active_key']);
    expect(manager.getEntry('active_key')).toEqual({ lastRunAt: null });
    expect(manager.getEntry('orphaned_key')).toBeUndefined();
  });
});
