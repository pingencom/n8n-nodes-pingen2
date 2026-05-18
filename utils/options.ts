import {
  AddressPosition,
  BatchIcon,
  DeliveryProduct,
  GroupingType,
  PaperType,
  PrintMode,
  PrintSpectrum,
  SplitPosition,
  SplitType,
} from '../types';

const enumToOptions = <T extends Record<string, string>>(e: T, labels?: Partial<Record<T[keyof T], string>>) =>
  (Object.values(e) as T[keyof T][]).map((value) => ({
    name: labels?.[value] ?? value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    value,
  }));

export const DELIVERY_PRODUCTS = enumToOptions(DeliveryProduct);
export const PRINT_MODES = enumToOptions(PrintMode, {
  [PrintMode.Simplex]: 'Simplex (Single-sided)',
  [PrintMode.Duplex]: 'Duplex (Double-sided)',
});
export const PRINT_SPECTRUMS = enumToOptions(PrintSpectrum, {
  [PrintSpectrum.Grayscale]: 'Grayscale',
  [PrintSpectrum.Color]: 'Colour',
});
export const ADDRESS_POSITIONS = enumToOptions(AddressPosition);
export const BATCH_ICONS = enumToOptions(BatchIcon);
export const GROUPING_TYPES = enumToOptions(GroupingType);
export const SPLIT_TYPES = enumToOptions(SplitType, {
  [SplitType.Page]: 'Page (Fixed Size)',
  [SplitType.QrInvoice]: 'QR Invoice',
  [SplitType.Custom]: 'Custom (Separator)',
});
export const SPLIT_POSITIONS = enumToOptions(SplitPosition, {
  [SplitPosition.FirstPage]: 'Before QR Page',
  [SplitPosition.LastPage]: 'After QR Page',
});
export const PAPER_TYPES = enumToOptions(PaperType, {
  [PaperType.Qr]: 'QR',
  [PaperType.SepaAt]: 'SEPA (AT)',
  [PaperType.SepaDe]: 'SEPA (DE)',
});
