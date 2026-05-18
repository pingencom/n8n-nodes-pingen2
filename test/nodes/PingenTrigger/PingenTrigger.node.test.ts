import type { IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { createHmac } from 'node:crypto';
import { PingenTrigger } from '../../../nodes/PingenTrigger/PingenTrigger.node';
import { WEBHOOK_DELIVERED, WEBHOOK_ISSUES, WEBHOOK_SENT, WEBHOOK_UNDELIVERABLE } from '../../fixtures/webhookFixtures';

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
