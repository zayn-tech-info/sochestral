import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { usageAttempts, type Database } from "@sochestral/database";
import type { ModelCompletion } from "./model.js";

export type UsageContext = { db: Database["db"]; userId: string; parentId: string; role: string };
const context = new AsyncLocalStorage<UsageContext>();

export function withUsageContext<T>(value: UsageContext, work: () => Promise<T>): Promise<T> {
  return context.run(value, work);
}

export function withUsageRole<T>(role: string, work: () => Promise<T>): Promise<T> {
  const scope = context.getStore();
  return scope ? context.run({ ...scope, role }, work) : work();
}

const tokens = (value: number | null | undefined) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Persist before network I/O. A crash leaves a visible started attempt for reconciliation. */
export async function measureModelAttempt(
  input: { provider: string; model: string; attempt: number },
  work: () => Promise<ModelCompletion>,
): Promise<ModelCompletion> {
  const scope = context.getStore();
  if (!scope) return work();
  const id = `usage_${randomUUID()}`;
  await scope.db.insert(usageAttempts).values({
    id, userId: scope.userId, parentId: scope.parentId, role: scope.role, ...input,
  });
  const started = performance.now();
  const finish = async (patch: Partial<typeof usageAttempts.$inferInsert>) => {
    try {
      await scope.db.update(usageAttempts).set(patch).where(eq(usageAttempts.id, id));
    } catch (cause) {
      // A bookkeeping outage after a provider response must not trigger a network retry.
      throw new Error("USAGE_PERSISTENCE_FAILED", { cause });
    }
  };
  let result: ModelCompletion;
  try {
    result = await work();
  } catch (error) {
    await finish({
      outcome: "failed", durationMs: Math.round(performance.now() - started), completedAt: new Date(),
    });
    throw error;
  }
  // Missing provider usage is unknown, including failed/aborted requests. Never infer zero cost.
  const usage = result.usage;
  await finish({
    outcome: "succeeded", durationMs: Math.round(performance.now() - started), completedAt: new Date(),
    inputTokens: tokens(usage?.inputTokens), outputTokens: tokens(usage?.outputTokens),
    cacheReadTokens: tokens(usage?.cacheReadTokens), cacheWriteTokens: tokens(usage?.cacheWriteTokens),
    reasoningTokens: tokens(usage?.reasoningTokens),
  });
  return result;
}
