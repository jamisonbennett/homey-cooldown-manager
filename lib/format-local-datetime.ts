'use strict';

export default function formatLocalDateTime(
  timestampMs: number,
  timezone: string,
  language: string,
): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(timestampMs));
}
