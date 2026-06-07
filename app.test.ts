'use strict';

/* eslint-disable camelcase -- mirrors Homey Flow card argument names */
/* eslint-disable import/first -- jest.mock must run before importing app.ts */

jest.mock('homey');

import { COOLDOWN_SETTINGS_KEY } from './lib/cooldown';
import CooldownManagerApp from './app';

type FlowCardArgumentValues = Array<Record<string, unknown>>;

type FlowCardMock = {
  getArgumentValues: jest.Mock<Promise<FlowCardArgumentValues>, []>;
  registerArgumentAutocompleteListener: jest.Mock;
  registerRunListener: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  trigger?: jest.Mock<Promise<void>, [Record<string, unknown>, Record<string, unknown>]>;
  runListener?: (
    args: Record<string, unknown>,
    state?: Record<string, unknown>,
  ) => Promise<unknown>;
  autocompleteListener?: (query: string) => Promise<unknown>;
};

type HomeyMockOptions = {
  timezone?: string;
  language?: string;
  allowCards?: FlowCardArgumentValues;
  allowUpToCards?: FlowCardArgumentValues;
  resetCards?: FlowCardArgumentValues;
  suspendCards?: FlowCardArgumentValues;
  resetTokenCards?: FlowCardArgumentValues;
  grantTokenCards?: FlowCardArgumentValues;
  grantTokensCards?: FlowCardArgumentValues;
  triggerCards?: FlowCardArgumentValues;
  triggerAtLeastCards?: FlowCardArgumentValues;
  persistedState?: Record<string, {
    lastRunAt: number | null;
    blockCount?: number;
    usedCount?: number;
  }>;
};

type TimezoneChangeListener = (timezone: string) => void;

type UnloadListener = () => void;

function createFlowCardMock(argumentValues: FlowCardArgumentValues = []): FlowCardMock {
  const card: FlowCardMock = {
    getArgumentValues: jest.fn().mockResolvedValue(argumentValues),
    registerArgumentAutocompleteListener: jest.fn((name, listener) => {
      if (name === 'key') {
        card.autocompleteListener = listener;
      }
    }),
    registerRunListener: jest.fn((listener) => {
      card.runListener = listener;
    }),
    on: jest.fn(),
    off: jest.fn(),
  };

  return card;
}

