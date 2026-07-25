# Stage 2 baseline testing

Stage 2 turns the makeup meeting request into a live mini-app preview:

1. Qwen Cloud converts the meeting text into a schema-validated ProductSpec.
2. Qoder edits a seeded React/Vite app in a temporary local workspace.
3. The generated source is uploaded to an isolated Daytona TypeScript sandbox.
4. Daytona installs dependencies and runs the production build.
5. The worker verifies that a non-empty `dist/index.html` was produced.
6. Daytona starts Vite and returns a signed preview URL.

## Test without provider usage

Run the deterministic integration suite:

```bash
pnpm check
```

The Stage 2 workflow test uses fake provider adapters but exercises the real
state machine, SQLite artifact persistence, failure handling, and preview event.

## Run one live baseline

First confirm all three credentials:

```bash
pnpm auth:check
```

Then run:

```bash
pnpm baseline:live
```

Expected state sequence:

```text
SPEC_GENERATING
SPEC_READY
SANDBOX_CREATING
BUILDING
FUNCTIONAL_TESTING
PREVIEW_READY
```

Open the printed preview URL before its displayed expiry time. The Daytona
sandbox itself has a two-hour TTL and auto-delete interval, so failed runs do
not leave an unbounded resource.

## Exercise the API and mock bot

Use three terminals:

```bash
pnpm dev:bot
```

```bash
pnpm dev
```

```bash
curl \
  --request POST \
  --header "Content-Type: application/json" \
  --data @examples/demo-request.json \
  http://127.0.0.1:3000/v1/demo-jobs
```

Poll the returned job:

```bash
curl http://127.0.0.1:3000/v1/demo-jobs/JOB_ID
```

Inspect its ProductSpec:

```bash
curl http://127.0.0.1:3000/v1/demo-jobs/JOB_ID/spec
```

## Current baseline boundaries

- Text meeting inputs and up to three HTTPS screenshot references are processed.
  Audio transcription is intentionally deferred.
- Qoder runs as a constrained local SDK process and receives only the validated
  ProductSpec plus seeded app files. It has file tools but no shell or web tools.
- Provider credentials stay in the worker process. They are not written into
  the generated project or uploaded to Daytona.
- Evaluation currently proves production compilation and output presence.
  Browser interaction and screenshot comparison are the next Stage 2 increment.
