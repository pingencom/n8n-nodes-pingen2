import type { IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { createHmac } from 'node:crypto';
import { PingenTrigger } from '../../../nodes/PingenTrigger/PingenTrigger.node';
import { WEBHOOK_DELIVERED, WEBHOOK_ISSUES, WEBHOOK_SENT, WEBHOOK_UNDELIVERABLE } from '../../fixtures/webhookFixtures';
import { createMockCtx } from '../../helpers/mockCtx';

const SECRET = 'whsec_live_42';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');
const JSON_API = 'application/vnd.api+json';

type MockOpts = {
  rawBody?: string | Buffer;
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

function mockWebhookCtx(opts: MockOpts = {}): IWebhookFunctions {
  const params = { eventType: 'delivered', webhookSecret: SECRET, ...opts.params };
  const rawBody = typeof opts.rawBody === 'string' ? Buffer.from(opts.rawBody, 'utf8') : opts.rawBody;
  return {
    getNodeParameter: jest.fn((name: string, def?: unknown) =>
      name in params ? params[name as keyof typeof params] : def,
    ),
    getHeaderData: jest.fn(() => opts.headers ?? {}),
    getRequestObject: jest.fn(() => ({ rawBody })),
  } as unknown as IWebhookFunctions;
}

const node = new PingenTrigger();
const run = (opts: MockOpts) => node.webhook.call(mockWebhookCtx(opts)) as Promise<IWebhookResponseData>;

const signedRequest = (fixture: object, eventType: string, overrides: Partial<MockOpts> = {}): MockOpts => {
  const raw = JSON.stringify(fixture);
  return {
    rawBody: raw,
    headers: { 'content-type': JSON_API, signature: sign(raw), ...overrides.headers },
    params: { eventType, webhookSecret: SECRET, ...overrides.params },
    ...overrides,
  };
};

describe('PingenTrigger.description', () => {
  it('declares trigger group and no inputs', () => {
    expect(node.description.group).toContain('trigger');
    expect(node.description.inputs).toEqual([]);
  });

  it('exposes a POST webhook whose path follows the selected Event Type', () => {
    const webhook = node.description.webhooks?.[0];
    expect(webhook?.httpMethod).toBe('POST');
    expect(webhook?.path).toBe('={{$parameter["eventType"]}}');
  });

  it('requires a webhook secret with password masking', () => {
    const secretProp = node.description.properties.find((p) => p.name === 'webhookSecret');
    expect(secretProp?.required).toBe(true);
    expect((secretProp as { typeOptions: { password: boolean } }).typeOptions.password).toBe(true);
  });

  it('lists all four Pingen event types', () => {
    const eventProp = node.description.properties.find((p) => p.name === 'eventType');
    const values = (eventProp as { options: Array<{ value: string }> }).options.map((o) => o.value);
    expect(values).toEqual(['issues', 'sent', 'delivered', 'undeliverable']);
  });

  it('renders subtitle showing the selected event type', () => {
    expect(node.description.subtitle).toContain('eventType');
  });
});

describe('PingenTrigger.webhook() — JSON:API payloads from Pingen docs', () => {
  it.each([
    ['sent', WEBHOOK_SENT, 'webhook_sent'],
    ['issues', WEBHOOK_ISSUES, 'webhook_issues'],
    ['undeliverable', WEBHOOK_UNDELIVERABLE, 'webhook_undeliverable'],
    ['delivered', WEBHOOK_DELIVERED, 'webhook_delivered'],
  ])('flattens %s webhook with relationship ids', async (eventType, fixture, expectedType) => {
    const result = await run(signedRequest(fixture, eventType));
    expect(result.workflowData?.[0]?.[0]?.json).toMatchObject({
      eventType,
      type: expectedType,
      id: fixture.data.id,
      letter_id: fixture.data.relationships.letter.data.id,
      event_id: fixture.data.relationships.event.data.id,
      organisation_id: fixture.data.relationships.organisation.data.id,
    });
  });

  it('surfaces the reason on issues events', async () => {
    const result = await run(signedRequest(WEBHOOK_ISSUES, 'issues'));
    expect(result.workflowData?.[0]?.[0]?.json).toMatchObject({ reason: 'Content failed inspection' });
  });

  it('surfaces corrected_address on undeliverable events', async () => {
    const result = await run(signedRequest(WEBHOOK_UNDELIVERABLE, 'undeliverable'));
    const json = result.workflowData?.[0]?.[0]?.json as { corrected_address: { zip: string } };
    expect(json.corrected_address).toMatchObject({ zip: '8051', city: 'Zürich' });
  });
});

describe('PingenTrigger.webhook() — protocol & security', () => {
  const raw = JSON.stringify(WEBHOOK_DELIVERED);

  it('accepts Signature header case-insensitively', async () => {
    const result = await run({ rawBody: raw, headers: { 'content-type': JSON_API, Signature: sign(raw) } });
    expect(result.workflowData).toBeDefined();
  });

  it('accepts Content-Type header case-insensitively and with charset', async () => {
    const result = await run({
      rawBody: raw,
      headers: { 'Content-Type': 'Application/VND.API+JSON; charset=utf-8', signature: sign(raw) },
    });
    expect(result.workflowData).toBeDefined();
  });

  it.each([
    ['missing Content-Type', {}],
    ['application/json only', { 'content-type': 'application/json' }],
    ['text/plain', { 'content-type': 'text/plain' }],
  ])('rejects with 415 when %s', async (_label, headers) => {
    const result = await run({ rawBody: raw, headers: { ...headers, signature: sign(raw) } });
    expect(result.webhookResponse).toMatchObject({ status: 415 });
  });

  it.each([
    ['missing signature', { 'content-type': JSON_API }],
    ['empty signature', { 'content-type': JSON_API, signature: '' }],
    ['wrong signature', { 'content-type': JSON_API, signature: sign(raw, 'other-secret') }],
    ['tampered payload', null], // special: tamper rawBody after signing
  ])('rejects with 401 when %s', async (label, headers) => {
    const opts: MockOpts =
      label === 'tampered payload'
        ? { rawBody: raw.replace('delivered', 'sent'), headers: { 'content-type': JSON_API, signature: sign(raw) } }
        : { rawBody: raw, headers: headers as Record<string, unknown> };
    const result = await run(opts);
    expect(result.webhookResponse).toMatchObject({ status: 401 });
  });

  it.each([
    ['empty string body', ''],
    ['undefined body', undefined],
  ])('returns 400 when %s', async (_label, rawBody) => {
    const result = await run({ rawBody, headers: { 'content-type': JSON_API, signature: sign('') } });
    expect(result.webhookResponse).toMatchObject({ status: 400 });
  });

  it('returns 400 when body is valid-signature garbage', async () => {
    const garbage = 'not-json-at-all';
    const result = await run({
      rawBody: garbage,
      headers: { 'content-type': JSON_API, signature: sign(garbage) },
    });
    expect(result.webhookResponse).toMatchObject({ status: 400 });
  });

  it('returns 422 when the JSON payload lacks a JSON:API data envelope', async () => {
    const bogus = JSON.stringify({ something: 'else' });
    const result = await run({
      rawBody: bogus,
      headers: { 'content-type': JSON_API, signature: sign(bogus) },
    });
    expect(result.webhookResponse).toMatchObject({ status: 422 });
  });

  it('runs signature check BEFORE content-type (unauthenticated callers get 401, not 415)', async () => {
    const result = await run({
      rawBody: raw,
      headers: { 'content-type': 'text/plain', signature: 'deadbeef' + 'f'.repeat(56) },
    });
    expect(result.webhookResponse).toMatchObject({ status: 401 });
  });

  it('rejects when webhookSecret is empty (prevents accepting unsigned webhooks)', async () => {
    const result = await run({
      rawBody: raw,
      headers: { 'content-type': JSON_API, signature: sign(raw, '') },
      params: { webhookSecret: '' },
    });
    expect(result.webhookResponse).toMatchObject({ status: 401 });
  });
});

const WEBHOOK_URL = 'https://n8n.example.com/webhook/abc/delivered';

function mockHookCtx(
  opts: {
    params?: Record<string, unknown>;
    staticData?: Record<string, unknown>;
    responses?: unknown[];
  } = {},
) {
  const staticData = opts.staticData ?? {};
  const authMock = jest.fn();
  (opts.responses ?? []).forEach((r) => {
    if (r instanceof Error) {
      authMock.mockRejectedValueOnce(r);
    } else {
      authMock.mockResolvedValueOnce(r);
    }
  });
  const params = {
    environment: 'production',
    organisationId: 'org-1',
    eventType: 'delivered',
    webhookSecret: 'sec-123',
    ...opts.params,
  };
  const ctx = {
    getNodeParameter: jest.fn((name: string, fallback?: unknown) =>
      name in params ? params[name as keyof typeof params] : fallback,
    ),
    getNodeWebhookUrl: jest.fn(() => WEBHOOK_URL),
    getWorkflowStaticData: jest.fn(() => staticData),
    helpers: { httpRequestWithAuthentication: authMock },
  } as unknown as IHookFunctions;
  return { ctx, staticData, authMock };
}

const hooks = new PingenTrigger().webhookMethods.default;

describe('PingenTrigger.description — managed webhook wiring', () => {
  const n = new PingenTrigger();

  it('declares both production and staging OAuth2 credentials', () => {
    const credNames = n.description.credentials?.map((c) => c.name);
    expect(credNames).toEqual(expect.arrayContaining(['pingenOAuth2Api', 'pingenStagingOAuth2Api']));
  });

  it('exposes environment and organisation selectors', () => {
    const names = n.description.properties.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['environment', 'organisationId', 'eventType']));
  });
});

