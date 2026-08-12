import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createDb,
  createProfileEntry,
  getCompiledProfile,
  listProfileEntries,
  patchBusinessProfile,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import {
  applyCompetitorAnswers,
  buildCompetitorQuestions,
  buildProfileUpdateConfirmQuestions,
  createDeepSeekResearchClient,
  executeSetupTool,
  isSetupGateActive,
  resolveCompetitorCustomSelection,
  SETUP_SYSTEM_MESSAGE,
} from "./setup-agent.js";

function proposedEntry(
  id: string,
  title: string,
  body: string,
): Parameters<typeof buildCompetitorQuestions>[0][number] {
  return {
    id,
    userId: "user_1",
    category: "competitor",
    title,
    body,
    status: "proposed",
    source: "research",
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("setup agent helpers", () => {
  it("uses a conversational intro prompt without gate banner language", () => {
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/introduce what you can help with/i);
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/bold markdown question/i);
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/personalized/i);
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/Never mention research/i);
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/Re-asking after a skip/i);
    expect(SETUP_SYSTEM_MESSAGE).toMatch(/restore enough context/i);
    expect(SETUP_SYSTEM_MESSAGE).not.toMatch(
      /Finish business setup in this chat/i,
    );
    expect(SETUP_SYSTEM_MESSAGE.toLowerCase()).not.toContain("force the user");
  });

  it("treats the gate as active until setup is complete (AC-2)", () => {
    expect(isSetupGateActive(true, "not_started")).toBe(true);
    expect(isSetupGateActive(true, "in_progress")).toBe(true);
    expect(isSetupGateActive(true, "complete")).toBe(false);
    expect(isSetupGateActive(false, "not_started")).toBe(false);
  });

  it("builds competitor Q&A options with all, custom, and skip (AC-4)", () => {
    const one = buildCompetitorQuestions([
      proposedEntry("pentry_a", "Rival", "Same market"),
    ]);
    expect(one[0]?.options.map((option) => option.id)).toEqual([
      "pentry_a",
      "custom",
      "skip",
    ]);

    const many = buildCompetitorQuestions([
      proposedEntry("pentry_a", "Rival A", "Market A"),
      proposedEntry("pentry_b", "Rival B", "Market B"),
      proposedEntry("pentry_c", "Rival C", "Market C"),
    ]);
    expect(many[0]?.options.map((option) => option.id)).toEqual([
      "pentry_a",
      "pentry_b",
      "pentry_c",
      "all",
      "custom",
      "skip",
    ]);
  });

  it("resolves custom competitor text against offered options", () => {
    const proposed = [
      proposedEntry("pentry_a", "Woodcraft", "Hardware chain"),
      proposedEntry("pentry_b", "ToolTown", "Online tools"),
    ];
    expect(resolveCompetitorCustomSelection("All of them", proposed)).toEqual({
      kind: "ids",
      ids: ["pentry_a", "pentry_b"],
    });
    expect(resolveCompetitorCustomSelection("option 1", proposed)).toEqual({
      kind: "ids",
      ids: ["pentry_a"],
    });
    expect(resolveCompetitorCustomSelection("the second", proposed)).toEqual({
      kind: "ids",
      ids: ["pentry_b"],
    });
    expect(resolveCompetitorCustomSelection("Woodcraft", proposed)).toEqual({
      kind: "ids",
      ids: ["pentry_a"],
    });
    expect(resolveCompetitorCustomSelection("Rival Co Inc", proposed)).toEqual({
      kind: "literal",
      text: "Rival Co Inc",
    });
  });

  it("builds profile update confirm questions (AC-7)", () => {
    const questions = buildProfileUpdateConfirmQuestions(
      "We now sell software only",
    );
    expect(questions[0]?.id).toBe("profile_update");
    expect(questions[0]?.options.some((option) => option.id === "yes")).toBe(
      true,
    );
  });

  it("returns null research client when DeepSeek key is missing (AC-4)", () => {
    expect(
      createDeepSeekResearchClient({
        apiKey: null,
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      }),
    ).toBeNull();
  });
});

