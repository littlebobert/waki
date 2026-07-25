import { describe, expect, it } from "vitest";
import { findWorkspaceRoot, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("does not require bot credentials in hackathon mode", () => {
    const config = loadConfig(
      {
        BOT_AUTH_ENABLED: "false",
      },
      "/tmp/waki-config-test",
    );

    expect(config.botApiToken).toBeNull();
    expect(config.webhookSigningSecret).toBeNull();
  });

  it("requires a token when bot authentication is enabled", () => {
    expect(() =>
      loadConfig(
        {
          BOT_AUTH_ENABLED: "true",
        },
        "/tmp/waki-config-test",
      ),
    ).toThrow("BOT_API_TOKEN is required");
  });
});

describe("findWorkspaceRoot", () => {
  it("finds the same root from a workspace package", () => {
    const root = findWorkspaceRoot();
    expect(findWorkspaceRoot(`${root}/apps/api`)).toBe(root);
  });
});
