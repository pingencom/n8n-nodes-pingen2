import { createHmac } from 'node:crypto';
import {
  computePingenSignature,
  flattenPingenWebhookPayload,
  isPingenJsonApiContentType,
  verifyPingenSignature,
} from '../../utils/webhook';
import { WEBHOOK_DELIVERED, WEBHOOK_ISSUES, WEBHOOK_SENT, WEBHOOK_UNDELIVERABLE } from '../fixtures/webhookFixtures';

const SECRET = 'whsec_test_super_secret';
const PAYLOAD = '{"data":{"id":"letter-1","type":"letters","attributes":{"status":"delivered"}}}';
const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

describe('computePingenSignature', () => {
  it('matches the Pingen Node.js reference implementation', () => {
    expect(computePingenSignature(PAYLOAD, SECRET)).toBe(sign(PAYLOAD));
  });

  it('produces different signatures for different payloads', () => {
    const a = computePingenSignature('{"x":1}', SECRET);
    const b = computePingenSignature('{"x":2}', SECRET);
    expect(a).not.toBe(b);
  });

  it('produces different signatures for different secrets', () => {
    const a = computePingenSignature(PAYLOAD, 'secret-a');
    const b = computePingenSignature(PAYLOAD, 'secret-b');
    expect(a).not.toBe(b);
  });

  it('is sensitive to whitespace — re-serialization breaks the signature', () => {
    const compact = '{"a":1}';
    const reserialized = JSON.stringify({ a: 1 }); // same value, but no guarantee of identical bytes
    const spaced = '{ "a": 1 }';
    expect(computePingenSignature(compact, SECRET)).toBe(computePingenSignature(reserialized, SECRET));
    expect(computePingenSignature(compact, SECRET)).not.toBe(computePingenSignature(spaced, SECRET));
  });
});

describe('verifyPingenSignature', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifyPingenSignature(PAYLOAD, sign(PAYLOAD), SECRET)).toBe(true);
  });

  it('rejects a tampered payload (same signature, different body)', () => {
    const tampered = PAYLOAD.replace('delivered', 'undeliverable');
    expect(verifyPingenSignature(tampered, sign(PAYLOAD), SECRET)).toBe(false);
  });

  it('rejects signature computed with a different secret', () => {
    expect(verifyPingenSignature(PAYLOAD, sign(PAYLOAD, 'wrong-secret'), SECRET)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['number', 12345],
    ['array', ['sig']],
  ])('rejects non-string signature header: %s', (_label, value) => {
    expect(verifyPingenSignature(PAYLOAD, value, SECRET)).toBe(false);
  });

  it('rejects when secret is empty', () => {
    expect(verifyPingenSignature(PAYLOAD, sign(PAYLOAD), '')).toBe(false);
  });

  it('rejects a signature of wrong length without calling timingSafeEqual', () => {
    expect(verifyPingenSignature(PAYLOAD, 'deadbeef', SECRET)).toBe(false);
  });

  it('rejects a same-length signature that is not valid hex', () => {
    const fake = 'z'.repeat(64);
    expect(verifyPingenSignature(PAYLOAD, fake, SECRET)).toBe(false);
  });

  it('rejects a same-length but wrong-bytes signature', () => {
    const valid = sign(PAYLOAD);
    const flipped = valid.slice(0, -1) + (valid.slice(-1) === '0' ? '1' : '0');
    expect(verifyPingenSignature(PAYLOAD, flipped, SECRET)).toBe(false);
  });
});

describe('isPingenJsonApiContentType', () => {
  it.each([
    ['exact match', 'application/vnd.api+json', true],
    ['with charset suffix', 'application/vnd.api+json; charset=utf-8', true],
    ['uppercase', 'APPLICATION/VND.API+JSON', true],
    ['leading/trailing whitespace around media type', 'application/vnd.api+json ', true],
    ['plain application/json', 'application/json', false],
    ['text/plain', 'text/plain', false],
    ['empty string', '', false],
    ['missing header', undefined, false],
    ['non-string', 123, false],
  ])('%s → %s', (_label, value, expected) => {
    expect(isPingenJsonApiContentType(value)).toBe(expected);
  });
});

describe('flattenPingenWebhookPayload', () => {
  it.each([
    ['sent', WEBHOOK_SENT, 'webhook_sent'],
    ['delivered', WEBHOOK_DELIVERED, 'webhook_delivered'],
  ])('flattens the %s envelope with relationship ids', (_label, payload, expectedType) => {
    const flat = flattenPingenWebhookPayload(payload);
    expect(flat).toMatchObject({
      id: payload.data.id,
      type: expectedType,
      url: 'https://your.webhook/url',
      created_at: '2020-11-19T09:42:48+0100',
      organisation_id: payload.data.relationships.organisation.data.id,
      letter_id: payload.data.relationships.letter.data.id,
      event_id: payload.data.relationships.event.data.id,
    });
  });

  it('surfaces the reason attribute on issues webhooks', () => {
    const flat = flattenPingenWebhookPayload(WEBHOOK_ISSUES);
    expect(flat).toMatchObject({ type: 'webhook_issues', reason: 'Content failed inspection' });
  });

  it('surfaces corrected_address on undeliverable webhooks', () => {
    const flat = flattenPingenWebhookPayload(WEBHOOK_UNDELIVERABLE);
    expect(flat?.type).toBe('webhook_undeliverable');
    expect(flat?.corrected_address).toMatchObject({ zip: '8051', city: 'Zürich' });
  });

  it('forwards non-empty included[] array', () => {
    const flat = flattenPingenWebhookPayload({
      ...WEBHOOK_SENT,
      included: [{ id: 'x', type: 'letters_events' }],
    });
    expect(flat?.included).toEqual([{ id: 'x', type: 'letters_events' }]);
  });

  it('omits empty included[] to avoid noise', () => {
    const flat = flattenPingenWebhookPayload({ ...WEBHOOK_SENT, included: [] });
    expect(flat?.included).toBeUndefined();
  });

  it('tolerates non-object attributes and relationships gracefully', () => {
    const flat = flattenPingenWebhookPayload({
      data: {
        id: 'x',
        type: 'webhook_sent',
        attributes: 'unexpected string instead of object',
        relationships: 'also a string',
      },
    });
    expect(flat).toEqual({ id: 'x', type: 'webhook_sent' });
  });

  it('skips relationships without a string id', () => {
    const flat = flattenPingenWebhookPayload({
      data: {
        id: 'x',
        type: 'webhook_sent',
        attributes: {},
        relationships: {
          organisation: { data: { id: 'org-1' } },
          letter: { data: {} },
          event: {},
        },
      },
    });
    expect(flat).toMatchObject({ organisation_id: 'org-1' });
    expect(flat).not.toHaveProperty('letter_id');
    expect(flat).not.toHaveProperty('event_id');
  });

  it.each([
    ['null', null],
    ['string', 'not-an-object'],
    ['array', [1, 2, 3]],
    ['missing data', { included: [] }],
    ['data is array', { data: [] }],
    ['data without id', { data: { type: 'webhook_sent' } }],
    ['data without type', { data: { id: 'x' } }],
  ])('returns null for malformed envelope: %s', (_label, value) => {
    expect(flattenPingenWebhookPayload(value)).toBeNull();
  });
});
