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
  runListener?: (args: Record<string, unknown>) => Promise<unknown>;
  autocompleteListener?: (query: string) => Promise<unknown>;
};

type HomeyMockOptions = {
  timezone?: string;
  language?: string;
  allowCards?: FlowCardArgumentValues;
  resetCards?: FlowCardArgumentValues;
  suspendCards?: FlowCardArgumentValues;
  persistedState?: Record<string, { lastRunAt: number | null }>;
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
  const resetCooldownCard = createFlowCardMock(options.resetCards ?? []);
  const suspendCooldownCard = createFlowCardMock(options.suspendCards ?? []);

  const timezoneListeners = new Map<string, TimezoneChangeListener>();
  const homeyListeners = new Map<string, UnloadListener>();

  const translations: Record<string, string> = {
    'errors.key_required': 'A cooldown key is required.',
    'errors.duration_required': 'A cooldown duration is required.',
    'errors.duration_invalid': 'Cooldown duration must be greater than 0.',
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
        throw new Error(`Unknown condition card: ${id}`);
      }),
      getActionCard: jest.fn((id: string) => {
        if (id === 'reset_cooldown') {
          return resetCooldownCard;
        }
        if (id === 'suspend_cooldown') {
          return suspendCooldownCard;
        }
        throw new Error(`Unknown action card: ${id}`);
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
    resetCooldownCard,
    suspendCooldownCard,
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
      resetCooldownCard,
      suspendCooldownCard,
    } = await createInitializedApp({
      timezone: 'Europe/Oslo',
      language: 'en',
    });

    expect(allowOnceCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(allowOnceCard.registerArgumentAutocompleteListener).toHaveBeenCalledWith(
      'key',
      expect.any(Function),
    );
    expect(resetCooldownCard.registerRunListener).toHaveBeenCalledTimes(1);
    expect(suspendCooldownCard.registerRunListener).toHaveBeenCalledTimes(1);
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
        door: { lastRunAt: 1_000 },
        window: { lastRunAt: null },
      },
    });

    await expect(app.getTriggers()).resolves.toEqual([
      { key: 'door', lastRunAt: 1_000 },
      { key: 'garage', lastRunAt: null },
      { key: 'window', lastRunAt: null },
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
    const { app, allowOnceCard, settings } = await createInitializedApp({
      allowCards: [{ key: 'door', duration: 5, duration_unit: 'minutes' }],
    });

    const runAllowOnce = allowOnceCard.runListener!;
    const args = { key: 'door', duration: 5, duration_unit: 'minutes' };

    await expect(runAllowOnce(args)).resolves.toBe(true);
    await expect(runAllowOnce(args)).resolves.toBe(false);
    await expect(runAllowOnce(args)).resolves.toBe(false);

    jest.setSystemTime(new Date('2024-06-01T12:06:00.000Z'));
    await expect(runAllowOnce(args)).resolves.toBe(true);

    expect(settings.get(COOLDOWN_SETTINGS_KEY)).toEqual({
      door: { lastRunAt: Date.parse('2024-06-01T12:06:00.000Z') },
    });
    await expect(app.getTriggers()).resolves.toEqual([
      { key: 'door', lastRunAt: Date.parse('2024-06-01T12:06:00.000Z') },
    ]);
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
    const { allowOnceCard } = await createInitializedApp();

    await expect(allowOnceCard.runListener!({ key: '  ', duration: 5, duration_unit: 'minutes' }))
      .rejects.toThrow('A cooldown key is required.');
    await expect(allowOnceCard.runListener!({ key: 'door', duration: 0, duration_unit: 'minutes' }))
      .rejects.toThrow('A cooldown duration is required.');
    await expect(allowOnceCard.runListener!({ key: 'door', duration: 5, duration_unit: 'weeks' }))
      .rejects.toThrow('A cooldown duration is required.');
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
        description: expect.stringContaining('6:00 AM'),
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
      door: { lastRunAt: 1_000 },
    });

    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  it('unregisters Flow card listeners on teardown', async () => {
    const {
      app,
      allowOnceCard,
      resetCooldownCard,
      suspendCooldownCard,
    } = await createInitializedApp();

    const cleanup = allowOnceCard.on.mock.calls.find(([event]) => event === 'update')?.[1];
    await app.onUninit();

    expect(allowOnceCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(resetCooldownCard.off).toHaveBeenCalledWith('update', cleanup);
    expect(suspendCooldownCard.off).toHaveBeenCalledWith('update', cleanup);
  });
});
