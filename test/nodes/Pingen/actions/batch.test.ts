import { batchHandlers } from '../../../../nodes/Pingen/actions/batch';
import {
  createMockCtx,
  mockFileUploadResponse,
  mockJsonApiSingle,
  mockJsonApiCollection,
} from '../../../helpers/mockCtx';

const ORG = 'org-1';
const API = 'https://api.pingen.com';
const HEADERS = { Authorization: 'Bearer t' };

describe('batchHandlers.uploadAndCreate', () => {
  const base = {
    batchBinaryPropertyName: 'data',
    batchName: 'Q4 Invoices',
    batchIcon: 'document',
    batchFileOriginalName: 'invoices.pdf',
    batchAddressPosition: 'left',
  };

  it('creates batch with merge+page grouping and split_size', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'page',
        batchSplitSize: 2,
        batchPresetId: '',
      },
      requests: [
        mockFileUploadResponse(),
        '',
        JSON.stringify({ data: { id: 'batch-1', type: 'batches', attributes: { status: 'created' } } }),
      ],
    });
    const result = (await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)) as { id: string };
    expect(result.id).toBe('batch-1');
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.grouping_options_split_size).toBe(2);
    expect(body.data.attributes.grouping_options_split_type).toBe('page');
  });

  it('falls back to application/pdf when binaryData has no mimeType', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'page',
        batchSplitSize: 2,
      },
      binary: {},
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const putCall = (ctx.helpers.request as jest.Mock).mock.calls[1][0];
    expect(putCall.headers['Content-Type']).toBe('application/pdf');
  });

  it('throws on non-positive split_size', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'page',
        batchSplitSize: 0,
      },
      requests: [mockFileUploadResponse(), ''],
    });
    await expect(batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)).rejects.toThrow(
      /Split Size must be a positive integer/,
    );
  });

  it('adds split_position for qr_invoice', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'qr_invoice',
        batchSplitPosition: 'first_page',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.grouping_options_split_position).toBe('first_page');
  });

  it('skips split_position when empty', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'qr_invoice',
        batchSplitPosition: '',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.grouping_options_split_position).toBeUndefined();
  });

  it('adds split_separator for custom', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'custom',
        batchSplitSeparator: '---END---',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.grouping_options_split_separator).toBe('---END---');
  });

  it('throws when split_separator empty for custom split type', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'custom',
        batchSplitSeparator: '',
      },
      requests: [mockFileUploadResponse(), ''],
    });
    await expect(batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)).rejects.toThrow(
      /Split Separator is required/,
    );
  });

  it('zip grouping forces split_type=file and skips merge branch', async () => {
    const ctx = createMockCtx({
      params: { ...base, batchGroupingType: 'zip' },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.grouping_options_split_type).toBe('file');
    expect(body.data.attributes.grouping_options_split_size).toBeUndefined();
  });

  it('attaches preset when provided', async () => {
    const ctx = createMockCtx({
      params: {
        ...base,
        batchGroupingType: 'merge',
        batchSplitType: 'page',
        batchSplitSize: 1,
        batchPresetId: 'preset-1',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.relationships.preset.data.id).toBe('preset-1');
  });
});

describe('batchHandlers.send', () => {
  it('sends with single delivery product', async () => {
    const ctx = createMockCtx({
      params: {
        batchId: 'batch-1',
        batchDeliveryProducts: { pair: [{ country: 'CH', deliveryProduct: 'cheap' }] },
        batchPrintMode: 'simplex',
        batchPrintSpectrum: 'grayscale',
      },
      requests: [mockJsonApiSingle('batch-1', 'batches', { status: 'sent' })],
    });
    const result = (await batchHandlers.send(ctx, 0, ORG, HEADERS, API)) as { status: string };
    expect(result.status).toBe('sent');
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[0][0].body);
    expect(body.data.attributes.delivery_products).toEqual([{ country: 'CH', delivery_product: 'cheap' }]);
  });

  it('filters empty pair entries', async () => {
    const ctx = createMockCtx({
      params: {
        batchId: 'batch-1',
        batchDeliveryProducts: {
          pair: [
            { country: 'CH', deliveryProduct: 'cheap' },
            { country: '', deliveryProduct: 'cheap' },
            { country: 'DE', deliveryProduct: '' },
          ],
        },
        batchPrintMode: 'simplex',
        batchPrintSpectrum: 'grayscale',
      },
      requests: [mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await batchHandlers.send(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[0][0].body);
    expect(body.data.attributes.delivery_products).toHaveLength(1);
  });

  it('handles missing pair array', async () => {
    const ctx = createMockCtx({
      params: {
        batchId: 'batch-1',
        batchDeliveryProducts: {},
        batchPrintMode: 'simplex',
        batchPrintSpectrum: 'grayscale',
      },
      requests: [mockJsonApiSingle('batch-1', 'batches', {})],
    });
    await expect(batchHandlers.send(ctx, 0, ORG, HEADERS, API)).rejects.toThrow(/at least one delivery_product/);
  });
});

describe('batchHandlers.get', () => {
  it('fetches one batch', async () => {
    const ctx = createMockCtx({
      params: { batchId: 'batch-1' },
      requests: [mockJsonApiSingle('batch-1', 'batches', { name: 'x' })],
    });
    const result = (await batchHandlers.get(ctx, 0, ORG, HEADERS, API)) as { id: string };
    expect(result.id).toBe('batch-1');
  });
});

describe('batchHandlers.getAll', () => {
  it('without query params', async () => {
    const ctx = createMockCtx({
      params: { pageNumber: 0 },
      requests: [mockJsonApiCollection([{ id: 'b1', type: 'batches', attributes: {} }])],
    });
    await batchHandlers.getAll(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).not.toContain('?');
  });

  it('with query params', async () => {
    const ctx = createMockCtx({
      params: { filters: { filter: [{ key: 'name', value: 'Q4' }] } },
      requests: [mockJsonApiCollection([])],
    });
    await batchHandlers.getAll(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).toContain('?filter[name]=Q4');
  });
});

describe('batchHandlers.cancel', () => {
  it('patches cancel endpoint', async () => {
    const ctx = createMockCtx({
      params: { batchId: 'batch-1' },
      requests: [mockJsonApiSingle('batch-1', 'batches', { status: 'cancelled' })],
    });
    await batchHandlers.cancel(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].method).toBe('PATCH');
  });
});

describe('batchHandlers.delete', () => {
  it('returns deleted sentinel when API returns empty body', async () => {
    const ctx = createMockCtx({
      params: { batchId: 'batch-1' },
      requests: [''],
    });
    const result = (await batchHandlers['delete'](ctx, 0, ORG, HEADERS, API)) as {
      deleted: boolean;
      batchId: string;
    };
    expect(result.deleted).toBe(true);
    expect(result.batchId).toBe('batch-1');
  });

  it('flattens response when API returns body', async () => {
    const ctx = createMockCtx({
      params: { batchId: 'batch-1' },
      requests: [mockJsonApiSingle('batch-1', 'batches', { status: 'deleted' })],
    });
    const result = (await batchHandlers['delete'](ctx, 0, ORG, HEADERS, API)) as { status: string };
    expect(result.status).toBe('deleted');
  });
});

describe('batchHandlers.getStatistics', () => {
  it('fetches statistics', async () => {
    const ctx = createMockCtx({
      params: { batchId: 'batch-1' },
      requests: [mockJsonApiSingle('batch-1', 'batch_statistics', { total_letters: 10 })],
    });
    const result = (await batchHandlers.getStatistics(ctx, 0, ORG, HEADERS, API)) as { total_letters: number };
    expect(result.total_letters).toBe(10);
  });
});
