# Example workflows

Importable n8n workflow JSON files matching the use cases in the main README.

To use: **n8n UI → Workflows → Import from File** and select a `.json` file below.

| File | What it does |
|---|---|
| [`stripe-invoice-letter.json`](./stripe-invoice-letter.json) | Listens for `invoice.paid` on Stripe, downloads the invoice PDF, sends it as a cheap physical letter. |
| [`monthly-reminders-batch.json`](./monthly-reminders-batch.json) | On the 1st of each month, fetches overdue customers from Postgres, generates a merged PDF, creates a Pingen batch, and sends with per-country delivery products. |
| [`delivery-webhook-to-slack.json`](./delivery-webhook-to-slack.json) | A Pingen Trigger dedicated to the **Delivered** event posts the letter id + timestamp to a Slack channel. Zero latency, zero wasted API calls. Add a second trigger for Issues / Sent / Undeliverable if needed. |

Before importing, make sure you have:

- A **Pingen API** credential configured in n8n (see the main [README](../../README.md))
- An `PINGEN_ORG_ID` environment variable set on your n8n instance (the action examples reference it via `$env.PINGEN_ORG_ID` for portability)
- For the webhook example: a `PINGEN_WEBHOOK_DELIVERED_SECRET` env var holding the secret you configure for the **Delivered** webhook in Pingen. One Pingen Trigger node = one event type = one URL + secret; for other events (Issues / Sent / Undeliverable) add another trigger.
- Any other credentials required by non-Pingen nodes (Stripe, Postgres, Slack, etc.)
