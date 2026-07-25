# Waki Demo Builder

Waki turns finalized meeting input from an existing bot into a mini-app demo.
This repository contains the agent/backend side of the system.

Stage 1 provides:

- A versioned and validated bot request contract
- Optional bearer authentication for hosted bot APIs
- Server-side Qwen, Daytona, and Qoder credential configuration
- A live provider credential check
- Idempotent job creation
- Persistent SQLite workflow state
- A deterministic asynchronous worker
- Durable, ordered callbacks with optional HMAC signing
- Clarification, feedback, and approval endpoints

Stage 2 now adds:

- Qwen Cloud structured `ProductSpec` generation with strict schema validation
- A constrained Qoder coding session over an isolated temporary app workspace
- A Daytona TypeScript sandbox with a bounded two-hour lifetime
- Production compilation and deterministic output checks
- Signed, expiring Daytona preview URLs
- Durable ProductSpec, build report, and evaluation artifacts
- A provider-free integration test plus an opt-in live baseline command

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
cp .env.example .env
pnpm install
```

Add the provider credentials you have to `.env`, then verify them:

```bash
pnpm auth:check
```

Run the Stage 2 baseline against the makeup meeting in
`examples/demo-request.json`:

```bash
pnpm baseline:live
```

The command prints every workflow state and finishes with a signed preview URL.
It creates one Daytona sandbox, which is configured to expire automatically.

Run the mock bot callback receiver:

```bash
pnpm dev:bot
```

In a second terminal, run the API and worker:

```bash
pnpm dev
```

Submit the example request:

```bash
curl \
  --request POST \
  --header "Content-Type: application/json" \
  --data @examples/demo-request.json \
  http://127.0.0.1:3000/v1/demo-jobs
```

Use the returned `jobId` to read status:

```bash
curl \
  http://127.0.0.1:3000/v1/demo-jobs/JOB_ID
```

Inspect the validated ProductSpec:

```bash
curl \
  http://127.0.0.1:3000/v1/demo-jobs/JOB_ID/spec
```

## Validate

```bash
pnpm check
```

See [provider authentication](docs/provider-auth.md) for credential setup and
[the bot integration contract](docs/bot-integration.md) for endpoint, callback,
retry, and idempotency details. See
[Stage 2 testing](docs/stage-2-testing.md) for the baseline flow and current
limitations.
