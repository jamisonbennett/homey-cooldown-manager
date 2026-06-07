'use strict';

import isFlowTagReference from './flow-tag';

describe('isFlowTagReference', () => {
  it('detects Homey tag reference strings', () => {
    expect(isFlowTagReference('[[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]')).toBe(true);
    expect(isFlowTagReference('  [[homey:manager:logic|86669477-a2a8-41e3-a811-d49d8753b5e5]]  ')).toBe(true);
  });

  it('rejects plain numbers and other strings', () => {
    expect(isFlowTagReference(3)).toBe(false);
    expect(isFlowTagReference('3')).toBe(false);
    expect(isFlowTagReference('[[]]')).toBe(false);
    expect(isFlowTagReference('[[incomplete')).toBe(false);
    expect(isFlowTagReference(null)).toBe(false);
  });
});
