import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
  AddressPosition,
  DeliveryProduct,
  PrintMode,
  PrintSpectrum,
  BatchIcon,
  GroupingType,
  SplitType,
  SplitPosition,
  type BatchAttributes,
  type PresetRelationship,
  type OperationHandler,
} from '../../../types';
import {
  DELIVERY_PRODUCTS,
  PRINT_MODES,
  PRINT_SPECTRUMS,
  ADDRESS_POSITIONS,
  BATCH_ICONS,
  GROUPING_TYPES,
  SPLIT_TYPES,
  SPLIT_POSITIONS,
} from '../../../utils/options';
import { validateCountryCode } from '../../../utils/validation';
import { readEncodedIdParam } from '../../../utils/params';
import { createBatchDeliveryProduct, buildBatchPayload, buildBatchSendPayload } from '../../../utils/payloads';
import { pingenRequest } from '../../../services/http.service';
import { flattenJsonApi } from '../../../utils/response';
import { uploadBinaryToPingen } from '../../../services/upload.service';
import { buildQueryString } from '../../../utils/query';

export const batchOperations: INodePropertyOptions[] = [
  {
    name: 'Upload & Create',
    value: 'uploadAndCreate',
    description: 'Upload a PDF and create a batch',
    action: 'Upload and create a batch',
  },
  { name: 'Send', value: 'send', description: 'Send a created batch', action: 'Send a batch' },
  {
    name: 'Get',
    value: 'get',
    description: 'Get details of a specific batch',
    action: 'Get a batch',
  },
  {
    name: 'Get Many',
    value: 'getAll',
    description: 'List batches',
    action: 'Get many batches',
  },
  {
    name: 'Cancel',
    value: 'cancel',
    description: 'Cancel a batch not yet sent',
    action: 'Cancel a batch',
  },
  { name: 'Delete', value: 'delete', description: 'Delete a batch', action: 'Delete a batch' },
  {
    name: 'Get Statistics',
    value: 'getStatistics',
    description: 'Get statistics for a batch',
    action: 'Get batch statistics',
  },
];

