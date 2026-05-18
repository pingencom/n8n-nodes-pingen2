import { letterHandlers } from '../../../../nodes/Pingen/actions/letter';
import {
  createMockCtx,
  mockFileUploadResponse,
  mockJsonApiSingle,
  mockJsonApiCollection,
} from '../../../helpers/mockCtx';

const ORG = 'org-1';
const API = 'https://api.pingen.com';
const HEADERS = { Authorization: 'Bearer t', Accept: 'application/vnd.api+json' };

describe('letterHandlers.uploadAndCreate', () => {
  it('uploads file, creates letter without auto_send', async () => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'invoice.pdf',
        addressPosition: 'left',
        autoSend: false,
        deliveryProduct: '',
        printMode: '',
        printSpectrum: '',
        registeredRecipient: {},
        registeredSender: {},
        presetIdCreate: '',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('letter-1', 'letters', { status: 'valid' })],
    });
    const result = (await letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)) as {
      id: string;
      status: string;
    };
    expect(result.id).toBe('letter-1');
    expect(result.status).toBe('valid');
    expect(ctx.helpers.request).toHaveBeenCalledTimes(3);
    const createCall = (ctx.helpers.request as jest.Mock).mock.calls[2][0];
    expect(createCall.url).toContain('/organisations/org-1/deliveries/letters');
    const body = JSON.parse(createCall.body);
    expect(body.data.attributes.auto_send).toBe(false);
    expect(body.data.attributes.delivery_product).toBeUndefined();
  });

  it.each([
    ['binary.fileName', { fileName: 'from-binary.pdf', mimeType: 'application/pdf' }, 'from-binary.pdf'],
    ['document.pdf fallback', { mimeType: 'application/pdf' }, 'document.pdf'],
  ])('picks file_original_name from %s', async (_label, binary, expected) => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: '',
        addressPosition: 'left',
        autoSend: false,
        registeredRecipient: {},
        registeredSender: {},
      },
      binary,
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('letter-1', 'letters', {})],
    });
    await letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.file_original_name).toBe(expected);
  });

  it('falls back to application/pdf when binaryData has no mimeType', async () => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'x.pdf',
        addressPosition: 'left',
        autoSend: false,
        registeredRecipient: {},
        registeredSender: {},
      },
      binary: {},
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('letter-1', 'letters', {})],
    });
    await letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const putCall = (ctx.helpers.request as jest.Mock).mock.calls[1][0];
    expect(putCall.headers['Content-Type']).toBe('application/pdf');
  });

  it.each([
    [
      'delivery_product',
      { deliveryProduct: '', printMode: 'simplex', printSpectrum: 'grayscale' },
      /Delivery Product is required/,
    ],
    ['print_mode', { deliveryProduct: 'cheap', printMode: '', printSpectrum: 'grayscale' }, /Print Mode is required/],
    [
      'print_spectrum',
      { deliveryProduct: 'cheap', printMode: 'simplex', printSpectrum: '' },
      /Print Spectrum is required/,
    ],
  ])('throws when auto_send without %s', async (_field, overrides, pattern) => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'x.pdf',
        addressPosition: 'left',
        autoSend: true,
        ...overrides,
      },
      requests: [mockFileUploadResponse(), ''],
    });
    await expect(letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)).rejects.toThrow(pattern);
  });

  it('throws when registered auto_send without recipient', async () => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'x.pdf',
        addressPosition: 'left',
        autoSend: true,
        deliveryProduct: 'registered',
        printMode: 'simplex',
        printSpectrum: 'grayscale',
        registeredRecipient: {},
        registeredSender: {},
      },
      requests: [mockFileUploadResponse(), ''],
    });
    await expect(letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API)).rejects.toThrow(
      /Recipient address is required/,
    );
  });

  it('completes auto_send with non-registered delivery product and attaches preset', async () => {
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'x.pdf',
        addressPosition: 'left',
        autoSend: true,
        deliveryProduct: 'cheap',
        printMode: 'simplex',
        printSpectrum: 'grayscale',
        registeredRecipient: {},
        registeredSender: {},
        presetIdCreate: 'preset-xyz',
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('letter-1', 'letters', { status: 'valid' })],
    });
    await letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.delivery_product).toBe('cheap');
    expect(body.data.attributes.meta_data).toBeUndefined();
    expect(body.data.relationships.preset.data.id).toBe('preset-xyz');
  });

  const addr = { name: 'Jane', street: 'X', number: '1', zip: '8001', city: 'Zurich', country: 'CH' };
  it.each([
    ['both', { details: addr }, { details: addr }, { recipient: 'Jane', sender: 'Jane' }],
    ['recipient only', { details: addr }, {}, { recipient: 'Jane', sender: undefined }],
    ['sender only', {}, { details: addr }, { recipient: undefined, sender: 'Jane' }],
  ] as const)('attaches meta_data when %s present', async (_label, recipient, sender, expected) => {
    // "sender only" implies no recipient — registered mail would reject, so use non-registered
    const isRegistered = expected.recipient !== undefined;
    const ctx = createMockCtx({
      params: {
        binaryPropertyName: 'data',
        fileOriginalName: 'x.pdf',
        addressPosition: 'left',
        autoSend: isRegistered,
        deliveryProduct: isRegistered ? 'registered' : 'cheap',
        printMode: 'simplex',
        printSpectrum: 'grayscale',
        registeredRecipient: recipient,
        registeredSender: sender,
      },
      requests: [mockFileUploadResponse(), '', mockJsonApiSingle('letter-1', 'letters', {})],
    });
    await letterHandlers.uploadAndCreate(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[2][0].body);
    expect(body.data.attributes.meta_data?.recipient?.name).toBe(expected.recipient);
    expect(body.data.attributes.meta_data?.sender?.name).toBe(expected.sender);
  });
});

