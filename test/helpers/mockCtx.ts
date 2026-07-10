import type { IExecuteFunctions } from 'n8n-workflow';

type MockCtxOptions = {
  params?: Record<string, unknown>;
  requests?: unknown[];
  requestImpl?: (options: Record<string, unknown>, callIndex: number) => unknown;
  binary?: { mimeType?: string; fileName?: string };
  binaryBuffer?: Buffer;
  credentials?: Record<string, unknown>;
  inputData?: unknown[];
  continueOnFail?: boolean;
};

export function createMockCtx(opts: MockCtxOptions = {}) {
  const requestMock = jest.fn();
  if (opts.requestImpl) {
    let callIndex = 0;
    requestMock.mockImplementation((options: Record<string, unknown>) => {
      const result = opts.requestImpl!(options, callIndex);
      callIndex += 1;
      return Promise.resolve(result);
    });
  } else if (opts.requests) {
    opts.requests.forEach((r) => {
      if (r instanceof Error) {
        requestMock.mockRejectedValueOnce(r);
      } else {
        requestMock.mockResolvedValueOnce(r);
      }
    });
  }

  const ctx = {
    getNodeParameter: jest.fn((name: string, _i: number, def?: unknown) => {
      if (opts.params && name in opts.params) return opts.params[name];
      if (def !== undefined) return def;
      return undefined;
    }),
    getCurrentNodeParameter: jest.fn((name: string) => {
      if (opts.params && name in opts.params) return opts.params[name];
      return undefined;
    }),
    helpers: {
      httpRequest: requestMock,
      // n8n's oAuth2Api credential injects the Bearer token here. Tests drive both authed and
      // unauthenticated calls off the same `requests`/`requestImpl` queue, so forward to
      // `requestMock` (dropping the credential-type arg) to preserve call order and responses.
      httpRequestWithAuthentication: jest.fn((_credentialsType: string, options: Record<string, unknown>) =>
        requestMock(options),
      ),
      assertBinaryData: jest.fn(() => opts.binary ?? { mimeType: 'application/pdf', fileName: 'doc.pdf' }),
      getBinaryDataBuffer: jest.fn(() => Promise.resolve(opts.binaryBuffer ?? Buffer.from('pdf-bytes'))),
    },
    getCredentials: jest.fn(() => Promise.resolve(opts.credentials ?? { clientId: 'cid', clientSecret: 'csec' })),
    getInputData: jest.fn(() => opts.inputData ?? [{ json: {} }]),
    getNode: jest.fn(() => ({ name: 'Pingen', type: 'pingen', typeVersion: 1 })),
    continueOnFail: jest.fn(() => opts.continueOnFail ?? false),
  };

  return ctx as unknown as IExecuteFunctions & typeof ctx;
}

export const mockJsonApiSingle = (id: string, type: string, attributes: Record<string, unknown>) => ({
  data: { id, type, attributes },
});

export const mockJsonApiCollection = (
  items: Array<{ id: string; type: string; attributes: Record<string, unknown> }>,
  total?: number,
) => ({ data: items, meta: { total: total ?? items.length } });

export const mockFileUploadResponse = (url = 'https://storage.example.com/upload?sig=abc') => ({
  data: { id: 'upload-1', type: 'file_uploads', attributes: { url, url_signature: 'signature-xyz' } },
});

export const mockTokenResponse = (token = 'tok-xyz', expiresIn = 3600) => ({
  access_token: token,
  expires_in: expiresIn,
});
