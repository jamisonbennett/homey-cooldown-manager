'use strict';

import { durationToMs, type DurationUnit } from './duration';
import isFlowTagReference from './flow-tag';
import normalizeKey from './flow-key';
import { isValidMaxCountArg, parseMaxCount } from './max-count';

export type AllowOnceCardSnapshot = {
  key: unknown;
  duration: unknown;
  duration_unit: unknown;
};

export type AllowUpToCardSnapshot = {
  key: unknown;
  max_count: unknown;
  duration: unknown;
  duration_unit: unknown;
};

export type ActionCardSnapshot = {
  key: unknown;
};

export type GrantTokensCardSnapshot = {
  key: unknown;
  token_count: unknown;
};

export type TriggerCardSnapshot = {
  key: unknown;
};

export type FlowConfigSnapshot = {
  allowOnceCards: ReadonlyArray<AllowOnceCardSnapshot>;
  allowUpToCards: ReadonlyArray<AllowUpToCardSnapshot>;
  actionCards: ReadonlyArray<ActionCardSnapshot>;
  grantTokensCards: ReadonlyArray<GrantTokensCardSnapshot>;
  triggerCards: ReadonlyArray<TriggerCardSnapshot>;
};

export type DurationSpec = {
  duration: number;
  unit: DurationUnit;
};

export type InvalidDurationSpec = {
  invalid: true;
};

export type FlowConfigDurationSpec = DurationSpec | InvalidDurationSpec;

export type AllowUpToLimitSpec = {
  maxCount: number;
  duration: number;
  unit: DurationUnit;
};

export type InvalidAllowUpToLimitSpec = {
  invalid: true;
};

export type FlowConfigAllowUpToLimitSpec = AllowUpToLimitSpec | InvalidAllowUpToLimitSpec;

export type FlowConfigError =
  | {
    kind: 'allow_key_conflicting_durations';
    key: string;
    durations: FlowConfigDurationSpec[];
  }
  | {
    kind: 'allow_key_invalid_duration';
    key: string;
  }
  | {
    kind: 'allow_up_to_key_conflicting_limits';
    key: string;
    limits: FlowConfigAllowUpToLimitSpec[];
  }
  | {
    kind: 'allow_up_to_key_invalid_limit';
    key: string;
  }
  | {
    kind: 'allow_key_mixed_card_types';
    key: string;
  }
  | {
    kind: 'action_key_without_allow';
    key: string;
  }
  | {
    kind: 'grant_tokens_key_invalid_token_count';
    key: string;
  }
  | {
    kind: 'trigger_key_without_allow';
    key: string;
  };

export type FlowConfigErrorChecker = (
  snapshot: FlowConfigSnapshot,
) => FlowConfigError[];

function normalizeDurationUnit(unit: unknown): DurationUnit | null {
  if (
    unit === 'seconds'
    || unit === 'minutes'
    || unit === 'hours'
    || unit === 'days'
  ) {
    return unit;
  }

  if (unit !== null && typeof unit === 'object' && 'id' in unit) {
    const { id } = unit as { id: unknown };
    if (
      id === 'seconds'
      || id === 'minutes'
      || id === 'hours'
      || id === 'days'
    ) {
      return id;
    }
  }

  return null;
}

function durationTokenPart(duration: unknown, unit: unknown): string {
  const durationMs = durationToMs(duration, unit);
  if (durationMs !== null) {
    return String(durationMs);
  }

  if (isFlowTagReference(duration)) {
    return String(duration).trim();
  }

  return 'invalid';
}

function isDurationArgValid(duration: unknown, unit: unknown): boolean {
  if (durationToMs(duration, unit) !== null) {
    return normalizeDurationUnit(unit) !== null;
  }

  return isFlowTagReference(duration) && normalizeDurationUnit(unit) !== null;
}

function durationToken(card: AllowOnceCardSnapshot): string {
  if (!isDurationArgValid(card.duration, card.duration_unit)) {
    return 'invalid';
  }

  return durationTokenPart(card.duration, card.duration_unit);
}

