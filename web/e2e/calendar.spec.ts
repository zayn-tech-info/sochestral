import { expect, test } from "@playwright/test";

// Browser acceptance of real UI behavior with a local API fixture. No provider calls.
test("moves a calendar post and retains its caption", async ({ page }) => {
  const now = new Date("2030-01-07T09:00:00.000Z");
  await page.clock.setFixedTime(now);
  now.setUTCHours(12, 0, 0, 0);
  let slot = { scheduleId: "browser_schedule", platform: "threads", accountId: "browser_account",
    accountLabel: "Browser Brand", scheduledAt: now.toISOString(), statusBucket: "Scheduled",
    captionPreview: "Approved browser caption", thumbUrl: null, canReschedule: true,
    caption: "Approved browser caption", media: [], conversationId: null, draftId: null,
    canCancel: true, canEditContent: true };
  const moves: string[] = [];
  await page.route("http://127.0.0.1:8789/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let response: unknown = {};
    if (path === "/auth/me") response = { id: "browser_user", email: "browser@example.test" };
    else if (path === "/profile") response = { setupStatus: "complete", businessName: "Browser Brand" };
    else if (path === "/orchestration/conversations") response = { conversations: [], nextCursor: null };
    else if (path === "/calendar/accounts") response = { accounts: [{ id: "browser_account", platform: "threads", label: "Browser Brand", username: "browser_brand", avatarHint: null }] };
    else if (path === "/calendar/slots") response = { slots: [slot], timeZone: "UTC" };
    else if (path === "/calendar/slots/browser_schedule" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { scheduledAt: string };
      moves.push(body.scheduledAt);
      slot = { ...slot, scheduledAt: body.scheduledAt };
      response = slot;
    } else if (path === "/calendar/slots/browser_schedule") response = slot;
    await route.fulfill({ json: response, headers: { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-credentials": "true" } });
  });
  await page.goto("/app/calendar");
  const caption = page.getByText("Approved browser caption", { exact: true });
  await expect(caption).toBeVisible();
  await expect(page.locator(".cal-day")).toHaveCount(7);
  const card = page.locator(".cal-slot");
  await card.scrollIntoViewIfNeeded();
  const target = page.locator(".cal-day-canvas").last();
  await target.scrollIntoViewIfNeeded();
  await card.dragTo(target, { targetPosition: { x: 50, y: 56 * 12 + 20 } });
  await expect.poll(() => moves.length).toBe(1);
  expect(moves[0]?.slice(0, 10)).toBe("2030-01-13");
  await expect(caption).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/calendar-desktop.png", fullPage: true });
});
