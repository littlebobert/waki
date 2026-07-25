# Waki

**Ideas, made present.** Waki is a quiet meeting companion that turns conversation into useful, interactive software while the meeting is still happening.

This first hackathon slice transforms a transcript into a live launch command center with metrics, decisions, risks, and interactive action items. It deliberately uses a structured component registry instead of executing arbitrary generated code, which keeps the first demo fast and safe.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). An API key is optional: without one, Waki uses a deterministic fallback so the demo remains reliable.

## Optional QwenCloud generation

Treat the QwenCloud credit as Alibaba Cloud Model Studio access. Set these values in `.env.local`:

```bash
DASHSCOPE_API_KEY=your_key
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus
```

The generation route uses Qwen as the primary multimodal product analyst in two passes:

1. **Evidence pass:** jointly analyze the transcript and supplied keyframes, segment topics, extract proposals, decisions, and constraints, and select relevant frame IDs. If keyframes are insufficient and a `fullVideoUrl` is supplied, Qwen analyzes the full video as a fallback.
2. **AppSpec pass:** convert only the grounded evidence map into the structured artifact, including deterministic acceptance criteria.

`POST /api/generate` accepts `transcript` plus optional `keyframes` (`{ id, imageUrl, timestamp? }[]`) and `fullVideoUrl`. Media must use HTTPS or a data URL.

## Verification policy

LLM judges may add qualitative product feedback, but they are advisory. A successful production build and Playwright acceptance tests remain the deterministic release gates; generated acceptance criteria label the expected verification method accordingly.

## Hosted Attendee live transcription

Waki can send an Attendee bot into a Google Meet, Zoom, or Microsoft Teams meeting and receive real-time speaker-attributed transcription.

1. In Attendee Hosted, open **Settings → Credentials**, add an OpenAI API key, and enable OpenAI transcription. The key stays in Attendee; Waki never receives it. OpenAI automatic language handling is used for mixed English/Japanese meetings.
2. Open **Settings → Webhooks** and copy the project webhook secret. Waki attaches `bot.state_change` and `transcript.update` bot-level subscriptions when it creates each bot.
3. Create the D1 database and copy its ID into `wrangler.jsonc`:

```bash
npx wrangler d1 create waki
npx wrangler d1 migrations apply waki --remote
```

4. Configure local values in `.env.local`, and production secrets in Cloudflare:

```bash
npx wrangler secret put ATTENDEE_API_KEY
npx wrangler secret put ATTENDEE_WEBHOOK_SECRET
npx wrangler secret put DASHSCOPE_API_KEY
```

Set `WAKI_PUBLIC_URL` as a Cloudflare Worker variable to the deployed HTTPS origin. The resulting webhook is `https://your-origin/api/attendee/webhook`.

Create a random secret for Attendee's realtime video WebSocket connection:

```bash
openssl rand -hex 32 | npx wrangler secret put ATTENDEE_VIDEO_STREAM_TOKEN
```

When Waki creates a bot, it requests Attendee's `per_participant_video` WebSocket stream at 360p for webcams and screen shares. The Cloudflare Durable Object endpoint accepts Attendee's base64 JPEG messages and samples at most one frame every five seconds per participant and source. Sampled frames are currently discarded after metadata logging: they are not decoded, stored, or sent to a model.

No additional Attendee dashboard webhook is required for video; the WebSocket URL is attached to each bot creation request. The existing Attendee API key remains sufficient.

5. Deploy, paste a Google Meet URL into Waki, and select **Join with Waki**. Admit the Waki participant if the meeting has a lobby. Its status and transcript should begin updating within a few seconds.

For local D1-backed development, `npm run dev` uses the local Wrangler binding configured by OpenNext. Attendee cannot call localhost, so use the deployed Worker for a real webhook smoke test. Webhook deliveries can be inspected in the Attendee bot detail under **Webhooks**.

## Waki Coder app building

The generated-app path runs [waki-coder](https://github.com/q-cheng/waki-coder) as a separate private Node service. Do not deploy its long-running SQLite worker inside Cloudflare. The service requires Node 22.5+, one API process, exactly one worker, and a persistent volume for its SQLite database. Configure its Qwen, Qoder, and Daytona credentials, then set:

```bash
BOT_AUTH_ENABLED=true
BOT_API_TOKEN=a-long-random-service-token
WEBHOOK_SIGNING_SECRET=a-different-long-random-secret
CALLBACK_ALLOWED_ORIGINS=https://your-waki-worker.example.com
```

The Node API must be reachable over HTTPS from Cloudflare, even if access is otherwise private behind its bearer token. In Waki, configure `WAKI_CODER_BASE_URL` as a Worker variable and add the two matching secrets:

```bash
npx wrangler secret put WAKI_CODER_API_TOKEN
npx wrangler secret put WAKI_CODER_WEBHOOK_SECRET
```

Apply the build-job migration before deploying:

```bash
npx wrangler d1 migrations apply waki-database --remote
```

Waki submits transcript-only requests in this first slice. Sampled video frames are not included because they are not yet stored at public HTTPS URLs. The service sends signed progress callbacks to `/api/waki-coder/webhook`, while the browser-safe Waki status route also reconciles by polling.

## Current vertical slice

1. Paste a Google Meet URL and send Waki into the call.
2. Signed Attendee webhooks populate the live transcript in D1; the browser polls the session every two seconds.
3. Select **Build this app** once transcript text is available.
4. Waki submits an idempotent request to the separate Waki Coder service.
5. The UI shows real Qwen, Qoder, build, and test progress before opening the signed Daytona preview.
6. The existing `POST /api/generate` structured landing-page demo remains separate from the generated-app path.

## Architecture

- `app/page.tsx` — meeting workspace entry point
- `components/meeting-studio.tsx` — transcript and interactive artifact UI
- `app/api/generate/route.ts` — structured LLM generation and fallback path
- `app/api/attendee/` — bot creation, signed webhook ingestion, and live-session reads
- `app/api/builds/` — browser-safe generated-app creation and status routes
- `app/api/waki-coder/webhook/` — signed builder progress callback ingestion
- `lib/attendee.ts` — URL validation and webhook signature verification
- `lib/waki-coder.ts` — typed private service client and transcript mapping
- `lib/build-store.ts` — D1 build progress and preview persistence
- `lib/meeting-store.ts` — D1 session and transcript persistence
- `lib/artifact.ts` — Zod contract, sample data, and deterministic generator
- `migrations/` — D1 schema migrations

## Hackathon build order

1. **Attendee webhook adapter:** normalize partial/final transcript events into the current transcript input.
2. **Intentional trigger:** recognize “Waki, build…” or expose a one-click suggestion before generation.
3. **Screen context:** sample screen-share frames and send the latest relevant frame with the transcript window.
4. **Meeting delivery:** post the artifact URL back into meeting chat.
5. **Iteration loop:** apply requests such as “make this weekly” to the existing artifact contract.
6. **Sandbox mode:** add Daytona only when arbitrary generated apps become essential to the demo.

## Product principle

In Noh theater, the *waki* supports the story from the side of the stage. Waki should behave the same way in a meeting: present when useful, quiet when not.