function durationSpecFromCard(card: AllowOnceCardSnapshot): FlowConfigDurationSpec {
  const durationMs = durationToMs(card.duration, card.duration_unit);
  if (durationMs === null) {
    return { invalid: true };
  }

  const unit = normalizeDurationUnit(card.duration_unit);
  const value = typeof card.duration === 'number'
    ? card.duration
    : Number(card.duration);

  if (unit === null || !Number.isInteger(value)) {
    return { invalid: true };
  }

  return { duration: value, unit };
}

function compareDurationSpecs(
  left: FlowConfigDurationSpec,
  right: FlowConfigDurationSpec,
): number {
  const leftInvalid = 'invalid' in left;
  const rightInvalid = 'invalid' in right;

  if (leftInvalid && rightInvalid) {
    return 0;
  }

  if (leftInvalid) {
    return 1;
  }

  if (rightInvalid) {
    return -1;
  }

  const leftMs = durationToMs(left.duration, left.unit) ?? 0;
  const rightMs = durationToMs(right.duration, right.unit) ?? 0;

  if (leftMs !== rightMs) {
    return leftMs - rightMs;
  }

  const unitOrder: Record<DurationUnit, number> = {
    seconds: 0,
    minutes: 1,
    hours: 2,
    days: 3,
  };

  if (left.unit !== right.unit) {
    return unitOrder[left.unit] - unitOrder[right.unit];
  }

  return left.duration - right.duration;
}

function uniqueDurationSpecs(
  cards: ReadonlyArray<AllowOnceCardSnapshot>,
): FlowConfigDurationSpec[] {
  const seen = new Set<string>();
  const specs: FlowConfigDurationSpec[] = [];

  for (const card of cards) {
    const token = durationToken(card);
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    specs.push(durationSpecFromCard(card));
  }

  return specs.sort(compareDurationSpecs);
}

function allowUpToMaxCountTokenPart(value: unknown): string {
  const maxCount = parseMaxCount(value);
  if (maxCount !== null) {
    return String(maxCount);
  }

  if (isFlowTagReference(value)) {
    return String(value).trim();
  }

  return 'invalid';
}

function allowUpToCardUsesUnresolvedTag(card: AllowUpToCardSnapshot): boolean {
  return isFlowTagReference(card.max_count) || isFlowTagReference(card.duration);
}

function isAllowUpToLimitValid(card: AllowUpToCardSnapshot): boolean {
  return isValidMaxCountArg(card.max_count)
    && isDurationArgValid(card.duration, card.duration_unit);
}

function allowUpToLimitToken(card: AllowUpToCardSnapshot): string {
  if (!isAllowUpToLimitValid(card)) {
    return 'invalid';
  }

  return `${allowUpToMaxCountTokenPart(card.max_count)}:${durationTokenPart(card.duration, card.duration_unit)}`;
}

function allowUpToLimitSpecFromCard(
  card: AllowUpToCardSnapshot,
): FlowConfigAllowUpToLimitSpec {
  const maxCount = parseMaxCount(card.max_count);
  const durationMs = durationToMs(card.duration, card.duration_unit);
  const unit = normalizeDurationUnit(card.duration_unit);
  const duration = typeof card.duration === 'number'
    ? card.duration
    : Number(card.duration);

  if (maxCount === null || durationMs === null || unit === null || !Number.isInteger(duration)) {
    return { invalid: true };
  }

  return { maxCount, duration, unit };
}

function compareAllowUpToLimitSpecs(
  left: FlowConfigAllowUpToLimitSpec,
  right: FlowConfigAllowUpToLimitSpec,
): number {
  const leftInvalid = 'invalid' in left;
  const rightInvalid = 'invalid' in right;

  if (leftInvalid && rightInvalid) {
    return 0;
  }

  if (leftInvalid) {
    return 1;
  }

  if (rightInvalid) {
    return -1;
  }

  const leftMs = durationToMs(left.duration, left.unit) ?? 0;
  const rightMs = durationToMs(right.duration, right.unit) ?? 0;

  if (leftMs !== rightMs) {
    return leftMs - rightMs;
  }

  if (left.maxCount !== right.maxCount) {
    return left.maxCount - right.maxCount;
  }

  const unitOrder: Record<DurationUnit, number> = {
    seconds: 0,
    minutes: 1,
    hours: 2,
    days: 3,
  };

  if (left.unit !== right.unit) {
    return unitOrder[left.unit] - unitOrder[right.unit];
  }

  return left.duration - right.duration;
}

