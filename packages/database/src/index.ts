export { closeDb, createDb, getDb, type Database } from "./client.js";
export { requireDatabaseUrl, requireTestDatabaseUrl } from "./env.js";
export {
  DatabaseError,
  EMAIL_TAKEN,
  isUniqueViolation,
} from "./errors.js";
export {
  createConversationId,
  createDraftId,
  createMessageId,
  createRunId,
  createToolCallId,
  createUserId,
} from "./ids.js";
export {
  drafts,
  orchestrationConversations,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
  sessions,
  users,
  type Draft,
  type DraftPlatform,
  type DraftStatus,
  type NewDraft,
  type NewOrchestrationConversation,
  type NewOrchestrationMessage,
  type NewOrchestrationRun,
  type NewOrchestrationToolCall,
  type NewSession,
  type NewUser,
  type OrchestrationConversation,
  type OrchestrationMessage,
  type OrchestrationRun,
  type OrchestrationToolCall,
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
export {
  appendConversationTurn,
  completeOrchestrationRun,
  createConversationTurn,
  createOrchestrationToolCall,
  deleteOwnedConversation,
  failOrchestrationRun,
  findOwnedTurnByRequestId,
  finishOrchestrationToolCall,
  getOwnedConversation,
  listAllConversationMessages,
  listConversationMessages,
  listConversationRuns,
  listOwnedConversations,
  listRunToolCalls,
  OrchestrationDatabaseError,
  updateRunUsage,
  type ConversationCursor,
  type CreatedTurn,
  type CreateTurnInput,
  type TargetPlatform,
} from "./orchestration.js";
