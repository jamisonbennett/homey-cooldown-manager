'use strict';

export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const DURATION_MULTIPLIERS_MS: Record<DurationUnit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** Matches the Flow duration number arg `max` in app.json / compose. */
export const MAX_DURATION_INPUT = 999_999_999;

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

export function durationToMs(duration: unknown, unit: unknown): number | null {
  const value = typeof duration === 'number' ? duration : Number(duration);
  const normalizedUnit = normalizeDurationUnit(unit);

  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || value <= 0
    || value > MAX_DURATION_INPUT
    || normalizedUnit === null
  ) {
    return null;
  }

  const durationMs = value * DURATION_MULTIPLIERS_MS[normalizedUnit];

  if (!Number.isSafeInteger(durationMs)) {
    return null;
  }

  return durationMs;
}
