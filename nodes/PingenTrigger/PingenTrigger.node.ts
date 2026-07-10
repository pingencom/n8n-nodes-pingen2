import type { IncomingMessage } from 'http';
import type {
  IHookFunctions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow';
import { getApiUrl, normalizeEnvironment } from '../../utils/constants';
import { credentialNameForEnvironment, getPingenHeaders } from '../../services/auth.service';
import { loadOrganisationOptions } from '../../services/organisations.service';
import { flattenPingenWebhookPayload, isPingenJsonApiContentType, verifyPingenSignature } from '../../utils/webhook';
import type { RetryableError } from '../../types';

// n8n's webhook handler decorates the incoming Node request with a `rawBody` Buffer
// (the bytes as received, before body-parser touches them). Declared here because
// n8n-workflow doesn't publicly export the augmented type.
type N8nWebhookRequest = IncomingMessage & { rawBody: Buffer };

// eventType values double as Pingen's webhook `event_category` values — keep them in sync.
const EVENT_TYPES = [
  {
    name: 'Issues',
    value: 'issues',
    description: 'Pre-send validation problems — content inspection failures. Letter is not dispatched.',
  },
  { name: 'Sent', value: 'sent', description: 'Letter dispatched to postal carrier' },
  { name: 'Delivered', value: 'delivered', description: 'Letter successfully delivered to recipient' },
  {
    name: 'Undeliverable',
    value: 'undeliverable',
    description: 'Carrier could not deliver and returned the letter (wrong address discovered at delivery time)',
  },
];

interface TriggerContext {
  apiUrl: string;
  credentialsType: string;
  orgId: string;
}

// Resolve the environment-dependent request context shared by all three webhook lifecycle
// hooks. `orgId` is URL-encoded because it is interpolated straight into the request path.
function getTriggerContext(ctx: IHookFunctions): TriggerContext {
  const env = normalizeEnvironment(ctx.getNodeParameter('environment') as string);
  return {
    apiUrl: getApiUrl(env),
    credentialsType: credentialNameForEnvironment(env),
    orgId: encodeURIComponent(ctx.getNodeParameter('organisationId') as string),
  };
}

export class PingenTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingen Trigger',
    name: 'pingenTrigger',
    icon: 'file:../Pingen/pingen.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["eventType"] + " (" + $parameter["environment"] + ")"}}',
    description: 'Starts the workflow when Pingen pushes a webhook (pick one event type per node)',
    defaults: { name: 'Pingen Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [
      {
        name: 'pingenOAuth2Api',
        required: true,
        displayOptions: { show: { environment: ['production'] } },
      },
      {
        name: 'pingenStagingOAuth2Api',
        required: true,
        displayOptions: { show: { environment: ['staging'] } },
      },
    ],
    codex: {
      alias: ['pingen', 'pingen-webhook', 'postal-webhook'],
      categories: ['Communication'],
      subcategories: { Communication: ['Postal Mail'] },
    },
    properties: [
      {
        displayName:
          'When this workflow is activated, n8n registers this URL as a webhook in your Pingen organisation for the selected Event Type (and removes it on deactivation). Add a second Pingen Trigger node if you need to react to more than one event type.',
        name: 'notice',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Environment',
        name: 'environment',
        type: 'options',
        noDataExpression: true,
        default: 'production',
        options: [
          { name: 'Production', value: 'production' },
          { name: 'Staging', value: 'staging', description: 'Free test environment — no real letters sent' },
        ],
        description: 'Which Pingen environment to use. Each maps to a separate credential.',
      },
      {
        displayName: 'Organisation Name or ID',
        name: 'organisationId',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getOrganisations',
        },
        default: '',
        required: true,
        description:
          'Pingen organisation the webhook is registered in. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Event Type',
        name: 'eventType',
        type: 'options',
        default: 'delivered',
        noDataExpression: true,
        options: EVENT_TYPES,
        description: 'Which Pingen event category this node subscribes to',
      },
      {
        displayName: 'Webhook Secret',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description:
          'Signing secret (max 32 chars) registered with the webhook and used to verify the HMAC-SHA256 signature on every incoming request',
      },
    ],
    // Dynamic path: URL ends in e.g. `.../webhook/<id>/delivered` so each event-type node
    // gets a distinct, self-documenting URL without needing four separate node classes.
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: '={{$parameter["eventType"]}}',
      },
    ],
  };

  methods = {
    loadOptions: {
      async getOrganisations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        return loadOrganisationOptions(this);
      },
    },
  };

  // Pingen exposes programmatic webhook management, so these hooks register and tear down the
  // subscription automatically as the workflow is activated/deactivated. The created webhook's
  // id is kept in the node's static data so `delete` can target it precisely.
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const eventType = this.getNodeParameter('eventType') as string;
        const { apiUrl, credentialsType, orgId } = getTriggerContext(this);
        const res = await this.helpers.httpRequestWithAuthentication.call(this, credentialsType, {
          method: 'GET',
          url: `${apiUrl}/organisations/${orgId}/webhooks`,
          headers: getPingenHeaders(),
        });
        const list =
          (res as { data?: Array<{ id: string; attributes?: { url?: string; event_category?: string } }> }).data ?? [];
        const match = list.find((w) => w.attributes?.url === webhookUrl && w.attributes?.event_category === eventType);
        if (!match) {
          return false;
        }
        this.getWorkflowStaticData('node').webhookId = match.id;
        return true;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const eventType = this.getNodeParameter('eventType') as string;
        const signingKey = this.getNodeParameter('webhookSecret') as string;
        const { apiUrl, credentialsType, orgId } = getTriggerContext(this);
        const res = await this.helpers.httpRequestWithAuthentication.call(this, credentialsType, {
          method: 'POST',
          url: `${apiUrl}/organisations/${orgId}/webhooks`,
          headers: getPingenHeaders(),
          body: JSON.stringify({
            data: {
              type: 'webhooks',
              attributes: { event_category: eventType, url: webhookUrl, signing_key: signingKey },
            },
          }),
        });
        const id = (res as { data?: { id?: string } }).data?.id;
        if (!id) {
          return false;
        }
        this.getWorkflowStaticData('node').webhookId = id;
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        const webhookId = staticData.webhookId as string | undefined;
        if (!webhookId) {
          return true;
        }
        const { apiUrl, credentialsType, orgId } = getTriggerContext(this);
        try {
          await this.helpers.httpRequestWithAuthentication.call(this, credentialsType, {
            method: 'DELETE',
            url: `${apiUrl}/organisations/${orgId}/webhooks/${webhookId}`,
            headers: getPingenHeaders(),
          });
        } catch (error) {
          // A 404 means the webhook is already gone (e.g. deleted in the Pingen UI) — that is
          // the desired end state, so treat it as success. Anything else is a real failure.
          if ((error as RetryableError).response?.status !== 404) {
            throw error;
          }
        }
        delete staticData.webhookId;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const secret = this.getNodeParameter('webhookSecret', '') as string;
    const eventType = this.getNodeParameter('eventType', 'delivered') as string;
    const headers = this.getHeaderData() as Record<string, unknown>;
    const receivedSignature = headers.signature ?? headers.Signature;
    const req = this.getRequestObject() as unknown as N8nWebhookRequest;
    const raw = req.rawBody?.toString('utf8') ?? '';

    if (!verifyPingenSignature(raw, receivedSignature, secret)) {
      return { webhookResponse: { status: 401, body: { error: 'Invalid or missing signature' } } };
    }

    const contentType = headers['content-type'] ?? headers['Content-Type'];
    if (!isPingenJsonApiContentType(contentType)) {
      return {
        webhookResponse: { status: 415, body: { error: 'Expected Content-Type application/vnd.api+json' } },
      };
    }

    if (!raw) {
      return { webhookResponse: { status: 400, body: { error: 'Empty request body' } } };
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return { webhookResponse: { status: 400, body: { error: 'Invalid JSON payload' } } };
    }

    const flat = flattenPingenWebhookPayload(body);
    if (!flat) {
      return { webhookResponse: { status: 422, body: { error: 'Missing JSON:API data envelope' } } };
    }

    return { workflowData: [[{ json: { eventType, ...flat } }]] };
  }
}
