'use strict';

/**
 * Homey stores Flow tag references in card arguments as strings like
 * `[[homey:manager:logic|…]]`. The resolved value is only available at run time.
 */
export default function isFlowTagReference(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.startsWith('[[') && trimmed.endsWith(']]') && trimmed.length > 4;
}
