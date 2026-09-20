import { expect, test, type Page, type Route } from "@playwright/test";

const API = "http://127.0.0.1:8789";
const PLAN_ID = "plan_interview_1";
const CONV_ID = "conv_plan_1";
const NOW = "2026-09-20T12:00:00.000Z";
const PAUSE_COPY = "Planning paused. Your earlier answers are saved. Say continue planning when you want to pick this up again.";
const CONNECTED_COPY = "Threads and LinkedIn Personal are the connected destinations I can check.";
const DIRECTION_QUESTION = "What voice should this take?";
const publishingPreference = {
  currentMode: "always_draft",
  effectiveMode: "always_draft",
  revision: 0,
  consentVersion: null,
  consentedAt: null,
  consentCurrent: false,
  policyVersion: "2026-08-01",
  enabled: false,
  authorityEventId: null,
};

function cors() {
  return {
    "access-control-allow-origin": "http://127.0.0.1:3100",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,x-sochestral-request",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

function json(route: Route, body: unknown) {
  return route.fulfill({ json: body, headers: cors() });
}

function ndjson(route: Route, events: unknown[]) {
  return route.fulfill({
    status: 200,
    headers: { ...cors(), "content-type": "application/x-ndjson; charset=utf-8" },
    body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  });
}

const sections = ["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"].map((type) => ({
  id: `s_${type}`,
  type,
  title: type.replaceAll("_", " "),
  blocks: type === "calendar"
    ? [{
      id: "calendar",
      kind: "calendar",
      items: [{
        id: "item_1",
        angle: "Show the new workshop kit",
        audience: "Independent workshop owners",
        format: "image",
        destinations: ["threads"],
        proposedTime: "Next week, after review",
        assetNeeds: ["Approved product photo"],
      }],
    }]
    : [{
      id: `b_${type}`,
      kind: "paragraph",
      text: type === "goal" ? "Reach workshop owners" : `Review the ${type.replaceAll("_", " ")} for this launch.`,
    }],
}));

async function mockInterviewApi(page: Page) {
  const conversation = { id: CONV_ID, title: "Workshop plan", createdAt: NOW, updatedAt: NOW };
  const messages: Array<{ id: string; role: "user" | "assistant"; content: string; sequence: number; createdAt: string }> = [];
  const comments: Array<Record<string, unknown>> = [];
  const approvals: Array<Record<string, unknown>> = [];
  let sequence = 0;

  function turn(userText: string, assistantText: string) {
    sequence += 1;
    const userMessage = { id: `msg_u_${sequence}`, role: "user" as const, content: userText, sequence, createdAt: NOW };
    sequence += 1;
    const assistantMessage = { id: `msg_a_${sequence}`, role: "assistant" as const, content: assistantText, sequence, createdAt: NOW };
    messages.push(userMessage, assistantMessage);
    return {
      conversation,
      userMessage,
      assistantMessage,
      run: { id: `run_${sequence}`, status: "completed", safeError: null },
      toolSummaries: [],
      reviewGroups: [],
      turnActivity: null,
    };
  }

  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors() });
      return;
    }
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path === "/auth/me") return json(route, { id: "browser_user", email: "browser@example.test" });
    if (path === "/profile") return json(route, { setupStatus: "complete", businessName: "Workshop Co" });
    if (path === "/connectors") return json(route, { connectors: [] });
    if (path === "/publishing/preferences") return json(route, publishingPreference);
    if (path === "/orchestration/conversations" && method === "GET") {
      return json(route, { conversations: messages.length ? [conversation] : [], nextCursor: null });
    }
    if (path.startsWith(`/orchestration/conversations/${CONV_ID}`) && method === "GET") {
      return json(route, {
        conversation, messages, runs: [], toolSummaries: [], reviewGroups: [], turnActivities: [], nextCursor: null,
      });
    }
    if (path === "/orchestration/conversations/stream" && method === "POST") {
      const body = route.request().postDataJSON() as { message: string };
      const result = turn(body.message, "What should this campaign achieve?");
      return ndjson(route, [
        { type: "turn_started", sequence: 1 },
        { type: "step_started", sequence: 2, step: "clarifying_intent" },
        { type: "step_completed", sequence: 3, step: "clarifying_intent" },
        { type: "turn_completed", sequence: 4, result },
      ]);
    }
    if (path === `/orchestration/conversations/${CONV_ID}/messages/stream` && method === "POST") {
      const body = route.request().postDataJSON() as { message: string };
      const text = body.message.trim().toLowerCase();
      let assistant = `Your plan is ready: [Review plan](/app/plans/${PLAN_ID}). You can comment on the document and approve its direction.`;
      let step: "clarifying_intent" | "planning" = "planning";
      if (text === "pause planning") {
        assistant = PAUSE_COPY;
        step = "clarifying_intent";
      } else if (text === "which social accounts are connected?") {
        assistant = CONNECTED_COPY;
        step = "clarifying_intent";
      } else if (text === "continue planning") {
        assistant = DIRECTION_QUESTION;
        step = "clarifying_intent";
      }
      const result = turn(body.message, assistant);
      return ndjson(route, [
        { type: "turn_started", sequence: 1 },
        { type: "step_started", sequence: 2, step },
        { type: "step_completed", sequence: 3, step },
        { type: "turn_completed", sequence: 4, result },
      ]);
    }
    if (path === `/plans/${PLAN_ID}/comments` && method === "POST") {
      comments.push({ id: "comment_1", ...route.request().postDataJSON(), status: "pending", batchId: null });
      return json(route, comments[0]);
    }
    if (path === `/plans/${PLAN_ID}/comment-batches` && method === "POST") {
      comments[0]!.status = "submitted";
      comments[0]!.batchId = "batch_1";
      return json(route, { id: "batch_1", version: 1, status: "submitted", errorCode: null });
    }
    if (path === `/plans/${PLAN_ID}/approve` && method === "POST") {
      approvals.push({ scope: "plan_direction", revision: 1 });
      return json(route, approvals[0]);
    }
    if (path === `/plans/${PLAN_ID}`) {
      return json(route, {
        plan: { id: PLAN_ID, title: "Workshop launch", currentVersion: 1, updatedAt: NOW },
        version: { version: 1, document: { schemaVersion: 1, sections } },
        comments,
        approvals,
        batches: comments[0]?.batchId ? [{ id: "batch_1", version: 1, status: "submitted", errorCode: null }] : [],
      });
    }
    return json(route, {});
  });
  return { comments, approvals };
}

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`opens an interview plan from chat at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { comments, approvals } = await mockInterviewApi(page);
    await page.goto("/app/workspace");
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await page.getByLabel("Message Sochestral").fill("Plan the next 2 weeks");
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("What should this campaign achieve?")).toBeVisible();
    await page.getByLabel("Message Sochestral").fill("Sell workshop tools with practical shop-floor tips");
    await page.getByRole("button", { name: "Send message" }).click();
    const reviewLink = page.getByRole("link", { name: "Review plan" });
    await expect(reviewLink).toBeVisible();
    await expect(reviewLink).toHaveAttribute("href", `/app/plans/${PLAN_ID}`);
    await page.reload();
    await expect(page.getByRole("link", { name: "Review plan" })).toBeVisible();
    await page.getByRole("link", { name: "Review plan" }).click();
    await expect(page).toHaveURL(`/app/plans/${PLAN_ID}`);
    await expect(page.getByRole("heading", { name: "Workshop launch", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Comment on Reach workshop owners" }).click();
    await page.getByLabel("Your comment").fill("Focus on independent shops");
    await page.getByRole("button", { name: "Save comment", exact: true }).click();
    await expect(page.getByText("Comment saved.")).toBeVisible();
    await page.getByRole("button", { name: "Review comments (1)" }).click();
    await expect(page.getByText("Comments submitted for revision.")).toBeVisible();
    await page.getByRole("button", { name: "Approve plan direction" }).click();
    await expect(page.getByText("Version 1 · Direction approved")).toBeVisible();
    expect(comments[0]).toMatchObject({ version: 1, blockId: "b_goal", body: "Focus on independent shops", status: "submitted" });
    expect(approvals).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/chat-plan-${width}.png`, fullPage: true });
  });
}

test("pauses an interview, keeps unrelated chat off the plan, then resumes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockInterviewApi(page);
  await page.goto("/app/workspace");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await page.getByLabel("Message Sochestral").fill("Plan the next 2 weeks");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("What should this campaign achieve?")).toBeVisible();
  await page.getByLabel("Message Sochestral").fill("pause planning");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(PAUSE_COPY)).toBeVisible();
  await expect(page.getByRole("link", { name: "Review plan" })).toHaveCount(0);
  await page.getByLabel("Message Sochestral").fill("Which social accounts are connected?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(CONNECTED_COPY)).toBeVisible();
  await expect(page.getByRole("link", { name: "Review plan" })).toHaveCount(0);
  await page.getByLabel("Message Sochestral").fill("continue planning");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(DIRECTION_QUESTION)).toBeVisible();
  await expect(page.getByRole("link", { name: "Review plan" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/chat-plan-pause-resume.png", fullPage: true });
});
