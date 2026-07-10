import { USER_AGENT, type PingenEnvironment } from '../utils/constants';

// n8n's built-in oAuth2Api credential (grantType: clientCredentials) now owns the token
// exchange and caching. Each environment maps to its own credential type; the node picks
// the right one and hands it to `httpRequestWithAuthentication`, which injects the Bearer
// header. This module is left with just the environment→credential mapping and the static
// JSON:API headers every Pingen request needs.
export function credentialNameForEnvironment(environment: PingenEnvironment): string {
  return environment === 'staging' ? 'pingenStagingOAuth2Api' : 'pingenOAuth2Api';
}

export function getPingenHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    'User-Agent': USER_AGENT,
  };
}
