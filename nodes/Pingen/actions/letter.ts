import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
  AddressPosition,
  DeliveryProduct,
  PrintMode,
  PrintSpectrum,
  type LetterAttributes,
  type RegisteredAddress,
  type PresetRelationship,
  type OperationHandler,
} from '../../../types';
import {
  DELIVERY_PRODUCTS,
  PRINT_MODES,
  PRINT_SPECTRUMS,
  ADDRESS_POSITIONS,
  PAPER_TYPES,
} from '../../../utils/options';
import { validateRegisteredAddress, validateCountryCode } from '../../../utils/validation';
import { readEncodedIdParam } from '../../../utils/params';
import { buildLetterPayload, buildSendPayload } from '../../../utils/payloads';
import { pingenRequest } from '../../../services/http.service';
import { flattenJsonApi } from '../../../utils/response';
import { uploadBinaryToPingen } from '../../../services/upload.service';
import { buildQueryString } from '../../../utils/query';

export const letterOperations: INodePropertyOptions[] = [
  {
    name: 'Upload & Create',
    value: 'uploadAndCreate',
    description: 'Upload a PDF and create a letter',
    action: 'Upload and create a letter',
  },
  {
    name: 'Send',
    value: 'send',
    description: 'Send an already created letter',
    action: 'Send a letter',
  },
  {
    name: 'Get',
    value: 'get',
    description: 'Get details of a specific letter',
    action: 'Get a letter',
  },
  {
    name: 'Get Many',
    value: 'getAll',
    description: 'List letters in your organisation',
    action: 'Get many letters',
  },
  {
    name: 'Calculate Price',
    value: 'calculatePrice',
    description: 'Calculate price before sending',
    action: 'Calculate letter price',
  },
  {
    name: 'Cancel',
    value: 'cancel',
    description: 'Cancel a letter not yet sent',
    action: 'Cancel a letter',
  },
];