describe("setup agent trusted tools", () => {
  let database: Database;
  let userId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from users`);
    userId = (await provisionUser(database.db, "setup-tools@example.com")).id;
  });

  it("fails open on research without a key and completes after skip plus tone (AC-4, AC-9)", async () => {
    await executeSetupTool(
      database.db,
      userId,
      "update_business_identity",
      {
        businessName: "Harbor Tools",
        businessDescription: Array.from({ length: 32 }, (_, i) => `word${i}`).join(
          " ",
        ),
      },
      null,
    );
    await patchBusinessProfile(database.db, userId, {
      personaRole: "business_owner",
      primaryPlatforms: ["threads"],
      attributionSource: "friend",
      skills: ["Content writing"],
    });
    const research = await executeSetupTool(
      database.db,
      userId,
      "research_competitors",
      {},
      null,
    );
    expect(research.ok).toBe(false);
    expect(research.summary).toMatch(/ask who their main competitors/i);
    expect(research.summary.toLowerCase()).not.toContain("unavailable");
    expect(research.summary.toLowerCase()).not.toContain("failed");

    await executeSetupTool(database.db, userId, "skip_competitors", {}, null);
    await executeSetupTool(
      database.db,
      userId,
      "save_tone_rule",
      { body: "Warm and short" },
      null,
    );
    const done = await executeSetupTool(
      database.db,
      userId,
      "complete_setup_if_ready",
      {},
      null,
    );
    expect(done.ok).toBe(true);
    expect(done.profileComplete).toBe(true);
    const profile = await getCompiledProfile(database.db, userId);
    expect(profile.profile.setupStatus).toBe("complete");
    expect(profile.profile.competitorsSkipped).toBe(true);
  });

  it("applies competitor skip answers (AC-4)", async () => {
    await executeSetupTool(
      database.db,
      userId,
      "update_business_identity",
      {
        businessName: "Skip Co",
        businessDescription: "Tools",
      },
      null,
    );
    const applied = await applyCompetitorAnswers(database.db, userId, [
      { questionId: "competitors", optionId: "skip" },
    ]);
    expect(applied.questionsHandled).toBe(true);
    const profile = await getCompiledProfile(database.db, userId);
    expect(profile.profile.competitorsSkipped).toBe(true);
  });

  it("confirms all proposed competitors from all and custom All of them", async () => {
    await executeSetupTool(
      database.db,
      userId,
      "update_business_identity",
      {
        businessName: "Confirm Co",
        businessDescription: "Tools",
      },
      null,
    );
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "Woodcraft",
      body: "Hardware chain",
      status: "proposed",
      source: "research",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "ToolTown",
      body: "Online tools",
      status: "proposed",
      source: "research",
    });

    const allApplied = await applyCompetitorAnswers(database.db, userId, [
      { questionId: "competitors", optionId: "all" },
    ]);
    expect(allApplied.assistantHint).toMatch(/all suggested competitors/i);
    let active = await listProfileEntries(database.db, {
      userId,
      category: "competitor",
      status: "active",
    });
    expect(active.items).toHaveLength(2);

    await database.db.execute(sql`delete from profile_entries`);
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "Woodcraft",
      body: "Hardware chain",
      status: "proposed",
      source: "research",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "ToolTown",
      body: "Online tools",
      status: "proposed",
      source: "research",
    });

    const customAll = await applyCompetitorAnswers(database.db, userId, [
      {
        questionId: "competitors",
        optionId: "custom",
        customText: "All of them",
      },
    ]);
    expect(customAll.assistantHint).toMatch(/suggested competitors confirmed/i);
    active = await listProfileEntries(database.db, {
      userId,
      category: "competitor",
      status: "active",
    });
    expect(active.items).toHaveLength(2);
    expect(active.items.some((entry) => entry.title === "All of them")).toBe(
      false,
    );
    expect(active.items.map((entry) => entry.title).sort()).toEqual([
      "ToolTown",
      "Woodcraft",
    ]);
  });

  it("saves literal custom competitors and resolves option 1", async () => {
    await executeSetupTool(
      database.db,
      userId,
      "update_business_identity",
      {
        businessName: "Literal Co",
        businessDescription: "Tools",
      },
      null,
    );
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "Woodcraft",
      body: "Hardware chain",
      status: "proposed",
      source: "research",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "competitor",
      title: "ToolTown",
      body: "Online tools",
      status: "proposed",
      source: "research",
    });

    const optionOne = await applyCompetitorAnswers(database.db, userId, [
      {
        questionId: "competitors",
        optionId: "custom",
        customText: "option 1",
      },
    ]);
    expect(optionOne.questionsHandled).toBe(true);
    let active = await listProfileEntries(database.db, {
      userId,
      category: "competitor",
      status: "active",
    });
    expect(active.items.map((entry) => entry.title)).toEqual(["Woodcraft"]);

    await database.db.execute(sql`delete from profile_entries`);
    const literal = await applyCompetitorAnswers(database.db, userId, [
      {
        questionId: "competitors",
        optionId: "custom",
        customText: "Rival Co Inc",
      },
    ]);
    expect(literal.assistantHint).toMatch(/custom competitor saved/i);
    active = await listProfileEntries(database.db, {
      userId,
      category: "competitor",
      status: "active",
    });
    expect(active.items.some((entry) => entry.title === "Rival Co Inc")).toBe(
      true,
    );
  });
});