describe('PingenTrigger.webhookMethods.checkExists', () => {
  it('returns true and records the id when a matching webhook exists', async () => {
    const { ctx, staticData, authMock } = mockHookCtx({
      responses: [
        {
          data: [
            { id: 'wh-other', attributes: { url: 'https://other', event_category: 'delivered' } },
            { id: 'wh-1', attributes: { url: WEBHOOK_URL, event_category: 'delivered' } },
          ],
        },
      ],
    });
    await expect(hooks.checkExists.call(ctx)).resolves.toBe(true);
    expect(staticData.webhookId).toBe('wh-1');
    expect(authMock.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      url: expect.stringContaining('/organisations/org-1/webhooks'),
    });
  });

  it('returns false when no webhook matches the URL + event category', async () => {
    const { ctx, staticData } = mockHookCtx({
      responses: [{ data: [{ id: 'wh-x', attributes: { url: WEBHOOK_URL, event_category: 'sent' } }] }],
    });
    await expect(hooks.checkExists.call(ctx)).resolves.toBe(false);
    expect(staticData.webhookId).toBeUndefined();
  });

  it('handles an empty/absent webhook list', async () => {
    const { ctx } = mockHookCtx({ responses: [{}] });
    await expect(hooks.checkExists.call(ctx)).resolves.toBe(false);
  });
});

