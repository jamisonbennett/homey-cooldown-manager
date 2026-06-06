'use strict';

/* eslint-disable camelcase -- mirrors Homey Flow card argument names */

import { durationToMs, type DurationUnit } from './duration';
import normalizeKey from './flow-key';

export type AllowCardSnapshot = {
  key: unknown;
  duration: unknown;
  duration_unit: unknown;
};

export type ActionCardSnapshot = {
  key: unknown;
};

export type FlowConfigSnapshot = {
  allowCards: ReadonlyArray<AllowCardSnapshot>;
  actionCards: ReadonlyArray<ActionCardSnapshot>;
};

export type DurationSpec = {
  duration: number;
  unit: DurationUnit;
};

export type InvalidDurationSpec = {
  invalid: true;
};

export type FlowConfigDurationSpec = DurationSpec | InvalidDurationSpec;

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
    kind: 'action_key_without_allow';
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

function durationToken(card: AllowCardSnapshot): number | 'invalid' {
  const durationMs = durationToMs(card.duration, card.duration_unit);
  return durationMs ?? 'invalid';
}

function durationSpecFromCard(card: AllowCardSnapshot): FlowConfigDurationSpec {
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

function uniqueDurationSpecs(cards: ReadonlyArray<AllowCardSnapshot>): FlowConfigDurationSpec[] {
  const seen = new Set<number | 'invalid'>();
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

function groupAllowCardsByKey(
  allowCards: ReadonlyArray<AllowCardSnapshot>,
): Map<string, AllowCardSnapshot[]> {
  const grouped = new Map<string, AllowCardSnapshot[]>();

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

  for (const [key, cards] of groupAllowCardsByKey(snapshot.allowCards)) {
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

function collectAllowKeys(snapshot: FlowConfigSnapshot): Set<string> {
  const keys = new Set<string>();

  for (const card of snapshot.allowCards) {
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

  for (const [key, cards] of groupAllowCardsByKey(snapshot.allowCards)) {
    const hasInvalid = cards.some(
      (card) => durationToMs(card.duration, card.duration_unit) === null,
    );
    const hasValid = cards.some(
      (card) => durationToMs(card.duration, card.duration_unit) !== null,
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

function findActionKeysWithoutAllow(
  snapshot: FlowConfigSnapshot,
): FlowConfigError[] {
  const allowKeys = collectAllowKeys(snapshot);
  const orphanKeys = new Set<string>();

  for (const card of snapshot.actionCards) {
    const key = normalizeKey(card.key);
    if (key && !allowKeys.has(key)) {
      orphanKeys.add(key);
    }
  }

  return [...orphanKeys].sort().map((key) => ({
    kind: 'action_key_without_allow',
    key,
  }));
}

const FLOW_CONFIG_ERROR_CHECKERS: FlowConfigErrorChecker[] = [
  findAllowKeyConflictingDurations,
  findAllowCardsWithInvalidDuration,
  findActionKeysWithoutAllow,
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
