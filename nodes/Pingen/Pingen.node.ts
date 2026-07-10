import {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  NodeApiError,
  NodeOperationError,
} from 'n8n-workflow';
import type { INodeProperties, JsonObject } from 'n8n-workflow';
import { getApiUrl, normalizeEnvironment } from '../../utils/constants';
import { credentialNameForEnvironment } from '../../services/auth.service';
import { loadOrganisationOptions } from '../../services/organisations.service';
import { extractErrorMessage } from '../../errors';
import type { OperationHandler } from '../../types';

import { letterOperations, letterFields, letterHandlers } from './actions/letter';
import { letterEventOperations, letterEventFields, letterEventHandlers } from './actions/letterEvents';
import { batchOperations, batchFields, batchHandlers } from './actions/batch';

const LIST_OP_DISPLAY = {
  show: {
    resource: ['letter', 'batch', 'letterEvent'],
    operation: ['getAll', 'getAllForLetter', 'getIssues', 'getUndeliverable', 'getDelivered', 'getSent'],
  },
};

const queryFields: INodeProperties[] = [
  {
    displayName: 'Page Number',
    name: 'pageNumber',
    type: 'number',
    default: 0,
    description: 'Page to fetch (1-based). Leave 0 to use the server default.',
    typeOptions: { minValue: 0 },
    displayOptions: LIST_OP_DISPLAY,
  },
  {
    displayName: 'Page Size',
    name: 'pageSize',
    type: 'number',
    default: 0,
    description: 'Items per page. Leave 0 to use the server default.',
    typeOptions: { minValue: 0, maxValue: 100 },
    displayOptions: LIST_OP_DISPLAY,
  },
  {
    displayName: 'Sort',
    name: 'sort',
    type: 'string',
    default: '',
    placeholder: '-created_at',
    description:
      'JSON:API sort expression. Comma-separated fields; prefix with <code>-</code> for descending (e.g. <code>-created_at,name</code>).',
    displayOptions: LIST_OP_DISPLAY,
  },
  {
    displayName: 'Additional Filters',
    name: 'filters',
    type: 'fixedCollection',
    typeOptions: { multipleValues: true },
    default: {},
    placeholder: 'Add Filter',
    description: 'Each pair becomes <code>filter[key]=value</code> on the request URL',
    displayOptions: LIST_OP_DISPLAY,
    options: [
      {
        name: 'filter',
        displayName: 'Filter',
        values: [
          { displayName: 'Key', name: 'key', type: 'string', default: '', placeholder: 'status' },
          { displayName: 'Value', name: 'value', type: 'string', default: '', placeholder: 'sent' },
        ],
      },
    ],
  },
];

export class Pingen implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingen',
    name: 'pingen',
    icon: 'file:pingen.svg',
    group: ['transform'],
    version: 1,
    usableAsTool: true,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"] + " (" + $parameter["environment"] + ")"}}',
    description: 'Send physical postal letters through the Pingen API — invoices, reminders, contracts, any PDF.',
    defaults: { name: 'Pingen' },
    codex: {
      alias: ['pingen', 'pingen-api', 'postal-mail', 'physical-mail', 'letters-api', 'send-letter-post'],
      categories: ['Communication'],
      subcategories: { Communication: ['Postal Mail'] },
    },
    inputs: ['main'],
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

    properties: [
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
          'Select your Pingen organisation. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        default: 'letter',
        options: [
          { name: 'Letter', value: 'letter' },
          { name: 'Batch', value: 'batch' },
          { name: 'Letter Event', value: 'letterEvent' },
        ],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'uploadAndCreate',
        displayOptions: { show: { resource: ['letter'] } },
        options: [...letterOperations],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'uploadAndCreate',
        displayOptions: { show: { resource: ['batch'] } },
        options: [...batchOperations],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'getAllForLetter',
        displayOptions: { show: { resource: ['letterEvent'] } },
        options: [...letterEventOperations],
      },
      ...letterFields,
      ...letterEventFields,
      ...batchFields,
      ...queryFields,
    ],
  };

  methods = {
    loadOptions: {
      async getOrganisations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        return loadOrganisationOptions(this);
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const handlersByResource: Record<string, Record<string, OperationHandler>> = {
      letter: letterHandlers,
      batch: batchHandlers,
      letterEvent: letterEventHandlers,
    };
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter('resource', i) as string;
      const operation = this.getNodeParameter('operation', i) as string;
      const handler = handlersByResource[resource]?.[operation];

      try {
        if (!handler) {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${resource}.${operation}`, { itemIndex: i });
        }
        const orgId = encodeURIComponent(this.getNodeParameter('organisationId', i) as string);
        const env = normalizeEnvironment(this.getNodeParameter('environment', i, 'production') as string);
        const apiUrl = getApiUrl(env);
        const credentialsType = credentialNameForEnvironment(env);
        const responseData = await handler(this, i, orgId, credentialsType, apiUrl);
        results.push({ json: responseData as IDataObject, pairedItem: { item: i } });
      } catch (error) {
        if (this.continueOnFail()) {
          const message = extractErrorMessage(error);
          const statusCode = (error as { response?: { status?: number } }).response?.status;
          results.push({ json: { error: message, statusCode }, pairedItem: { item: i } });
          continue;
        }
        if (error instanceof NodeOperationError || error instanceof NodeApiError) {
          throw error;
        }
        // HTTP failures carry a `.response` (non-2xx) or a transport `.code` (e.g. ECONNRESET);
        // wrap those in NodeApiError so the n8n UI keeps the full response context. Everything
        // else is a user-input/validation error thrown by the handlers — surface it as a
        // NodeOperationError, since NodeApiError would mislabel it as a service fault.
        const isHttpError =
          (error as { response?: unknown }).response !== undefined ||
          typeof (error as { code?: unknown }).code === 'string';
        if (isHttpError) {
          throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [results];
  }
}
