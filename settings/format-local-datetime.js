'use strict';

function formatLocalDateTime(timestampMs, timezone, language) {
  const date = new Date(timestampMs);
  const baseOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  };
  const attempts = [
    [language, { ...baseOptions, timeZone: timezone }],
    [language, baseOptions],
    [undefined, { ...baseOptions, timeZone: timezone }],
    [undefined, baseOptions],
  ];

  for (let i = 0; i < attempts.length; i += 1) {
    const locale = attempts[i][0];
    const options = attempts[i][1];

    try {
      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      // Invalid language and/or timezone — try a safer combination.
    }
  }

  return date.toISOString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = formatLocalDateTime;
} else if (typeof globalThis !== 'undefined') {
  globalThis.formatLocalDateTime = formatLocalDateTime;
}
