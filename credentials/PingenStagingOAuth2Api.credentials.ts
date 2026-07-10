import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
import { SCOPE, USER_AGENT, getIdentityUrl } from '../utils/constants';

// Staging counterpart of PingenOAuth2Api — same client-credentials flow, but against Pingen's
// staging identity server. Staging credentials do not work against production.
export class PingenStagingOAuth2Api implements ICredentialType {
  name = 'pingenStagingOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Pingen Staging OAuth2 API';
  documentationUrl = 'https://api.pingen.com/documentation';
  icon = 'file:../nodes/Pingen/pingen.svg' as const;

  properties: INodeProperties[] = [
    {
      displayName:
        'Staging is a free test environment. Create a separate app at <b>identity-staging.pingen.com</b> → API Access, then paste the Client ID and Client Secret below. n8n obtains and refreshes the access token for you.',
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
      default: `${getIdentityUrl('staging')}/auth/access-tokens`,
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

  // Same fresh-exchange pass/fail feedback as production, but against the staging identity host.
  test: ICredentialTestRequest = {
    request: {
      baseURL: getIdentityUrl('staging'),
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
