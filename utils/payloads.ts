import { validateRegisteredAddress } from './validation';
import type {
  BatchAttributes,
  BatchDeliveryProduct,
  BatchSendAttributes,
  DeliveryProduct,
  LetterAttributes,
  LetterSendMetaData,
  PresetRelationship,
  PrintMode,
  PrintSpectrum,
} from '../types';

export function createBatchDeliveryProduct(country: string, deliveryProduct: DeliveryProduct): BatchDeliveryProduct {
  return { country, delivery_product: deliveryProduct };
}

export function buildLetterPayload(attributes: LetterAttributes, preset?: PresetRelationship): string {
  const data: Record<string, unknown> = {
    type: 'letters',
    attributes,
  };
  if (preset) {
    data.relationships = { preset };
  }
  return JSON.stringify({ data });
}

export function buildSendPayload(
  letterId: string,
  deliveryProduct: DeliveryProduct,
  printMode: PrintMode,
  printSpectrum: PrintSpectrum,
  metaData?: LetterSendMetaData,
): string {
  const attributes: Record<string, unknown> = {
    delivery_product: deliveryProduct,
    print_mode: printMode,
    print_spectrum: printSpectrum,
  };

  if (deliveryProduct === 'registered' && !metaData?.recipient) {
    throw new Error('Registered mail requires meta_data.recipient.');
  }

  if (metaData) {
    if (metaData.recipient) {
      validateRegisteredAddress(metaData.recipient, 'recipient');
    }
    if (metaData.sender) {
      validateRegisteredAddress(metaData.sender, 'sender');
    }
    attributes.meta_data = metaData;
  }

  return JSON.stringify({ data: { id: letterId, type: 'letters', attributes } });
}

export function buildBatchPayload(attributes: BatchAttributes, preset?: PresetRelationship): string {
  const data: Record<string, unknown> = {
    type: 'batches',
    attributes,
  };
  if (preset) {
    data.relationships = { preset };
  }
  return JSON.stringify({ data });
}

export function buildBatchSendPayload(batchId: string, attributes: BatchSendAttributes): string {
  if (!attributes.delivery_products || attributes.delivery_products.length === 0) {
    throw new Error('Batch send requires at least one delivery_product.');
  }
  return JSON.stringify({ data: { id: batchId, type: 'batches', attributes } });
}
