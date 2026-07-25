import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProductSpecArtifact } from "@waki/core";
import { createSeedProject } from "./qoder.js";

const backendSpecification: ProductSpecArtifact = {
  version: 1,
  document: {
    schemaVersion: "1.0",
    project: {
      name: "Hackathon Team Voting",
      summary: "A one-page team voting app.",
      primaryUser: "Hackathon attendee",
      primaryGoal: "Vote for a team",
    },
    pages: [
      {
        route: "/",
        name: "Teams",
        purpose: "Show teams, QR codes, and vote totals.",
        sections: ["Team cards", "Voting view"],
        interactions: ["Scan a QR code", "Submit a vote"],
      },
    ],
    design: {
      visualDirection: "Bright and event-friendly.",
      primaryColor: "#2563EB",
      accentColor: "#F59E0B",
      backgroundColor: "#F8FAFC",
      fontFamily: "Inter, system-ui, sans-serif",
    },
    backend: {
      enabled: true,
      framework: "fastapi",
      storage: "memory",
      endpoints: [
        {
          method: "GET",
          path: "/api/teams",
          purpose: "List teams and votes.",
        },
        {
          method: "POST",
          path: "/api/teams/{team_id}/vote",
          purpose: "Submit a vote.",
        },
      ],
    },
    mockData: [
      {
        name: "teams",
        description: "Teams read from the reference image.",
        sampleRecords: [
          { id: "aurora", name: "Aurora Labs" },
          { name: "Pixel Pioneers" },
        ],
      },
    ],
    acceptanceCriteria: [
      {
        id: "AC-1",
        requirement: "A user can vote for a team.",
        evidence: "The API increments and returns the team's vote total.",
      },
    ],
    assumptions: ["Votes reset when the sandbox restarts."],
    conflicts: [],
    openQuestions: [],
  },
};

describe("createSeedProject", () => {
  it("creates a protected FastAPI voting service and team data", async () => {
    const directory = await createSeedProject(backendSpecification);
    try {
      const teams = JSON.parse(
        await readFile(path.join(directory, "backend/teams.json"), "utf8"),
      ) as unknown;
      const packageJson = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      const backendPath = path.join(directory, "backend/main.py");

      expect(teams).toEqual([
        { id: "aurora", name: "Aurora Labs" },
        { id: "pixel-pioneers", name: "Pixel Pioneers" },
      ]);
      expect(packageJson.dependencies.qrcode).toBe("latest");
      expect(await readFile(backendPath, "utf8")).toContain(
        '@app.post("/api/teams/{team_id}/vote")',
      );

      const compile = spawnSync("python3", ["-m", "py_compile", backendPath], {
        encoding: "utf8",
      });
      expect(compile.status, compile.stderr).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
