# Provider authentication

Provider credentials live only in the backend environment. They must not be sent
by the meeting bot, placed in job payloads, copied into generated websites, or
committed to Git.

## Qwen Cloud

1. Sign in at `https://home.qwencloud.com`.
2. Open API Keys and create a pay-as-you-go API key.
3. Copy the key when it is shown.
4. Configure the Qwen Cloud OpenAI-compatible endpoint:

```env
DASHSCOPE_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus
```

Do not use a regional workspace URL with this Qwen Cloud configuration.
Pay-as-you-go and Token Plan keys have different endpoints and must not be
mixed. This backend currently targets the pay-as-you-go endpoint documented in
the Qwen Cloud developer quickstart. A key beginning with `sk-sp-` is a plan
key, not the pay-as-you-go key this backend needs.

The ProductSpec workflow requires image-capable structured JSON in non-thinking
mode. Use `qwen3.7-plus`; `qwen3.8-max-preview` is thinking-only and is not
compatible with this workflow's JSON Object response.

## Daytona

Create a key in the Daytona dashboard with sandbox permissions:

```env
DAYTONA_API_KEY=...
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_TARGET=us
```

The Stage 2 sandbox adapter needs sandbox create/modify and delete permissions.

## Qoder

Create a Personal Access Token from the Qoder account integrations page:

```env
QODER_PERSONAL_ACCESS_TOKEN=...
```

Use a PAT for the worker instead of relying on a developer's interactive CLI
login.

## Test credentials

After filling `.env`, run:

```bash
pnpm auth:check
```

The command:

- sends a minimal Qwen completion;
- reads the current Daytona API-key record without creating a sandbox;
- sends a minimal no-tools Qoder SDK query.

Qwen and Qoder checks may consume a very small amount of model usage. Missing
providers are reported as `SKIPPED`; invalid configured credentials make the
command exit unsuccessfully. Secret values and successful response content are
not printed.
