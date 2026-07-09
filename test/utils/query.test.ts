import type { IExecuteFunctions } from 'n8n-workflow';
import { buildQueryString } from '../../utils/query';

type Params = {
  pageNumber?: number;
  pageSize?: number;
  sort?: string;
  filters?: { filter?: Array<{ key: string; value: string }> };
};

function makeCtx(params: Params): IExecuteFunctions {
  return {
    getNodeParameter: jest.fn((name: string, _i: number, def?: unknown) => {
      if (name in params) return (params as Record<string, unknown>)[name];
      return def;
    }),
  } as unknown as IExecuteFunctions;
}

describe('buildQueryString', () => {
  it('returns empty string when no parameters are set', () => {
    expect(buildQueryString(makeCtx({}), 0)).toBe('');
  });

  it('emits page[number] and page[limit] with raw brackets', () => {
    const qs = buildQueryString(makeCtx({ pageNumber: 2, pageSize: 50 }), 0);
    expect(qs).toBe('?page[number]=2&page[limit]=50');
  });

  it('skips page params when zero or negative', () => {
    expect(buildQueryString(makeCtx({ pageNumber: 0, pageSize: 0 }), 0)).toBe('');
    expect(buildQueryString(makeCtx({ pageNumber: -1, pageSize: -5 }), 0)).toBe('');
  });

  it('keeps commas in sort unencoded, encodes each field separately', () => {
    const qs = buildQueryString(makeCtx({ sort: '-created_at,name' }), 0);
    expect(qs).toBe('?sort=-created_at,name');
  });

  it('encodes special characters inside individual sort fields', () => {
    const qs = buildQueryString(makeCtx({ sort: 'weird field,normal' }), 0);
    expect(qs).toBe('?sort=weird%20field,normal');
  });

  it('ignores empty segments in sort', () => {
    const qs = buildQueryString(makeCtx({ sort: ',,-created_at,,name,' }), 0);
    expect(qs).toBe('?sort=-created_at,name');
  });

  it('drops sort entirely when it collapses to empty after filtering', () => {
    expect(buildQueryString(makeCtx({ sort: ',,,' }), 0)).toBe('');
    expect(buildQueryString(makeCtx({ sort: ' , , ' }), 0)).toBe('');
  });

  it('emits filter[key] with raw brackets and encoded value', () => {
    const qs = buildQueryString(makeCtx({ filters: { filter: [{ key: 'status', value: 'sent' }] } }), 0);
    expect(qs).toBe('?filter[status]=sent');
  });

  it('encodes filter values with spaces and special chars', () => {
    const qs = buildQueryString(makeCtx({ filters: { filter: [{ key: 'name', value: 'John & Jane' }] } }), 0);
    expect(qs).toBe('?filter[name]=John%20%26%20Jane');
  });

  it('emits multiple filters joined with &', () => {
    const qs = buildQueryString(
      makeCtx({
        filters: {
          filter: [
            { key: 'status', value: 'sent' },
            { key: 'created_at[gte]', value: '2026-01-01' },
          ],
        },
      }),
      0,
    );
    expect(qs).toContain('filter[status]=sent');
    expect(qs).toContain('filter[created_at%5Bgte%5D]=2026-01-01');
  });

  it('skips filter pairs missing key or value', () => {
    const qs = buildQueryString(
      makeCtx({
        filters: {
          filter: [
            { key: '', value: 'x' },
            { key: 'ok', value: 'yes' },
          ],
        },
      }),
      0,
    );
    expect(qs).toBe('?filter[ok]=yes');
  });

  it('combines page, sort, and filters with correct order and separators', () => {
    const qs = buildQueryString(
      makeCtx({
        pageNumber: 1,
        pageSize: 25,
        sort: '-created_at',
        filters: { filter: [{ key: 'status', value: 'sent' }] },
      }),
      0,
    );
    expect(qs).toBe('?page[number]=1&page[limit]=25&sort=-created_at&filter[status]=sent');
  });
});
