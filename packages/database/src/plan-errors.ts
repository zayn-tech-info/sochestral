export type PlanWorkflowCode =
  | "PLAN_NOT_FOUND"
  | "STALE_VERSION"
  | "INVALID_DOCUMENT"
  | "INVALID_ANCHOR"
  | "INVALID_COMMENT"
  | "INVALID_BATCH"
  | "CONTEXT_NOT_FOUND"
  | "CONTENT_NOT_READY"
  | "DIRECTION_NOT_APPROVED"
  | "NO_CALENDAR_ITEMS"
  | "INVALID_CONTENT"
  | "TIMEZONE_NOT_CONFIRMED"
  | "SCHEDULE_NOT_READY"
  | "ACCOUNT_REQUIRED"
  | "INVALID_SCHEDULE";

export class PlanWorkflowError extends Error {
  constructor(
    public readonly code: PlanWorkflowCode,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
