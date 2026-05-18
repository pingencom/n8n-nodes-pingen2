import type { IncomingMessage } from 'http';
import type { INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { flattenPingenWebhookPayload, isPingenJsonApiContentType, verifyPingenSignature } from '../../utils/webhook';

// n8n's webhook handler decorates the incoming Node request with a `rawBody` Buffer
// (the bytes as received, before body-parser touches them). Declared here because
// n8n-workflow doesn't publicly export the augmented type.
type N8nWebhookRequest = IncomingMessage & { rawBody: Buffer };

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

export class PingenTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingen Trigger',
    name: 'pingenTrigger',
    icon: 'file:../Pingen/pingen.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["eventType"]}}',
    description: 'Starts the workflow when Pingen pushes a webhook (pick one event type per node)',
    defaults: { name: 'Pingen Trigger' },
    inputs: [],
    outputs: ['main'],
    codex: {
      alias: ['pingen', 'pingen-webhook', 'postal-webhook'],
      categories: ['Communication'],
      subcategories: { Communication: ['Postal Mail'] },
    },
    properties: [
      {
        displayName:
          'One Pingen Trigger per event type — add a second node on the canvas if you need to react to more. The <b>Webhook URL</b> above updates automatically when you change Event Type below (the path ends in <code>/issues</code> / <code>/sent</code> / <code>/delivered</code> / <code>/undeliverable</code>). Copy the URL and paste it into the matching event slot in <b>Pingen → Settings → Webhooks</b>, then put the same secret below.',
        name: 'notice',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Event Type',
        name: 'eventType',
        type: 'options',
        default: 'delivered',
        noDataExpression: true,
        options: EVENT_TYPES,
        description: 'Which Pingen event this node subscribes to. Changing this refreshes the Webhook URL above.',
      },
      {
        displayName: 'Webhook Secret',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        description:
          'Secret you configured for this event type in Pingen. Used to verify the HMAC-SHA256 signature on every incoming request.',
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
