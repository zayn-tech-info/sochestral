import { apiRequest } from "./product-api";

export type PlanItem = { id: string; angle: string; audience: string; format: string; destinations: string[]; proposedTime: string | null; assetNeeds: string[] };
export type PlanBlock =
  | { id: string; kind: "paragraph" | "callout"; text: string; tone?: "info" | "attention" }
  | { id: string; kind: "calendar"; items: PlanItem[] }
  | { id: string; kind: "sources"; sources: Array<{ id: string; url: string; title: string; retrievedAt: string; summary: string; claim: string }> };
export type PlanDocument = { schemaVersion: 1; sections: Array<{ id: string; type: string; title: string; blocks: PlanBlock[] }> };
export type PlanSummary = { id: string; title: string; currentVersion: number; updatedAt: string };
export type PlanComment = { id: string; version: number; blockId: string; quote: string | null; body: string; status: "pending" | "submitted" | "addressed" | "needs_reattachment" | "reattached"; reattachedFromId?: string | null; batchId: string | null };
export type PlanRevisionBatch = { id: string; version: number; status: string; errorCode: string | null };
export type PlanDetail = { batches?: PlanRevisionBatch[]; plan: PlanSummary; version: { version: number; document: PlanDocument; parentVersion?: number | null; createdAt?: string; changedBlockIds?: string[]; handledCommentIds?: string[] }; comments: PlanComment[]; approvals: Array<{ scope: string; revision: number }> };
export const listPlans = () => apiRequest<{ plans: PlanSummary[] }>("/plans");
export const getPlan = (id: string, version?: number) => apiRequest<PlanDetail>(`/plans/${encodeURIComponent(id)}${version === undefined ? "" : `?version=${version}`}`);
function post<T>(id: string, suffix: string, body: unknown) {
  return apiRequest<T>(`/plans/${encodeURIComponent(id)}/${suffix}`, { method: "POST", headers: { "X-Sochestral-Request": "plan-action" }, body: JSON.stringify(body) });
}
export const commentOnPlan = (id: string, input: { version: number; blockId: string; quote?: string; body: string }) => post<PlanComment>(id, "comments", input);
export const submitPlanComments = (id: string, version: number, commentIds: string[]) => post(id, "comment-batches", { version, commentIds });
export const approvePlan = (id: string, version: number) => post(id, "approve", { version, confirm: true });
export const createPlanContent = (id: string, version: number) => post(id, "create-content", { version, confirm: true });

export const reattachComment = (id: string, commentId: string, input: { version: number; blockId: string; quote?: string }) => post<PlanComment>(id, `comments/${encodeURIComponent(commentId)}/reattach`, input);