describe('PingenTrigger.webhookMethods.create', () => {
  it('registers the webhook and stores the returned id', async () => {
    const { ctx, staticData, authMock } = mockHookCtx({ responses: [{ data: { id: 'wh-new' } }] });
    await expect(hooks.create.call(ctx)).resolves.toBe(true);
    expect(staticData.webhookId).toBe('wh-new');
    const body = JSON.parse(authMock.mock.calls[0][1].body);
    expect(body.data).toMatchObject({
      type: 'webhooks',
      attributes: { event_category: 'delivered', url: WEBHOOK_URL, signing_key: 'sec-123' },
    });
    expect(authMock.mock.calls[0][1].method).toBe('POST');
  });

  it('returns false when the API response has no id', async () => {
    const { ctx, staticData } = mockHookCtx({ responses: [{ data: {} }] });
    await expect(hooks.create.call(ctx)).resolves.toBe(false);
    expect(staticData.webhookId).toBeUndefined();
  });
});

describe('PingenTrigger.webhookMethods.delete', () => {
  it('deletes the stored webhook and clears static data', async () => {
    const { ctx, staticData, authMock } = mockHookCtx({ staticData: { webhookId: 'wh-1' }, responses: [{}] });
    await expect(hooks.delete.call(ctx)).resolves.toBe(true);
    expect(staticData.webhookId).toBeUndefined();
    expect(authMock.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      url: expect.stringContaining('/webhooks/wh-1'),
    });
  });

  it('is a no-op when there is no stored webhook id', async () => {
    const { ctx, authMock } = mockHookCtx({ staticData: {} });
    await expect(hooks.delete.call(ctx)).resolves.toBe(true);
    expect(authMock).not.toHaveBeenCalled();
  });

  it('treats a 404 as already-deleted', async () => {
    const err = Object.assign(new Error('gone'), { response: { status: 404 } });
    const { ctx, staticData } = mockHookCtx({ staticData: { webhookId: 'wh-1' }, responses: [err] });
    await expect(hooks.delete.call(ctx)).resolves.toBe(true);
    expect(staticData.webhookId).toBeUndefined();
  });

  it('rethrows non-404 errors', async () => {
    const err = Object.assign(new Error('boom'), { response: { status: 500 } });
    const { ctx } = mockHookCtx({ staticData: { webhookId: 'wh-1' }, responses: [err] });
    await expect(hooks.delete.call(ctx)).rejects.toThrow(/boom/);
  });
});

describe('PingenTrigger.loadOptions.getOrganisations', () => {
  it('lists organisations via the shared loader', async () => {
    const ctx = createMockCtx({
      requests: [
        {
          data: [
            {
              id: 'org-a',
              type: 'organisations',
              attributes: { name: 'Acme', status: 'active', plan: 'pro', default_country: 'CH' },
            },
          ],
        },
      ],
    });
    const result = await new PingenTrigger().methods.loadOptions.getOrganisations.call(
      ctx as unknown as ILoadOptionsFunctions,
    );
    expect(result).toEqual([{ name: 'Acme (CH)', value: 'org-a' }]);
  });
});
