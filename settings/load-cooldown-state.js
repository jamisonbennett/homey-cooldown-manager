'use strict';

const normalizeLastRunAt = require('../lib/last-run-at');

const SUSPENDED_USED_COUNT = -1;

function canonicalKey(value) {
  return value.trim().toLowerCase();
}

function normalizeBlockCount(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function normalizeUsedCount(value) {
  if (value === SUSPENDED_USED_COUNT) {
    return SUSPENDED_USED_COUNT;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function mergeCooldownEntries(a, b) {
  const merged = {
    lastRunAt: null,
    blockCount: Math.max(a.blockCount, b.blockCount),
    usedCount: 0,
  };

  if (a.lastRunAt === null) {
    merged.lastRunAt = b.lastRunAt;
  } else if (b.lastRunAt === null) {
    merged.lastRunAt = a.lastRunAt;
  } else if (a.lastRunAt >= b.lastRunAt) {
    merged.lastRunAt = a.lastRunAt;
  } else {
    merged.lastRunAt = b.lastRunAt;
  }

  if (a.usedCount === SUSPENDED_USED_COUNT || b.usedCount === SUSPENDED_USED_COUNT) {
    merged.usedCount = SUSPENDED_USED_COUNT;
  } else {
    merged.usedCount = Math.max(a.usedCount, b.usedCount);
  }

  return merged;
}

function loadCooldownState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const now = Date.now();
  const state = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const trimmed = key.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const normalizedKey = canonicalKey(trimmed);
    let entry;

    const { lastRunAt } = value;
    const blockCount = normalizeBlockCount(value.blockCount);
    const usedCount = normalizeUsedCount(value.usedCount);

    if (lastRunAt === null) {
      entry = { lastRunAt: null, blockCount, usedCount };
    } else if (typeof lastRunAt === 'number' && Number.isFinite(lastRunAt)) {
      entry = {
        lastRunAt: normalizeLastRunAt(lastRunAt, now),
        blockCount,
        usedCount,
      };
    }

    if (!entry) {
      continue;
    }

    const existing = state[normalizedKey];
    state[normalizedKey] = existing ? mergeCooldownEntries(existing, entry) : entry;
  }

  return state;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadCooldownState, SUSPENDED_USED_COUNT };
} else if (typeof globalThis !== 'undefined') {
  globalThis.loadCooldownState = loadCooldownState;
}