function createHomeyMock(options: HomeyMockOptions = {}) {
  const settings = new Map<string, unknown>();
  if (options.persistedState) {
    settings.set(COOLDOWN_SETTINGS_KEY, options.persistedState);
  }

  const allowOnceCard = createFlowCardMock(options.allowCards ?? []);
  const allowUpToCard = createFlowCardMock(options.allowUpToCards ?? []);
  const resetCooldownCard = createFlowCardMock(options.resetCards ?? []);
  const suspendCooldownCard = createFlowCardMock(options.suspendCards ?? []);
  const resetTokenCountCard = createFlowCardMock(options.resetTokenCards ?? []);
  const grantTokenCard = createFlowCardMock(options.grantTokenCards ?? []);
  const grantTokensCard = createFlowCardMock(options.grantTokensCards ?? []);
  const blockedCountReachedCard = createFlowCardMock(options.triggerCards ?? []);
  blockedCountReachedCard.trigger = jest.fn().mockResolvedValue(undefined);
  const blockedCountAtLeastCard = createFlowCardMock(options.triggerAtLeastCards ?? []);
  blockedCountAtLeastCard.trigger = jest.fn().mockResolvedValue(undefined);

  const timezoneListeners = new Map<string, TimezoneChangeListener>();
  const homeyListeners = new Map<string, UnloadListener>();

  const translations: Record<string, string> = {
    'errors.key_required': 'A cooldown key is required.',
    'errors.duration_required': 'A cooldown duration is required.',
    'errors.duration_invalid': 'Cooldown duration must be greater than 0.',
    'errors.max_count_invalid': 'Max times must be a whole number of 1 or greater.',
    'errors.token_count_invalid': 'Times must be a whole number of 1 or greater.',
    'autocomplete.create_key': 'Create new key',
    'autocomplete.never_run': 'Never run',
    'autocomplete.last_run': 'Last run: __time__',
  };

  const homey = {
    clock: {
      getTimezone: jest.fn().mockResolvedValue(options.timezone ?? 'America/Denver'),
      on: jest.fn((event: string, listener: (timezone: string) => void) => {
        timezoneListeners.set(event, listener);
      }),
    },
    settings: {
      get: jest.fn((key: string) => settings.get(key)),
      set: jest.fn((key: string, value: unknown) => {
        settings.set(key, value);
      }),
    },
    flow: {
      getConditionCard: jest.fn((id: string) => {
        if (id === 'allow_once') {
          return allowOnceCard;
        }
        if (id === 'allow_up_to') {
          return allowUpToCard;
        }
        throw new Error(`Unknown condition card: ${id}`);
      }),
      getActionCard: jest.fn((id: string) => {
        if (id === 'reset_cooldown') {
          return resetCooldownCard;
        }
        if (id === 'suspend_cooldown') {
          return suspendCooldownCard;
        }
        if (id === 'reset_token_count') {
          return resetTokenCountCard;
        }
        if (id === 'grant_token') {
          return grantTokenCard;
        }
        if (id === 'grant_tokens') {
          return grantTokensCard;
        }
        throw new Error(`Unknown action card: ${id}`);
      }),
      getTriggerCard: jest.fn((id: string) => {
        if (id === 'blocked_count_reached') {
          return blockedCountReachedCard;
        }
        if (id === 'blocked_count_at_least') {
          return blockedCountAtLeastCard;
        }
        throw new Error(`Unknown trigger card: ${id}`);
      }),
    },
    i18n: {
      getLanguage: jest.fn().mockReturnValue(options.language ?? 'en'),
    },
    __: jest.fn((key: string, tokens?: Record<string, string>) => {
      let message = translations[key] ?? key;
      if (tokens) {
        for (const [token, value] of Object.entries(tokens)) {
          message = message.replace(`__${token}__`, value);
        }
      }
      return message;
    }),
    on: jest.fn((event: string, listener: () => void) => {
      homeyListeners.set(event, listener);
    }),
  };

  return {
    homey,
    allowOnceCard,
    allowUpToCard,
    resetCooldownCard,
    suspendCooldownCard,
    resetTokenCountCard,
    grantTokenCard,
    grantTokensCard,
    blockedCountReachedCard,
    blockedCountAtLeastCard,
    settings,
    timezoneListeners,
    homeyListeners,
  };
}

async function createInitializedApp(options: HomeyMockOptions = {}) {
  const mocks = createHomeyMock(options);
  const app = new CooldownManagerApp();
  app.homey = mocks.homey as never;
  await app.onInit();
  return { app, ...mocks };
}

