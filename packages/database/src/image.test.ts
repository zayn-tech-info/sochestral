import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { brandAssets, brandDesignBriefs, type BrandAsset } from "./schema.js";
import {
  claimDueBrandBriefCompile,
  computeBrandSourceHash,
  createBrandAsset,
  createPendingMediaAssets,
  listBrandAssets,
  markBrandBriefReady,
  markMediaAssetReady,
  pickBrandCompilePack,
  pickBrandJobExemplars,
  scheduleBrandBriefCompile,
} from "./index.js";

function fakeAsset(
  overrides: Partial<BrandAsset> & Pick<BrandAsset, "id" | "kind">,
): BrandAsset {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const needsMedia =
    overrides.kind === "logo" || overrides.kind === "reference_image";
  return {
    userId: "user_test",
    name: overrides.name ?? overrides.kind,
    mediaAssetId: needsMedia ? "media_1" : null,
    colorValue: null,
    noteText: null,
    sortOrder: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("brand design brief helpers", () => {
  it("skips the same source hash (AC-1)", () => {
    const assets = [
      fakeAsset({
        id: "ba_1",
        kind: "color",
        colorValue: "#111111",
        name: "Primary",
      }),
    ];
    expect(computeBrandSourceHash(assets)).toBe(computeBrandSourceHash(assets));
    expect(
      computeBrandSourceHash([
        ...assets,
        fakeAsset({
          id: "ba_2",
          kind: "color",
          colorValue: "#f211b6",
          name: "Secondary",
        }),
      ]),
    ).not.toBe(computeBrandSourceHash(assets));
  });

  it("caps compile pack at 8 and job exemplars at logo plus 2 refs (AC-2, AC-8)", () => {
    const logo = fakeAsset({ id: "ba_logo", kind: "logo", sortOrder: 0 });
    const refs = Array.from({ length: 10 }, (_, index) =>
      fakeAsset({
        id: `ba_ref_${index}`,
        kind: "reference_image",
        createdAt: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index * 1000),
      }),
    );
    const pack = pickBrandCompilePack([logo, ...refs], 8);
    expect(pack[0]?.id).toBe("ba_logo");
    expect(pack).toHaveLength(8);

    const exemplars = pickBrandJobExemplars([logo, ...refs]);
    expect(exemplars).toHaveLength(3);
    expect(exemplars[0]?.id).toBe("ba_logo");
    expect(exemplars[1]?.id).toBe("ba_ref_9");
    expect(exemplars[2]?.id).toBe("ba_ref_8");
  });
});

describe("brand design brief compile gate", () => {
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
    userId = (await provisionUser(database.db, "brief-gate@example.com")).id;
  });

  it("schedules on mutate and skips vision when the hash is unchanged (AC-1)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Primary",
      colorValue: "#111111",
    });
    const first = await scheduleBrandBriefCompile(database.db, userId);
    expect(first.scheduled).toBe(true);
    expect(first.brief?.status).toBe("pending");

    await markBrandBriefReady(database.db, {
      userId,
      sourceHash: first.hash,
      briefText: "Navy blocks, mark top left.",
    });
    const second = await scheduleBrandBriefCompile(database.db, userId);
    expect(second.scheduled).toBe(false);
    expect(second.brief?.status).toBe("ready");
    expect(second.hash).toBe(first.hash);
  });

  it("debounces two mutates into one pending row (AC-3)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Primary",
      colorValue: "#111111",
    });
    await scheduleBrandBriefCompile(database.db, userId);
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Secondary",
      colorValue: "#f211b6",
    });
    const second = await scheduleBrandBriefCompile(database.db, userId);
    expect(second.scheduled).toBe(true);

    const rows = await database.db
      .select()
      .from(brandDesignBriefs)
      .where(eq(brandDesignBriefs.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");

    const tooSoon = await claimDueBrandBriefCompile(database.db, 60_000);
    expect(tooSoon).toBeNull();

    await database.db
      .update(brandDesignBriefs)
      .set({ pendingAt: new Date(Date.now() - 10_000) })
      .where(eq(brandDesignBriefs.userId, userId));
    const due = await claimDueBrandBriefCompile(database.db, 3000);
    expect(due?.userId).toBe(userId);

    await markBrandBriefReady(database.db, {
      userId,
      sourceHash: due!.sourceHash,
      briefText: "Compiled once.",
    });
    const again = await claimDueBrandBriefCompile(database.db, 0);
    expect(again).toBeNull();
  });

  it("picks owned logo plus newest reference images from stored rows", async () => {
    async function readyMedia() {
      const [asset] = await createPendingMediaAssets(database.db, {
        userId,
        descriptors: [{ mimeType: "image/png", byteSize: 80 }],
        pendingExpiresAt: new Date(Date.now() + 60_000),
        hourlyLimit: 50,
        storageLimitBytes: 1024,
      });
      await markMediaAssetReady(database.db, {
        userId,
        assetId: asset!.id,
        mimeType: "image/png",
        byteSize: 80,
        width: 2,
        height: 2,
      });
      return asset!.id;
    }

    const logo = await createBrandAsset(database.db, {
      userId,
      kind: "logo",
      name: "Mark",
      mediaAssetId: await readyMedia(),
    });
    const older = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "Old flyer",
      mediaAssetId: await readyMedia(),
    });
    const newer = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "New flyer",
      mediaAssetId: await readyMedia(),
    });
    const extra = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "Newest flyer",
      mediaAssetId: await readyMedia(),
    });
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T10:00:00.000Z") })
      .where(eq(brandAssets.id, older.id));
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T11:00:00.000Z") })
      .where(eq(brandAssets.id, newer.id));
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T12:00:00.000Z") })
      .where(eq(brandAssets.id, extra.id));

    const exemplars = pickBrandJobExemplars(
      await listBrandAssets(database.db, { userId }),
    );
    expect(exemplars.map((item) => item.id)).toEqual([
      logo.id,
      extra.id,
      newer.id,
    ]);
  });
});
