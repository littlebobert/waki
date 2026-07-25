# Bot integration contract

The meeting bot calls the Demo Builder API only after it has a finalized request.
The backend responds asynchronously and reports progress through webhooks.

## Optional bot authentication

Bot authentication is disabled for the hackathon. When `BOT_AUTH_ENABLED=false`,
the bot does not need an authorization header.

For a hosted deployment, it can be enabled with:

```env
BOT_AUTH_ENABLED=true
BOT_API_TOKEN=<shared-service-token>
```

Every `/v1/*` request must then include:

```http
Authorization: Bearer <BOT_API_TOKEN>
```

## Create a job

```http
POST /v1/demo-jobs
Content-Type: application/json
```

Include `Authorization: Bearer <BOT_API_TOKEN>` only when bot authentication is
enabled.

Use the payload in `examples/demo-request.json`. `requestId` is the idempotency
key. Repeating the exact request returns the existing job. Reusing the same
`requestId` with different content returns `409 IDEMPOTENCY_CONFLICT`.

The API returns:

```json
{
  "jobId": "job_e23867fbfe0f4e29",
  "status": "ACCEPTED",
  "idempotentReplay": false
}
```

## Screenshot input

The bot can attach up to three visual references. Qwen receives each screenshot
alongside the meeting text:

```json
{
  "inputs": {
    "text": [
      {
        "id": "transcript-1",
        "content": "Create a regional sales dashboard."
      }
    ],
    "audio": [],
    "screenshots": [
      {
        "id": "sheet-1",
        "url": "https://assets.example.com/regional-sales.png?signature=...",
        "mimeType": "image/png",
        "description": "Regional sales sheet referenced in the meeting"
      }
    ]
  }
}
```

Screenshot URLs must:

- use HTTPS;
- be directly readable by QwenCloud without cookies or custom headers;
- remain valid for at least ten minutes after job submission;
- identify PNG, JPEG, or WebP content;
- avoid exposing sensitive or personal production data.

Short-lived signed URLs from the bot's existing object storage are recommended.
The Stage 2 baseline passes URLs directly to QwenCloud; it does not download or
store image bytes.

## Optional demo backend

Set the request preference when a mini-app needs simple mutable demo state:

```json
{
  "preferences": {
    "allowBackend": true
  }
}
```

When enabled, Qwen may specify only the bounded backend supported by Waki:
FastAPI with in-memory storage and `GET` or `POST` routes under `/api/*`. Waki
generates that service deterministically and prevents Qoder from editing it.
Qoder builds the React UI against the fixed API.

This is intended for hackathon demos, not production persistence. There is no
database or login, and all state resets when the backend process or Daytona
sandbox restarts. Leave `allowBackend` as `false` for a frontend-only demo.

## Read status and events

```http
GET /v1/demo-jobs/{jobId}
GET /v1/demo-jobs/{jobId}/events
```

Polling is supported as a fallback. Webhooks are the primary progress mechanism.

## Clarification, feedback, and approval

```http
POST /v1/demo-jobs/{jobId}/answers
POST /v1/demo-jobs/{jobId}/feedback
POST /v1/demo-jobs/{jobId}/approve
```

Clarification answer:

```json
{
  "questionId": "question-3",
  "answer": "no-login"
}
```

Feedback:

```json
{
  "feedbackId": "feedback-1",
  "text": "Use a darker header",
  "screenshots": []
}
```

Approval:

```json
{
  "approved": true,
  "specVersion": 1
}
```

State validation is strict. For example, feedback and approval are accepted only
when the job is `PREVIEW_READY`.

## Optional webhook verification

When `WEBHOOK_SIGNING_SECRET` is configured, callbacks include:

```http
X-Waki-Delivery: delivery_123
X-Waki-Event: demo.progress
X-Waki-Timestamp: 1784937600
X-Waki-Signature: v1=<hex digest>
```

Compute:

```text
expected = "v1=" + HMAC_SHA256(
  WEBHOOK_SIGNING_SECRET,
  X-Waki-Timestamp + "." + raw_request_body
)
```

Compare signatures using a constant-time comparison and verify the timestamp is
recent before processing the event. Use `X-Waki-Delivery` to deduplicate callback
deliveries.

For the hackathon, leave `WEBHOOK_SIGNING_SECRET` empty if the bot will not
verify callback signatures. Delivery IDs, event names, and timestamps are still
included.

The backend retries failed callbacks with exponential backoff. Events for the
same job are delivered in order. After eight failed attempts, an event remains
stored as a dead-letter record for inspection.

## Callback URL policy

Hosted callback URLs must use HTTPS and their exact origin must appear in
`BOT_CALLBACK_ALLOWED_ORIGINS`. HTTP is accepted only for localhost development.
