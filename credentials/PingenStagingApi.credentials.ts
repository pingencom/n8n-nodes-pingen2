import { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
import { USER_AGENT, SCOPE, getIdentityUrl } from '../utils/constants';

export class PingenStagingApi implements ICredentialType {
  name = 'pingenStagingApi';
  displayName = 'Pingen Staging API';
  documentationUrl = 'https://api.pingen.com/documentation';
  icon = 'file:../nodes/Pingen/pingen.svg' as const;

  properties: INodeProperties[] = [
    {
      displayName:
        'Staging is a free test environment. Create a separate app at <b>identity-staging.pingen.com</b> → API Access. Staging credentials do not work against production.',
      name: 'notice',
      type: 'notice',
      default: '',
    },
    {
      displayName: 'Client ID',
      name: 'clientId',
      type: 'string',
      required: true,
      default: '',
    },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'User-Agent': USER_AGENT,
      },
    },
  };

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
