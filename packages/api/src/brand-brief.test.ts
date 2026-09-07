import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrandAsset,
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  scheduleBrandBriefCompile,
  type Database,
} from "@sochestral/database";
import { compileDueBrandBrief } from "./brand-brief.js";
import type { MediaService } from "./media-storage.js";
import type { ModelProvider } from "@sochestral/orchestration";

describe("compileDueBrandBrief", () => {
  let database: Database;
  let userId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "brief-compile@example.com")).id;
  });

  it("compiles a text-only brief without calling vision when there are no images (AC-2)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Primary",
      colorValue: "#111111",
    });
    await scheduleBrandBriefCompile(database.db, userId);
    await database.client`
      update brand_design_briefs
      set pending_at = ${new Date(Date.now() - 10_000).toISOString()}
      where user_id = ${userId}
    `;
    const vision = { complete: vi.fn() } as unknown as ModelProvider;
    const media = {
      modelImage: vi.fn(),
    } as unknown as MediaService;

    const result = await compileDueBrandBrief(database.db, media, {
      debounceMs: 0,
      compileCap: 8,
      vision,
      visionEnabled: true,
    });
    expect(result).toBe("compiled");
    expect(vision.complete).not.toHaveBeenCalled();
    expect(media.modelImage).not.toHaveBeenCalled();
  });
});
