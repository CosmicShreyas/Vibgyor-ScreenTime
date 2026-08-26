import { escapeRegExp, normalizeEmployeeId } from '../employee-identity';

describe('employee identity helpers', () => {
  it('normalizes insignificant casing and whitespace', () => {
    expect(normalizeEmployeeId(' emp-0042 ')).toBe('EMP-0042');
  });

  it('rejects missing and blank identifiers', () => {
    expect(normalizeEmployeeId(undefined)).toBeUndefined();
    expect(normalizeEmployeeId('   ')).toBeUndefined();
  });

  it('escapes IDs used for legacy exact-match lookups', () => {
    expect(escapeRegExp('EMP.(42)+')).toBe('EMP\\.\\(42\\)\\+');
  });
});
