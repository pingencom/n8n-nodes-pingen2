// Verbatim payloads from Pingen API docs (https://api.pingen.com/documentation,
// tag: misc.webhooks). Reproduced here so tests lock onto the actual contract.

export const WEBHOOK_SENT = {
  data: {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    type: 'webhook_sent',
    attributes: {
      url: 'https://your.webhook/url',
      created_at: '2020-11-19T09:42:48+0100',
    },
    relationships: {
      organisation: {
        links: { related: 'string' },
        data: { id: 'bbbbbbbb-1111-2222-3333-444444444444', type: 'organisations' },
      },
      letter: {
        links: { related: 'string' },
        data: { id: 'cccccccc-1111-2222-3333-444444444444', type: 'letters' },
      },
      event: {
        links: { related: 'string' },
        data: { id: 'dddddddd-1111-2222-3333-444444444444', type: 'letters_events' },
      },
    },
    links: { self: 'string' },
  },
  included: [{}],
};

export const WEBHOOK_ISSUES = {
  data: {
    id: 'ee111111-1111-2222-3333-444444444444',
    type: 'webhook_issues',
    attributes: {
      reason: 'Content failed inspection',
      url: 'https://your.webhook/url',
      created_at: '2020-11-19T09:42:48+0100',
    },
    relationships: {
      organisation: {
        links: { related: 'string' },
        data: { id: 'bbbbbbbb-1111-2222-3333-444444444444', type: 'organisations' },
      },
      letter: {
        links: { related: 'string' },
        data: { id: 'cccccccc-1111-2222-3333-444444444444', type: 'letters' },
      },
      event: {
        links: { related: 'string' },
        data: { id: 'dddddddd-1111-2222-3333-444444444444', type: 'letters_events' },
      },
    },
    links: { self: 'string' },
  },
  included: [{}],
};

export const WEBHOOK_UNDELIVERABLE = {
  data: {
    id: 'ff222222-1111-2222-3333-444444444444',
    type: 'webhook_undeliverable',
    attributes: {
      reason: 'Recipient could not be determined at the specified address.',
      corrected_address: {
        name: 'Alex Meier',
        street: 'Example street',
        number: '50A',
        zip: '8051',
        city: 'Zürich',
      },
      url: 'https://your.webhook/url',
      created_at: '2020-11-19T09:42:48+0100',
    },
    relationships: {
      organisation: {
        links: { related: 'string' },
        data: { id: 'bbbbbbbb-1111-2222-3333-444444444444', type: 'organisations' },
      },
      letter: {
        links: { related: 'string' },
        data: { id: 'cccccccc-1111-2222-3333-444444444444', type: 'letters' },
      },
      event: {
        links: { related: 'string' },
        data: { id: 'dddddddd-1111-2222-3333-444444444444', type: 'letters_events' },
      },
    },
    links: { self: 'string' },
  },
  included: [{}],
};

export const WEBHOOK_DELIVERED = {
  data: {
    id: '99aaaaaa-1111-2222-3333-444444444444',
    type: 'webhook_delivered',
    attributes: {
      url: 'https://your.webhook/url',
      created_at: '2020-11-19T09:42:48+0100',
    },
    relationships: {
      organisation: {
        links: { related: 'string' },
        data: { id: 'bbbbbbbb-1111-2222-3333-444444444444', type: 'organisations' },
      },
      letter: {
        links: { related: 'string' },
        data: { id: 'cccccccc-1111-2222-3333-444444444444', type: 'letters' },
      },
      event: {
        links: { related: 'string' },
        data: { id: 'dddddddd-1111-2222-3333-444444444444', type: 'letters_events' },
      },
    },
    links: { self: 'string' },
  },
  included: [{}],
};
