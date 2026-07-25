import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  accessTokenFromEnv,
  query,
} from "@qoder-ai/qoder-agent-sdk";
import type {
  BuildArtifact,
  CodeAgentProvider,
  EvaluationReport,
  ProductSpecArtifact,
  SandboxHandle,
} from "@waki/core";

interface QoderCodeAgentOptions {
  accessToken: string;
  maxTurns?: number;
}

const TEMPLATE_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "waki-generated-demo",
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
      },
      dependencies: {
        "@vitejs/plugin-react": "latest",
        qrcode: "latest",
        vite: "latest",
        typescript: "latest",
        react: "latest",
        "react-dom": "latest",
      },
      devDependencies: {
        "@types/qrcode": "latest",
        "@types/react": "latest",
        "@types/react-dom": "latest",
      },
    },
    null,
    2,
  ),
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Waki demo</title>
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
`,
  "src/vite-env.d.ts": `/// <reference types="vite/client" />
`,
  "src/App.tsx": `import spec from "../product-spec.json";

export default function App() {
  const page = spec.pages[0];
  return (
    <main>
      <header>
        <p className="eyebrow">Interactive concept</p>
        <h1>{spec.project.name}</h1>
        <p>{spec.project.summary}</p>
      </header>
      <section className="panel">
        <h2>{page.name}</h2>
        <p>{page.purpose}</p>
        <div className="grid">
          {page.sections.map((section) => (
            <article className="card" key={section}>
              <span>{section}</span>
              <strong>Ready for demo</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
`,
  "src/styles.css": `:root {
  font-family: Inter, system-ui, sans-serif;
  color: #172033;
  background: #f5f7fb;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
main { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 72px 0; }
header { max-width: 720px; margin-bottom: 40px; }
h1 { margin: 8px 0 16px; font-size: clamp(2.5rem, 7vw, 5rem); line-height: .95; }
.eyebrow { color: #2563eb; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; }
.panel { padding: 28px; border: 1px solid #e5eaf2; border-radius: 24px; background: white; box-shadow: 0 20px 60px #14213d14; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 24px; }
.card { display: grid; gap: 24px; min-height: 140px; padding: 20px; border-radius: 16px; background: #f8fafc; }
.card strong { align-self: end; }
`,
};

const BACKEND_FILES: Record<string, string> = {
  "backend/requirements.txt": `fastapi>=0.115,<1
uvicorn>=0.34,<1
`,
  "backend/main.py": `from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
TEAM_DATA = json.loads((Path(__file__).parent / "teams.json").read_text())
VOTES = {team["id"]: 0 for team in TEAM_DATA}
VOTE_LOCK = Lock()

app = FastAPI(title="Waki Hackathon Voting API")


def team_snapshot() -> list[dict[str, str | int]]:
    return [
        {"id": team["id"], "name": team["name"], "votes": VOTES[team["id"]]}
        for team in TEAM_DATA
    ]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/teams")
def list_teams() -> list[dict[str, str | int]]:
    return team_snapshot()


@app.post("/api/teams/{team_id}/vote")
def vote(team_id: str) -> dict[str, str | int]:
    if team_id not in VOTES:
        raise HTTPException(status_code=404, detail="Team not found")
    with VOTE_LOCK:
        VOTES[team_id] += 1
        total = VOTES[team_id]
    team = next(team for team in TEAM_DATA if team["id"] == team_id)
    return {"id": team_id, "name": team["name"], "votes": total}


@app.post("/api/_reset", include_in_schema=False)
def reset_votes() -> dict[str, str]:
    with VOTE_LOCK:
        for team_id in VOTES:
            VOTES[team_id] = 0
    return {"status": "reset"}


@app.get("/{requested_path:path}", include_in_schema=False)
def frontend(requested_path: str):
    if requested_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    candidate = (DIST / requested_path).resolve()
    if requested_path and candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
        return FileResponse(candidate)
    index = DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Frontend build is not ready")
    return FileResponse(index)
`,
  "backend/smoke_test.py": `from __future__ import annotations

import json
from urllib.request import Request, urlopen

BASE_URL = "http://127.0.0.1:8000"


def request(path: str, method: str = "GET"):
    with urlopen(Request(BASE_URL + path, method=method), timeout=5) as response:
        return response.status, json.load(response)


status, health = request("/health")
assert status == 200 and health == {"status": "ok"}

status, teams = request("/api/teams")
assert status == 200 and teams, "The API must expose at least one team"
team = teams[0]

status, voted = request(f"/api/teams/{team['id']}/vote", "POST")
assert status == 200 and voted["votes"] == team["votes"] + 1

status, _ = request("/api/_reset", "POST")
assert status == 200
print("FastAPI voting smoke test passed")
`,
};

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function extractTeams(specification: ProductSpecArtifact): Array<{
  id: string;
  name: string;
}> {
  const datasets = [...specification.document.mockData].sort((left, right) => {
    const leftIsTeams = /teams?/i.test(left.name) ? 0 : 1;
    const rightIsTeams = /teams?/i.test(right.name) ? 0 : 1;
    return leftIsTeams - rightIsTeams;
  });
  const usedIds = new Set<string>();
  const teams: Array<{ id: string; name: string }> = [];
  for (const dataset of datasets) {
    for (const [index, record] of dataset.sampleRecords.entries()) {
      const rawName =
        record.name ??
        record.teamName ??
        record.team_name ??
        record.team ??
        record.title;
      if (typeof rawName !== "string" || !rawName.trim()) {
        continue;
      }
      const name = rawName.trim().slice(0, 120);
      let id =
        typeof record.id === "string" && record.id.trim()
          ? slugify(record.id, `team-${index + 1}`)
          : slugify(name, `team-${index + 1}`);
      let suffix = 2;
      const baseId = id;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      teams.push({ id, name });
    }
    if (teams.length > 0) {
      break;
    }
  }
  if (teams.length === 0) {
    throw new Error(
      "FastAPI voting demos require a mockData teams dataset with id/name records",
    );
  }
  return teams;
}

function backendTeamsJson(specification: ProductSpecArtifact): string {
  return JSON.stringify(extractTeams(specification), null, 2);
}

export async function createSeedProject(
  specification: ProductSpecArtifact,
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "waki-build-"));
  const files = specification.document.backend.enabled
    ? { ...TEMPLATE_FILES, ...BACKEND_FILES }
    : TEMPLATE_FILES;
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
  if (specification.document.backend.enabled) {
    await writeFile(
      path.join(directory, "backend/teams.json"),
      backendTeamsJson(specification),
      "utf8",
    );
  }
  await writeFile(
    path.join(directory, "product-spec.json"),
    JSON.stringify(specification.document, null, 2),
    "utf8",
  );
  return directory;
}

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, root)));
    } else {
      files.push(path.relative(root, absolutePath));
    }
  }
  return files.sort();
}

function qoderPrompt(specification: ProductSpecArtifact): string {
  const backendInstructions = specification.document.backend.enabled
    ? [
        "A deterministic FastAPI service already exists under backend/.",
        "Do not edit backend files. Use GET /api/teams to load teams and vote totals.",
        "Use POST /api/teams/{team_id}/vote to submit a vote, then refresh the UI.",
        "Use the installed qrcode package to generate a real scannable QR code for",
        "each team. Build the target from new URL(window.location.href), set its",
        "team query parameter, and preserve all existing signed-preview parameters.",
        "When the team query parameter is present, show a focused voting view for",
        "that team with a clear submit button. Do not replace the API with local state.",
      ]
    : [
        "Do not use external APIs, authentication, or a backend.",
        "All visible features should use local mock data.",
      ];
  return [
    "Implement a polished, responsive React mini-app for the ProductSpec in",
    "product-spec.json. The repository already contains a compiling Vite baseline.",
    "Edit only index.html and files under src/. Do not change package.json,",
    "tsconfig.json, or product-spec.json. Do not use Bash, network access,",
    "remote images, external services, or authentication.",
    ...backendInstructions,
    "All visible interactions should work.",
    "Make the visual design specific to the ProductSpec, not a generic dashboard.",
    "Keep TypeScript strict and finish with a compilable project.",
    "",
    `Acceptance criteria: ${JSON.stringify(
      specification.document.acceptanceCriteria,
    )}`,
  ].join("\n");
}

export class QoderCodeAgent implements CodeAgentProvider {
  private readonly accessToken: string;
  private readonly maxTurns: number;

  constructor(options: QoderCodeAgentOptions) {
    if (!options.accessToken.trim()) {
      throw new Error("QODER_PERSONAL_ACCESS_TOKEN is required for Qoder");
    }
    this.accessToken = options.accessToken;
    this.maxTurns = options.maxTurns ?? 18;
  }

  async build(
    _sandbox: SandboxHandle,
    specification: ProductSpecArtifact,
  ): Promise<BuildArtifact> {
    const localPath = await createSeedProject(specification);
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 6 * 60_000);
    const messages = query({
      prompt: qoderPrompt(specification),
      options: {
        auth: accessTokenFromEnv(),
        abortController,
        cwd: localPath,
        tools: ["Read", "Edit", "Write", "Glob", "Grep"],
        allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"],
        disallowedTools: ["Bash", "WebFetch", "WebSearch"],
        permissionMode: "acceptEdits",
        maxTurns: this.maxTurns,
        settingSources: [],
        skills: [],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          QODER_PERSONAL_ACCESS_TOKEN: this.accessToken,
        },
      },
    });

    let success = false;
    try {
      for await (const message of messages) {
        if (message.type === "result") {
          if (message.subtype !== "success") {
            throw new Error(
              message.errors?.join("; ") ??
                `Qoder ended with ${message.subtype}`,
            );
          }
          success = true;
        }
      }
    } finally {
      clearTimeout(timer);
      await messages.close?.();
    }
    if (!success) {
      throw new Error("Qoder ended without a successful result");
    }

    const protectedFiles = specification.document.backend.enabled
      ? {
          "package.json": TEMPLATE_FILES["package.json"],
          "backend/main.py": BACKEND_FILES["backend/main.py"],
          "backend/requirements.txt":
            BACKEND_FILES["backend/requirements.txt"],
          "backend/smoke_test.py": BACKEND_FILES["backend/smoke_test.py"],
          "backend/teams.json": backendTeamsJson(specification),
        }
      : { "package.json": TEMPLATE_FILES["package.json"] };
    for (const [relativePath, expected] of Object.entries(protectedFiles)) {
      const actual = await readFile(path.join(localPath, relativePath), "utf8");
      if (actual !== expected) {
        throw new Error(`Qoder modified protected ${relativePath}`);
      }
    }

    return {
      commit: null,
      changedFiles: await listFiles(localPath),
      localPath,
    };
  }

  async repair(
    sandbox: SandboxHandle,
    specification: ProductSpecArtifact,
    _report: EvaluationReport,
  ): Promise<BuildArtifact> {
    return this.build(sandbox, specification);
  }
}
