import type { RegisteredAddress } from '../types';

const COUNTRY_RE = /^[A-Z]{2}$/;

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

export function validateCountryCode(value: string, label: string): void {
  if (!COUNTRY_RE.test(value)) {
    throw new Error(`${label} must be a 2-letter ISO 3166-1 alpha-2 code (e.g. CH, DE, AT), got "${value}".`);
  }
}

export function validateRegisteredAddress(addr: RegisteredAddress, label: string): void {
  if (!addr.name || addr.name.length > 45) {
    throw new Error(`${label} name is required and must be <= 45 characters.`);
  }
  if (!addr.zip || addr.zip.length > 8) {
    throw new Error(`${label} zip is required and must be <= 8 characters.`);
  }
  if (!addr.city || addr.city.length > 25) {
    throw new Error(`${label} city is required and must be <= 25 characters.`);
  }
  if (!addr.country) {
    throw new Error(`${label} country is required.`);
  }
  validateCountryCode(addr.country, `${label} country`);
  const hasStreet = addr.street && addr.street.length > 0;
  const hasPobox = addr.pobox && addr.pobox.length > 0;
  if (!hasStreet && !hasPobox) {
    throw new Error(`Either ${label}.street (with number) or ${label}.pobox must be provided.`);
  }
  if (addr.street && addr.street.length > 40) {
    throw new Error(`${label} street must be <= 40 characters.`);
  }
  if (addr.pobox && addr.pobox.length > 45) {
    throw new Error(`${label} pobox must be <= 45 characters.`);
  }
  if (addr.number && addr.number.length > 10) {
    throw new Error(`${label} number must be <= 10 characters.`);
  }
}
