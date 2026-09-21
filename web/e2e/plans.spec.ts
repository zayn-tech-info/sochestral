import { expect, test } from "@playwright/test";

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`reviews a post board at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const comments: Array<Record<string, unknown>> = [];
    const sections = ["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"].map(type => ({
      id: `s_${type}`, type, title: type.replaceAll("_", " "), blocks: type === "calendar" ? [{
        id: "calendar", kind: "calendar", items: [{ id: "item_1", angle: "Show the new workshop kit", audience: "Independent workshop owners", format: "text", destinations: ["threads"], proposedTime: "2031-01-02T09:00", assetNeeds: [] }],
      }] : [{ id: `b_${type}`, kind: "paragraph", text: type === "goal" ? "Reach workshop owners" : `Review the ${type.replaceAll("_", " ")} for this launch.` }],
    }));
    await page.route("http://127.0.0.1:8789/**", async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let response: unknown = {};
      if (path === "/auth/me") response = { id: "browser_user", email: "browser@example.test" };
      else if (path === "/profile") response = { setupStatus: "complete", businessName: "Workshop Co", timezone: "UTC", timezoneConfirmedAt: "2030-01-01T00:00:00Z" };
      else if (path === "/orchestration/conversations") response = { conversations: [], nextCursor: null };
      else if (path === "/connectors") response = { connectors: [{ platform: "threads", state: "connected", accounts: [{ id: "acct_1", username: "shop", displayName: "Shop", state: "connected" }] }] };
      else if (path === "/plans/plan_1/comments") {
        expect(route.request().headers()["x-sochestral-request"]).toBe("plan-action");
        comments.push({ id: "comment_1", ...route.request().postDataJSON(), status: "pending", batchId: null });
        response = comments[0];
      } else if (path === "/plans/plan_1/comment-batches") {
        comments[0]!.status = "submitted";
        response = { id: "batch_1", version: 1, kind: "content", status: "submitted" };
      } else if (path === "/plans/plan_1") response = {
        plan: { id: "plan_1", title: "Workshop launch", currentVersion: 1 },
        version: { version: 1, document: { schemaVersion: 1, sections } },
        comments, approvals: [], board: { timezone: "UTC", timezoneConfirmed: true },
        contentJob: { id: "job_1", planVersion: 1, status: "applied", errorCode: null },
        contentItems: [{ id: "citem_1", calendarItemId: "item_1", status: "ready", excludedAt: null, revision: { revision: 1, caption: "A shop-floor caption for builders.", destinations: ["threads"], format: "text", assetNeeds: [], blockReason: null } }],
      };
      await route.fulfill({ json: response });
    });
    await page.goto("/app/plans/plan_1");
    await expect(page.getByRole("heading", { name: "Workshop launch", exact: true })).toBeVisible();
    await expect(page.getByText("A shop-floor caption for builders.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve plan direction" })).toHaveCount(0);
    await page.getByLabel("General comment").fill("Focus on independent shops");
    await page.getByRole("button", { name: "Save comment", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Comment saved");
    expect(comments[0]).toMatchObject({ version: 1, blockId: "board", body: "Focus on independent shops", scope: "board" });
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByText("Comments sent for review.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/plan-${width}.png`, fullPage: true });
  });
}
