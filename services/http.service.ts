import { randomUUID } from 'node:crypto';
import { sleep } from 'n8n-workflow';
import type { IHttpRequestOptions } from 'n8n-workflow';
import type { RetryableError } from '../types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET', 'PUT', 'DELETE']);
const MUTATION_METHODS = new Set<HttpMethod>(['POST', 'PATCH']);
// Cap server-suggested Retry-After so a misbehaving server can't stall the worker indefinitely.
const MAX_RETRY_AFTER_MS = 10_000;
// Base for exponential backoff; attempt N waits BASE * 2^N ms (+jitter).
const BASE_BACKOFF_MS = 250;

type Sender = (options: IHttpRequestOptions) => Promise<unknown>;

type AuthRequestCtx = {
  helpers: {
    httpRequestWithAuthentication: (credentialsType: string, options: IHttpRequestOptions) => Promise<unknown>;
  };
};

type RawRequestCtx = {
  helpers: {
    httpRequest: (options: IHttpRequestOptions) => Promise<unknown>;
  };
};

// Authenticated Pingen API request. n8n's oAuth2Api credential injects the Bearer token via
// `httpRequestWithAuthentication`; we only add the JSON:API/idempotency plumbing + retries.
export async function pingenRequest(
  ctx: AuthRequestCtx,
  credentialsType: string,
  options: object,
  maxAttempts = 3,
): Promise<unknown> {
  const send: Sender = (o) => ctx.helpers.httpRequestWithAuthentication.call(ctx, credentialsType, o);
  return runWithRetry(send, options, maxAttempts);
}

// Unauthenticated request — used for the pre-signed storage upload URL, which must NOT
// carry the Pingen bearer token (it is a short-lived signed URL to object storage).
export async function pingenRawRequest(ctx: RawRequestCtx, options: object, maxAttempts = 3): Promise<unknown> {
  const send: Sender = (o) => ctx.helpers.httpRequest(o);
  return runWithRetry(send, options, maxAttempts);
}

// Retry policy:
//   429 — always safe (server rejected before processing); honours Retry-After.
//   5xx — safe only if method is idempotent OR we attached an Idempotency-Key.
//   Same Idempotency-Key is reused across all attempts of a logical request so Pingen
//   can deduplicate. Without it, retrying a POST could create a second letter.
async function runWithRetry(send: Sender, options: object, maxAttempts: number): Promise<unknown> {
  const method = ((options as { method?: string }).method ?? 'GET').toUpperCase() as HttpMethod;
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  const isMutation = MUTATION_METHODS.has(method);
  const finalOptions = isMutation ? withHeader(options, 'Idempotency-Key', randomUUID()) : options;
  return attemptRequest(send, finalOptions, isIdempotent, isMutation, 0, maxAttempts);
}

async function attemptRequest(
  send: Sender,
  options: object,
  isIdempotent: boolean,
  isMutation: boolean,
  attempt: number,
  maxAttempts: number,
): Promise<unknown> {
  try {
    return await send(options as IHttpRequestOptions);
  } catch (err) {
    const e = err as RetryableError;
    const status = e.response?.status ?? 0;
    const retryable = status === 429 || (status >= 500 && (isIdempotent || isMutation));
    if (!retryable || attempt === maxAttempts - 1) {
      throw err;
    }
    const base = Math.max(extractRetryAfterMs(e), BASE_BACKOFF_MS * 2 ** attempt);
    const waitMs = Math.round(base * (0.8 + Math.random() * 0.4));
    await sleep(waitMs);
    return attemptRequest(send, options, isIdempotent, isMutation, attempt + 1, maxAttempts);
  }
}

function withHeader(options: object, name: string, value: string): object {
  const base = options as { headers?: Record<string, string> };
  return { ...options, headers: { ...(base.headers ?? {}), [name]: value } };
}

function extractRetryAfterMs(e: RetryableError): number {
  const v = e.response?.headers?.['retry-after'];
  if (typeof v !== 'string') {
    return 0;
  }
  const seconds = parseInt(v, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}
