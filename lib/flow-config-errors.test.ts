'use strict';

/* eslint-disable camelcase -- mirrors Homey Flow card argument names */

import {
  findFlowConfigErrors,
  type FlowConfigSnapshot,
} from './flow-config-errors';

function snapshot(
  allowCards: FlowConfigSnapshot['allowCards'],
  actionCards: FlowConfigSnapshot['actionCards'] = [],
): FlowConfigSnapshot {
  return { allowCards, actionCards };
}

describe('findFlowConfigErrors', () => {
  it('returns no errors for a consistent configuration', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [{ key: 'door' }],
    ))).toEqual([]);
  });

  it('flags allow cards that share a key with different durations', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 5, duration_unit: 'minutes' },
      { key: 'door', duration: 10, duration_unit: 'minutes' },
    ]))).toEqual([
      {
        kind: 'allow_key_conflicting_durations',
        key: 'door',
        durations: [
          { duration: 5, unit: 'minutes' },
          { duration: 10, unit: 'minutes' },
        ],
      },
    ]);
  });

  it('treats equivalent durations as consistent', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 60, duration_unit: 'minutes' },
      { key: 'door', duration: 1, duration_unit: 'hours' },
    ]))).toEqual([]);
  });

  it('flags allow cards with missing or invalid duration', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 0, duration_unit: 'minutes' },
    ]))).toEqual([
      {
        kind: 'allow_key_invalid_duration',
        key: 'door',
      },
    ]);

    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 1.5, duration_unit: 'minutes' },
    ]))).toEqual([
      {
        kind: 'allow_key_invalid_duration',
        key: 'door',
      },
    ]);

    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 5, duration_unit: 'weeks' },
    ]))).toEqual([
      {
        kind: 'allow_key_invalid_duration',
        key: 'door',
      },
    ]);
  });

  it('does not duplicate invalid duration errors when mixed with valid durations', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 5, duration_unit: 'minutes' },
      { key: 'door', duration: 0, duration_unit: 'minutes' },
    ]))).toEqual([
      {
        kind: 'allow_key_conflicting_durations',
        key: 'door',
        durations: [
          { duration: 5, unit: 'minutes' },
          { invalid: true },
        ],
      },
    ]);
  });

  it('flags then-card keys that have no allow card', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [{ key: 'window' }],
    ))).toEqual([
      {
        kind: 'action_key_without_allow',
        key: 'window',
      },
    ]);
  });

  it('normalizes keys case-insensitively', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'Door', duration: 5, duration_unit: 'minutes' },
      { key: 'door', duration: 10, duration_unit: 'minutes' },
    ]))).toEqual([
      {
        kind: 'allow_key_conflicting_durations',
        key: 'door',
        durations: [
          { duration: 5, unit: 'minutes' },
          { duration: 10, unit: 'minutes' },
        ],
      },
    ]);

    expect(findFlowConfigErrors(snapshot(
      [{ key: 'Door', duration: 5, duration_unit: 'minutes' }],
      [{ key: 'door' }],
    ))).toEqual([]);
  });

  it('sorts errors deterministically', () => {
    expect(findFlowConfigErrors(snapshot(
      [
        { key: 'door', duration: 5, duration_unit: 'minutes' },
        { key: 'window', duration: 1, duration_unit: 'hours' },
        { key: 'window', duration: 30, duration_unit: 'minutes' },
      ],
      [{ key: 'garage' }, { key: 'attic' }],
    ))).toEqual([
      {
        kind: 'allow_key_conflicting_durations',
        key: 'window',
        durations: [
          { duration: 30, unit: 'minutes' },
          { duration: 1, unit: 'hours' },
        ],
      },
      {
        kind: 'action_key_without_allow',
        key: 'attic',
      },
      {
        kind: 'action_key_without_allow',
        key: 'garage',
      },
    ]);
  });
});
