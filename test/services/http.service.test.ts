import { pingenRequest } from '../../services/http.service';

describe('pingenRequest (retry)', () => {
  it('returns on first success', async () => {
    const ctx = { helpers: { request: jest.fn().mockResolvedValue('ok') } };
    const result = await pingenRequest(ctx, { method: 'GET', url: 'x' });
    expect(result).toBe('ok');
    expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx up to maxAttempts', async () => {
    const err = Object.assign(new Error('fail'), { statusCode: 503 });
    const ctx = { helpers: { request: jest.fn().mockRejectedValue(err) } };
    await expect(pingenRequest(ctx, { method: 'GET', url: 'x' }, 2)).rejects.toThrow(/fail/);
    expect(ctx.helpers.request).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 and honours Retry-After header', async () => {
    const err429 = Object.assign(new Error('limit'), {
      statusCode: 429,
      response: { headers: { 'retry-after': '1' } },
    });
    const req = jest.fn().mockRejectedValueOnce(err429).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    const result = await pingenRequest(ctx, { method: 'GET', url: 'x' });
    expect(result).toBe('ok');
    expect(req).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['GET', 400],
    ['POST', 400],
    ['GET', 404],
  ])('does not retry %s on %i (non-429 4xx)', async (method, statusCode) => {
    const err = Object.assign(new Error('bad'), { statusCode });
    const ctx = { helpers: { request: jest.fn().mockRejectedValue(err) } };
    await expect(pingenRequest(ctx, { method, url: 'x' })).rejects.toThrow();
    expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
  });

  it('handles non-string retry-after', async () => {
    const err500 = Object.assign(new Error('boom'), {
      statusCode: 500,
      response: { headers: { 'retry-after': ['bad'] } },
    });
    const req = jest.fn().mockRejectedValueOnce(err500).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    const result = await pingenRequest(ctx, { method: 'GET', url: 'x' });
    expect(result).toBe('ok');
  });

  it('handles error with no statusCode', async () => {
    const err = new Error('network');
    const ctx = { helpers: { request: jest.fn().mockRejectedValue(err) } };
    await expect(pingenRequest(ctx, { method: 'GET', url: 'x' })).rejects.toThrow(/network/);
    expect(ctx.helpers.request).toHaveBeenCalledTimes(1);
  });

  it('retries POST on 5xx when Idempotency-Key is attached', async () => {
    const err = Object.assign(new Error('server'), { statusCode: 503 });
    const req = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    const result = await pingenRequest(ctx, { method: 'POST', url: 'x' });
    expect(result).toBe('ok');
    expect(req).toHaveBeenCalledTimes(2);
  });

  it('retries PATCH on 429 (always safe)', async () => {
    const err = Object.assign(new Error('limit'), { statusCode: 429 });
    const req = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    const result = await pingenRequest(ctx, { method: 'PATCH', url: 'x' });
    expect(result).toBe('ok');
    expect(req).toHaveBeenCalledTimes(2);
  });

  it('attaches Idempotency-Key on POST and reuses it across retries', async () => {
    const err = Object.assign(new Error('server'), { statusCode: 503 });
    const req = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    await pingenRequest(ctx, { method: 'POST', url: 'x', headers: { 'X-Other': 'preserved' } });
    const call1 = req.mock.calls[0][0] as { headers: Record<string, string> };
    const call2 = req.mock.calls[1][0] as { headers: Record<string, string> };
    expect(call1.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(call1.headers['Idempotency-Key']).toBe(call2.headers['Idempotency-Key']);
    expect(call1.headers['X-Other']).toBe('preserved');
  });

  it('does NOT attach Idempotency-Key on GET', async () => {
    const req = jest.fn().mockResolvedValue('ok');
    const ctx = { helpers: { request: req } };
    await pingenRequest(ctx, { method: 'GET', url: 'x' });
    const call = req.mock.calls[0][0] as { headers?: Record<string, string> };
    expect(call.headers?.['Idempotency-Key']).toBeUndefined();
  });

  it('does NOT attach Idempotency-Key on PUT (signed URL uploads)', async () => {
    const req = jest.fn().mockResolvedValue('ok');
    const ctx = { helpers: { request: req } };
    await pingenRequest(ctx, { method: 'PUT', url: 'signed-url' });
    const call = req.mock.calls[0][0] as { headers?: Record<string, string> };
    expect(call.headers?.['Idempotency-Key']).toBeUndefined();
  });

  it.each([
    ['zero/negative', '-5'],
    ['non-numeric', 'later'],
  ])('ignores invalid Retry-After value (%s)', async (_label, retryAfter) => {
    const err429 = Object.assign(new Error('limit'), {
      statusCode: 429,
      response: { headers: { 'retry-after': retryAfter } },
    });
    const req = jest.fn().mockRejectedValueOnce(err429).mockResolvedValueOnce('ok');
    const ctx = { helpers: { request: req } };
    const result = await pingenRequest(ctx, { method: 'GET', url: 'x' });
    expect(result).toBe('ok');
  });

  it('defaults method to GET when omitted', async () => {
    const err = Object.assign(new Error('fail'), { statusCode: 503 });
    const ctx = { helpers: { request: jest.fn().mockRejectedValue(err) } };
    await expect(pingenRequest(ctx, { url: 'x' }, 2)).rejects.toThrow();
    expect(ctx.helpers.request).toHaveBeenCalledTimes(2);
  });
});
