export const USER_AGENT = 'PINGEN.N8N';
export const SCOPE = 'letter batch organisation_read webhook';

export type PingenEnvironment = 'production' | 'staging';

const URLS = {
  production: { api: 'https://api.pingen.com', identity: 'https://identity.pingen.com' },
  staging: { api: 'https://api-staging.pingen.com', identity: 'https://identity-staging.pingen.com' },
} as const;

export function normalizeEnvironment(input: unknown): PingenEnvironment {
  if (typeof input === 'string') {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'staging') {
      return 'staging';
    }
    if (trimmed === 'production') {
      return 'production';
    }
  }
  throw new Error(`Unknown Pingen environment: ${JSON.stringify(input)}. Expected "production" or "staging".`);
}

export function getApiUrl(environment: PingenEnvironment): string {
  return URLS[environment].api;
}

export function getIdentityUrl(environment: PingenEnvironment): string {
  return URLS[environment].identity;
}

export const PINGEN_API_URL = URLS.production.api;
export const PINGEN_IDENTITY_URL = URLS.production.identity;