const addressFields: INodeProperties[] = [
  { displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Full name (max 45 chars)' },
  {
    displayName: 'Street',
    name: 'street',
    type: 'string',
    default: '',
    description: 'Street name (max 40 chars). Either street+number or PO Box required.',
  },
  { displayName: 'Number', name: 'number', type: 'string', default: '', description: 'House number (max 10 chars)' },
  {
    displayName: 'PO Box',
    name: 'pobox',
    type: 'string',
    default: '',
    description: 'PO Box (max 45 chars). Alternative to street+number.',
  },
  { displayName: 'ZIP', name: 'zip', type: 'string', default: '', description: 'Postal code (max 8 chars)' },
  { displayName: 'City', name: 'city', type: 'string', default: '', description: 'City (max 25 chars)' },
  {
    displayName: 'Country',
    name: 'country',
    type: 'string',
    default: '',
    placeholder: 'CH',
    description: 'ISO 3166-1 alpha-2 country code',
  },
];

export const letterFields: INodeProperties[] = [
  {
    displayName: 'Input Binary Field',
    name: 'binaryPropertyName',
    type: 'string',
    required: true,
    default: 'data',
    description:
      'Name of the binary field that holds the PDF. Use "Read/Write Files From Disk" or "HTTP Request" node to provide the file.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'File Display Name',
    name: 'fileOriginalName',
    type: 'string',
    required: true,
    default: 'document.pdf',
    description: 'Original file name',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Address Window Position',
    name: 'addressPosition',
    type: 'options',
    default: 'left',
    options: [...ADDRESS_POSITIONS],
    description: 'Position of the address window on the envelope',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Auto Send',
    name: 'autoSend',
    type: 'boolean',
    default: false,
    description: 'Whether to send the letter immediately after creation',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Preset ID',
    name: 'presetIdCreate',
    type: 'string',
    default: '',
    placeholder: 'e.g. 01234567-abcd-efgh-ijkl-000000000000',
    description: 'Optional Pingen preset ID. Leave empty to skip.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Delivery Product',
    name: 'deliveryProduct',
    type: 'options',
    options: [{ name: '— Not Set —', value: '' }, ...DELIVERY_PRODUCTS],
    default: '',
    description: 'Delivery speed and type. Required when Auto Send is enabled.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Print Mode',
    name: 'printMode',
    type: 'options',
    options: [{ name: '— Not Set —', value: '' }, ...PRINT_MODES],
    default: '',
    description: 'Single or double-sided printing. Required when Auto Send is enabled.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Print Spectrum',
    name: 'printSpectrum',
    type: 'options',
    options: [{ name: '— Not Set —', value: '' }, ...PRINT_SPECTRUMS],
    default: '',
    description: 'Colour or grayscale printing. Required when Auto Send is enabled.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
  },
  {
    displayName: 'Recipient Address',
    name: 'registeredRecipient',
    type: 'fixedCollection',
    default: {},
    description: 'Recipient address. Required for registered mail, optional otherwise.',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
    options: [{ name: 'details', displayName: 'Recipient Details', values: [...addressFields] }],
  },
  {
    displayName: 'Sender Address',
    name: 'registeredSender',
    type: 'fixedCollection',
    default: {},
    description: 'Optional sender (return) address',
    displayOptions: { show: { resource: ['letter'], operation: ['uploadAndCreate'] } },
    options: [{ name: 'details', displayName: 'Sender Details', values: [...addressFields] }],
  },
  {
    displayName: 'Letter ID',
    name: 'letterId',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'e.g. 01234567-abcd-efgh-ijkl-000000000000',
    description: 'The ID of the letter to act on (UUID from the create response or Pingen UI)',
    displayOptions: { show: { resource: ['letter'], operation: ['send', 'get', 'cancel'] } },
  },
  {
    displayName: 'Delivery Product',
    name: 'deliveryProductSend',
    type: 'options',
    options: [...DELIVERY_PRODUCTS],
    default: 'cheap',
    description: 'Delivery speed and type',
    displayOptions: { show: { resource: ['letter'], operation: ['send'] } },
  },
  {
    displayName: 'Print Mode',
    name: 'printModeSend',
    type: 'options',
    options: [...PRINT_MODES],
    default: 'simplex',
    description: 'Single or double-sided printing',
    displayOptions: { show: { resource: ['letter'], operation: ['send'] } },
  },
  {
    displayName: 'Print Spectrum',
    name: 'printSpectrumSend',
    type: 'options',
    options: [...PRINT_SPECTRUMS],
    default: 'grayscale',
    description: 'Colour or grayscale printing',
    displayOptions: { show: { resource: ['letter'], operation: ['send'] } },
  },
  {
    displayName: 'Recipient Address',
    name: 'registeredRecipientSend',
    type: 'fixedCollection',
    default: {},
    description: 'Recipient address. Required for registered mail, optional otherwise.',
    displayOptions: { show: { resource: ['letter'], operation: ['send'] } },
    options: [{ name: 'details', displayName: 'Recipient Details', values: [...addressFields] }],
  },
  {
    displayName: 'Sender Address',
    name: 'registeredSenderSend',
    type: 'fixedCollection',
    default: {},
    description: 'Optional sender (return) address',
    displayOptions: { show: { resource: ['letter'], operation: ['send'] } },
    options: [{ name: 'details', displayName: 'Sender Details', values: [...addressFields] }],
  },
  {
    displayName: 'Recipient Country',
    name: 'country',
    type: 'string',
    default: 'CH',
    placeholder: 'CH',
    description: 'ISO 3166-1 alpha-2 country code (e.g. CH, DE, AT)',
    displayOptions: { show: { resource: ['letter'], operation: ['calculatePrice'] } },
  },
  {
    displayName: 'Delivery Product',
    name: 'deliveryProductPrice',
    type: 'options',
    options: [...DELIVERY_PRODUCTS],
    default: 'cheap',
    description: 'Delivery product to calculate price for',
    displayOptions: { show: { resource: ['letter'], operation: ['calculatePrice'] } },
  },
  {
    displayName: 'Print Mode',
    name: 'printModePrice',
    type: 'options',
    options: [...PRINT_MODES],
    default: 'simplex',
    description: 'Print mode to calculate price for',
    displayOptions: { show: { resource: ['letter'], operation: ['calculatePrice'] } },
  },
  {
    displayName: 'Print Spectrum',
    name: 'printSpectrumPrice',
    type: 'options',
    options: [...PRINT_SPECTRUMS],
    default: 'grayscale',
    description: 'Print spectrum to calculate price for',
    displayOptions: { show: { resource: ['letter'], operation: ['calculatePrice'] } },
  },
  {
    displayName: 'Paper Types',
    name: 'paperTypesPrice',
    type: 'multiOptions',
    options: [...PAPER_TYPES],
    default: ['normal'],
    required: true,
    description: 'Paper type(s) for the letter',
    displayOptions: { show: { resource: ['letter'], operation: ['calculatePrice'] } },
  },
];

const isNonEmpty = (v: unknown): boolean => v != null && String(v).trim() !== '';

const readAddress = (ctx: Parameters<OperationHandler>[0], i: number, field: string): RegisteredAddress => {
  const raw = ctx.getNodeParameter(field, i, {}) as { details?: RegisteredAddress };
  return raw.details ?? ({} as RegisteredAddress);
};

const getAddressParts = (
  ctx: Parameters<OperationHandler>[0],
  i: number,
  recipientField: string,
  senderField: string,
) => {
  const recipient = readAddress(ctx, i, recipientField);
  const sender = readAddress(ctx, i, senderField);
  return {
    recipient,
    sender,
    hasRecipient: Object.values(recipient).some(isNonEmpty),
    hasSender: Object.values(sender).some(isNonEmpty),
  };
};

const uploadAndCreate: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const binaryPropertyName = ctx.getNodeParameter('binaryPropertyName', i) as string;
  const fileOriginalName = (ctx.getNodeParameter('fileOriginalName', i) as string).trim();
  const addressPosition = ctx.getNodeParameter('addressPosition', i) as AddressPosition;
  const autoSend = ctx.getNodeParameter('autoSend', i) as boolean;

  const binaryData = ctx.helpers.assertBinaryData(i, binaryPropertyName);
  const fileName = fileOriginalName || binaryData.fileName?.trim() || 'document.pdf';
  const { signedUrl, signature } = await uploadBinaryToPingen(ctx, i, binaryPropertyName, apiUrl, headers);

  const attributes: LetterAttributes = {
    file_original_name: fileName,
    file_url: signedUrl,
    file_url_signature: signature,
    address_position: addressPosition,
    auto_send: autoSend,
  };

  const deliveryProduct = ctx.getNodeParameter('deliveryProduct', i, '') as string;
  const printMode = ctx.getNodeParameter('printMode', i, '') as string;
  const printSpectrum = ctx.getNodeParameter('printSpectrum', i, '') as string;

  if (autoSend) {
    if (!deliveryProduct) {
      throw new Error('Delivery Product is required when Auto Send is enabled.');
    }
    if (!printMode) {
      throw new Error('Print Mode is required when Auto Send is enabled.');
    }
    if (!printSpectrum) {
      throw new Error('Print Spectrum is required when Auto Send is enabled.');
    }
  }
  if (deliveryProduct) {
    attributes.delivery_product = deliveryProduct as DeliveryProduct;
  }
  if (printMode) {
    attributes.print_mode = printMode as PrintMode;
  }
  if (printSpectrum) {
    attributes.print_spectrum = printSpectrum as PrintSpectrum;
  }

  const { recipient, sender, hasRecipient, hasSender } = getAddressParts(
    ctx,
    i,
    'registeredRecipient',
    'registeredSender',
  );

  if (autoSend && deliveryProduct === 'registered' && !hasRecipient) {
    throw new Error('Recipient address is required for registered mail.');
  }
  if (hasRecipient) {
    validateRegisteredAddress(recipient, 'recipient');
  }
  if (hasSender) {
    validateRegisteredAddress(sender, 'sender');
  }
  if (hasRecipient || hasSender) {
    attributes.meta_data = {
      ...(hasRecipient ? { recipient } : {}),
      ...(hasSender ? { sender } : {}),
    };
  }

  const presetId = (ctx.getNodeParameter('presetIdCreate', i, '') as string).trim();
  const preset: PresetRelationship | undefined = presetId ? { data: { id: presetId, type: 'presets' } } : undefined;

  const createRaw = await pingenRequest(ctx, {
    method: 'POST',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters`,
    headers,
    body: buildLetterPayload(attributes, preset),
  });
  return flattenJsonApi(createRaw);
};

const send: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const letterId = readEncodedIdParam(ctx, i, 'letterId', 'Letter ID');
  const deliveryProduct = ctx.getNodeParameter('deliveryProductSend', i) as DeliveryProduct;
  const { recipient, sender, hasRecipient, hasSender } = getAddressParts(
    ctx,
    i,
    'registeredRecipientSend',
    'registeredSenderSend',
  );
  const metaData =
    hasRecipient || hasSender
      ? {
          ...(hasRecipient ? { recipient } : {}),
          ...(hasSender ? { sender } : {}),
        }
      : undefined;

  const res = await pingenRequest(ctx, {
    method: 'PATCH',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters/${letterId}/send`,
    headers,
    body: buildSendPayload(
      letterId,
      deliveryProduct,
      ctx.getNodeParameter('printModeSend', i) as PrintMode,
      ctx.getNodeParameter('printSpectrumSend', i) as PrintSpectrum,
      metaData,
    ),
  });
  return flattenJsonApi(res);
};

