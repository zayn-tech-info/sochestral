import { nanoid } from "nanoid";

const ID_LENGTH = 21;

export function createUserId(): string {
  return `user_${nanoid(ID_LENGTH)}`;
}

export function createDraftId(): string {
  return `draft_${nanoid(ID_LENGTH)}`;
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
