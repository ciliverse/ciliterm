import { describe, it, expect } from 'vitest';
import { hexTint } from '../client/src/components/Globe/globeFx';

describe('hexTint', () => {
  it('returns a stable rgba for the same seed', () => {
    expect(hexTint('#35e6ff', 'USA', 0.58)).toBe(hexTint('#35e6ff', 'USA', 0.58));
    expect(hexTint('#35e6ff', 'USA', 0.58)).not.toBe(hexTint('#35e6ff', 'CHN', 0.58));
    expect(hexTint('#35e6ff', 'USA', 0.58)).toMatch(/^rgba\(\d+,\d+,\d+,0\.58\)$/);
  });
});
