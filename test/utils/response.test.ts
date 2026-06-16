import {
  contentTypeOrDefault,
  flattenJsonApi,
  parseFileUploadResponse,
  safeParseJson,
  tryParseJson,
} from '../../utils/response';

describe('tryParseJson', () => {
  it('parses a valid JSON string', () => {
    expect(tryParseJson('{"x":1}')).toEqual({ x: 1 });
  });

  it('returns undefined on invalid JSON instead of throwing', () => {
    expect(tryParseJson('not json')).toBeUndefined();
  });

  it.each([
    ['already-parsed object', { foo: 'bar' }],
    ['already-parsed array', [1, 2, 3]],
    ['number', 42],
    ['null', null],
    ['undefined', undefined],
  ])('returns non-string input unchanged (%s)', (_label, value) => {
    expect(tryParseJson(value)).toEqual(value);
  });
});

describe('safeParseJson', () => {
  it('parses valid JSON strings with a generic type', () => {
    expect(safeParseJson<{ ok: boolean }>('{"ok":true}', 'ctx').ok).toBe(true);
  });
  it('throws a context-annotated error on invalid JSON', () => {
    expect(() => safeParseJson('not json', 'organisations')).toThrow(/organisations: response is not valid JSON/);
  });
  it('returns an already-parsed object unchanged (httpRequest auto-parses JSON)', () => {
    const obj = { foo: 'bar' };
    expect(safeParseJson(obj, 'ctx')).toBe(obj);
  });
  it.each([
    ['number', 42],
    ['undefined', undefined],
    ['null', null],
  ])('throws a context-annotated error when input is not a string (%s)', (_label, value) => {
    expect(() => safeParseJson(value, 'ctx')).toThrow(/ctx: expected a JSON string/);
  });
});

describe('contentTypeOrDefault', () => {
  it('returns mimeType when it is a non-empty string', () => {
    expect(contentTypeOrDefault('image/png')).toBe('image/png');
  });

  it.each([
    ['empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
  ])('falls back to application/pdf for %s', (_label, value) => {
    expect(contentTypeOrDefault(value)).toBe('application/pdf');
  });

  it('accepts a custom fallback', () => {
    expect(contentTypeOrDefault(undefined, 'text/plain')).toBe('text/plain');
  });
});

describe('flattenJsonApi', () => {
  it('returns null/undefined/primitives unchanged', () => {
    expect(flattenJsonApi(null)).toBeNull();
    expect(flattenJsonApi(undefined)).toBeUndefined();
    expect(flattenJsonApi('a string')).toBe('a string');
    expect(flattenJsonApi(42)).toBe(42);
  });

  it('flattens a single resource envelope', () => {
    const result = flattenJsonApi({
      data: { id: 'l1', type: 'letters', attributes: { status: 'sent' } },
    });
    expect(result).toEqual({ id: 'l1', type: 'letters', status: 'sent' });
  });

  it('flattens a collection envelope with meta.total', () => {
    const result = flattenJsonApi({
      data: [
        { id: 'l1', type: 'letters', attributes: { status: 'sent' } },
        { id: 'l2', type: 'letters', attributes: { status: 'valid' } },
      ],
      meta: { total: 42 },
    });
    expect(result).toEqual({
      items: [
        { id: 'l1', type: 'letters', status: 'sent' },
        { id: 'l2', type: 'letters', status: 'valid' },
      ],
      total: 42,
    });
  });

  it('falls back to items.length when meta.total is missing', () => {
    const result = flattenJsonApi({
      data: [{ id: 'l1', type: 'letters', attributes: {} }],
    });
    expect((result as { total: number }).total).toBe(1);
  });

  it('passes through non-JSON:API objects', () => {
    expect(flattenJsonApi({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });

  it('preserves errors array on collection', () => {
    const result = flattenJsonApi({
      data: [],
      errors: [{ detail: 'warn' }],
    });
    expect((result as { errors: unknown[] }).errors).toEqual([{ detail: 'warn' }]);
  });

  it('preserves links on collection', () => {
    const result = flattenJsonApi({
      data: [{ id: 'a', type: 'x', attributes: {} }],
      links: { next: '/page/2' },
    });
    expect((result as { links: unknown }).links).toEqual({ next: '/page/2' });
  });

  it('preserves meta beyond total on collection', () => {
    const result = flattenJsonApi({
      data: [],
      meta: { total: 0, warnings: ['slow'] },
    });
    expect((result as { meta: { warnings: string[] } }).meta.warnings).toEqual(['slow']);
  });

  it('preserves errors on single resource', () => {
    const result = flattenJsonApi({
      data: { id: 'a', type: 'x', attributes: { s: 1 } },
      errors: [{ detail: 'non-fatal' }],
    });
    expect((result as { errors: unknown[] }).errors).toHaveLength(1);
  });

  it('preserves meta on single resource', () => {
    const result = flattenJsonApi({
      data: { id: 'a', type: 'x', attributes: {} },
      meta: { request_id: 'r1' },
    });
    expect((result as { meta: { request_id: string } }).meta.request_id).toBe('r1');
  });
});

describe('parseFileUploadResponse', () => {
  it('returns url + url_signature when shape is valid', () => {
    const raw = { data: { attributes: { url: 'u', url_signature: 's' } } };
    expect(parseFileUploadResponse(raw)).toEqual({ url: 'u', url_signature: 's' });
  });

  it('tolerates extra fields and missing id/type', () => {
    const raw = { data: { attributes: { url: 'u', url_signature: 's', extra: 1 } } };
    expect(() => parseFileUploadResponse(raw)).not.toThrow();
  });

  it.each([
    ['null input', null],
    ['empty object', {}],
    ['url missing', { data: { attributes: { url_signature: 's' } } }],
    ['url_signature missing', { data: { attributes: { url: 'u' } } }],
    ['data.attributes missing', { data: {} }],
  ])('throws on %s', (_label, input) => {
    expect(() => parseFileUploadResponse(input)).toThrow(/missing url or url_signature/);
  });
});
