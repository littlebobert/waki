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

## Optional live generation

Set these values in `.env.local`:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

## Current vertical slice

1. Paste or edit a meeting transcript.
2. Select **Build from conversation**.
3. Waki extracts a structured artifact through `POST /api/generate`.
4. The artifact appears beside the source context and remains interactive.
5. If the model or network is unavailable, the endpoint returns a safe demo artifact.

## Architecture

- `app/page.tsx` — meeting workspace entry point
- `components/meeting-studio.tsx` — transcript and interactive artifact UI
- `app/api/generate/route.ts` — structured LLM generation and fallback path
- `lib/artifact.ts` — Zod contract, sample data, and deterministic generator

## Hackathon build order

1. **Attendee webhook adapter:** normalize partial/final transcript events into the current transcript input.
2. **Intentional trigger:** recognize “Waki, build…” or expose a one-click suggestion before generation.
3. **Screen context:** sample screen-share frames and send the latest relevant frame with the transcript window.
4. **Meeting delivery:** post the artifact URL back into meeting chat.
5. **Iteration loop:** apply requests such as “make this weekly” to the existing artifact contract.
6. **Sandbox mode:** add Daytona only when arbitrary generated apps become essential to the demo.

## Product principle

In Noh theater, the *waki* supports the story from the side of the stage. Waki should behave the same way in a meeting: present when useful, quiet when not.