const get: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const letterId = readEncodedIdParam(ctx, i, 'letterId', 'Letter ID');
  const res = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters/${letterId}`,
    headers,
  });
  return flattenJsonApi(res);
};

const getAll: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const qs = buildQueryString(ctx, i);
  const res = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters${qs}`,
    headers,
  });
  return flattenJsonApi(res);
};

const calculatePrice: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const country = (ctx.getNodeParameter('country', i) as string).trim().toUpperCase();
  validateCountryCode(country, 'Country');
  const res = await pingenRequest(ctx, {
    method: 'POST',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters/price-calculator`,
    headers,
    body: JSON.stringify({
      data: {
        type: 'letter_price_calculator',
        attributes: {
          country,
          delivery_product: ctx.getNodeParameter('deliveryProductPrice', i),
          print_mode: ctx.getNodeParameter('printModePrice', i),
          print_spectrum: ctx.getNodeParameter('printSpectrumPrice', i),
          paper_types: ctx.getNodeParameter('paperTypesPrice', i),
        },
      },
    }),
  });
  return flattenJsonApi(res);
};

const cancel: OperationHandler = async (ctx, i, orgId, headers, apiUrl) => {
  const letterId = readEncodedIdParam(ctx, i, 'letterId', 'Letter ID');
  const res = await pingenRequest(ctx, {
    method: 'PATCH',
    url: `${apiUrl}/organisations/${orgId}/deliveries/letters/${letterId}/cancel`,
    headers,
  });
  return flattenJsonApi(res);
};

export const letterHandlers = {
  uploadAndCreate,
  send,
  get,
  getAll,
  calculatePrice,
  cancel,
} satisfies Record<string, OperationHandler>;