function uniqueAllowUpToLimitSpecs(
  cards: ReadonlyArray<AllowUpToCardSnapshot>,
): FlowConfigAllowUpToLimitSpec[] {
  const seen = new Set<string>();
  const specs: FlowConfigAllowUpToLimitSpec[] = [];

  for (const card of cards) {
    const token = allowUpToLimitToken(card);
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    specs.push(allowUpToLimitSpecFromCard(card));
  }

  return specs.sort(compareAllowUpToLimitSpecs);
}

function groupAllowOnceCardsByKey(
  allowCards: ReadonlyArray<AllowOnceCardSnapshot>,
): Map<string, AllowOnceCardSnapshot[]> {
  const grouped = new Map<string, AllowOnceCardSnapshot[]>();

  for (const card of allowCards) {
    const key = normalizeKey(card.key);
    if (!key) {
      continue;
    }

    const cardsForKey = grouped.get(key) ?? [];
    cardsForKey.push(card);
    grouped.set(key, cardsForKey);
  }

  return grouped;
}

function groupAllowUpToCardsByKey(
  allowCards: ReadonlyArray<AllowUpToCardSnapshot>,
): Map<string, AllowUpToCardSnapshot[]> {
  const grouped = new Map<string, AllowUpToCardSnapshot[]>();

  for (const card of allowCards) {
    const key = normalizeKey(card.key);
    if (!key) {
      continue;
    }

    const cardsForKey = grouped.get(key) ?? [];
    cardsForKey.push(card);
    grouped.set(key, cardsForKey);
  }

  return grouped;
}

function findAllowKeyConflictingDurations(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const errors: FlowConfigError[] = [];

  for (const [key, cards] of groupAllowOnceCardsByKey(snapshot.allowOnceCards)) {
    if (cards.some((card) => isFlowTagReference(card.duration))) {
      continue;
    }

    const uniqueTokens = new Set(cards.map(durationToken));
    if (uniqueTokens.size <= 1) {
      continue;
    }

    errors.push({
      kind: 'allow_key_conflicting_durations',
      key,
      durations: uniqueDurationSpecs(cards),
    });
  }

  return errors;
}

function findAllowUpToKeyConflictingLimits(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const errors: FlowConfigError[] = [];

  for (const [key, cards] of groupAllowUpToCardsByKey(snapshot.allowUpToCards)) {
    if (cards.some(allowUpToCardUsesUnresolvedTag)) {
      continue;
    }

    const uniqueTokens = new Set(cards.map(allowUpToLimitToken));
    if (uniqueTokens.size <= 1) {
      continue;
    }

    errors.push({
      kind: 'allow_up_to_key_conflicting_limits',
      key,
      limits: uniqueAllowUpToLimitSpecs(cards),
    });
  }

  return errors;
}

