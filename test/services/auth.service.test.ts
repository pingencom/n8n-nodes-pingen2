import { PINGEN_API_URL, normalizeEnvironment } from '../../utils/constants';
import { DELIVERY_PRODUCTS } from '../../utils/options';
import { getPingenHeaders, credentialNameForEnvironment } from '../../services/auth.service';

describe('credentialNameForEnvironment', () => {
  it('maps staging → pingenStagingOAuth2Api', () => {
    expect(credentialNameForEnvironment('staging')).toBe('pingenStagingOAuth2Api');
  });

  it('maps production → pingenOAuth2Api', () => {
    expect(credentialNameForEnvironment('production')).toBe('pingenOAuth2Api');
  });
});

describe('normalizeEnvironment', () => {
  it.each([
    ['production', 'production'],
    ['Production', 'production'],
    ['PRODUCTION', 'production'],
    ['  production  ', 'production'],
    ['staging', 'staging'],
    ['Staging', 'staging'],
  ])('accepts "%s" → %s', (input, expected) => {
    expect(normalizeEnvironment(input)).toBe(expected);
  });

  it.each([
    ['empty string', ''],
    ['unknown string', 'stage'],
    ['undefined', undefined],
    ['number', 42],
    ['object', {}],
  ])('throws on %s', (_label, input) => {
    expect(() => normalizeEnvironment(input)).toThrow(/Unknown Pingen environment/);
  });
});

describe('getPingenHeaders', () => {
  it('sets JSON content type and JSON:API accept header (no Authorization — n8n injects it)', () => {
    const headers = getPingenHeaders();
    expect(headers['Content-Type']).toBe('application/vnd.api+json');
    expect(headers.Accept).toBe('application/vnd.api+json');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['User-Agent']).toBe('PINGEN.N8N');
  });
});

describe('constants sanity', () => {
  it('PINGEN_API_URL points to production endpoint', () => {
    expect(PINGEN_API_URL).toBe('https://api.pingen.com');
  });

  it('DELIVERY_PRODUCTS matches Pingen API enum exactly', () => {
    const values = DELIVERY_PRODUCTS.map((p) => p.value).sort();
    expect(values).toEqual(['bulk', 'cheap', 'fast', 'premium', 'registered']);
  });
});
