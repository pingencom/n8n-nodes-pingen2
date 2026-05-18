import { createHash } from 'node:crypto';
import {
  SCOPE,
  USER_AGENT,
  getApiUrl,
  getIdentityUrl,
  normalizeEnvironment,
  type PingenEnvironment,
} from '../utils/constants';

interface TokenEntry {
  token: string;
  expiresAt: number;
}

export interface PingenConfig {
  token: string;
  apiUrl: string;
  environment: string;
}

// Per-process cache. Each n8n worker process keeps its own map — we don't share across
// a cluster, which is fine because tokens are short-lived and re-fetched per worker.
// Cache key hashes env + credentials so rotating the secret or switching environment
// evicts the stale entry instead of serving a token that will fail with 401.
const TOKEN_CACHE = new Map<string, Promise<TokenEntry>>();

export function clearTokenCache(): void {
  TOKEN_CACHE.clear();
}

function cacheKey(environment: string, clientId: string, clientSecret: string): string {
  return createHash('sha256').update(`${environment}:${clientId}:${clientSecret}`).digest('hex');
}

type TokenCtx = {
  helpers: { request: (options: object) => Promise<unknown> };
  getCredentials: (name: string) => Promise<Record<string, unknown>>;
};

async function fetchToken(
  ctx: TokenCtx,
  identityUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenEntry> {
  const res = await ctx.helpers.request({
    method: 'POST',
    url: `${identityUrl}/auth/access-tokens`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    form: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPE,
    },
  });
  if (typeof res !== 'string') {
    throw new Error('Token endpoint did not return a JSON string.');
  }
  let parsed: { access_token?: unknown; expires_in?: unknown };
  try {
    parsed = JSON.parse(res);
  } catch {
    throw new Error('Token endpoint returned invalid JSON.');
  }
  if (typeof parsed.access_token !== 'string' || typeof parsed.expires_in !== 'number') {
    throw new Error('Token endpoint response missing access_token or expires_in.');
  }
  const ttlSeconds = Math.max(0, parsed.expires_in - 60);
  return {
    token: parsed.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
}

export function credentialNameForEnvironment(environment: PingenEnvironment): string {
  return environment === 'staging' ? 'pingenStagingApi' : 'pingenApi';
}

// Concurrency: cold-start callers dedupe on a single in-flight fetch. After evicting an
// expired or rejected entry we recurse so we can pick up a fresher pending that a concurrent
// caller may have just installed — giving us dedup across refresh transitions.
export async function getPingenConfig(ctx: TokenCtx, environment: unknown = 'production'): Promise<PingenConfig> {
  const env = normalizeEnvironment(environment);
  const creds = await ctx.getCredentials(credentialNameForEnvironment(env));
  const clientId = creds.clientId as string | undefined;
  const clientSecret = creds.clientSecret as string | undefined;

  if (!clientId || !clientSecret) {
    throw new Error('Pingen credentials are missing: provide Client ID and Client Secret.');
  }

  const apiUrl = getApiUrl(env);
  const key = cacheKey(env, clientId, clientSecret);
  return acquireToken(ctx, env, apiUrl, key, clientId, clientSecret);
}

async function acquireToken(
  ctx: TokenCtx,
  env: PingenEnvironment,
  apiUrl: string,
  key: string,
  clientId: string,
  clientSecret: string,
): Promise<PingenConfig> {
  const cached = TOKEN_CACHE.get(key);
  if (cached) {
    const entry = await cached.catch(() => null);
    if (entry && Date.now() < entry.expiresAt) {
      return { token: entry.token, apiUrl, environment: env };
    }
    if (TOKEN_CACHE.get(key) === cached) {
      TOKEN_CACHE.delete(key);
    }
    return acquireToken(ctx, env, apiUrl, key, clientId, clientSecret);
  }

  const pending = fetchToken(ctx, getIdentityUrl(env), clientId, clientSecret);
  pending.catch(() => {});
  TOKEN_CACHE.set(key, pending);
  try {
    const entry = await pending;
    return { token: entry.token, apiUrl, environment: env };
  } catch (err) {
    if (TOKEN_CACHE.get(key) === pending) {
      TOKEN_CACHE.delete(key);
    }
    throw err;
  }
}

export function getPingenHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    'User-Agent': USER_AGENT,
  };
}
