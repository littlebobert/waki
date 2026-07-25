import { expect, test } from "@playwright/test";

test("joins a meeting, receives transcript updates, and generates", async ({ page }) => {
  let sessionReads = 0;

  await page.route("**/api/attendee/bots", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ sessionId: "session-1", botId: "bot-1", state: "joining" }),
    });
  });

  await page.route("**/api/attendee/sessions/session-1", async (route) => {
    sessionReads += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: { botState: sessionReads > 1 ? "ended" : "joined_recording", errorMessage: null },
        transcript: "Maya: We should ship the beta Friday.\n\nKenji: I will finish onboarding tomorrow.",
        terminal: sessionReads > 1,
      }),
    });
  });

  await page.route("**/api/generate", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.transcript).toContain("finish onboarding");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "live",
        artifact: {
          title: "Friday beta plan",
          subtitle: "Generated from the live meeting",
          summary: "The team aligned on a Friday beta launch.",
          progress: 60,
          metrics: [
            { label: "Launch", value: "Friday", detail: "target" },
            { label: "Owners", value: "2", detail: "assigned" },
            { label: "Blockers", value: "1", detail: "onboarding" },
          ],
          actions: [{ id: "a1", title: "Finish onboarding", owner: "Kenji", due: "Tomorrow", done: false }],
          decisions: [{ title: "Ship Friday", detail: "The team agreed to the beta date." }],
          risks: ["Onboarding is unfinished"],
          proposals: [{ title: "Friday beta", status: "accepted" }],
          constraints: ["Onboarding must be complete"],
          acceptanceCriteria: [{ id: "ac1", criterion: "Production build passes", verification: "build" }],
          relevantFrameIds: [],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Bring Waki into the meeting").fill("https://meet.google.com/abc-defg-hij");
  await page.getByRole("button", { name: "Join with Waki" }).click();

  await expect(page.getByLabel("Live transcript")).toContainText("finish onboarding", { timeout: 5_000 });
  await page.getByRole("button", { name: "Build from conversation" }).click();
  await expect(page.getByRole("heading", { name: "Friday beta plan" })).toBeVisible();
});
