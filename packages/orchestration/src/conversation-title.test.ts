import { describe, expect, it } from "vitest";
import {
  compressMessageToTitle,
  deriveInitialConversationTitle,
  hasEnoughTitleContext,
  isGreetingMessage,
  isProvisionalConversationTitle,
  isSubstantiveMessage,
  sanitizeGeneratedTitle,
} from "./conversation-title.js";

describe("conversation titles", () => {
  it("classifies greetings and filler", () => {
    expect(isGreetingMessage("Hi")).toBe(true);
    expect(isGreetingMessage("hello!")).toBe(true);
    expect(isGreetingMessage("Draft a Threads launch post")).toBe(false);
    expect(isSubstantiveMessage("Hi")).toBe(false);
    expect(isSubstantiveMessage("Draft a Threads launch post")).toBe(true);
  });

  it("derives provisional titles without using raw greetings", () => {
    expect(deriveInitialConversationTitle("Hi")).toBe("New chat");
    expect(
      deriveInitialConversationTitle("Hi", { setupGateActive: true }),
    ).toBe("Business setup");
    expect(
      deriveInitialConversationTitle("Please draft an Instagram caption for our launch"),
    ).toBe("draft an Instagram caption for our launch");
  });

  it("compresses long openings", () => {
    const title = compressMessageToTitle(
      "Can you please write a long LinkedIn update about our Series A fundraising announcement for founders",
    );
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.toLowerCase()).not.toContain("can you please");
  });

  it("detects provisional titles including first-message truncates", () => {
    expect(isProvisionalConversationTitle("New chat")).toBe(true);
    expect(isProvisionalConversationTitle("Business setup")).toBe(true);
    expect(isProvisionalConversationTitle("Hi", "Hi")).toBe(true);
    expect(
      isProvisionalConversationTitle("Launch post for Instagram", "Hi"),
    ).toBe(false);
    expect(
      isProvisionalConversationTitle(
        "draft an Instagram caption for our launch",
        "Please draft an Instagram caption for our launch",
      ),
    ).toBe(false);
  });

  it("requires enough context before mid-conversation rename", () => {
    expect(
      hasEnoughTitleContext({
        userMessages: ["Hi"],
        hasAssistantReply: true,
      }),
    ).toBe(false);
    expect(
      hasEnoughTitleContext({
        userMessages: ["Draft a Threads post about the launch"],
        hasAssistantReply: true,
      }),
    ).toBe(true);
    expect(
      hasEnoughTitleContext({
        userMessages: ["Hi", "We sell handmade tools"],
        hasAssistantReply: true,
      }),
    ).toBe(true);
    expect(
      hasEnoughTitleContext({
        userMessages: ["Hi"],
        hasAssistantReply: true,
        businessName: "Acme",
      }),
    ).toBe(true);
  });

  it("sanitizes model title output", () => {
    expect(sanitizeGeneratedTitle('"Launch post plan."')).toBe("Launch post plan");
    expect(sanitizeGeneratedTitle("Hi")).toBeNull();
    expect(sanitizeGeneratedTitle("New chat")).toBeNull();
  });
});
