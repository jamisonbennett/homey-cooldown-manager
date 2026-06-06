'use strict';

/**
 * Normalize a persisted lastRunAt for comparison against the current clock.
 * Negative values are corrupt; future values indicate clock skew and are
 * treated as if the event just occurred at `now`.
 */
function normalizeLastRunAt(lastRunAt, now) {
  if (lastRunAt === null) {
    return null;
  }
  if (lastRunAt < 0) {
    return null;
  }
  if (lastRunAt > now) {
    return now;
  }
  return lastRunAt;
}

module.exports = normalizeLastRunAt;
