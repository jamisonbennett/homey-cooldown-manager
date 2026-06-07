'use strict';

import Homey from 'homey';
import {
  COOLDOWN_SETTINGS_KEY,
  CooldownManager,
  InvalidCooldownDurationError,
  loadCooldownState,
  type CooldownStore,
} from './lib/cooldown';
import { durationToMs } from './lib/duration';
import formatLocalDateTime from './lib/format-local-datetime';
import {
  findFlowConfigErrors,
  type FlowConfigError,
} from './lib/flow-config-errors';
import normalizeKey, { canonicalKey } from './lib/flow-key';
import { parseMaxCount } from './lib/max-count';

const FLOW_CARD_IDS = {
  allowOnce: 'allow_once',
  allowUpTo: 'allow_up_to',
  resetCooldown: 'reset_cooldown',
  suspendCooldown: 'suspend_cooldown',
  resetTokenCount: 'reset_token_count',
  grantToken: 'grant_token',
  grantTokens: 'grant_tokens',
  blockedCountReached: 'blocked_count_reached',
  blockedCountAtLeast: 'blocked_count_at_least',
} as const;

const BLOCK_COUNT_TRIGGER_CARD_IDS = [
  FLOW_CARD_IDS.blockedCountReached,
  FLOW_CARD_IDS.blockedCountAtLeast,
] as const;

class CooldownManagerApp extends Homey.App {
  private cooldownManager!: CooldownManager;

  private timezone = 'UTC';

  private flowCardsCleanup?: () => void;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.timezone = await this.homey.clock.getTimezone();
    this.homey.clock.on('timezoneChange', (timezone: string) => {
      this.timezone = timezone;
    });

    this.cooldownManager = new CooldownManager(this.createSettingsStore());
    await this.registerFlowCards();

    // onUninit is not always called on dev reload; unload is more reliable.
    this.homey.on('unload', () => {
      this.onUninit().catch(this.error);
    });

