'use strict';

function formatLocalDateTime(timestampMs, timezone, language) {
  var date = new Date(timestampMs);
  var baseOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  };
  var attempts = [
    [language, Object.assign({}, baseOptions, { timeZone: timezone })],
    [language, baseOptions],
    [undefined, Object.assign({}, baseOptions, { timeZone: timezone })],
    [undefined, baseOptions],
  ];

  for (var i = 0; i < attempts.length; i += 1) {
    var locale = attempts[i][0];
    var options = attempts[i][1];

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
