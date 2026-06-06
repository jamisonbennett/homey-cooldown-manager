'use strict';

// Runtime require targets compiled JS; eslint import resolver prefers the .d.ts source.
// eslint-disable-next-line import/extensions
const normalizeLastRunAt = require('../lib/last-run-at');

function canonicalKey(value) {
  return value.trim().toLowerCase();
}

function mergeCooldownEntries(a, b) {
  if (a.lastRunAt === null) {
    return b;
  }
  if (b.lastRunAt === null) {
    return a;
  }
  return { lastRunAt: Math.max(a.lastRunAt, b.lastRunAt) };
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
    if (lastRunAt === null) {
      entry = { lastRunAt: null };
    } else if (typeof lastRunAt === 'number' && Number.isFinite(lastRunAt)) {
      entry = { lastRunAt: normalizeLastRunAt(lastRunAt, now) };
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
