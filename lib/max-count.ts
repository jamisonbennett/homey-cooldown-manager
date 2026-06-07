'use strict';

import isFlowTagReference from './flow-tag';

/** Matches the Flow max_count number arg `max` in app.json / compose. */
export const MAX_COUNT_INPUT = 999_999_999;

export function parseMaxCount(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (
    !Number.isFinite(parsed)
    || !Number.isInteger(parsed)
    || parsed < 1
    || parsed > MAX_COUNT_INPUT
  ) {
    return null;
  }

  return parsed;
}

export function isValidMaxCountArg(value: unknown): boolean {
  return parseMaxCount(value) !== null || isFlowTagReference(value);
}
