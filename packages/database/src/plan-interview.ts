import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./client.js";
import { planInterviews, orchestrationConversations, generationContexts } from "./schema.js";
import { createPlan, PlanWorkflowError } from "./plans.js";

const field = z.enum(["goal", "newsAssets", "direction"]);
export const planInterviewStateSchema = z.object({
  status: z.enum(["asking", "clarification_needed", "delegated", "ready", "research_unavailable", "planned", "canceled"]),
  answers: z.object({ goal: z.string().max(4000).nullable(), newsAssets: z.string().max(4000).nullable(), direction: z.string().max(4000).nullable() }).strict(),
  questions: z.array(z.object({ field, text: z.string().trim().min(1).max(600) }).strict()).max(3),
  useExistingContext: z.boolean(),
  sources: z.array(z.object({ url: z.url(), title: z.string(), retrievedAt: z.iso.datetime(), summary: z.string(), claim: z.string() }).strict()).max(30).default([]),
}).strict();
export type PlanInterviewState = z.infer<typeof planInterviewStateSchema>;
type Db = Database["db"];
export async function getPlanInterview(db: Db, userId: string, conversationId: string) {
  const [row] = await db.select().from(planInterviews).where(and(eq(planInterviews.userId, userId), eq(planInterviews.conversationId, conversationId)));
  return row ?? null;
}
export async function savePlanInterview(db: Db, input: { userId: string; conversationId: string; expectedRevision: number; state: PlanInterviewState; contextId: string | null; generated?: { title: string; document: unknown } }) {
  const state = planInterviewStateSchema.parse(input.state);
  return db.transaction(async tx => {
    const [conversation] = await tx.select().from(orchestrationConversations).where(and(eq(orchestrationConversations.id, input.conversationId), eq(orchestrationConversations.userId, input.userId))).for("update");
    if (!conversation) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    if (input.contextId) {
      const [context] = await tx.select({ id: generationContexts.id }).from(generationContexts).where(and(eq(generationContexts.id, input.contextId), eq(generationContexts.userId, input.userId)));
      if (!context) throw new PlanWorkflowError("CONTEXT_NOT_FOUND");
    }
    const current = await getPlanInterview(tx as unknown as Db, input.userId, input.conversationId);
    if ((current?.revision ?? 0) !== input.expectedRevision) throw new PlanWorkflowError("STALE_VERSION");
    let planId = current?.planId ?? null;
    if (input.generated) {
      if (planId) throw new PlanWorkflowError("STALE_VERSION");
      planId = (await createPlan(tx as unknown as Db, { ...input.generated, userId: input.userId, conversationId: input.conversationId, contextId: input.contextId })).plan.id;
      state.status = "planned";
      state.questions = [];
    }
    const values = { state, contextId: input.contextId, planId, revision: input.expectedRevision + 1, updatedAt: new Date() };
    const [row] = current
      ? await tx.update(planInterviews).set(values).where(eq(planInterviews.conversationId, input.conversationId)).returning()
      : await tx.insert(planInterviews).values({ ...values, userId: input.userId, conversationId: input.conversationId }).returning();
    return row!;
  });
}