describe('letterHandlers.send', () => {
  it('sends letter with no address override', async () => {
    const ctx = createMockCtx({
      params: {
        letterId: 'letter-1',
        deliveryProductSend: 'cheap',
        printModeSend: 'simplex',
        printSpectrumSend: 'grayscale',
        registeredRecipientSend: {},
        registeredSenderSend: {},
      },
      requests: [mockJsonApiSingle('letter-1', 'letters', { status: 'sent' })],
    });
    const result = (await letterHandlers.send(ctx, 0, ORG, HEADERS, API)) as { status: string };
    expect(result.status).toBe('sent');
    const call = (ctx.helpers.request as jest.Mock).mock.calls[0][0];
    expect(call.url).toContain('/letters/letter-1/send');
    expect(JSON.parse(call.body).data.attributes.meta_data).toBeUndefined();
  });

  it('sends registered letter with recipient meta_data', async () => {
    const addr = { name: 'Jane', street: 'X', number: '1', zip: '8001', city: 'Zurich', country: 'CH' };
    const ctx = createMockCtx({
      params: {
        letterId: 'letter-1',
        deliveryProductSend: 'registered',
        printModeSend: 'simplex',
        printSpectrumSend: 'grayscale',
        registeredRecipientSend: { details: addr },
        registeredSenderSend: {},
      },
      requests: [mockJsonApiSingle('letter-1', 'letters', { status: 'sent' })],
    });
    await letterHandlers.send(ctx, 0, ORG, HEADERS, API);
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[0][0].body);
    expect(body.data.attributes.meta_data.recipient.name).toBe('Jane');
  });
});

describe('letterHandlers.get', () => {
  it('fetches single letter', async () => {
    const ctx = createMockCtx({
      params: { letterId: 'letter-1' },
      requests: [mockJsonApiSingle('letter-1', 'letters', { status: 'sent' })],
    });
    const result = (await letterHandlers.get(ctx, 0, ORG, HEADERS, API)) as { id: string };
    expect(result.id).toBe('letter-1');
  });
});

describe('letterHandlers.getAll', () => {
  it('fetches letters with no query', async () => {
    const ctx = createMockCtx({
      params: { pageNumber: 0 },
      requests: [mockJsonApiCollection([{ id: 'l1', type: 'letters', attributes: { status: 'valid' } }])],
    });
    const result = (await letterHandlers.getAll(ctx, 0, ORG, HEADERS, API)) as {
      items: Array<{ id: string }>;
      total: number;
    };
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).not.toContain('?');
  });

  it('appends query string', async () => {
    const ctx = createMockCtx({
      params: { pageNumber: 2 },
      requests: [mockJsonApiCollection([])],
    });
    await letterHandlers.getAll(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).toContain('?page[number]=2');
  });
});

describe('letterHandlers.calculatePrice', () => {
  it('sends price calculator request', async () => {
    const ctx = createMockCtx({
      params: {
        country: 'CH',
        deliveryProductPrice: 'cheap',
        printModePrice: 'simplex',
        printSpectrumPrice: 'grayscale',
        paperTypesPrice: ['normal'],
      },
      requests: [mockJsonApiSingle('calc-1', 'letter_price_calculator', { price_currency: 'CHF' })],
    });
    const result = (await letterHandlers.calculatePrice(ctx, 0, ORG, HEADERS, API)) as { price_currency: string };
    expect(result.price_currency).toBe('CHF');
    const body = JSON.parse((ctx.helpers.request as jest.Mock).mock.calls[0][0].body);
    expect(body.data.attributes.country).toBe('CH');
    expect(body.data.attributes.paper_types).toEqual(['normal']);
  });
});

describe('letterHandlers.cancel', () => {
  it('cancels letter', async () => {
    const ctx = createMockCtx({
      params: { letterId: 'letter-1' },
      requests: [mockJsonApiSingle('letter-1', 'letters', { status: 'cancelled' })],
    });
    const result = (await letterHandlers.cancel(ctx, 0, ORG, HEADERS, API)) as { status: string };
    expect(result.status).toBe('cancelled');
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].method).toBe('PATCH');
  });
});