function collectAllowKeys(snapshot: FlowConfigSnapshot): Set<string> {
  const keys = new Set<string>();

  for (const card of snapshot.allowOnceCards) {
    const key = normalizeKey(card.key);
    if (key) {
      keys.add(key);
    }
  }

  for (const card of snapshot.allowUpToCards) {
    const key = normalizeKey(card.key);
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function collectAllowOnceKeys(snapshot: FlowConfigSnapshot): Set<string> {
  const keys = new Set<string>();

  for (const card of snapshot.allowOnceCards) {
    const key = normalizeKey(card.key);
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function collectAllowUpToKeys(snapshot: FlowConfigSnapshot): Set<string> {
  const keys = new Set<string>();

  for (const card of snapshot.allowUpToCards) {
    const key = normalizeKey(card.key);
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function findAllowCardsWithInvalidDuration(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const invalidKeys = new Set<string>();

  for (const [key, cards] of groupAllowOnceCardsByKey(snapshot.allowOnceCards)) {
    const hasInvalid = cards.some(
      (card) => !isDurationArgValid(card.duration, card.duration_unit),
    );
    const hasValid = cards.some(
      (card) => isDurationArgValid(card.duration, card.duration_unit),
    );

    if (hasInvalid && !hasValid) {
      invalidKeys.add(key);
    }
  }

  return [...invalidKeys].sort().map((key) => ({
    kind: 'allow_key_invalid_duration',
    key,
  }));
}

function findAllowUpToCardsWithInvalidLimit(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const invalidKeys = new Set<string>();

  for (const [key, cards] of groupAllowUpToCardsByKey(snapshot.allowUpToCards)) {
    if (cards.some((card) => allowUpToLimitToken(card) === 'invalid')) {
      invalidKeys.add(key);
    }
  }

  return [...invalidKeys].sort().map((key) => ({
    kind: 'allow_up_to_key_invalid_limit',
    key,
  }));
}

function findGrantTokensCardsWithInvalidTokenCount(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const invalidKeys = new Set<string>();

  for (const card of snapshot.grantTokensCards) {
    const key = normalizeKey(card.key);
    if (!key || isValidMaxCountArg(card.token_count)) {
      continue;
    }

    invalidKeys.add(key);
  }

  return [...invalidKeys].sort().map((key) => ({
    kind: 'grant_tokens_key_invalid_token_count',
    key,
  }));
}

function findAllowKeyMixedCardTypes(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const onceKeys = collectAllowOnceKeys(snapshot);
  const upToKeys = collectAllowUpToKeys(snapshot);
  const mixedKeys = new Set<string>();

  for (const key of onceKeys) {
    if (!upToKeys.has(key)) {
      continue;
    }

    const upToCards = groupAllowUpToCardsByKey(snapshot.allowUpToCards).get(key) ?? [];
    if (upToCards.some((card) => isFlowTagReference(card.max_count))) {
      continue;
    }

    const onlyLiteralOne = upToCards.every((card) => parseMaxCount(card.max_count) === 1);

    if (!onlyLiteralOne) {
      mixedKeys.add(key);
    }
  }

  return [...mixedKeys].sort().map((key) => ({
    kind: 'allow_key_mixed_card_types',
    key,
  }));
}

function findKeysWithoutAllow(
  cards: ReadonlyArray<{ key: unknown }>,
  kind: 'action_key_without_allow' | 'trigger_key_without_allow',
  allowKeys: Set<string>,
): FlowConfigError[] {
  const orphanKeys = new Set<string>();

  for (const card of cards) {
    const key = normalizeKey(card.key);
    if (key && !allowKeys.has(key)) {
      orphanKeys.add(key);
    }
  }

  return [...orphanKeys].sort().map((key) => ({
    kind,
    key,
  }));
}

function findActionKeysWithoutAllow(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  return findKeysWithoutAllow(
    [...snapshot.actionCards, ...snapshot.grantTokensCards],
    'action_key_without_allow',
    collectAllowKeys(snapshot),
  );
}

function findTriggerKeysWithoutAllow(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  return findKeysWithoutAllow(
    snapshot.triggerCards,
    'trigger_key_without_allow',
    collectAllowKeys(snapshot),
  );
}

const FLOW_CONFIG_ERROR_CHECKERS: FlowConfigErrorChecker[] = [
  findAllowKeyConflictingDurations,
  findAllowUpToKeyConflictingLimits,
  findAllowCardsWithInvalidDuration,
  findAllowUpToCardsWithInvalidLimit,
  findGrantTokensCardsWithInvalidTokenCount,
  findAllowKeyMixedCardTypes,
  findActionKeysWithoutAllow,
  findTriggerKeysWithoutAllow,
];

export function findFlowConfigErrors(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  return FLOW_CONFIG_ERROR_CHECKERS.flatMap((checker) => checker(snapshot));
}

export function isValidDurationSpec(
  spec: FlowConfigDurationSpec,
): spec is DurationSpec {
  return !('invalid' in spec);
}

export function isValidAllowUpToLimitSpec(
  spec: FlowConfigAllowUpToLimitSpec,
): spec is AllowUpToLimitSpec {
  return !('invalid' in spec);
}
