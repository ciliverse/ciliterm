import { describe, it, expect } from 'vitest';
import { diffGeoKeys, geoPointKey } from '../client/src/components/Globe/geoDiff';

describe('geoPointKey', () => {
  it('joins kind and ip', () => {
    expect(geoPointKey({ kind: 'conn', ip: '1.1.1.1' })).toBe('conn:1.1.1.1');
  });
});

describe('diffGeoKeys', () => {
  it('reports appeared and disappeared keys', () => {
    expect(diffGeoKeys(['conn:1.1.1.1', 'ssh:8.8.8.8'], ['ssh:8.8.8.8', 'conn:9.9.9.9'])).toEqual({
      appeared: ['conn:9.9.9.9'],
      disappeared: ['conn:1.1.1.1'],
    });
  });

  it('is empty when the set is unchanged', () => {
    expect(diffGeoKeys(['a', 'b'], ['b', 'a'])).toEqual({ appeared: [], disappeared: [] });
  });
});
