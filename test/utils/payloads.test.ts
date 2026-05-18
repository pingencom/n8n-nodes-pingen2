import {
  AddressPosition,
  BatchIcon,
  DeliveryProduct,
  GroupingType,
  PrintMode,
  PrintSpectrum,
  SplitPosition,
  SplitType,
  type BatchAttributes,
  type RegisteredAddress,
} from '../../types';
import {
  buildBatchPayload,
  buildBatchSendPayload,
  buildLetterPayload,
  buildSendPayload,
  createBatchDeliveryProduct,
} from '../../utils/payloads';

const baseAttributes = {
  file_original_name: 'invoice.pdf',
  file_url: 'https://storage.example.com/file.pdf',
  file_url_signature: 'sig123',
  address_position: AddressPosition.Left,
  auto_send: false,
};

const validRecipient: RegisteredAddress = {
  name: 'Jane Doe',
  street: 'Bahnhofstrasse',
  number: '1',
  zip: '8001',
  city: 'Zurich',
  country: 'CH',
};

const validSender: RegisteredAddress = {
  name: 'ACME GmbH',
  street: 'Teststrasse',
  number: '5',
  zip: '8001',
  city: 'Zurich',
  country: 'CH',
};

const poboxRecipient: RegisteredAddress = {
  name: 'Jane Doe',
  pobox: 'P.O. Box 123',
  zip: '8001',
  city: 'Zurich',
  country: 'CH',
};

describe('buildLetterPayload', () => {
  it('wraps attributes in JSON:API envelope', () => {
    const payload = JSON.parse(buildLetterPayload(baseAttributes));
    expect(payload.data.type).toBe('letters');
    expect(payload.data.attributes.auto_send).toBe(false);
    expect(payload.data.attributes.address_position).toBe('left');
  });

  it('omits delivery options when auto_send is false', () => {
    const payload = JSON.parse(buildLetterPayload(baseAttributes));
    expect(payload.data.attributes.delivery_product).toBeUndefined();
  });

  it('includes delivery options when auto_send is true', () => {
    const payload = JSON.parse(
      buildLetterPayload({
        ...baseAttributes,
        auto_send: true,
        delivery_product: DeliveryProduct.Fast,
        print_mode: PrintMode.Duplex,
        print_spectrum: PrintSpectrum.Color,
      }),
    );
    expect(payload.data.attributes.delivery_product).toBe('fast');
    expect(payload.data.attributes.print_mode).toBe('duplex');
    expect(payload.data.attributes.print_spectrum).toBe('color');
  });

  it('adds preset relationship when provided', () => {
    const payload = JSON.parse(
      buildLetterPayload(baseAttributes, { data: { id: 'preset-uuid-123', type: 'presets' } }),
    );
    expect(payload.data.relationships.preset.data.id).toBe('preset-uuid-123');
  });

  it('includes meta_data when provided', () => {
    const payload = JSON.parse(
      buildLetterPayload({
        ...baseAttributes,
        auto_send: true,
        delivery_product: DeliveryProduct.Cheap,
        print_mode: PrintMode.Simplex,
        print_spectrum: PrintSpectrum.Grayscale,
        meta_data: { recipient: validRecipient, sender: validSender },
      }),
    );
    expect(payload.data.attributes.meta_data.recipient.name).toBe('Jane Doe');
  });
});

