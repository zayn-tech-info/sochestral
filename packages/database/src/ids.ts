import { nanoid } from "nanoid";

const ID_LENGTH = 21;

export function createUserId(): string {
  return `user_${nanoid(ID_LENGTH)}`;
}

export function createDraftId(): string {
  return `draft_${nanoid(ID_LENGTH)}`;
}

export function createReviewGroupId(): string {
  return `review_${nanoid(ID_LENGTH)}`;
}

export function createDraftPublishAttemptId(): string {
  return `attempt_${nanoid(ID_LENGTH)}`;
}

export function createPublishingAuthorityEventId(): string {
  return `authority_${nanoid(ID_LENGTH)}`;
}

export function createMediaAssetId(): string {
  return `media_${nanoid(ID_LENGTH)}`;
}

export function createBrandAssetId(): string {
  return `brand_${nanoid(ID_LENGTH)}`;
}

export function createImageJobId(): string {
  return `imgjob_${nanoid(ID_LENGTH)}`;
}

export function createImageJobInputId(): string {
  return `imgin_${nanoid(ID_LENGTH)}`;
}

export function createConversationId(): string {
  return `conv_${nanoid(ID_LENGTH)}`;
}

export function createMessageId(): string {
  return `msg_${nanoid(ID_LENGTH)}`;
}

export function createRunId(): string {
  return `run_${nanoid(ID_LENGTH)}`;
}

export function createToolCallId(): string {
  return `toolcall_${nanoid(ID_LENGTH)}`;
}

export function createBusinessProfileId(): string {
  return `bprof_${nanoid(ID_LENGTH)}`;
}

export function createProfileEntryId(): string {
  return `pentry_${nanoid(ID_LENGTH)}`;
}

export function createContentPlanId(): string {
  return `cplan_${nanoid(ID_LENGTH)}`;
}

export function createCampaignJobId(): string {
  return `camp_${nanoid(ID_LENGTH)}`;
}
