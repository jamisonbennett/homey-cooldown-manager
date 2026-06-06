'use strict';

// Runtime require targets compiled JS; eslint import resolver prefers the .d.ts source.
// eslint-disable-next-line import/extensions
const normalizeLastRunAt = require('../lib/last-run-at');

function canonicalKey(value) {
  return value.trim().toLowerCase();
}

function normalizeBlockCount(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function mergeCooldownEntries(a, b) {
  if (a.lastRunAt === null) {
    return {
      lastRunAt: b.lastRunAt,
      blockCount: Math.max(a.blockCount, b.blockCount),
    };
  }
  if (b.lastRunAt === null) {
    return {
      lastRunAt: a.lastRunAt,
      blockCount: Math.max(a.blockCount, b.blockCount),
    };
  }

  if (a.lastRunAt >= b.lastRunAt) {
    return a;
  }

  return b;
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

    if (lastRunAt === null) {
      entry = { lastRunAt: null, blockCount };
    } else if (typeof lastRunAt === 'number' && Number.isFinite(lastRunAt)) {
      entry = { lastRunAt: normalizeLastRunAt(lastRunAt, now), blockCount };
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
  module.exports = { loadCooldownState };
} else if (typeof globalThis !== 'undefined') {
  globalThis.loadCooldownState = loadCooldownState;
}
