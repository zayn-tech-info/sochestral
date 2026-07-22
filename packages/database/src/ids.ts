import { nanoid } from "nanoid";

const ID_LENGTH = 21;

export function createUserId(): string {
  return `user_${nanoid(ID_LENGTH)}`;
}

export function createDraftId(): string {
  return `draft_${nanoid(ID_LENGTH)}`;
}
