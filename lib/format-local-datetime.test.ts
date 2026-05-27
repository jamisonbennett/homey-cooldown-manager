'use strict';

import formatLocalDateTime from './format-local-datetime';

describe('formatLocalDateTime', () => {
  it('formats a timestamp in the requested timezone', () => {
    const formatted = formatLocalDateTime(
      Date.UTC(2026, 4, 26, 18, 30),
      'Europe/Amsterdam',
      'en-GB',
    );

    expect(formatted).toBe('26/05/2026, 20:30');
  });
});
