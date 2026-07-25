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
        vite: "latest",
        typescript: "latest",
        react: "latest",
        "react-dom": "latest",
      },
      devDependencies: {
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

async function writeTemplate(
  specification: ProductSpecArtifact,
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "waki-build-"));
  for (const [relativePath, contents] of Object.entries(TEMPLATE_FILES)) {
    const filePath = path.join(directory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
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
  return [
    "Implement a polished, responsive React mini-app for the ProductSpec in",
    "product-spec.json. The repository already contains a compiling Vite baseline.",
    "Edit only index.html and files under src/. Do not change package.json,",
    "tsconfig.json, or product-spec.json. Do not use Bash, network access,",
    "remote images, external APIs, authentication, or a backend.",
    "All visible features should use local mock data and interactions should work.",
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
    const localPath = await writeTemplate(specification);
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

    const packageJson = await readFile(
      path.join(localPath, "package.json"),
      "utf8",
    );
    if (packageJson !== TEMPLATE_FILES["package.json"]) {
      throw new Error("Qoder modified protected package.json");
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
