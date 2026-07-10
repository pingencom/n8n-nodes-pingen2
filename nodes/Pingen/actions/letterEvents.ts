import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { pingenRequest } from '../../../services/http.service';
import { getPingenHeaders } from '../../../services/auth.service';
import { flattenJsonApi } from '../../../utils/response';
import { readEncodedIdParam } from '../../../utils/params';
import { buildQueryString } from '../../../utils/query';
import type { OperationHandler } from '../../../types';

export const letterEventOperations: INodePropertyOptions[] = [
  {
    name: 'Get for Letter',
    value: 'getAllForLetter',
    description: 'Get events for a specific letter',
    action: 'Get events for a letter',
  },
  {
    name: 'Get Issues',
    value: 'getIssues',
    description: 'List letter issue events',
    action: 'Get many letter issue events',
  },
  {
    name: 'Get Undeliverable',
    value: 'getUndeliverable',
    description: 'List undeliverable letter events',
    action: 'Get many undeliverable letter events',
  },
  {
    name: 'Get Delivered',
    value: 'getDelivered',
    description: 'List delivered letter events',
    action: 'Get many delivered letter events',
  },
  {
    name: 'Get Sent',
    value: 'getSent',
    description: 'List sent letter events',
    action: 'Get many sent letter events',
  },
];

export const letterEventFields: INodeProperties[] = [
  {
    displayName: 'Letter ID',
    name: 'eventLetterId',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. 01234567-abcd-efgh-ijkl-000000000000',
    description: 'The ID of the letter to fetch events for (UUID)',
    displayOptions: { show: { resource: ['letterEvent'], operation: ['getAllForLetter'] } },
  },
];

const getAllForLetter: OperationHandler = async (ctx, i, orgId, credentialsType, apiUrl) => {
  const letterId = readEncodedIdParam(ctx, i, 'eventLetterId', 'Letter ID');
  const qs = buildQueryString(ctx, i);
  const res = await pingenRequest(ctx, credentialsType, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters/${letterId}/events${qs}`,
    headers: getPingenHeaders(),
  });
  return flattenJsonApi(res);
};

const eventCollectionHandler = (path: string): OperationHandler => {
  return async (ctx, i, orgId, credentialsType, apiUrl) => {
    const qs = buildQueryString(ctx, i);
    const res = await pingenRequest(ctx, credentialsType, {
      method: 'GET',
      url: `${apiUrl}/organisations/${orgId}/deliveries/letters/events/${path}${qs}`,
      headers: getPingenHeaders(),
    });
    return flattenJsonApi(res);
  };
};

export const letterEventHandlers = {
  getAllForLetter,
  getIssues: eventCollectionHandler('issues'),
  getUndeliverable: eventCollectionHandler('undeliverable'),
  getDelivered: eventCollectionHandler('delivered'),
  getSent: eventCollectionHandler('sent'),
} satisfies Record<string, OperationHandler>;
