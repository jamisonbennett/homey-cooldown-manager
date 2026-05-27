'use strict';

import formatLocalDateTime from './format-local-datetime';

describe('formatLocalDateTime', () => {
  const timestampMs = Date.UTC(2026, 4, 26, 18, 30);

  it('formats a timestamp in the requested timezone', () => {
    const formatted = formatLocalDateTime(
      timestampMs,
      'Europe/Amsterdam',
      'en-GB',
    );

    expect(formatted).toBe('26/05/2026, 20:30');
  });

  it('falls back without timezone when timezone is invalid', () => {
    const attempts: { locale: string | undefined; options: Intl.DateTimeFormatOptions }[] = [];

    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locale, options) => {
      attempts.push({
        locale: locale as string | undefined,
        options: options ?? {},
      });
      if (options?.timeZone) {
        throw new RangeError('Invalid time zone');
      }
      return { format: () => 'fallback-without-timezone' } as Intl.DateTimeFormat;
    });

    const formatted = formatLocalDateTime(timestampMs, 'Not/A_Timezone', 'en-GB');

    expect(attempts).toHaveLength(2);
    expect(attempts[0].options.timeZone).toBe('Not/A_Timezone');
    expect(attempts[1].options).not.toHaveProperty('timeZone');
    expect(formatted).toBe('fallback-without-timezone');

    jest.restoreAllMocks();
  });

  it('falls back to default locale when language is invalid', () => {
    const attempts: (string | undefined)[] = [];

    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locale, options) => {
      attempts.push(locale as string | undefined);
      if (typeof locale === 'string' && locale.includes('not-a-locale')) {
        throw new RangeError('Invalid language tag');
      }
      return { format: () => 'fallback-default-locale' } as Intl.DateTimeFormat;
    });

    const formatted = formatLocalDateTime(
      timestampMs,
      'Europe/Amsterdam',
      'not-a-locale',
    );

    expect(attempts).toEqual(['not-a-locale', 'not-a-locale', undefined]);
    expect(formatted).toBe('fallback-default-locale');

    jest.restoreAllMocks();
  });

  it('falls back through all options when timezone and language are invalid', () => {
    let callCount = 0;

    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      callCount += 1;
      if (callCount < 4) {
        throw new RangeError('Invalid');
      }
      return { format: () => 'last-resort-formatted' } as Intl.DateTimeFormat;
    });

    const formatted = formatLocalDateTime(
      timestampMs,
      'Not/A_Timezone',
      'not-a-locale',
    );

    expect(callCount).toBe(4);
    expect(formatted).toBe('last-resort-formatted');

    jest.restoreAllMocks();
  });

  it('returns an ISO string when every formatter attempt fails', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('Invalid');
    });

    const formatted = formatLocalDateTime(
      timestampMs,
      'Not/A_Timezone',
      'not-a-locale',
    );

    expect(formatted).toBe('2026-05-26T18:30:00.000Z');

    jest.restoreAllMocks();
  });
});
