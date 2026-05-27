'use strict';

/**
 * Canonical cooldown key form (trimmed, lowercase). Keys match case-insensitively.
 */
export function canonicalKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalize a Flow autocomplete argument value to a cooldown key string.
 */
export default function normalizeKey(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? canonicalKey(trimmed) : null;
  }

  if (value !== null && typeof value === 'object') {
    if ('name' in value) {
      const name = String((value as { name: unknown }).name).trim();
      if (name.length > 0) {
        return canonicalKey(name);
      }
    }

    if ('id' in value) {
      const { id } = value as { id: unknown };
      if (typeof id === 'string') {
        const trimmed = id.trim();
        if (trimmed.length > 0) {
          return canonicalKey(trimmed);
        }
      }
    }
  }

  return null;
}
