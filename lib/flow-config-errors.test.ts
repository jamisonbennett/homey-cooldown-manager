'use strict';

import {
  findFlowConfigErrors,
  type FlowConfigSnapshot,
} from './flow-config-errors';

function snapshot(
  allowOnceCards: FlowConfigSnapshot['allowOnceCards'],
  allowUpToCards: FlowConfigSnapshot['allowUpToCards'] = [],
  actionCards: FlowConfigSnapshot['actionCards'] = [],
  triggerCards: FlowConfigSnapshot['triggerCards'] = [],
  grantTokensCards: FlowConfigSnapshot['grantTokensCards'] = [],
): FlowConfigSnapshot {
  return {
    allowOnceCards, allowUpToCards, actionCards, grantTokensCards, triggerCards,
  };
}

describe('findFlowConfigErrors', () => {
  it('returns no errors for a consistent configuration', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
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

  it('flags invalid max times even when the same key has a valid card', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [
        {
          key: 'door',
          max_count: 3,
          duration: 30,
          duration_unit: 'minutes',
        },
        {
          key: 'door',
          max_count: 2.5,
          duration: 30,
          duration_unit: 'minutes',
        },
      ],
    ))).toEqual([
      {
        kind: 'allow_up_to_key_conflicting_limits',
        key: 'door',
        limits: [
          { maxCount: 3, duration: 30, unit: 'minutes' },
          { invalid: true },
        ],
      },
      {
        kind: 'allow_up_to_key_invalid_limit',
        key: 'door',
      },
    ]);
  });

  it('flags allow-up-to cards that share a key with different limits', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [
        {
          key: 'door',
          max_count: 3,
          duration: 30,
          duration_unit: 'minutes',
        },
        {
          key: 'door',
          max_count: 2,
          duration: 30,
          duration_unit: 'minutes',
        },
      ],
    ))).toEqual([
      {
        kind: 'allow_up_to_key_conflicting_limits',
        key: 'door',
        limits: [
          { maxCount: 2, duration: 30, unit: 'minutes' },
          { maxCount: 3, duration: 30, unit: 'minutes' },
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

  it('treats equivalent allow-up-to limits as consistent', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [
        {
          key: 'door',
          max_count: 3,
          duration: 60,
          duration_unit: 'minutes',
        },
        {
          key: 'door',
          max_count: 3,
          duration: 1,
          duration_unit: 'hours',
        },
      ],
    ))).toEqual([]);
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

  it('accepts Flow tag references for allow-once duration', () => {
    expect(findFlowConfigErrors(snapshot([
      {
        key: 'door',
        duration: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
        duration_unit: 'minutes',
      },
    ], [], [{ key: 'door' }]))).toEqual([]);
  });

  it('does not flag conflicting durations when tags are used', () => {
    expect(findFlowConfigErrors(snapshot([
      { key: 'door', duration: 5, duration_unit: 'minutes' },
      {
        key: 'door',
        duration: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
        duration_unit: 'minutes',
      },
    ]))).toEqual([]);
  });

  it('flags allow-up-to cards with fractional max times', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door', max_count: 2.5, duration: 5, duration_unit: 'minutes',
      }],
    ))).toEqual([
      {
        kind: 'allow_up_to_key_invalid_limit',
        key: 'door',
      },
    ]);
  });

  it('flags allow-up-to cards with missing or invalid limits', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door', max_count: 0, duration: 5, duration_unit: 'minutes',
      }],
    ))).toEqual([
      {
        kind: 'allow_up_to_key_invalid_limit',
        key: 'door',
      },
    ]);

    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door', max_count: 1.5, duration: 5, duration_unit: 'minutes',
      }],
    ))).toEqual([
      {
        kind: 'allow_up_to_key_invalid_limit',
        key: 'door',
      },
    ]);
  });

  it('accepts Flow tag references for max times and duration', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door',
        max_count: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
        duration: 5,
        duration_unit: 'minutes',
      }],
      [{ key: 'door' }],
    ))).toEqual([]);

    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door',
        max_count: 3,
        duration: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
        duration_unit: 'minutes',
      }],
      [{ key: 'door' }],
    ))).toEqual([]);
  });

  it('does not flag conflicting limits when tags are used', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [
        {
          key: 'door',
          max_count: 3,
          duration: 30,
          duration_unit: 'minutes',
        },
        {
          key: 'door',
          max_count: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
          duration: 30,
          duration_unit: 'minutes',
        },
      ],
    ))).toEqual([]);
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

  it('flags mixed interval and token-bucket cards unless max times is exactly 1', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [{
        key: 'door',
        max_count: 3,
        duration: 30,
        duration_unit: 'minutes',
      }],
    ))).toEqual([
      {
        kind: 'allow_key_mixed_card_types',
        key: 'door',
      },
    ]);

    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [{
        key: 'door',
        max_count: 1,
        duration: 30,
        duration_unit: 'minutes',
      }],
    ))).toEqual([]);
  });

  it('flags grant-tokens cards with missing or invalid token counts', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
      [],
      [],
      [{ key: 'door', token_count: 0 }],
    ))).toEqual([
      {
        kind: 'grant_tokens_key_invalid_token_count',
        key: 'door',
      },
    ]);

    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
      [],
      [],
      [{ key: 'door', token_count: 1.5 }],
    ))).toEqual([
      {
        kind: 'grant_tokens_key_invalid_token_count',
        key: 'door',
      },
    ]);
  });

  it('accepts Flow tag references for grant-tokens token count', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
      [],
      [],
      [{
        key: 'door',
        token_count: '[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]',
      }],
    ))).toEqual([]);
  });

  it('flags then-card keys that have no allow card', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
      [{ key: 'window' }],
    ))).toEqual([
      {
        kind: 'action_key_without_allow',
        key: 'window',
      },
    ]);
  });

  it('flags when-card keys that have no allow card', () => {
    expect(findFlowConfigErrors(snapshot(
      [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      [],
      [],
      [{ key: 'window', count: 3 }],
    ))).toEqual([
      {
        kind: 'trigger_key_without_allow',
        key: 'window',
      },
    ]);
  });

  it('accepts then and when cards that match allow-up-to cards', () => {
    expect(findFlowConfigErrors(snapshot(
      [],
      [{
        key: 'door',
        max_count: 3,
        duration: 5,
        duration_unit: 'minutes',
      }],
      [{ key: 'door' }],
      [{ key: 'door', count: 2 }],
    ))).toEqual([]);
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
      [],
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
      [],
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
