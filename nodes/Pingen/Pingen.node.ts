import {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';
import type { INodeProperties } from 'n8n-workflow';
import { USER_AGENT } from '../../utils/constants';
import { getPingenConfig, getPingenHeaders } from '../../services/auth.service';
import { extractErrorMessage } from '../../errors';
import { safeParseJson } from '../../utils/response';
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
        name: 'pingenApi',
        required: true,
        displayOptions: { show: { environment: ['production'] } },
      },
      {
        name: 'pingenStagingApi',
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
        const environment = (this.getCurrentNodeParameter('environment') as string | undefined) ?? 'production';
        const config = await getPingenConfig(this, environment);
        const res = await this.helpers.httpRequest({
          method: 'GET',
          url: `${config.apiUrl}/organisations`,
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/vnd.api+json',
            'User-Agent': USER_AGENT,
          },
        });
        const parsed = safeParseJson<{
          data: Array<{
            id: string;
            type: string;
            attributes: { name: string; status: string; plan: string; default_country: string };
          }>;
        }>(res, 'organisations');
        return parsed.data.map((org) => {
          const { name, default_country, status } = org.attributes;
          const suffix = status === 'active' ? '' : ` [${status}]`;
          return { name: `${name} (${default_country})${suffix}`, value: org.id };
        });
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
        const environment = this.getNodeParameter('environment', i) as string;
        const { token, apiUrl } = await getPingenConfig(this, environment);
        const headers = getPingenHeaders(token);
        const responseData = await handler(this, i, orgId, headers, apiUrl);
        results.push({ json: responseData as IDataObject, pairedItem: { item: i } });
      } catch (error) {
        const message = extractErrorMessage(error);
        const statusCode = (error as { response?: { status?: number } }).response?.status;
        if (this.continueOnFail()) {
          results.push({ json: { error: message, statusCode }, pairedItem: { item: i } });
          continue;
        }
        throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
      }
    }

    return [results];
  }
}
