import { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
import { USER_AGENT, SCOPE, PINGEN_IDENTITY_URL } from '../utils/constants';

export class PingenApi implements ICredentialType {
  name = 'pingenApi';
  displayName = 'Pingen API';
  documentationUrl = 'https://api.pingen.com/documentation';
  icon = 'file:../nodes/Pingen/pingen.svg' as const;

  properties: INodeProperties[] = [
    {
      displayName:
        'Create a Client Credentials app at identity.pingen.com → API Access. Copy Client ID and Secret below — the node requests the scopes it needs at token-exchange time.',
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
      baseURL: PINGEN_IDENTITY_URL,
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
