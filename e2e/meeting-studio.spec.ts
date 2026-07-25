import { expect, test } from "@playwright/test";

test("turns a live transcript into a Daytona preview", async ({ page }) => {
  await page.route("**/api/attendee/bots", (route) => route.fulfill({
    status: 201, contentType: "application/json",
    body: JSON.stringify({ sessionId: "session-1", botId: "bot-1", state: "joining" }),
  }));

  await page.route("**/api/attendee/sessions/session-1", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      session: { botState: "joined_recording", errorMessage: null },
      transcript: "Maya: Build a launch dashboard for Friday.", terminal: false,
    }),
  }));

  await page.route("**/api/builds", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().postDataJSON()).toEqual({ sessionId: "session-1" });
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      build: { id: "build-1", status: "BUILDING", stage: "Qoder is implementing the mini-app", percent: 45, previewUrl: null, previewExpiresAt: null, error: null },
    }) });
  });

  await page.route("**/api/builds/build-1", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      build: { id: "build-1", status: "PREVIEW_READY", stage: "Preview ready", percent: 100, previewUrl: "https://preview.example.com/app", previewExpiresAt: "2026-07-26T00:00:00.000Z", error: null },
    }),
  }));

  await page.goto("/");
  await page.getByPlaceholder("Google Meet URL").fill("https://meet.google.com/abc-defg-hij");
  await page.getByRole("button", { name: "Join with Waki" }).click();
  await expect(page.getByLabel("Live transcript")).toContainText("launch dashboard", { timeout: 5_000 });
  await page.getByRole("button", { name: "Build this app" }).click();
  await expect(page.getByText("Qoder is implementing the mini-app")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open app" })).toHaveAttribute("href", "https://preview.example.com/app", { timeout: 5_000 });
  await expect(page.getByText(/Preview expires/)).toBeVisible();
});
