import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { Pingen } from '../../../nodes/Pingen/Pingen.node';
import { clearTokenCache } from '../../../services/auth.service';
import { createMockCtx, mockJsonApiSingle } from '../../helpers/mockCtx';

const node = new Pingen();

beforeEach(() => {
  clearTokenCache();
});

const tokenResponse = { access_token: 'tok-xyz', expires_in: 3600 };

const mockExecuteCtx = (overrides: Parameters<typeof createMockCtx>[0] = {}) =>
  createMockCtx({
    inputData: [{ json: {} }],
    ...overrides,
  });

describe('Pingen.execute() dispatch', () => {
  it.each([
    [
      'letter.get',
      { resource: 'letter', operation: 'get', letterId: 'letter-1' },
      mockJsonApiSingle('letter-1', 'letters', { status: 'sent' }),
      { id: 'letter-1' },
    ],
    [
      'batch.get',
      { resource: 'batch', operation: 'get', batchId: 'batch-1' },
      mockJsonApiSingle('batch-1', 'batches', { status: 'created' }),
      { id: 'batch-1' },
    ],
    [
      'letterEvent.getIssues',
      { resource: 'letterEvent', operation: 'getIssues', pageNumber: 0 },
      { data: [], meta: { total: 0 } },
      { total: 0 },
    ],
  ] as const)('routes %s through the registry', async (_label, params, response, expected) => {
    const ctx = mockExecuteCtx({
      params: { organisationId: 'org-1', ...params },
      requests: [tokenResponse, response],
    });
    const result = await node.execute.call(ctx);
    expect(result[0]).toHaveLength(1);
    expect(result[0]![0]!.json).toMatchObject(expected);
  });

  it('throws NodeOperationError for unknown operation', async () => {
    const ctx = mockExecuteCtx({
      params: { organisationId: 'org-1', resource: 'letter', operation: 'xxxUnknown' },
      requests: [tokenResponse],
    });
    await expect(node.execute.call(ctx)).rejects.toThrow(/Unknown operation/);
  });

  describe('continueOnFail error extraction', () => {
    const errParams = { organisationId: 'org-1', resource: 'letter', operation: 'get', letterId: 'l1' };
    const buildCtx = (error: unknown) =>
      mockExecuteCtx({ params: errParams, requests: [tokenResponse, error], continueOnFail: true });

    it.each([
      [
        'JSON:API errors[].detail with statusCode prefix',
        Object.assign(new Error('bad'), {
          response: { status: 404, data: '{"errors":[{"detail":"not found"}]}' },
        }),
        { statusCode: 404, error: '[404] not found' },
      ],
      [
        'error.body.error.message',
        Object.assign(new Error('network'), { response: { data: '{"error":{"message":"server boom"}}' } }),
        { error: 'server boom' },
      ],
      [
        'error.body.message',
        Object.assign(new Error('network'), { response: { data: '{"message":"plain message"}' } }),
        { error: 'plain message' },
      ],
      [
        'multiple JSON:API errors joined with semicolons',
        Object.assign(new Error('x'), {
          response: { data: '{"errors":[{"detail":"first"},{"detail":"second"},{"title":"third"}]}' },
        }),
        { error: 'first; second; third' },
      ],
      [
        'errors[].title when detail absent',
        Object.assign(new Error('orig'), { response: { data: '{"errors":[{"title":"Only title"}]}' } }),
        { error: 'Only title' },
      ],
      [
        'error.response.body already parsed (object)',
        Object.assign(new Error('orig'), {
          response: { status: 400, data: { error: { message: 'parsed from object' } } },
        }),
        { error: '[400] parsed from object' },
      ],
      [
        'falls back to err.message when body has no known error shape',
        Object.assign(new Error('original'), { response: { data: '{"unrelated":"field"}' } }),
        { error: 'original' },
      ],
      [
        'skips null entries inside errors[]',
        Object.assign(new Error('x'), { response: { data: '{"errors":[null,{"detail":"real"}]}' } }),
        { error: 'real' },
      ],
      [
        'ignores errors field when not an array',
        Object.assign(new Error('orig'), { response: { data: '{"errors":"not-an-array"}' } }),
        { error: 'orig' },
      ],
    ])('%s', async (_label, error, expected) => {
      const result = await node.execute.call(buildCtx(error));
      expect(result[0]![0]!.json).toMatchObject(expected);
    });

    it.each([
      ['JSON body that is not an object', '42'],
      ['body is non-JSON text', 'not json at all, just text'],
    ])('treats %s as non-JSON', async (_label, body) => {
      const result = await node.execute.call(buildCtx(Object.assign(new Error('x'), { response: { data: body } })));
      expect((result[0]![0]!.json as { error: string }).error).toContain('non-JSON');
    });
  });

  it('wraps error in NodeOperationError when not continueOnFail', async () => {
    const ctx = mockExecuteCtx({
      params: { organisationId: 'org-1', resource: 'letter', operation: 'get', letterId: 'l1' },
      requests: [tokenResponse, new Error('boom')],
      continueOnFail: false,
    });
    await expect(node.execute.call(ctx)).rejects.toThrow(/boom/);
  });
});

