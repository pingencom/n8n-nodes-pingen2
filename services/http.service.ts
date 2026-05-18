import { randomUUID } from 'node:crypto';
import type { RetryableError } from '../types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET', 'PUT', 'DELETE']);
const MUTATION_METHODS = new Set<HttpMethod>(['POST', 'PATCH']);
// Cap server-suggested Retry-After so a misbehaving server can't stall the worker indefinitely.
const MAX_RETRY_AFTER_MS = 10_000;
// Base for exponential backoff; attempt N waits BASE * 2^N ms (+jitter).
const BASE_BACKOFF_MS = 250;

type RequestCtx = { helpers: { request: (options: object) => Promise<unknown> } };

// Retry policy:
//   429 — always safe (server rejected before processing); honours Retry-After.
//   5xx — safe only if method is idempotent OR we attached an Idempotency-Key.
//   Same Idempotency-Key is reused across all attempts of a logical request so Pingen
//   can deduplicate. Without it, retrying a POST could create a second letter.
export async function pingenRequest(ctx: RequestCtx, options: object, maxAttempts = 3): Promise<unknown> {
  const method = ((options as { method?: string }).method ?? 'GET').toUpperCase() as HttpMethod;
  const isIdempotent = IDEMPOTENT_METHODS.has(method);
  const isMutation = MUTATION_METHODS.has(method);
  const finalOptions = isMutation ? withHeader(options, 'Idempotency-Key', randomUUID()) : options;
  return attemptRequest(ctx, finalOptions, isIdempotent, isMutation, 0, maxAttempts);
}

async function attemptRequest(
  ctx: RequestCtx,
  options: object,
  isIdempotent: boolean,
  isMutation: boolean,
  attempt: number,
  maxAttempts: number,
): Promise<unknown> {
  try {
    return await ctx.helpers.request(options);
  } catch (err) {
    const e = err as RetryableError;
    const status = e.statusCode ?? 0;
    const retryable = status === 429 || (status >= 500 && (isIdempotent || isMutation));
    if (!retryable || attempt === maxAttempts - 1) {
      throw err;
    }
    const base = Math.max(extractRetryAfterMs(e), BASE_BACKOFF_MS * 2 ** attempt);
    const waitMs = Math.round(base * (0.8 + Math.random() * 0.4));
    await new Promise((r) => setTimeout(r, waitMs));
    return attemptRequest(ctx, options, isIdempotent, isMutation, attempt + 1, maxAttempts);
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
