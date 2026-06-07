'use strict';

import { parseMaxCount, isValidMaxCountArg } from './max-count';

describe('parseMaxCount', () => {
  it('accepts positive integers', () => {
    expect(parseMaxCount(1)).toBe(1);
    expect(parseMaxCount(3)).toBe(3);
    expect(parseMaxCount('5')).toBe(5);
  });

  it('rejects fractions', () => {
    expect(parseMaxCount(1.5)).toBeNull();
    expect(parseMaxCount(2.5)).toBeNull();
    expect(parseMaxCount('2.5')).toBeNull();
  });

  it('rejects zero, negative, and non-numeric values', () => {
    expect(parseMaxCount(0)).toBeNull();
    expect(parseMaxCount(-1)).toBeNull();
    expect(parseMaxCount('nope')).toBeNull();
    expect(parseMaxCount(null)).toBeNull();
  });

  it('rejects values above the Flow card maximum', () => {
    expect(parseMaxCount(1_000_000_000)).toBeNull();
  });
});

describe('isValidMaxCountArg', () => {
  it('accepts positive integers and Flow tag references', () => {
    expect(isValidMaxCountArg(3)).toBe(true);
    expect(isValidMaxCountArg('5')).toBe(true);
    expect(isValidMaxCountArg('[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidMaxCountArg(0)).toBe(false);
    expect(isValidMaxCountArg(2.5)).toBe(false);
    expect(isValidMaxCountArg('nope')).toBe(false);
    expect(isValidMaxCountArg(null)).toBe(false);
  });
});
