# Stage 2 baseline testing

Stage 2 turns the makeup meeting request into a live mini-app preview:

1. Qwen Cloud converts the meeting text into a schema-validated ProductSpec.
2. Qoder edits the seeded React/Vite frontend in a temporary local workspace.
3. The generated source is uploaded to an isolated Daytona TypeScript sandbox.
4. Daytona installs the frontend dependencies and, when requested, the protected
   FastAPI backend dependencies.
5. Daytona runs the React production build and compiles the Python backend.
6. The worker starts FastAPI and smoke-tests health, team listing, voting, and
   vote reset.
7. FastAPI serves both `/api/*` and the built React app through one signed
   Daytona preview URL.

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

If a temporary public screenshot URL has expired, the live baseline can send a
local image to Qwen as Base64 without changing the bot request contract:

```bash
BASELINE_IMAGE_PATH=/absolute/path/to/hackathon-teams.png pnpm baseline:live
```

The checked-in request must still contain the screenshot metadata. This override
is only used by the local baseline script; bot-submitted screenshots continue to
require public HTTPS URLs.

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

The current example sets `preferences.allowBackend` to `true`. Its votes are
stored in memory, so they reset if the FastAPI process or sandbox restarts.

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
- For backend-enabled requests, Waki generates and protects a fixed FastAPI
  service. Qoder may change only the React frontend and calls the fixed API.
- The backend is deliberately demo-only: FastAPI, in-memory state, no database,
  no authentication, and only bounded `/api/*` routes.
- Provider credentials stay in the worker process. They are not written into
  the generated project or uploaded to Daytona.
- Evaluation proves production compilation, output presence, and the fixed
  backend's API smoke flow. Browser interaction and screenshot comparison are
  the next Stage 2 increment.