describe('buildSendPayload', () => {
  it.each([DeliveryProduct.Cheap, DeliveryProduct.Fast, DeliveryProduct.Bulk, DeliveryProduct.Premium])(
    'builds payload without meta_data for "%s"',
    (product) => {
      const payload = JSON.parse(buildSendPayload('letter-123', product, PrintMode.Simplex, PrintSpectrum.Grayscale));
      expect(payload.data.id).toBe('letter-123');
      expect(payload.data.attributes.meta_data).toBeUndefined();
    },
  );

  it('throws when registered mail missing recipient', () => {
    expect(() =>
      buildSendPayload('letter-123', DeliveryProduct.Registered, PrintMode.Simplex, PrintSpectrum.Grayscale),
    ).toThrow(/Registered mail requires meta_data\.recipient/);
  });

  it('builds registered payload with sender + recipient', () => {
    const payload = JSON.parse(
      buildSendPayload('letter-123', DeliveryProduct.Registered, PrintMode.Simplex, PrintSpectrum.Grayscale, {
        recipient: validRecipient,
        sender: validSender,
      }),
    );
    expect(payload.data.attributes.meta_data.recipient.street).toBe('Bahnhofstrasse');
    expect(payload.data.attributes.meta_data.sender.name).toBe('ACME GmbH');
  });

  it('accepts metaData with only sender on non-registered mail', () => {
    const payload = JSON.parse(
      buildSendPayload('letter-123', DeliveryProduct.Cheap, PrintMode.Simplex, PrintSpectrum.Grayscale, {
        sender: validSender,
      }),
    );
    expect(payload.data.attributes.meta_data.sender.name).toBe('ACME GmbH');
    expect(payload.data.attributes.meta_data.recipient).toBeUndefined();
  });

  it('accepts pobox recipient', () => {
    const payload = JSON.parse(
      buildSendPayload('letter-123', DeliveryProduct.Registered, PrintMode.Simplex, PrintSpectrum.Grayscale, {
        recipient: poboxRecipient,
        sender: validSender,
      }),
    );
    expect(payload.data.attributes.meta_data.recipient.pobox).toBe('P.O. Box 123');
  });
});

const baseBatchAttributes: BatchAttributes = {
  file_url: 'https://storage.example.com/batch.pdf',
  file_url_signature: 'sig456',
  name: 'Monthly Invoices',
  icon: BatchIcon.Document,
  file_original_name: 'invoices.pdf',
  address_position: AddressPosition.Left,
  grouping_type: GroupingType.Merge,
  grouping_options_split_type: SplitType.Page,
};

describe('buildBatchPayload', () => {
  it('wraps attributes in batches JSON:API envelope', () => {
    const payload = JSON.parse(buildBatchPayload(baseBatchAttributes));
    expect(payload.data.type).toBe('batches');
    expect(payload.data.attributes.name).toBe('Monthly Invoices');
  });

  it('omits preset when not provided', () => {
    const payload = JSON.parse(buildBatchPayload(baseBatchAttributes));
    expect(payload.data.relationships).toBeUndefined();
  });

  it('includes preset when provided', () => {
    const payload = JSON.parse(buildBatchPayload(baseBatchAttributes, { data: { id: 'preset-xyz', type: 'presets' } }));
    expect(payload.data.relationships.preset.data.id).toBe('preset-xyz');
  });

  it('passes split options', () => {
    const payload = JSON.parse(
      buildBatchPayload({
        ...baseBatchAttributes,
        grouping_options_split_size: 3,
        grouping_options_split_separator: '---',
        grouping_options_split_position: SplitPosition.FirstPage,
      }),
    );
    expect(payload.data.attributes.grouping_options_split_size).toBe(3);
    expect(payload.data.attributes.grouping_options_split_position).toBe('first_page');
  });
});

describe('buildBatchSendPayload', () => {
  it('builds with single delivery product', () => {
    const payload = JSON.parse(
      buildBatchSendPayload('batch-1', {
        delivery_products: [createBatchDeliveryProduct('CH', DeliveryProduct.Cheap)],
        print_mode: PrintMode.Simplex,
        print_spectrum: PrintSpectrum.Grayscale,
      }),
    );
    expect(payload.data.id).toBe('batch-1');
    expect(payload.data.attributes.delivery_products).toEqual([{ country: 'CH', delivery_product: 'cheap' }]);
  });

  it('builds with multiple delivery products', () => {
    const payload = JSON.parse(
      buildBatchSendPayload('batch-1', {
        delivery_products: [
          createBatchDeliveryProduct('CH', DeliveryProduct.Cheap),
          createBatchDeliveryProduct('DE', DeliveryProduct.Fast),
        ],
        print_mode: PrintMode.Duplex,
        print_spectrum: PrintSpectrum.Color,
      }),
    );
    expect(payload.data.attributes.delivery_products).toHaveLength(2);
  });

  it('throws when delivery_products is empty', () => {
    expect(() =>
      buildBatchSendPayload('batch-1', {
        delivery_products: [],
        print_mode: PrintMode.Simplex,
        print_spectrum: PrintSpectrum.Grayscale,
      }),
    ).toThrow(/at least one delivery_product/);
  });
});
