import type { IExecuteFunctions } from 'n8n-workflow';

export type OperationHandler = (
  ctx: IExecuteFunctions,
  i: number,
  orgId: string,
  headers: Record<string, string>,
  apiUrl: string,
) => Promise<unknown>;

export enum AddressPosition {
  Left = 'left',
  Right = 'right',
}

export enum DeliveryProduct {
  Cheap = 'cheap',
  Fast = 'fast',
  Registered = 'registered',
  Bulk = 'bulk',
  Premium = 'premium',
}

export enum PrintMode {
  Simplex = 'simplex',
  Duplex = 'duplex',
}

export enum PrintSpectrum {
  Color = 'color',
  Grayscale = 'grayscale',
}

export enum BatchIcon {
  Campaign = 'campaign',
  Megaphone = 'megaphone',
  WaveHand = 'wave-hand',
  Flash = 'flash',
  Rocket = 'rocket',
  Bell = 'bell',
  PercentTag = 'percent-tag',
  PercentBadge = 'percent-badge',
  Present = 'present',
  Receipt = 'receipt',
  Document = 'document',
  Information = 'information',
  Calendar = 'calendar',
  Newspaper = 'newspaper',
  Crown = 'crown',
  Virus = 'virus',
}

export enum GroupingType {
  Merge = 'merge',
  Zip = 'zip',
}

export enum SplitType {
  File = 'file',
  Page = 'page',
  Custom = 'custom',
  QrInvoice = 'qr_invoice',
}

export enum SplitPosition {
  FirstPage = 'first_page',
  LastPage = 'last_page',
}

export enum PaperType {
  Normal = 'normal',
  Qr = 'qr',
  SepaAt = 'sepa_at',
  SepaDe = 'sepa_de',
}

export interface BatchDeliveryProduct {
  country: string;
  delivery_product: DeliveryProduct;
}

export interface RegisteredAddress {
  name: string; // <= 45 chars
  street?: string; // <= 40 chars
  pobox?: string; // <= 45 chars
  number?: string; // <= 10 chars
  zip: string; // <= 8 chars
  city: string; // <= 25 chars
  country: string; // ISO 3166-1 alpha-2
}

export interface LetterSendMetaData {
  recipient?: RegisteredAddress;
  sender?: RegisteredAddress;
}

export interface PresetRelationship {
  data: {
    id: string;
    type: string;
  };
}

export interface LetterAttributes {
  file_original_name: string;
  file_url: string;
  file_url_signature: string;
  address_position: AddressPosition;
  auto_send: boolean;
  delivery_product?: DeliveryProduct;
  print_mode?: PrintMode;
  print_spectrum?: PrintSpectrum;
  meta_data?: LetterSendMetaData;
}

export interface BatchAttributes {
  file_url: string;
  file_url_signature: string;
  name: string;
  icon: BatchIcon;
  file_original_name: string;
  address_position: AddressPosition;
  grouping_type: GroupingType;
  grouping_options_split_type: SplitType;
  grouping_options_split_size?: number;
  grouping_options_split_separator?: string;
  grouping_options_split_position?: SplitPosition;
}

export interface BatchSendAttributes {
  delivery_products: BatchDeliveryProduct[];
  print_mode: PrintMode;
  print_spectrum: PrintSpectrum;
}

export interface JsonApiSingleResponse<A = Record<string, unknown>> {
  data: { id: string; type: string; attributes: A };
}

// Shape that n8n's httpRequest (axios-based) errors conform to. We use an intersection
// with `Error` so `message` is available on the same type; `response.data` is `unknown`
// because Pingen may send parsed JSON, HTML on 5xx, etc.
export type RetryableError = Error & {
  response?: {
    status?: number;
    headers?: Record<string, string | string[]>;
    data?: unknown;
  };
};