    this.log('Cooldown Manager has been initialized');
  }

  /**
   * onUninit is called when the app is destroyed.
   */
  async onUninit() {
    this.unregisterFlowCards();
  }

  getDisplayContext(): { timezone: string; language: string } {
    return {
      timezone: this.timezone,
      language: this.homey.i18n.getLanguage(),
    };
  }

  async getTriggers(): Promise<Array<{
    key: string;
    lastRunAt: number | null;
    blockCount: number;
    usedCount: number;
  }>> {
    const usedKeys = await this.collectUsedKeys();

    return [...usedKeys]
      .sort()
      .map((key) => {
        const entry = this.cooldownManager.getEntry(key);
        return {
          key,
          lastRunAt: entry?.lastRunAt ?? null,
          blockCount: entry?.blockCount ?? 0,
          usedCount: entry?.usedCount ?? 0,
        };
      });
  }

  async getFlowConfigErrors(): Promise<FlowConfigError[]> {
    const allowOnceCard = this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowOnce);
    const allowUpToCard = this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowUpTo);
    const resetCooldownCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.resetCooldown);
    const suspendCooldownCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.suspendCooldown);
    const resetTokenCountCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.resetTokenCount);
    const grantTokenCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.grantToken);
    const grantTokensCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.grantTokens);

    const [
      allowOnceCards,
      allowUpToCards,
      resetCards,
      suspendCards,
      resetTokenCards,
      grantTokenCards,
      grantTokensCards,
      triggerCards,
    ] = await Promise.all([
      allowOnceCard.getArgumentValues(),
      allowUpToCard.getArgumentValues(),
      resetCooldownCard.getArgumentValues(),
      suspendCooldownCard.getArgumentValues(),
      resetTokenCountCard.getArgumentValues(),
      grantTokenCard.getArgumentValues(),
      grantTokensCard.getArgumentValues(),
      this.getBlockCountTriggerArgumentValues(),
    ]);

    return findFlowConfigErrors({
      allowOnceCards,
      allowUpToCards,
      actionCards: [
        ...resetCards,
        ...suspendCards,
        ...resetTokenCards,
        ...grantTokenCards,
      ],
      grantTokensCards,
      triggerCards,
    });
  }

  private createSettingsStore(): CooldownStore {
    return {
      getState: () => loadCooldownState(this.homey.settings.get(COOLDOWN_SETTINGS_KEY)),
      setState: (state) => {
        this.homey.settings.set(COOLDOWN_SETTINGS_KEY, state);
      },
    };
  }

  private async registerFlowCards() {
    const allowOnceCard = this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowOnce);
    const allowUpToCard = this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowUpTo);
    const resetCooldownCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.resetCooldown);
    const suspendCooldownCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.suspendCooldown);
    const resetTokenCountCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.resetTokenCount);
    const grantTokenCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.grantToken);
    const grantTokensCard = this.homey.flow.getActionCard(FLOW_CARD_IDS.grantTokens);

    const keyAutocomplete = async (query: string) => this.autocompleteKeys(query);

    allowOnceCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    allowUpToCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    resetCooldownCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    suspendCooldownCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    resetTokenCountCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    grantTokenCard.registerArgumentAutocompleteListener('key', keyAutocomplete);
    grantTokensCard.registerArgumentAutocompleteListener('key', keyAutocomplete);

    const cleanup = () => {
      this.cleanupUnusedKeys().catch(this.error);
    };
    this.flowCardsCleanup = cleanup;

    this.registerBlockCountTriggerCard(
      FLOW_CARD_IDS.blockedCountReached,
      (threshold, blockCount) => blockCount === threshold,
      keyAutocomplete,
      cleanup,
    );
    this.registerBlockCountTriggerCard(
      FLOW_CARD_IDS.blockedCountAtLeast,
      (threshold, blockCount) => blockCount >= threshold,
      keyAutocomplete,
      cleanup,
    );

    allowOnceCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      const durationMs = this.requireDurationMs(args.duration, args.duration_unit);

      try {
        const allowed = await this.cooldownManager.tryAllow(key, durationMs, Date.now());

        if (!allowed) {
          const blockCount = this.cooldownManager.getEntry(key)?.blockCount ?? 0;
          await this.triggerBlockCountCards(key, blockCount);
        }

        return allowed;
      } catch (error) {
        if (error instanceof InvalidCooldownDurationError) {
          throw new Error(this.homey.__('errors.duration_invalid'));
        }
        throw error;
      }
    });

    allowUpToCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      const maxCount = this.requireMaxCount(args.max_count);
      const durationMs = this.requireDurationMs(args.duration, args.duration_unit);

      try {
        const allowed = await this.cooldownManager.tryAllowUpTo(
          key,
          maxCount,
          durationMs,
          Date.now(),
        );

        if (!allowed) {
          const blockCount = this.cooldownManager.getEntry(key)?.blockCount ?? 0;
          await this.triggerBlockCountCards(key, blockCount);
        }

        return allowed;
      } catch (error) {
        if (error instanceof InvalidCooldownDurationError) {
          throw new Error(this.homey.__('errors.max_count_invalid'));
        }
        throw error;
      }
    });

    resetCooldownCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      await this.cooldownManager.reset(key);
    });

    suspendCooldownCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      await this.cooldownManager.suspend(key, Date.now());
    });

    resetTokenCountCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      await this.cooldownManager.resetTokenCount(key);
    });

    grantTokenCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      await this.cooldownManager.grantToken(key);
    });

    grantTokensCard.registerRunListener(async (args) => {
      const key = this.requireKey(args.key);
      const tokenCount = this.requireTokenCount(args.token_count);
      await this.cooldownManager.grantTokens(key, tokenCount);
    });

    const cardsWithCleanup = [
      allowOnceCard,
      allowUpToCard,
      resetCooldownCard,
      suspendCooldownCard,
      resetTokenCountCard,
      grantTokenCard,
      grantTokensCard,
    ];

    for (const card of cardsWithCleanup) {
      card.on('update', cleanup);
    }
  }

  private unregisterFlowCards() {
    const cleanup = this.flowCardsCleanup;
    if (!cleanup) {
      return;
    }

    const cards = [
      this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowOnce),
      this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowUpTo),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.resetCooldown),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.suspendCooldown),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.resetTokenCount),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.grantToken),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.grantTokens),
      ...this.getBlockCountTriggerCards(),
    ];

    for (const card of cards) {
      card.off('update', cleanup);
    }

    this.flowCardsCleanup = undefined;
  }

  private getBlockCountTriggerCards() {
    return BLOCK_COUNT_TRIGGER_CARD_IDS.map(
      (id) => this.homey.flow.getTriggerCard(id),
    );
  }

  private async getBlockCountTriggerArgumentValues() {
    const cards = this.getBlockCountTriggerCards();
    const valueSets = await Promise.all(cards.map((card) => card.getArgumentValues()));

    return valueSets.flat();
  }

  private registerBlockCountTriggerCard(
    cardId: typeof BLOCK_COUNT_TRIGGER_CARD_IDS[number],
    matches: (threshold: number, blockCount: number) => boolean,
    keyAutocomplete: (query: string) => ReturnType<CooldownManagerApp['autocompleteKeys']>,
    cleanup: () => void,
  ): void {
    const card = this.homey.flow.getTriggerCard(cardId);

    card.registerArgumentAutocompleteListener('key', keyAutocomplete);
    card.registerRunListener(async (args, state) => {
      const key = normalizeKey(args.key);
      const threshold = this.normalizeBlockCountThreshold(args.count);

      if (!key || threshold === null) {
        return false;
      }

      return canonicalKey(key) === state.key && matches(threshold, state.count);
    });
    card.on('update', cleanup);
  }

  private requireKey(value: unknown): string {
    const key = normalizeKey(value);
    if (!key) {
      throw new Error(this.homey.__('errors.key_required'));
    }
    return key;
  }

  private requireMaxCount(value: unknown): number {
    const maxCount = parseMaxCount(value);

    if (maxCount === null) {
      throw new Error(this.homey.__('errors.max_count_invalid'));
    }

    return maxCount;
  }

  private requireTokenCount(value: unknown): number {
    const tokenCount = parseMaxCount(value);

    if (tokenCount === null) {
      throw new Error(this.homey.__('errors.token_count_invalid'));
    }

    return tokenCount;
  }

  private normalizeBlockCountThreshold(value: unknown): number | null {
    const threshold = typeof value === 'number' ? value : Number(value);

    if (!Number.isInteger(threshold) || threshold < 1) {
      return null;
    }

    return threshold;
  }

  private async triggerBlockCountCards(key: string, blockCount: number): Promise<void> {
    const tokens = { block_count: blockCount };
    const state = { key: canonicalKey(key), count: blockCount };

    for (const cardId of BLOCK_COUNT_TRIGGER_CARD_IDS) {
      try {
        await this.homey.flow.getTriggerCard(cardId).trigger(tokens, state);
      } catch (error) {
        this.error(error);
      }
    }
  }

  private requireDurationMs(duration: unknown, unit: unknown): number {
    const durationMs = durationToMs(duration, unit);

    if (durationMs === null) {
      throw new Error(this.homey.__('errors.duration_required'));
    }

    return durationMs;
  }

  private async autocompleteKeys(query: string) {
    const usedKeys = await this.collectUsedKeys();
    const storedKeys = this.cooldownManager.getKeys();
    const allKeys = new Set(
      [...usedKeys, ...storedKeys].map((key) => canonicalKey(key)),
    );
    const normalizedQuery = query.trim().toLowerCase();

    const results = [...allKeys]
      .filter((key) => key.includes(normalizedQuery))
      .sort()
      .map((key) => ({
        name: key,
        id: key,
        description: this.describeKey(key),
      }));

    const trimmedQuery = query.trim();
    if (
      trimmedQuery.length > 0
      && !allKeys.has(canonicalKey(trimmedQuery))
      && trimmedQuery.toLowerCase().includes(normalizedQuery)
    ) {
      const newKey = canonicalKey(trimmedQuery);
      results.unshift({
        name: newKey,
        id: newKey,
        description: this.homey.__('autocomplete.create_key'),
      });
    }

    return results;
  }

  private describeKey(key: string): string {
    const entry = this.cooldownManager.getEntry(key);
    if (!entry || entry.lastRunAt === null) {
      return this.homey.__('autocomplete.never_run');
    }

    return this.homey.__('autocomplete.last_run', {
      time: formatLocalDateTime(
        entry.lastRunAt,
        this.timezone,
        this.homey.i18n.getLanguage(),
      ),
    });
  }

  private async collectUsedKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    const cards = [
      this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowOnce),
      this.homey.flow.getConditionCard(FLOW_CARD_IDS.allowUpTo),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.resetCooldown),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.suspendCooldown),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.resetTokenCount),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.grantToken),
      this.homey.flow.getActionCard(FLOW_CARD_IDS.grantTokens),
      ...this.getBlockCountTriggerCards(),
    ];

    for (const card of cards) {
      const argumentValues = await card.getArgumentValues();
      for (const valueSet of argumentValues) {
        const key = normalizeKey(valueSet.key);
        if (key) {
          keys.add(key);
        }
      }
    }

    return keys;
  }

  private async cleanupUnusedKeys() {
    const usedKeys = await this.collectUsedKeys();
    await this.cooldownManager.cleanup(usedKeys);
  }
}

export = CooldownManagerApp;
