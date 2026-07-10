import { PingenOAuth2Api } from '../../credentials/PingenOAuth2Api.credentials';
import { PingenStagingOAuth2Api } from '../../credentials/PingenStagingOAuth2Api.credentials';

const fieldDefault = (cred: { properties: Array<{ name: string; default?: unknown }> }, name: string) =>
  cred.properties.find((p) => p.name === name)?.default;

describe('PingenOAuth2Api credential (production)', () => {
  const cred = new PingenOAuth2Api();

  it('extends the built-in oAuth2Api base', () => {
    expect(cred.extends).toEqual(['oAuth2Api']);
    expect(cred.name).toBe('pingenOAuth2Api');
  });

  it('uses the client-credentials grant against the production token URL', () => {
    expect(fieldDefault(cred, 'grantType')).toBe('clientCredentials');
    expect(fieldDefault(cred, 'accessTokenUrl')).toBe('https://identity.pingen.com/auth/access-tokens');
    expect(fieldDefault(cred, 'authentication')).toBe('body');
  });

  it('requests the required Pingen scopes', () => {
    expect(fieldDefault(cred, 'scope')).toBe('letter batch organisation_read webhook');
  });

  it('declares the notice field explaining app-creation flow', () => {
    const notice = cred.properties.find((p) => p.name === 'notice');
    expect(notice?.type).toBe('notice');
  });

  it('tests via a fresh token exchange against the production identity host', () => {
    expect(cred.test.request.baseURL).toBe('https://identity.pingen.com');
    expect(cred.test.request.url).toBe('/auth/access-tokens');
    expect(cred.test.request.method).toBe('POST');
    const body = cred.test.request.body as Record<string, string>;
    expect(body.grant_type).toBe('client_credentials');
    expect(body.client_id).toBe('={{$credentials.clientId}}');
    expect(body.client_secret).toBe('={{$credentials.clientSecret}}');
  });
});

describe('PingenStagingOAuth2Api credential', () => {
  const cred = new PingenStagingOAuth2Api();

  it('extends oAuth2Api and points at the staging token URL', () => {
    expect(cred.extends).toEqual(['oAuth2Api']);
    expect(cred.name).toBe('pingenStagingOAuth2Api');
    expect(fieldDefault(cred, 'accessTokenUrl')).toBe('https://identity-staging.pingen.com/auth/access-tokens');
  });

  it('warns users that staging and production credentials are different', () => {
    const notice = cred.properties.find((p) => p.name === 'notice');
    expect((notice as { displayName: string }).displayName.toLowerCase()).toContain('staging');
  });

  it('tests via a fresh token exchange against the staging identity host', () => {
    expect(cred.test.request.baseURL).toBe('https://identity-staging.pingen.com');
    expect(cred.test.request.url).toBe('/auth/access-tokens');
    expect(cred.test.request.method).toBe('POST');
  });
});
