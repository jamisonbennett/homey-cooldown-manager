'use strict';

export default function formatLocalDateTime(
  timestampMs: number,
  timezone: string,
  language: string,
): string {
  const date = new Date(timestampMs);
  const baseOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  };
  const attempts: [string | undefined, Intl.DateTimeFormatOptions][] = [
    [language, { ...baseOptions, timeZone: timezone }],
    [language, baseOptions],
    [undefined, { ...baseOptions, timeZone: timezone }],
    [undefined, baseOptions],
  ];

  for (const [locale, options] of attempts) {
    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch {
      // Invalid language and/or timezone — try a safer combination.
    }
  }

  return date.toISOString();
}
