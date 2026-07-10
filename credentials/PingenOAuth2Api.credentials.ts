import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
import { SCOPE, USER_AGENT, getIdentityUrl } from '../utils/constants';

// Extends n8n's built-in oAuth2Api base with the client-credentials grant. n8n performs the
// token exchange against Pingen's identity server and caches/refreshes the access token; the
// node authenticates requests via `httpRequestWithAuthentication('pingenOAuth2Api', ...)`.
export class PingenOAuth2Api implements ICredentialType {
  name = 'pingenOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Pingen OAuth2 API';
  documentationUrl = 'https://api.pingen.com/documentation';
  icon = 'file:../nodes/Pingen/pingen.svg' as const;

  properties: INodeProperties[] = [
    {
      displayName:
        'Create a Client Credentials app at identity.pingen.com → API Access, then paste the Client ID and Client Secret below. n8n obtains and refreshes the access token for you.',
      name: 'notice',
      type: 'notice',
      default: '',
    },
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'clientCredentials',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: `${getIdentityUrl('production')}/auth/access-tokens`,
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: SCOPE,
    },
    {
      displayName: 'Auth URI Query Parameters',
      name: 'authQueryParameters',
      type: 'hidden',
      default: '',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'body',
    },
  ];

  // Gives users an explicit pass/fail on Save. We hit the token endpoint directly with the
  // Client ID/Secret from the fields (NOT via the OAuth helper) so every test does a fresh
  // exchange — otherwise n8n would validate a cached access token and keep reporting success
  // even after the secret is changed to an invalid one.
  test: ICredentialTestRequest = {
    request: {
      baseURL: getIdentityUrl('production'),
      url: '/auth/access-tokens',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: {
        grant_type: 'client_credentials',
        client_id: '={{$credentials.clientId}}',
        client_secret: '={{$credentials.clientSecret}}',
        scope: SCOPE,
      },
    },
  };
}
