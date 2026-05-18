# Contributing to n8n-nodes-pingen2

Thanks for helping improve the Pingen n8n node. This document covers local development, testing, and publishing.

## Prerequisites

- Node.js ≥ 20.15 (matches n8n support range)
- npm ≥ 9
- Docker (optional — for running n8n locally with the node loaded)

## Local development

```bash
npm install
npm run check     # format + lint + test (fast, no coverage threshold failures)
npm run build     # tsc + copy SVG icons → dist/
npm run dev       # TS watch mode
npm run test:watch
```

`npm run check` runs:

1. `prettier --check` on all source and test files
2. `eslint` with `eslint-plugin-n8n-nodes-base` rules plus `curly: all` and `no-floating-promises`
3. `jest --coverage` against 100% stmts / 98% branches / 100% funcs / 100% lines

## Running in a local n8n

```bash
docker-compose up -d --build
open http://localhost:5678
```

The Dockerfile builds the node and mounts it into `n8nio/n8n:<pinned>` as a custom extension. Bump the `N8N_VERSION` ARG in the Dockerfile when upgrading. First boot takes ~60 s.

## Project layout

```
credentials/           PingenApi, PingenStagingApi credential classes
nodes/Pingen/          Pingen.node.ts + actions/ (letter, batch, letterEvents)
nodes/PingenTrigger/   Incoming-webhook trigger (HMAC-verified)
services/              IO + state — auth.service.ts, http.service.ts, upload.service.ts
utils/                 pure helpers — constants, options, validation, query, payloads,
                       response, webhook (HMAC + JSON:API envelope)
types/                 enums + interfaces + OperationHandler
errors/                extractErrorMessage + safeJsonParse
test/                  jest tests mirroring source modules 1:1
docs/examples/         importable n8n workflow JSON
```

See the README for the user-facing architecture overview.

## Testing philosophy

- Test tree mirrors `src/` 1:1. Example: `services/http.service.ts` ↔ `test/services/http.service.test.ts`.
- Shared helpers live in `test/helpers/` (e.g. `mockCtx.ts` for building a fake `IExecuteFunctions`).
- Shared fixtures live in `test/fixtures/` (e.g. `webhookFixtures.ts` with verbatim Pingen webhook payloads).
- Prefer `it.each(...)` over three near-identical `it(...)` blocks.
- Prefer URL-based request matching (`requestImpl`) over sequential mock arrays when a test spans multiple HTTP calls; it is less brittle to reordering.

## Publishing

Releases are automated from git tags:

1. Bump version in your head (semver), e.g. `1.2.3`.
2. Create a GitHub Release with tag `1.2.3` (or `v1.2.3`).
3. CI validates the tag format, runs `npm run check` + `npm run build`, and publishes to npm with provenance.

Requires `NPM_TOKEN` set in the GitHub repo secrets.

## Code style

- TypeScript `strict: true`. No `any` unless unavoidable (and explain in a comment if so).
- SRP per module — if a file starts mixing unrelated concerns, split it.
- Comments explain **why**, not what — the code already says what.
- No `console.log` in shipped code. No `it.skip` in committed tests.

## Reporting issues

Use the issue templates under `.github/ISSUE_TEMPLATE/`. Always include the `n8n-nodes-pingen2` version and the Pingen environment (Production vs Staging).
