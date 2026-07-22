export { closeDb, createDb, getDb, type Database } from "./client.js";
export { requireDatabaseUrl } from "./env.js";
export {
  DatabaseError,
  EMAIL_TAKEN,
  isUniqueViolation,
} from "./errors.js";
export { createDraftId, createUserId } from "./ids.js";
export {
  drafts,
  sessions,
  users,
  type Draft,
  type DraftPlatform,
  type DraftStatus,
  type NewDraft,
  type NewSession,
  type NewUser,
  type Session,
  type User,
} from "./schema.js";
export {
  insertDraft,
  listDraftsByUserId,
  type InsertDraftInput,
} from "./drafts.js";
export {
  canonicalizeEmail,
  deleteUser,
  provisionUser,
  type ProvisionedUser,
} from "./users.js";
