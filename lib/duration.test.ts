'use strict';

import { durationToMs } from './duration';

describe('durationToMs', () => {
  it('converts minutes to milliseconds', () => {
    expect(durationToMs(10, 'minutes')).toBe(600_000);
  });

  it('converts seconds to milliseconds', () => {
    expect(durationToMs(30, 'seconds')).toBe(30_000);
  });

  it('converts hours to milliseconds', () => {
    expect(durationToMs(2, 'hours')).toBe(7_200_000);
  });

  it('converts days to milliseconds', () => {
    expect(durationToMs(1, 'days')).toBe(86_400_000);
  });

  it('accepts numeric strings', () => {
    expect(durationToMs('5', 'minutes')).toBe(300_000);
  });

  it('accepts dropdown objects', () => {
    expect(durationToMs(2, { id: 'minutes' })).toBe(120_000);
  });

  it('returns null for invalid values', () => {
    expect(durationToMs(0, 'minutes')).toBeNull();
    expect(durationToMs(10, 'weeks')).toBeNull();
    expect(durationToMs('abc', 'seconds')).toBeNull();
  });
});
