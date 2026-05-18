import { PingenApi } from '../../credentials/PingenApi.credentials';
import { PingenStagingApi } from '../../credentials/PingenStagingApi.credentials';

describe('PingenApi credential (production)', () => {
  const cred = new PingenApi();

  it('has clientId and clientSecret fields', () => {
    expect(cred.properties.find((p) => p.name === 'clientId')).toBeDefined();
    expect(cred.properties.find((p) => p.name === 'clientSecret')).toBeDefined();
  });

  it('declares the notice field explaining app-creation flow', () => {
    const notice = cred.properties.find((p) => p.name === 'notice');
    expect(notice?.type).toBe('notice');
  });
});

describe('PingenStagingApi credential', () => {
  const cred = new PingenStagingApi();

  it('warns users that staging and production credentials are different', () => {
    const notice = cred.properties.find((p) => p.name === 'notice');
    expect((notice as { displayName: string }).displayName.toLowerCase()).toContain('staging');
  });

  it('has clientId and clientSecret fields', () => {
    expect(cred.properties.find((p) => p.name === 'clientId')).toBeDefined();
    expect(cred.properties.find((p) => p.name === 'clientSecret')).toBeDefined();
  });
});
