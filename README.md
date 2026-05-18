# n8n-nodes-pingen2

Send physical postal mail directly from [n8n](https://n8n.io) workflows using the [Pingen](https://pingen.com) API.

Invoices, reminders, contracts, any PDF — dispatched as real letters across Europe, Switzerland and the UK.

## Requirements

- A [Pingen account](https://pingen.com) (free signup)
- n8n 1.0+ running on Node.js ≥ 20.15

## Installation

In n8n: **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-pingen2
```

## Setup

### 1. Create a Pingen API app

1. Log in at [identity.pingen.com](https://identity.pingen.com) (or [identity-staging.pingen.com](https://identity-staging.pingen.com) for Staging)
2. Go to **API Access → Create Developer-App** (Client Credentials flow)
3. Copy the **Client ID** and **Client Secret**

The node requests all scopes it needs (`letter batch organisation_read webhook`) at token-exchange time — no scope picker on the Pingen side.

### 2. Add credential in n8n

In n8n: **Credentials → New →** pick either:

- **Pingen API** (for production)
- **Pingen Staging API** (for testing — no real letters sent, no credits consumed)

Paste Client ID + Secret and save. The node automatically exchanges them for an access token on first use and caches until expiry.

### 3. Use the Pingen node

Add the **Pingen** node to your workflow. Pick **Environment** (Production or Staging) — this selects which credential the node uses. Then pick your **Organisation** from the dropdown (auto-loaded from your Pingen account).

## Testing in Staging

Pingen provides a free staging environment for development. Letters sent against staging are **not printed or mailed** and **don't consume credits**.

**Setup is separate from production:**

1. Create a second app at [identity-staging.pingen.com](https://identity-staging.pingen.com)
2. In n8n, create a second credential using **Pingen Staging API** (not Pingen API) — staging and production client IDs/secrets are not interchangeable
3. In the Pingen node, set **Environment → Staging** — the node switches to `api-staging.pingen.com` and uses the staging credential automatically

Switch back to **Environment → Production** when going live. Token caches are isolated per environment, so no cross-contamination.

## Example use cases

Ready-to-import workflow JSON lives in [`docs/examples/`](./docs/examples/).

### 1. Send an invoice when a Stripe payment succeeds

```
Stripe trigger (invoice.paid)
  → HTTP Request (download invoice PDF)
  → Pingen (Resource: Letter, Operation: Upload & Create, Auto Send: true)
```
→ [`docs/examples/stripe-invoice-letter.json`](./docs/examples/stripe-invoice-letter.json)

### 2. Monthly batch of reminders

```
Cron (1st of month)
  → Postgres: fetch overdue customers → PDF generator
  → Pingen (Resource: Batch, Operation: Upload & Create)
  → Pingen (Resource: Batch, Operation: Send, per-country delivery products)
```
→ [`docs/examples/monthly-reminders-batch.json`](./docs/examples/monthly-reminders-batch.json)

### 3. React to a delivery event in real time

```
Pingen Trigger (Event Type: Delivered, with webhook secret)
  → Slack: notify ops channel
```
→ [`docs/examples/delivery-webhook-to-slack.json`](./docs/examples/delivery-webhook-to-slack.json)

Prefer this over cron polling — you get the event the moment Pingen emits it, the node verifies the HMAC signature for you, and there are no wasted API calls. Need polling anyway (e.g. to backfill events from before the workflow existed)? Use the **Letter Event → Get Delivered** operation with a `created_at[gte]` filter.

## Resources & Operations

Pick a **Resource** (Letter / Batch / Letter Event), then an **Operation**. Fields appear below the Operation selector.

### Resource: Letter

| Operation | Description |
|---|---|
| Upload & Create | Upload a PDF and create a letter. Enable Auto Send to dispatch immediately. |
| Send | Send a previously created letter (useful if you want to review price/recipient first). |
| Get | Fetch one letter by ID. |
| Get Many | List letters in the organisation (with paging/sort/filter). |
| Calculate Price | Compute cost for a given country + delivery product before sending. |
| Cancel | Cancel a letter that hasn't been dispatched. |

### Resource: Batch

| Operation | Description |
|---|---|
| Upload & Create | Upload a PDF containing multiple letters and create a batch. |
| Send | Send a created batch — specify delivery product per recipient country. |
| Get | Get one batch by ID. |
| Get Many | List batches (with paging/sort/filter). |
| Cancel | Cancel a batch not yet sent. |
| Delete | Delete a batch. |
| Get Statistics | Aggregate stats (letter count, status breakdown) for a batch. |

### Resource: Letter Event

| Operation | Description |
|---|---|
| Get for Letter | Events for a specific letter (status changes, delivery milestones). |
| Get Issues | All `issue` events across the organisation (e.g. failed validation, held mail). |
| Get Undeliverable | All `undeliverable` events. |
| Get Delivered | All `delivered` events. |
| Get Sent | All `sent` events. |

## Receiving webhooks

Use the **Pingen Trigger** node to start a workflow when Pingen pushes an event.

### Event types

| Event | When it fires |
|---|---|
| `Issues` | Pre-send validation rejected the letter (content inspection failure, bad format, policy check). The letter is **not** dispatched. |
| `Sent` | Letter handed off to the postal carrier. |
| `Delivered` | Letter arrived at the recipient. |
| `Undeliverable` | Carrier tried and failed — returned the letter (e.g. wrong address discovered at delivery). |

### Setup — one trigger per event type

One Pingen Trigger node = one event type = one URL. This keeps each branch of your workflow focused on a single concern (single-responsibility) and surfaces which events you're subscribed to directly in the canvas.

1. Drag a **Pingen Trigger** onto the canvas. Pick an **Event Type** (Issues / Sent / Delivered / Undeliverable). The Webhook URL above updates automatically — the path ends in `/issues`, `/sent`, `/delivered` or `/undeliverable` so the URL is self-documenting.
2. Generate a strong random string and paste it into **Webhook Secret** (e.g. `openssl rand -hex 32`).
3. In **Pingen → Settings → Webhooks**, paste the URL into the matching event-type slot and paste the same secret next to it.
4. Need more event types? Add another Pingen Trigger and repeat — one per event type you care about.

### Test URL vs Production URL (how n8n webhooks work)

The trigger node shows **two URLs**:

| URL | When it is live | Expires | Use for |
|---|---|---|---|
| **Test URL** | Only while you're in the editor and clicked **"Listen for test event"** | 2 minutes or first event | Development / fast iteration. Pingen's **"Send test webhook"** button can target this while the listener is armed. |
| **Production URL** | Only while the workflow is **active** (toggle top-right) | Never — as long as the workflow stays active | Production — real delivery events. Also works with Pingen's "Send test webhook" if you want to smoke-test a live deployment. |

**This is an n8n platform constraint — not something this node can change.** Day-to-day testing uses the Test URL + "Listen for test event". Once you're happy, swap in the Production URL in Pingen and activate the workflow.

### Output shape

The node unwraps Pingen's JSON:API envelope so downstream nodes see flat fields:

```json
{
  "eventType": "delivered",
  "id": "<webhook event uuid>",
  "type": "webhook_delivered",
  "url": "https://your.webhook/url",
  "created_at": "2020-11-19T09:42:48+0100",
  "letter_id": "<letter uuid>",
  "event_id": "<letters_events uuid>",
  "organisation_id": "<organisation uuid>"
}
```

`reason` is included for `issues` events; `corrected_address` for `undeliverable`. `included[]` is forwarded as-is when non-empty.

### Security

HMAC-SHA256 signature is verified **first**, before any other request inspection — an unauthenticated caller gets a generic `401` without learning whether the content-type, body shape, or anything else matched. Comparison is timing-safe (`crypto.timingSafeEqual`).

### Retries

If the webhook URL is unreachable or returns non-2xx, Pingen retries on a fixed schedule (1 min, 5 min, 10 min, 1 h, 2 h, 4 h) then gives up. Keep the workflow idempotent — the same event may arrive more than once on flapping connections.

## Registered mail

Registered letters require a recipient address that overrides the one printed on the PDF. When you set **Delivery Product → Registered** in the Send or Upload & Create operation:

- **Recipient Address** is **required** (throws an error if missing)
- **Sender Address** is optional but recommended

## Address validation limits

Pingen enforces strict character limits on registered-mail addresses. The node validates before submitting:

| Field | Max length | Notes |
|---|---|---|
| Name | 45 | Required |
| Street | 40 | Either street+number OR pobox required |
| House number | 10 | |
| PO Box | 45 | Alternative to street+number |
| ZIP | 8 | Required |
| City | 25 | Required |
| Country | 2 | ISO 3166-1 alpha-2 (e.g. CH, DE, AT) — **uppercase required** |

## Preset IDs

Pingen lets you pre-configure delivery defaults (product, print mode, address position…) as a **preset** in their web UI. Once created, the preset's UUID appears in the URL or API response.

- Create presets at `app.pingen.com → Settings → Presets`
- Paste the UUID into the **Preset ID** field on Upload & Create
- Per-call parameters still override the preset

## Paging, Sorting, Filtering (Get Many, Letter Events)

All "list" operations expose structured fields:

| Field | Purpose |
|---|---|
| **Page Number** | 1-based page (leave 0 for server default) |
| **Page Size** | Items per page (max 100) |
| **Sort** | JSON:API sort expression, e.g. `-created_at,name` (prefix with `-` for descending) |
| **Additional Filters** | Key/value pairs — each becomes `filter[key]=value` on the URL |

Under the hood these compose into `?page[number]=2&page[size]=50&sort=-created_at&filter[status]=sent`. See [Pingen API docs](https://api.pingen.com/documentation) for available filter/sort keys per endpoint.

## Error handling

- Network / 5xx failures on idempotent requests (GET/PUT/DELETE/HEAD) are **retried up to 3 times** with exponential backoff + jitter.
- POST / PATCH mutations include an **Idempotency-Key** header — retries are safe (Pingen deduplicates server-side).
- `429 Too Many Requests` always retries and honours `Retry-After`.
- Errors surface the Pingen message (`errors[].detail`, `errors[].title`, `error.message`, or `message`). Multiple errors are joined with `; `.
- Enable **Continue On Fail** in the node settings to turn errors into output items instead of halting the workflow.

## FAQ

**Why do I get `[403]` immediately?**
The node requests the scopes `letter batch organisation_read webhook` at token exchange. If your Pingen plan doesn't grant one of those, Pingen returns 403. Check your plan's API access tier.

**Staging credentials don't work against production (or vice versa). Why?**
Pingen issues separate apps per environment. Create one at `identity.pingen.com` for production and another at `identity-staging.pingen.com` for staging — they have different Client IDs/Secrets and are not interchangeable.

**How do I get a letter's tracking URL / delivery proof?**
Use the **Letter — Get** operation; the returned `attributes` include tracking info. For delivery-triggered workflows use the **Pingen Trigger** node.

## License

BSD 3-Clause — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development, testing, and release workflow.

## About

This is the **official Pingen package** for n8n, maintained by Pingen GmbH.
