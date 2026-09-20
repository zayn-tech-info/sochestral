import { expect, test } from "@playwright/test";

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`reviews a saved plan at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let currentVersion = 1;
    const comments: Array<Record<string, unknown>> = [];
    const approvals: Array<Record<string, unknown>> = [];
    const sections = ["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"].map(type => ({
      id: `s_${type}`, type, title: type.replaceAll("_", " "), blocks: type === "calendar" ? [{
        id: "calendar", kind: "calendar", items: [{ id: "item_1", angle: "Show the new workshop kit", audience: "Independent workshop owners", format: "image", destinations: ["threads"], proposedTime: "Next week, after review", assetNeeds: ["Approved product photo"] }],
      }] : [{ id: `b_${type}`, kind: "paragraph", text: type === "goal" ? "Reach workshop owners" : `Review the ${type.replaceAll("_", " ")} for this launch.` }],
    }));
    await page.route("http://127.0.0.1:8789/**", async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let response: unknown = {};
      if (path === "/auth/me") response = { id: "browser_user", email: "browser@example.test" };
      else if (path === "/profile") response = { setupStatus: "complete", businessName: "Workshop Co" };
      else if (path === "/orchestration/conversations") response = { conversations: [], nextCursor: null };
      else if (path === "/plans/plan_1/comments") {
        expect(route.request().headers()["x-sochestral-request"]).toBe("plan-action");
        comments.push({ id: "comment_1", ...route.request().postDataJSON(), status: "pending", batchId: null });
        response = comments[0];
      } else if (path === "/plans/plan_1/comments/comment_1/reattach") {
        expect(route.request().postDataJSON()).toEqual({ version: 2, blockId: "b_direction" });
        comments[0]!.status = "reattached";
        const reattached = { ...comments[0], ...route.request().postDataJSON(), id: "comment_2", quote: null, status: "pending", reattachedFromId: "comment_1" };
        comments.push(reattached); response = reattached;
      } else if (path === "/plans/plan_1/approve") {
        expect(route.request().postDataJSON()).toEqual({ version: 1, confirm: true });
        approvals.push({ scope: "plan_direction", revision: 1 }); response = approvals[0];
      } else if (path === "/plans/plan_1") response = {
        plan: { id: "plan_1", title: "Workshop launch", currentVersion }, version: { version: Number(url.searchParams.get("version") ?? currentVersion), document: { schemaVersion: 1, sections } }, comments, approvals,
      };
      await route.fulfill({ json: response });
    });
    await page.goto("/app/plans/plan_1");
    await expect(page.getByRole("heading", { name: "Workshop launch", exact: true })).toBeVisible();
    const text = page.getByText("Reach workshop owners", { exact: true });
    await text.click({ clickCount: 3 });
    await page.getByRole("button", { name: "Comment on Reach workshop owners" }).click();
    await page.getByLabel("Your comment").fill("Focus on independent shops");
    await page.getByRole("button", { name: "Save comment", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Comment saved");
    expect(comments[0]).toMatchObject({ version: 1, blockId: "b_goal", quote: "Reach workshop owners", body: "Focus on independent shops" });
    await page.getByRole("button", { name: "Approve plan direction" }).click();
    await expect(page.getByText("Version 1 · Direction approved")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    currentVersion = 2;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("Version 2 · Needs review")).toBeVisible();
    await page.getByRole("button", { name: "Previous version" }).click();
    await expect(page.getByText("Version 1 · Earlier version · Read only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve plan direction" })).toBeDisabled();
    await expect(page.getByLabel("Your comment")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to latest" }).click();
    await expect(page.getByLabel("Your comment")).toBeVisible();
    expect(approvals).toHaveLength(1);
    expect(comments).toHaveLength(1);
    comments[0]!.status = "needs_reattachment";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("button", { name: "Reattach comment: Focus on independent shops" }).click();
    await expect(page.getByRole("button", { name: "Save new location" })).toBeDisabled();
    await page.getByRole("button", { name: "Comment on Review the direction for this launch." }).click();
    await page.getByRole("button", { name: "Save new location" }).click();
    await expect(page.getByText("Reattached from an earlier comment", { exact: true })).toBeVisible();
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ version: 1, blockId: "b_goal", quote: "Reach workshop owners", status: "reattached" });
    expect(comments[1]).toMatchObject({ version: 2, blockId: "b_direction", body: "Focus on independent shops" });
    await page.screenshot({ path: `test-results/plan-${width}.png`, fullPage: true });
  });
}