export const batchFields: INodeProperties[] = [
  {
    displayName: 'Batch ID',
    name: 'batchId',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. 01234567-abcd-efgh-ijkl-000000000000',
    description: 'The ID of the batch to act on (UUID from the create response or Pingen UI)',
    displayOptions: {
      show: {
        resource: ['batch'],
        operation: ['send', 'get', 'cancel', 'delete', 'getStatistics'],
      },
    },
  },
  {
    displayName: 'Input Binary Field',
    name: 'batchBinaryPropertyName',
    type: 'string',
    required: true,
    default: 'data',
    description: 'Name of the binary property containing the PDF file',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Batch Name',
    name: 'batchName',
    type: 'string',
    required: true,
    default: '',
    description: 'Display name for the batch',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'File Original Name',
    name: 'batchFileOriginalName',
    type: 'string',
    required: true,
    default: 'batch.pdf',
    description: 'Original file name',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Icon',
    name: 'batchIcon',
    type: 'options',
    default: 'document',
    required: true,
    options: [...BATCH_ICONS],
    description: 'Batch icon identifier shown in Pingen',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Address Window Position',
    name: 'batchAddressPosition',
    type: 'options',
    default: 'left',
    options: [...ADDRESS_POSITIONS],
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Grouping Type',
    name: 'batchGroupingType',
    type: 'options',
    default: 'merge',
    required: true,
    options: [...GROUPING_TYPES],
    description: 'How to group letters inside the batch PDF',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Split Type',
    name: 'batchSplitType',
    type: 'options',
    default: 'page',
    required: true,
    options: [...SPLIT_TYPES],
    description: 'How to split pages into individual letters',
    displayOptions: {
      show: { resource: ['batch'], operation: ['uploadAndCreate'], batchGroupingType: [GroupingType.Merge] },
    },
  },
  {
    displayName: 'Split Size',
    name: 'batchSplitSize',
    type: 'number',
    default: 1,
    description: 'Number of pages per letter',
    displayOptions: {
      show: {
        resource: ['batch'],
        operation: ['uploadAndCreate'],
        batchGroupingType: [GroupingType.Merge],
        batchSplitType: [SplitType.Page],
      },
    },
  },
  {
    displayName: 'Split Position',
    name: 'batchSplitPosition',
    type: 'options',
    default: 'first_page',
    options: [...SPLIT_POSITIONS],
    description: 'Split before or after the QR invoice page',
    displayOptions: {
      show: {
        resource: ['batch'],
        operation: ['uploadAndCreate'],
        batchGroupingType: [GroupingType.Merge],
        batchSplitType: [SplitType.QrInvoice],
      },
    },
  },
  {
    displayName: 'Split Separator',
    name: 'batchSplitSeparator',
    type: 'string',
    default: '',
    description: 'Text separator between letters in the PDF',
    displayOptions: {
      show: {
        resource: ['batch'],
        operation: ['uploadAndCreate'],
        batchGroupingType: [GroupingType.Merge],
        batchSplitType: [SplitType.Custom],
      },
    },
  },
  {
    displayName: 'Preset ID',
    name: 'batchPresetId',
    type: 'string',
    default: '',
    placeholder: 'e.g. 01234567-abcd-efgh-ijkl-000000000000',
    description: 'Optional Pingen preset ID',
    displayOptions: { show: { resource: ['batch'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Delivery Products',
    name: 'batchDeliveryProducts',
    type: 'fixedCollection',
    required: true,
    typeOptions: { multipleValues: true },
    default: {},
    placeholder: 'Add Country/Product Pair',
    description: 'One or more country + delivery product pairs for the batch',
    displayOptions: { show: { resource: ['batch'], operation: ['send'] } },
    options: [
      {
        name: 'pair',
        displayName: 'Country / Delivery Product',
        values: [
          {
            displayName: 'Country',
            name: 'country',
            type: 'string',
            default: 'CH',
            placeholder: 'CH',
            description: 'ISO 3166-1 alpha-2 country code',
          },
          {
            displayName: 'Delivery Product',
            name: 'deliveryProduct',
            type: 'options',
            default: 'cheap',
            options: [...DELIVERY_PRODUCTS],
          },
        ],
      },
    ],
  },
  {
    displayName: 'Print Mode',
    name: 'batchPrintMode',
    type: 'options',
    options: [...PRINT_MODES],
    default: 'simplex',
    displayOptions: { show: { resource: ['batch'], operation: ['send'] } },
  },
  {
    displayName: 'Print Spectrum',
    name: 'batchPrintSpectrum',
    type: 'options',
    options: [...PRINT_SPECTRUMS],
    default: 'grayscale',
    displayOptions: { show: { resource: ['batch'], operation: ['send'] } },
  },
];

const uploadAndCreate: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const binaryPropertyName = ctx.getNodeParameter('batchBinaryPropertyName', i) as string;
  const batchName = ctx.getNodeParameter('batchName', i) as string;
  const batchIcon = ctx.getNodeParameter('batchIcon', i) as BatchIcon;
  const batchFileName = ctx.getNodeParameter('batchFileOriginalName', i) as string;
  const addressPosition = ctx.getNodeParameter('batchAddressPosition', i) as AddressPosition;
  const groupingType = ctx.getNodeParameter('batchGroupingType', i) as GroupingType;
  const splitType =
    groupingType === GroupingType.Zip ? SplitType.File : (ctx.getNodeParameter('batchSplitType', i) as SplitType);
  const presetId = ctx.getNodeParameter('batchPresetId', i, '') as string;

  const { signedUrl, signature } = await uploadBinaryToPingen(ctx, i, binaryPropertyName, apiUrl, headers);

  const batchAttributes: BatchAttributes = {
    file_url: signedUrl,
    file_url_signature: signature,
    name: batchName,
    icon: batchIcon,
    file_original_name: batchFileName,
    address_position: addressPosition,
    grouping_type: groupingType,
    grouping_options_split_type: splitType,
  };
  if (groupingType === GroupingType.Merge) {
    if (splitType === SplitType.Page) {
      const size = ctx.getNodeParameter('batchSplitSize', i, 1) as number;
      if (!Number.isInteger(size) || size < 1) {
        throw new Error(`Split Size must be a positive integer, got ${size}.`);
      }
      batchAttributes.grouping_options_split_size = size;
    } else if (splitType === SplitType.QrInvoice) {
      const pos = ctx.getNodeParameter('batchSplitPosition', i, '') as SplitPosition | '';
      if (pos) {
        batchAttributes.grouping_options_split_position = pos;
      }
    } else if (splitType === SplitType.Custom) {
      const sep = (ctx.getNodeParameter('batchSplitSeparator', i, '') as string).trim();
      if (!sep) {
        throw new Error('Split Separator is required for custom split type.');
      }
      batchAttributes.grouping_options_split_separator = sep;
    }
  }

  const preset: PresetRelationship | undefined = presetId ? { data: { id: presetId, type: 'presets' } } : undefined;

  const createRaw = await pingenRequest(ctx, {
    method: 'POST',
    url: `${apiUrl}/organisations/${orgId}/batches`,
    headers,
    body: buildBatchPayload(batchAttributes, preset),
  });
  return flattenJsonApi(JSON.parse(createRaw as string));
};

const send: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const batchId = readEncodedIdParam(ctx, i, 'batchId', 'Batch ID');
  const deliveryProductsRaw = ctx.getNodeParameter('batchDeliveryProducts', i, {}) as {
    pair?: Array<{ country: string; deliveryProduct: DeliveryProduct }>;
  };
  const deliveryProducts = (deliveryProductsRaw.pair ?? [])
    .filter((p) => p.country && p.deliveryProduct)
    .map((p) => {
      const country = p.country.trim().toUpperCase();
      validateCountryCode(country, 'Delivery country');
      return createBatchDeliveryProduct(country, p.deliveryProduct);
    });

  const res = await pingenRequest(ctx, {
    method: 'PATCH',
    url: `${apiUrl}/organisations/${orgId}/batches/${batchId}/send`,
    headers,
    body: buildBatchSendPayload(batchId, {
      delivery_products: deliveryProducts,
      print_mode: ctx.getNodeParameter('batchPrintMode', i) as PrintMode,
      print_spectrum: ctx.getNodeParameter('batchPrintSpectrum', i) as PrintSpectrum,
    }),
  });
  return flattenJsonApi(JSON.parse(res as string));
};

const get: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const batchId = readEncodedIdParam(ctx, i, 'batchId', 'Batch ID');
  const res = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/batches/${batchId}`,
    headers,
  });
  return flattenJsonApi(JSON.parse(res as string));
};

const getAll: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const qs = buildQueryString(ctx, i);
  const res = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/batches${qs}`,
    headers,
  });
  return flattenJsonApi(JSON.parse(res as string));
};

const cancel: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const batchId = readEncodedIdParam(ctx, i, 'batchId', 'Batch ID');
  const res = await pingenRequest(ctx, {
    method: 'PATCH',
    url: `${apiUrl}/organisations/${orgId}/batches/${batchId}/cancel`,
    headers,
  });
  return flattenJsonApi(JSON.parse(res as string));
};

const delete_: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const batchId = readEncodedIdParam(ctx, i, 'batchId', 'Batch ID');
  const res = await pingenRequest(ctx, {
    method: 'DELETE',
    url: `${apiUrl}/organisations/${orgId}/batches/${batchId}`,
    headers,
  });
  return res ? flattenJsonApi(JSON.parse(res as string)) : { deleted: true, batchId };
};

const getStatistics: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const batchId = readEncodedIdParam(ctx, i, 'batchId', 'Batch ID');
  const res = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/batches/${batchId}/statistics`,
    headers,
  });
  return flattenJsonApi(JSON.parse(res as string));
};

export const batchHandlers = {
  uploadAndCreate,
  send,
  get,
  getAll,
  cancel,
  delete: delete_,
  getStatistics,
} satisfies Record<string, OperationHandler>;
