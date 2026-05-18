import { createHmac, timingSafeEqual } from 'node:crypto';

export const PINGEN_WEBHOOK_CONTENT_TYPE = 'application/vnd.api+json';
const HEX_RE = /^[0-9a-f]+$/i;

export function computePingenSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyPingenSignature(rawBody: string, headerSignature: unknown, secret: string): boolean {
  if (typeof headerSignature !== 'string' || headerSignature.length === 0) {
    return false;
  }
  if (!secret) {
    return false;
  }
  if (!HEX_RE.test(headerSignature)) {
    return false;
  }
  const expected = computePingenSignature(rawBody, secret);
  if (expected.length !== headerSignature.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(headerSignature, 'hex'));
}

export function isPingenJsonApiContentType(header: unknown): boolean {
  if (typeof header !== 'string') {
    return false;
  }
  /* istanbul ignore next */
  const mediaType = header.toLowerCase().split(';')[0]?.trim() ?? '';
  return mediaType === PINGEN_WEBHOOK_CONTENT_TYPE;
}

export interface PingenWebhookEnvelope {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: unknown; type?: unknown } }>;
  links?: Record<string, unknown>;
}

export function flattenPingenWebhookPayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const envelope = (body as { data?: unknown }).data;
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return null;
  }
  const d = envelope as PingenWebhookEnvelope;
  if (typeof d.id !== 'string' || typeof d.type !== 'string') {
    return null;
  }

  const out: Record<string, unknown> = { id: d.id, type: d.type };
  if (d.attributes && typeof d.attributes === 'object') {
    Object.assign(out, d.attributes);
  }

  if (d.relationships && typeof d.relationships === 'object') {
    for (const [name, rel] of Object.entries(d.relationships)) {
      const relId = rel?.data?.id;
      if (typeof relId === 'string') {
        out[`${name}_id`] = relId;
      }
    }
  }

  const included = (body as { included?: unknown }).included;
  if (Array.isArray(included) && included.length > 0) {
    out.included = included;
  }
  return out;
}
