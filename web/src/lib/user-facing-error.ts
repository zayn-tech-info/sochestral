/**
 * Maps product API / client error codes to copy users can act on.
 * Never surface SCREAMING_SNAKE codes in the UI — pass unknown values through
 * this helper at every display site.
 */

const ERROR_COPY: Record<string, string> = {
  // Auth / session
  UNAUTHORIZED: "Your session expired. Please sign in again.",
  INVALID_CREDENTIALS: "That email or password is incorrect.",
  JWT_SECRET_MISSING: "Sign-in is temporarily unavailable. Please try again later.",

  // Generic request
  REQUEST_FAILED: "Something went wrong. Please try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
  NETWORK_ERROR: "We could not reach the server. Check your connection and try again.",

  // Calendar / schedules
  INVALID_RANGE: "That date range is not valid. Try a shorter window.",
  INVALID_TIMEZONE: "That timezone is not supported. Refresh and try again.",
  INVALID_SORT: "That sort option is not valid.",
  INVALID_STATUS: "That status filter is not valid.",
  INVALID_SCHEDULE_RESPONSE:
    "Schedule data came back incomplete. Refresh and try again.",
  INVALID_CONTENT_UPDATE:
    "That caption or media could not be saved. Check the content and try again.",
  SCHEDULE_TIME_MUST_BE_FUTURE:
    "Pick a future time — past times cannot be scheduled.",
  SCHEDULE_NOT_FOUND: "This schedule was not found. It may have been removed.",
  PUBLISHED_IMMUTABLE: "Published posts cannot be edited.",
  MUTATION_UNSUPPORTED:
    "That change is not supported for this schedule right now.",
  SCHEDULE_REACTIVATE_FAILED:
    "This canceled schedule could not be reactivated. Refresh and try again, or pick a new future time.",
  ACCOUNT_REQUIRED: "Choose a connected account before continuing.",
  MEDIA_UPLOAD_FAILED: "We could not upload that image. Try again.",
  REWRITE_UNAVAILABLE:
    "Rewrite suggestions are unavailable right now. Try again shortly.",
  INVALID_REWRITE: "That rewrite request was not valid. Try a shorter instruction.",

  // Connectors / SocialMCP
  SOCIALMCP_UNAVAILABLE:
    "We could not reach the social account service. Try again shortly.",

  // Orchestration / chat
  RUN_IN_PROGRESS:
    "Sochestral is still finishing work in this conversation.",
  INVALID_MESSAGE:
    "Those image attachments could not be used for this chat. Remove them, re-attach, and try again.",
  INVALID_TOOL_ARGUMENTS:
    "I could not form a safe platform request. Name Threads, Instagram, or LinkedIn, or restate what to draft or schedule.",
  MODEL_UNAVAILABLE:
    "I could not reach the language model in time. Please try again shortly.",
  STREAM_INCOMPLETE: "The reply was interrupted before it finished. Please try again.",
  STREAM_UNAVAILABLE: "The reply was interrupted before it finished. Please try again.",
  TOOL_STEP_LIMIT: "That request needed too many steps. Try a simpler ask.",
  SCHEDULE_CAP_EXCEEDED:
    "You have reached the schedule limit for this plan. Remove or publish older drafts first.",

  // Profile
  INVALID_INPUT: "Check the fields and try again.",

  // Publishing / review
  STALE_REVISION:
    "This draft changed elsewhere. Refresh and try again.",
  PREFLIGHT_FAILED:
    "Fix the blocking draft errors before publishing. No platform call was made.",
  PUBLISH_RATE_LIMIT:
    "The hourly publish limit is reached. No platform call was made.",
  INVALID_PUBLISHING_REQUEST: "Publishing is not available for this account.",
  INVALID_PREFERENCE: "That publishing preference is not valid.",
  INVALID_REVIEW_REQUEST: "Review is not available for this draft.",
  INVALID_REVIEW_INPUT: "That review update was not valid.",
  REVIEW_NOT_FOUND: "This review was not found. Refresh and try again.",
};

const CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

export type UserFacingErrorOptions = {
  /** Used when the code is unknown. */
  fallback?: string;
};

function codeFromUnknown(error: unknown): string | null {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return null;
}

function looksLikeErrorCode(value: string): boolean {
  return CODE_PATTERN.test(value) || value in ERROR_COPY;
}

/**
 * Resolve any API code, ApiError, or unknown failure into user-facing copy.
 * Already-friendly prose is returned unchanged.
 */
export function userFacingError(
  error: unknown,
  options?: UserFacingErrorOptions,
): string {
  const fallback =
    options?.fallback ?? "Something went wrong. Please try again.";
  const raw = codeFromUnknown(error);
  if (!raw) return fallback;

  if (ERROR_COPY[raw]) return ERROR_COPY[raw]!;

  // Prefer a details.message from ApiError-shaped objects when it is prose.
  if (
    error &&
    typeof error === "object" &&
    "details" in error &&
    error.details &&
    typeof error.details === "object" &&
    "message" in error.details &&
    typeof (error.details as { message: unknown }).message === "string"
  ) {
    const detail = (error.details as { message: string }).message.trim();
    if (detail && detail !== raw && !looksLikeErrorCode(detail)) {
      return detail;
    }
  }

  if (!looksLikeErrorCode(raw)) return raw;

  return fallback;
}

/** True when a string is an uppercase API-style error code. */
export function isApiErrorCode(value: string): boolean {
  return looksLikeErrorCode(value.trim());
}
