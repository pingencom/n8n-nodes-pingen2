import type { JsonApiSingleResponse } from '../types';

export function flattenJsonApi(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const errors = obj.errors as unknown[] | undefined;
  const metaWithoutTotal = meta ? stripKey(meta, 'total') : undefined;

  if (Array.isArray(obj.data)) {
    const items = (obj.data as Array<Record<string, unknown>>).map((item) => ({
      id: item.id,
      type: item.type,
      ...(item.attributes as Record<string, unknown>),
    }));
    const result: Record<string, unknown> = {
      items,
      total: meta?.total ?? items.length,
    };
    if (metaWithoutTotal && Object.keys(metaWithoutTotal).length > 0) {
      result.meta = metaWithoutTotal;
    }
    if (errors && errors.length) {
      result.errors = errors;
    }
    if (obj.links) {
      result.links = obj.links;
    }
    return result;
  }

  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const d = obj.data as Record<string, unknown>;
    const result: Record<string, unknown> = {
      id: d.id,
      type: d.type,
      ...(d.attributes as Record<string, unknown>),
    };
    if (metaWithoutTotal && Object.keys(metaWithoutTotal).length > 0) {
      result.meta = metaWithoutTotal;
    }
    if (errors && errors.length) {
      result.errors = errors;
    }
    return result;
  }

  return raw;
}

function stripKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _ignored, ...rest } = obj;
  return rest;
}

export function parseJsonApiSingle<A = Record<string, unknown>>(
  raw: unknown,
  context: string,
): JsonApiSingleResponse<A> {
  if (typeof raw !== 'string') {
    throw new Error(`${context}: expected JSON string response, got ${typeof raw}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${context}: response is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${context}: response is not an object.`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    throw new Error(`${context}: response missing "data" resource.`);
  }
  const d = obj.data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.type !== 'string') {
    throw new Error(`${context}: response "data" missing id/type.`);
  }
  if (!d.attributes || typeof d.attributes !== 'object') {
    throw new Error(`${context}: response "data.attributes" missing.`);
  }
  return parsed as JsonApiSingleResponse<A>;
}

export function contentTypeOrDefault(mimeType: unknown, fallback = 'application/pdf'): string {
  if (typeof mimeType === 'string' && mimeType.length > 0) {
    return mimeType;
  }
  return fallback;
}

export function safeParseJson<T = unknown>(raw: unknown, context: string): T {
  if (raw && typeof raw === 'object') {
    return raw as T;
  }
  if (typeof raw !== 'string') {
    throw new Error(`${context}: expected a JSON string response, got ${typeof raw}.`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${context}: response is not valid JSON.`);
  }
}

export function tryParseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseFileUploadResponse(raw: unknown): { url: string; url_signature: string } {
  const attr = (raw as { data?: { attributes?: { url?: unknown; url_signature?: unknown } } })?.data?.attributes;
  if (!attr || typeof attr.url !== 'string' || typeof attr.url_signature !== 'string') {
    throw new Error('file-upload: response missing url or url_signature.');
  }
  return { url: attr.url, url_signature: attr.url_signature };
}