describe('CooldownManagerApp', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes flow cards and display context', async () => {
    const {
      app,
      allowOnceCard,
      allowUpToCard,
      resetCooldownCard,
      suspendCooldownCard,
      resetTokenCountCard,
      grantTokenCard,
      grantTokensCard,
      blockedCountReachedCard,
      blockedCountAtLeastCard,
    } = await createInitializedApp({
      timezone: 'Europe/Oslo',
      language: 'en',
    });

    expect(allowOnceCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(allowUpToCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(blockedCountReachedCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(blockedCountAtLeastCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(allowOnceCard.registerArgumentAutocompleteListener).toHaveBeenCalledWith(
      'key',
      expect.any(Function),
    );
    expect(resetCooldownCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(suspendCooldownCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(resetTokenCountCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(grantTokenCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(grantTokensCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(app.getDisplayContext()).toEqual({
      timezone: 'Europe/Oslo',
      language: 'en',
    });
  });

  it('updates display timezone when the hub timezone changes', async () => {
    const { app, timezoneListeners } = await createInitializedApp();

    timezoneListeners.get('timezoneChange')?.('Europe/Oslo');

    expect(app.getDisplayContext().timezone).toBe('Europe/Oslo');
  });

  it('lists triggers from Flow cards with persisted cooldown state', async () => {
    const { app } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      resetCards: [{ key: 'window' }],
      suspendCards: [{ key: 'garage' }],
      persistedState: {
        door: { lastRunAt: 1_000, blockCount: 2 },
        window: { lastRunAt: null },
      },
    });

    await expect(app.getTriggers()).resolves.toEqual([
      {
        key: 'door', lastRunAt: 1_000, blockCount: 2, usedCount: 0,
      },
      {
        key: 'garage', lastRunAt: null, blockCount: 0, usedCount: 0,
      },
      {
        key: 'window', lastRunAt: null, blockCount: 0, usedCount: 0,
      },
    ]);
  });

  it('reports Flow configuration errors from registered cards', async () => {
    const { app } = await createInitializedApp({
      allowCards: [
        { key: 'door', duration: 5, duration_unit: 'minutes' },
        { key: 'door', duration: 10, duration_unit: 'minutes' },
      ],
      resetCards: [{ key: 'window' }],
      suspendCards: [],
    });

    await expect(app.getFlowConfigErrors()).resolves.toEqual([
      {
        kind: 'allow_key_conflicting_durations',
        key: 'door',
        durations: [
          { duration: 5, unit: 'minutes' },
          { duration: 10, unit: 'minutes' },
        ],
      },
      {
        kind: 'action_key_without_allow',
        key: 'window',
      },
    ]);
  });

  it('runs the allow-once condition through the cooldown manager', async () => {
    const {
      app,
      allowOnceCard,
      blockedCountReachedCard,
      blockedCountAtLeastCard,
      settings,
    } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      triggerCards: [{ key: 'door', count: 2 }],
    });

    const runAllowOnce = allowOnceCard.runListener!;
    const args = { key: 'door', duration: 5, duration_unit: 'minutes' };

    await expect(runAllowOnce(args)).resolves.toBe(true);
    await expect(runAllowOnce(args)).resolves.toBe(false);
    await expect(runAllowOnce(args)).resolves.toBe(false);
    const triggerPayload = [
      { block_count: 2 },
      { key: 'door', count: 2 },
    ] as const;

    expect(blockedCountReachedCard.trigger).toHaveBeenLastCalledWith(...triggerPayload);
    expect(blockedCountAtLeastCard.trigger).toHaveBeenLastCalledWith(...triggerPayload);

    jest.setSystemTime(new Date('2024-06-01T12:06:00.000Z'));
    await expect(runAllowOnce(args)).resolves.toBe(true);

    expect(settings.get(COOLDOWN_SETTINGS_KEY)).toEqual({
      door: {
        lastRunAt: Date.parse('2024-06-01T12:06:00.000Z'),
        blockCount: 0,
        usedCount: 1,
      },
    });
    await expect(app.getTriggers()).resolves.toEqual([
      {
        key: 'door',
        lastRunAt: Date.parse('2024-06-01T12:06:00.000Z'),
        blockCount: 0,
        usedCount: 1,
      },
    ]);
  });

  it('filters exact blocked-count trigger flows by key and count', async () => {
    const { blockedCountReachedCard } = await createInitializedApp({
      triggerCards: [{ key: 'door', count: 3 }],
    });

    const runTrigger = blockedCountReachedCard.runListener!;

    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 3 }))
      .resolves.toBe(true);
    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 5 }))
      .resolves.toBe(false);
    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 2 }))
      .resolves.toBe(false);
    await expect(runTrigger({ key: 'window', count: 3 }, { key: 'door', count: 3 }))
      .resolves.toBe(false);
  });

  it('filters at-least blocked-count trigger flows by key and minimum threshold', async () => {
    const { blockedCountAtLeastCard } = await createInitializedApp({
      triggerAtLeastCards: [{ key: 'door', count: 3 }],
    });

    const runTrigger = blockedCountAtLeastCard.runListener!;

    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 3 }))
      .resolves.toBe(true);
    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 5 }))
      .resolves.toBe(true);
    await expect(runTrigger({ key: 'door', count: 3 }, { key: 'door', count: 2 }))
      .resolves.toBe(false);
    await expect(runTrigger({ key: 'window', count: 3 }, { key: 'door', count: 5 }))
      .resolves.toBe(false);
  });

  it('resets and suspends cooldowns through action cards', async () => {
    const { allowOnceCard, resetCooldownCard, suspendCooldownCard } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
    });

    const runAllowOnce = allowOnceCard.runListener!;
    const args = { key: 'door', duration: 5, duration_unit: 'minutes' };

    await runAllowOnce(args);
    await expect(runAllowOnce(args)).resolves.toBe(false);

    await resetCooldownCard.runListener!({ key: 'door' });
    await expect(runAllowOnce(args)).resolves.toBe(true);

    await runAllowOnce(args);
    await expect(runAllowOnce(args)).resolves.toBe(false);

    await suspendCooldownCard.runListener!({ key: 'door' });
    await expect(runAllowOnce(args)).resolves.toBe(false);
  });

  it('validates flow card arguments before running', async () => {
    const { allowOnceCard, allowUpToCard } = await createInitializedApp();

    await expect(allowOnceCard.runListener!({ key: '  ', duration: 5, duration_unit: 'minutes' }))
      .rejects.toThrow('A cooldown key is required.');
    await expect(allowOnceCard.runListener!({ key: 'door', duration: 0, duration_unit: 'minutes' }))
      .rejects.toThrow('A cooldown duration is required.');
    await expect(allowOnceCard.runListener!({ key: 'door', duration: 5, duration_unit: 'weeks' }))
      .rejects.toThrow('A cooldown duration is required.');
    await expect(allowUpToCard.runListener!({
      key: 'door',
      max_count: 2.5,
      duration: 5,
      duration_unit: 'minutes',
    })).rejects.toThrow('Max times must be a whole number of 1 or greater.');
  });

  it('autocompletes keys from Flow usage and stored state', async () => {
    const { allowOnceCard } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      resetCards: [{ key: 'window' }],
      persistedState: {
        attic: { lastRunAt: 1_000 },
      },
    });

    await allowOnceCard.runListener!({
      key: 'door',
      duration: 5,
      duration_unit: 'minutes',
    });

    const results = await allowOnceCard.autocompleteListener!('');
    expect(results).toEqual([
      {
        name: 'attic',
        id: 'attic',
        description: expect.any(String),
      },
      {
        name: 'door',
        id: 'door',
        description: 'Last run: 6/1/24, 6:00:00 AM',
      },
      {
        name: 'window',
        id: 'window',
        description: 'Never run',
      },
    ]);
  });

  it('offers to create a new autocomplete key', async () => {
    const { allowOnceCard } = await createInitializedApp();

    await expect(allowOnceCard.autocompleteListener!('New_Key')).resolves.toEqual([
      {
        name: 'new_key',
        id: 'new_key',
        description: 'Create new key',
      },
    ]);
  });

  it('cleans up unused keys when a Flow card updates', async () => {
    jest.useRealTimers();

    const { allowOnceCard, settings } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
      persistedState: {
        door: { lastRunAt: 1_000 },
        orphaned: { lastRunAt: null },
      },
    });

    const updateListener = allowOnceCard.on.mock.calls.find(([event]) => event === 'update')?.[1];
    expect(updateListener).toEqual(expect.any(Function));

    updateListener();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    expect(settings.get(COOLDOWN_SETTINGS_KEY)).toEqual({
      door: { lastRunAt: 1_000, blockCount: 0, usedCount: 0 },
    });

    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  it('unregisters Flow card listeners on teardown', async () => {
    const {
      app,
      allowOnceCard,
      allowUpToCard,
      resetCooldownCard,
      suspendCooldownCard,
      resetTokenCountCard,
      grantTokenCard,
      grantTokensCard,
      blockedCountReachedCard,
      blockedCountAtLeastCard,
    } = await createInitializedApp();

    const cleanup = allowOnceCard.on.mock.calls.find(([event]) => event === 'update')?.[1];
    await app.onUninit();

    expect(allowOnceCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(allowUpToCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(resetCooldownCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(suspendCooldownCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(resetTokenCountCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(grantTokenCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(grantTokensCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(blockedCountReachedCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(blockedCountAtLeastCard.off).toHaveBeenCalledWith('update', cleanup);
  });

  it('runs the allow-up-to condition through the cooldown manager', async () => {
    const {
      app,
      allowUpToCard,
      resetTokenCountCard,
      blockedCountReachedCard,
      settings,
    } = await createInitializedApp({
      allowUpToCards: [{
        key: 'door',
        max_count: 2,
        duration: 5,
        duration_unit: 'minutes',
      }],
      triggerCards: [{ key: 'door', count: 1 }],
    });

    const runAllowUpTo = allowUpToCard.runListener!;
    const args = {
      key: 'door',
      max_count: 2,
      duration: 5,
      duration_unit: 'minutes',
    };

    await expect(runAllowUpTo(args)).resolves.toBe(true);
    await expect(runAllowUpTo(args)).resolves.toBe(true);
    await expect(runAllowUpTo(args)).resolves.toBe(false);

    expect(blockedCountReachedCard.trigger).toHaveBeenLastCalledWith(
      { block_count: 1 },
      { key: 'door', count: 1 },
    );

    expect(settings.get(COOLDOWN_SETTINGS_KEY)).toEqual({
      door: {
        lastRunAt: Date.parse('2024-06-01T12:00:00.000Z'),
        blockCount: 1,
        usedCount: 2,
      },
    });

    await resetTokenCountCard.runListener!({ key: 'door' });
    await expect(runAllowUpTo(args)).resolves.toBe(true);
    await expect(app.getTriggers()).resolves.toEqual([
      {
        key: 'door',
        lastRunAt: Date.parse('2024-06-01T12:00:00.000Z'),
        blockCount: 0,
        usedCount: 1,
      },
    ]);
  });

  it('runs the grant-tokens action through the cooldown manager', async () => {
    const {
      app,
      allowUpToCard,
      grantTokensCard,
      settings,
    } = await createInitializedApp({
      allowUpToCards: [{
        key: 'door',
        max_count: 5,
        duration: 5,
        duration_unit: 'minutes',
      }],
    });

    const runAllowUpTo = allowUpToCard.runListener!;
    const args = {
      key: 'door',
      max_count: 5,
      duration: 5,
      duration_unit: 'minutes',
    };

    for (let i = 0; i < 4; i += 1) {
      await expect(runAllowUpTo(args)).resolves.toBe(true);
    }

    await grantTokensCard.runListener!({ key: 'door', token_count: 2 });

    expect(settings.get(COOLDOWN_SETTINGS_KEY)).toEqual({
      door: {
        lastRunAt: Date.parse('2024-06-01T12:00:00.000Z'),
        blockCount: 0,
        usedCount: 2,
      },
    });
    await expect(runAllowUpTo(args)).resolves.toBe(true);
    await expect(app.getTriggers()).resolves.toEqual([
      {
        key: 'door',
        lastRunAt: Date.parse('2024-06-01T12:00:00.000Z'),
        blockCount: 0,
        usedCount: 3,
      },
    ]);
  });
});
