import { validateRegisteredAddress, validateCountryCode, requireNonEmpty } from '../../utils/validation';
import type { RegisteredAddress } from '../../types';

const validRecipient: RegisteredAddress = {
  name: 'Jane Doe',
  street: 'Bahnhofstrasse',
  number: '1',
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

describe('validateRegisteredAddress', () => {
  describe('required fields', () => {
    it('accepts valid recipient with street+number', () => {
      expect(() => validateRegisteredAddress(validRecipient, 'recipient')).not.toThrow();
    });

    it('accepts valid recipient with pobox', () => {
      expect(() => validateRegisteredAddress(poboxRecipient, 'recipient')).not.toThrow();
    });

    it('throws when name is missing', () => {
      expect(() => validateRegisteredAddress({ ...validRecipient, name: '' }, 'recipient')).toThrow(
        /recipient name is required/i,
      );
    });

    it('throws when zip is missing', () => {
      expect(() => validateRegisteredAddress({ ...validRecipient, zip: '' }, 'recipient')).toThrow(
        /recipient zip is required/i,
      );
    });

    it('throws when city is missing', () => {
      expect(() => validateRegisteredAddress({ ...validRecipient, city: '' }, 'recipient')).toThrow(
        /recipient city is required/i,
      );
    });

    it('throws when country is missing', () => {
      expect(() => validateRegisteredAddress({ ...validRecipient, country: '' }, 'recipient')).toThrow(
        /recipient country is required/i,
      );
    });
  });

  describe('street-vs-pobox (either/or)', () => {
    it('throws when both street and pobox are missing', () => {
      const recipient = { ...validRecipient };
      delete recipient.street;
      delete recipient.pobox;
      expect(() => validateRegisteredAddress(recipient, 'recipient')).toThrow(
        /Either recipient\.street.*or recipient\.pobox/,
      );
    });

    it('accepts street-only (no pobox)', () => {
      expect(() => validateRegisteredAddress(validRecipient, 'recipient')).not.toThrow();
    });

    it('accepts pobox-only (no street)', () => {
      expect(() => validateRegisteredAddress(poboxRecipient, 'recipient')).not.toThrow();
    });
  });

  describe('length constraints', () => {
    it.each([
      ['name', 45, validRecipient],
      ['street', 40, validRecipient],
      ['pobox', 45, poboxRecipient],
      ['number', 10, validRecipient],
      ['zip', 8, validRecipient],
      ['city', 25, validRecipient],
    ] as const)('rejects %s > %i chars', (field, max, base) => {
      const over = { ...base, [field]: 'x'.repeat(max + 1) } as RegisteredAddress;
      expect(() => validateRegisteredAddress(over, 'recipient')).toThrow(new RegExp(`${field}.*${max}`));
    });

    it('accepts name of exactly 45 chars (boundary)', () => {
      expect(() => validateRegisteredAddress({ ...validRecipient, name: 'x'.repeat(45) }, 'recipient')).not.toThrow();
    });
  });
});

describe('requireNonEmpty', () => {
  it('returns trimmed value when non-empty', () => {
    expect(requireNonEmpty('  hello  ', 'Field')).toBe('hello');
  });

  it('throws when empty string', () => {
    expect(() => requireNonEmpty('', 'Letter ID')).toThrow(/Letter ID is required/);
  });

  it('throws when whitespace only', () => {
    expect(() => requireNonEmpty('   ', 'Letter ID')).toThrow(/Letter ID is required/);
  });
});

describe('validateCountryCode', () => {
  it('accepts valid 2-letter uppercase', () => {
    expect(() => validateCountryCode('CH', 'Country')).not.toThrow();
  });

  it('rejects lowercase', () => {
    expect(() => validateCountryCode('ch', 'Country')).toThrow(/ISO 3166-1/);
  });

  it('rejects 3-letter codes', () => {
    expect(() => validateCountryCode('CHE', 'Country')).toThrow();
  });

  it('rejects empty', () => {
    expect(() => validateCountryCode('', 'Country')).toThrow();
  });
});
