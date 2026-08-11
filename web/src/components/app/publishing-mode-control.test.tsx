import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  type PublishingPreference,
} from "@/lib/product-api";
import { PublishingModeControl } from "./publishing-mode-control";
import { ToastProvider } from "./toast-provider";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const preference: PublishingPreference = {
  currentMode: "always_draft",
  effectiveMode: "always_draft",
  revision: 4,
  consentVersion: null,
  consentedAt: null,
  consentCurrent: false,
  policyVersion: "policy-1",
  enabled: true,
  authorityEventId: "authority_1",
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue(preference);
});

describe("PublishingModeControl", () => {
  it("requires the exact acknowledgement before enabling Full access", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(preference)
      .mockResolvedValueOnce({
        ...preference,
        currentMode: "full_access",
        effectiveMode: "full_access",
        revision: 5,
        consentVersion: "policy-1",
        consentCurrent: true,
      });
    render(
      <ToastProvider>
        <PublishingModeControl source="settings" />
      </ToastProvider>,
    );

    const trigger = await screen.findByRole("button", { name: "Publishing mode" });
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: /Full access/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    const confirm = screen.getByRole("button", { name: "Confirm Full access" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("checkbox", {
      name: "I understand Sochestral may publish immediately without reviewing each post.",
    }));
    await user.click(confirm);

    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(
      "/publishing/preferences",
      {
        method: "PATCH",
        headers: { "X-Sochestral-Request": "publishing-action" },
        body: JSON.stringify({
          expectedRevision: 4,
          mode: "full_access",
          source: "settings",
          acknowledged: true,
          consentVersion: "policy-1",
        }),
      },
    ));
    expect(dialog).not.toHaveAttribute("open");
  });

  it("keeps the selector disabled while rollout forces Always draft", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...preference, enabled: false });
    render(
      <ToastProvider>
        <PublishingModeControl source="composer" compact />
      </ToastProvider>,
    );
    expect(
      await screen.findByRole("button", { name: "Publishing mode" }),
    ).toBeDisabled();
  });
});