describe('Pingen.loadOptions.getOrganisations', () => {
  const loadOptions = node.methods.loadOptions.getOrganisations;

  it('throws when credentials are missing', async () => {
    const ctx = createMockCtx({ credentials: { clientId: '', clientSecret: '' } });
    await expect(loadOptions.call(ctx as unknown as ILoadOptionsFunctions)).rejects.toThrow(/credentials are missing/i);
  });

  it('throws when token endpoint fails', async () => {
    const ctx = createMockCtx({
      credentials: { clientId: 'c', clientSecret: 's' },
      requests: [new Error('bad creds')],
    });
    await expect(loadOptions.call(ctx as unknown as ILoadOptionsFunctions)).rejects.toThrow(/bad creds/);
  });

  it('throws when orgs endpoint fails', async () => {
    const ctx = createMockCtx({
      credentials: { clientId: 'c', clientSecret: 's' },
      requests: [{ access_token: 'tok', expires_in: 3600 }, new Error('forbidden')],
    });
    await expect(loadOptions.call(ctx as unknown as ILoadOptionsFunctions)).rejects.toThrow(/forbidden/);
  });

  it('returns every organisation, flagging non-active status in the label', async () => {
    const ctx = createMockCtx({
      credentials: { clientId: 'c', clientSecret: 's' },
      requests: [
        { access_token: 'tok', expires_in: 3600 },
        {
          data: [
            {
              id: 'org-a',
              type: 'organisations',
              attributes: { name: 'Acme', status: 'active', plan: 'pro', default_country: 'CH' },
            },
            {
              id: 'org-b',
              type: 'organisations',
              attributes: { name: 'Inactive Co', status: 'inactive', plan: 'free', default_country: 'DE' },
            },
          ],
        },
      ],
    });
    const result = await loadOptions.call(ctx as unknown as ILoadOptionsFunctions);
    expect(result).toEqual([
      { name: 'Acme (CH)', value: 'org-a' },
      { name: 'Inactive Co (DE) [inactive]', value: 'org-b' },
    ]);
  });
});

// --- description / shape tests ---
describe('Pingen node description', () => {
  const n = new Pingen();

  it('has correct name and display name', () => {
    expect(n.description.name).toBe('pingen');
    expect(n.description.displayName).toBe('Pingen');
  });

  it('declares both production and staging credentials (conditional on environment)', () => {
    const credNames = n.description.credentials?.map((c) => c.name);
    expect(credNames).toEqual(expect.arrayContaining(['pingenApi', 'pingenStagingApi']));
    expect(credNames).toHaveLength(2);
  });

  it('has an Environment switch as first property', () => {
    const first = n.description.properties[0]!;
    expect(first.name).toBe('environment');
    const opts = (first as { options: Array<{ value: string }> }).options;
    expect(opts.map((o) => o.value)).toEqual(['production', 'staging']);
  });

  const operationsFor = (resource: string) => {
    const field = n.description.properties.find(
      (p) => p.name === 'operation' && (p.displayOptions?.show?.resource as string[] | undefined)?.includes(resource),
    );
    return (field?.options as Array<{ value: string }>)?.map((o) => o.value);
  };

  it.each([
    ['letter', ['uploadAndCreate', 'send', 'get', 'getAll', 'calculatePrice', 'cancel']],
    ['letterEvent', ['getAllForLetter', 'getIssues', 'getUndeliverable', 'getDelivered', 'getSent']],
    ['batch', ['uploadAndCreate', 'send', 'get', 'getAll', 'cancel', 'delete', 'getStatistics']],
  ])('exposes %s operations', (resource, expected) => {
    expect(operationsFor(resource)).toEqual(expected);
  });

  it('exposes Resource selector with letter/batch/letterEvent', () => {
    const res = n.description.properties.find((p) => p.name === 'resource');
    expect((res?.options as Array<{ value: string }>).map((o) => o.value)).toEqual(['letter', 'batch', 'letterEvent']);
  });

  it('has registered recipient and sender fields', () => {
    expect(n.description.properties.find((p) => p.name === 'registeredRecipient')).toBeDefined();
    expect(n.description.properties.find((p) => p.name === 'registeredSender')).toBeDefined();
  });
});
