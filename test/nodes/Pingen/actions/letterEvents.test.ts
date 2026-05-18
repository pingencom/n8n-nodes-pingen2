import { letterEventHandlers } from '../../../../nodes/Pingen/actions/letterEvents';
import { createMockCtx, mockJsonApiCollection } from '../../../helpers/mockCtx';

const ORG = 'org-1';
const API = 'https://api.pingen.com';
const HEADERS = { Authorization: 'Bearer t' };

describe('letterEventHandlers.getAllForLetter', () => {
  it('fetches events for a letter without query', async () => {
    const ctx = createMockCtx({
      params: { eventLetterId: 'letter-1', pageNumber: 0 },
      requests: [mockJsonApiCollection([{ id: 'e1', type: 'events', attributes: { type: 'sent' } }])],
    });
    const result = (await letterEventHandlers.getAllForLetter(ctx, 0, ORG, HEADERS, API)) as {
      items: unknown[];
    };
    expect(result.items).toHaveLength(1);
    const url = (ctx.helpers.request as jest.Mock).mock.calls[0][0].url;
    expect(url).toContain('/letters/letter-1/events');
    expect(url).not.toContain('?');
  });

  it('appends query string', async () => {
    const ctx = createMockCtx({
      params: { eventLetterId: 'letter-1', pageSize: 50 },
      requests: [mockJsonApiCollection([])],
    });
    await letterEventHandlers.getAllForLetter(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).toContain('?page[size]=50');
  });
});

describe.each([
  ['getIssues', 'issues'],
  ['getUndeliverable', 'undeliverable'],
  ['getDelivered', 'delivered'],
  ['getSent', 'sent'],
])('letterEventHandlers.%s', (op, path) => {
  const handler = letterEventHandlers[op as keyof typeof letterEventHandlers];

  it(`hits /events/${path} without qs`, async () => {
    const ctx = createMockCtx({
      params: { pageNumber: 0 },
      requests: [mockJsonApiCollection([])],
    });
    await handler(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).toContain(`/events/${path}`);
  });

  it(`appends qs to /events/${path}`, async () => {
    const ctx = createMockCtx({
      params: { pageNumber: 3 },
      requests: [mockJsonApiCollection([])],
    });
    await handler(ctx, 0, ORG, HEADERS, API);
    expect((ctx.helpers.request as jest.Mock).mock.calls[0][0].url).toContain(`/events/${path}?page[number]=3`);
  });
});
