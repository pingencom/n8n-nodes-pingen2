import { PINGEN_API_URL, normalizeEnvironment } from '../../utils/constants';
import { DELIVERY_PRODUCTS } from '../../utils/options';
import {
  getPingenHeaders,
  getPingenConfig,
  clearTokenCache,
  credentialNameForEnvironment,
} from '../../services/auth.service';

describe('credentialNameForEnvironment', () => {
  it('maps staging → pingenStagingApi', () => {
    expect(credentialNameForEnvironment('staging')).toBe('pingenStagingApi');
  });

  it('maps production → pingenApi', () => {
    expect(credentialNameForEnvironment('production')).toBe('pingenApi');
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
  it('sets Bearer token, JSON content type, and JSON:API accept header', () => {
    const headers = getPingenHeaders('test-token-123');
    expect(headers.Authorization).toBe('Bearer test-token-123');
    expect(headers['Content-Type']).toBe('application/vnd.api+json');
    expect(headers.Accept).toBe('application/vnd.api+json');
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

const tokenOk = (accessToken: string, expiresIn = 3600) =>
  JSON.stringify({ access_token: accessToken, expires_in: expiresIn });

describe('getPingenConfig', () => {
  beforeEach(() => {
    clearTokenCache();
  });

  it('fetches and returns a fresh token with production apiUrl by default', async () => {
    const ctx = {
      helpers: { request: jest.fn().mockResolvedValue(tokenOk('abc123')) },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    const cfg = await getPingenConfig(ctx);
    expect(cfg.token).toBe('abc123');
    expect(cfg.apiUrl).toBe('https://api.pingen.com');
    expect(cfg.environment).toBe('production');
    expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
  });

  it('uses staging URLs when environment=staging and fetches the staging credential', async () => {
    const getCreds = jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' });
    const ctx = {
      helpers: { request: jest.fn().mockResolvedValue(tokenOk('stg-token')) },
      getCredentials: getCreds,
    };
    const cfg = await getPingenConfig(ctx, 'staging');
    expect(cfg.apiUrl).toBe('https://api-staging.pingen.com');
    expect(cfg.environment).toBe('staging');
    expect(getCreds).toHaveBeenCalledWith('pingenStagingApi');
    const tokenCall = (ctx.helpers.request as jest.Mock).mock.calls[0][0];
    expect(tokenCall.url).toBe('https://identity-staging.pingen.com/auth/access-tokens');
  });

  it('isolates token cache between environments', async () => {
    const req = jest.fn().mockImplementation(() => Promise.resolve(tokenOk(`tok-${req.mock.calls.length}`)));
    const getCreds = jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' });
    const ctx = { helpers: { request: req }, getCredentials: getCreds };
    const c1 = await getPingenConfig(ctx, 'production');
    const c2 = await getPingenConfig(ctx, 'staging');
    const c3 = await getPingenConfig(ctx, 'production');
    expect(c1.token).toBe('tok-1');
    expect(c2.token).toBe('tok-2');
    expect(c3.token).toBe('tok-1'); // production cache still valid
    expect(req).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['clientId', { clientId: '', clientSecret: 's' }],
    ['clientSecret', { clientId: 'c', clientSecret: '' }],
  ])('throws when %s missing', async (_field, creds) => {
    const ctx = {
      helpers: { request: jest.fn() },
      getCredentials: jest.fn().mockResolvedValue(creds),
    };
    await expect(getPingenConfig(ctx)).rejects.toThrow(/credentials are missing/i);
  });

  it('invalidates cache when clientSecret rotates', async () => {
    const tokens = ['old-token', 'new-token'];
    let call = 0;
    const req = jest.fn().mockImplementation(() => Promise.resolve(tokenOk(tokens[call++] ?? '')));
    const getCreds = jest
      .fn()
      .mockResolvedValueOnce({ clientId: 'c', clientSecret: 'secret-v1' })
      .mockResolvedValueOnce({ clientId: 'c', clientSecret: 'secret-v2' });
    const ctx = { helpers: { request: req }, getCredentials: getCreds };

    const c1 = await getPingenConfig(ctx);
    const c2 = await getPingenConfig(ctx);
    expect(c1.token).toBe('old-token');
    expect(c2.token).toBe('new-token');
    expect(req).toHaveBeenCalledTimes(2);
  });

  it('dedups concurrent callers hitting an expired cache entry', async () => {
    let call = 0;
    const req = jest.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(tokenOk('stale', 60));
      return Promise.resolve(tokenOk('fresh', 3600));
    });
    const ctx = {
      helpers: { request: req },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };

    expect((await getPingenConfig(ctx)).token).toBe('stale');
    expect(req).toHaveBeenCalledTimes(1);

    const [c1, c2] = await Promise.all([getPingenConfig(ctx), getPingenConfig(ctx)]);
    expect(c1.token).toBe('fresh');
    expect(c2.token).toBe('fresh');
    expect(req).toHaveBeenCalledTimes(2);
  });

  it('uses separate cache entries per clientId', async () => {
    const ctx1 = {
      helpers: { request: jest.fn().mockResolvedValue(tokenOk('tok-A')) },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'clientA', clientSecret: 's' }),
    };
    const ctx2 = {
      helpers: { request: jest.fn().mockResolvedValue(tokenOk('tok-B')) },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'clientB', clientSecret: 's' }),
    };
    expect((await getPingenConfig(ctx1)).token).toBe('tok-A');
    expect((await getPingenConfig(ctx2)).token).toBe('tok-B');
    expect((await getPingenConfig(ctx1)).token).toBe('tok-A');
    expect(ctx1.helpers.request).toHaveBeenCalledTimes(1);
    expect(ctx2.helpers.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-string response', { not: 'string' }, /did not return a JSON string/],
    ['invalid JSON', 'not json', /invalid JSON/],
    ['missing fields', JSON.stringify({ access_token: 'x' }), /missing access_token or expires_in/],
  ])('throws on malformed token response: %s', async (_label, value, pattern) => {
    const ctx = {
      helpers: { request: jest.fn().mockResolvedValue(value) },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    await expect(getPingenConfig(ctx)).rejects.toThrow(pattern);
  });

  it('propagates rejection to concurrent callers sharing the same pending fetch', async () => {
    let rejectFetch: (e: Error) => void = () => {};
    const pending = new Promise<string>((_resolve, reject) => {
      rejectFetch = reject;
    });
    const req = jest.fn().mockReturnValueOnce(pending).mockResolvedValue(tokenOk('recovered'));
    const ctx = {
      helpers: { request: req },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    const p1 = getPingenConfig(ctx);
    const p2 = getPingenConfig(ctx);
    rejectFetch(new Error('boom'));
    const results = await Promise.allSettled([p1, p2]);
    expect(results[0]!.status).toBe('rejected');
    // one caller observes the rejected cache entry on its next loop iteration and retries
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('retries fetch after previous pending promise failed', async () => {
    const failing = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(tokenOk('good'));
    const ctx = {
      helpers: { request: failing },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    await expect(getPingenConfig(ctx)).rejects.toThrow(/network/);
    const cfg = await getPingenConfig(ctx);
    expect(cfg.token).toBe('good');
  });

  it('dedups concurrent fetches for same clientId', async () => {
    let resolveFetch: (v: string) => void = () => {};
    const pending = new Promise<string>((r) => {
      resolveFetch = r;
    });
    const req = jest.fn().mockReturnValue(pending);
    const ctx = {
      helpers: { request: req },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    const p1 = getPingenConfig(ctx);
    const p2 = getPingenConfig(ctx);
    resolveFetch(tokenOk('shared'));
    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1.token).toBe('shared');
    expect(c2.token).toBe('shared');
    expect(req).toHaveBeenCalledTimes(1);
  });

  it('reuses cached token within expiry window', async () => {
    const ctx = {
      helpers: { request: jest.fn().mockResolvedValue(tokenOk('abc123')) },
      getCredentials: jest.fn().mockResolvedValue({ clientId: 'c', clientSecret: 's' }),
    };
    await getPingenConfig(ctx);
    await getPingenConfig(ctx);
    expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
  });
});
