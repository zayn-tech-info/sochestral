import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBusinessProfile,
  patchBusinessProfile,
  type BusinessProfileResponse,
} from "@/lib/product-api";
import { PersonalSettings } from "./personal-settings";
import { ToastProvider } from "./toast-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getBusinessProfile: vi.fn(),
    patchBusinessProfile: vi.fn(),
  };
});

vi.mock("./app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("./product-motion-provider", () => ({
  productMotion: {
    duration: 0.2,
    ease: "easeOut",
    enter: { duration: 0.2, ease: "easeOut" },
  },
}));

const profile: BusinessProfileResponse = {
  id: "bprof_test",
  businessName: "Verify Brand Co",
  businessDescription: Array.from({ length: 32 }, (_, i) => `word${i}`).join(" "),
  websiteUrl: null,
  targetAudience: null,
  industry: null,
  personaRole: "business_owner",
  personaRoleOther: null,
  primaryPlatforms: ["threads"],
  attributionSource: "friend",
  attributionOther: null,
  setupStatus: "complete",
  setupStep: "done",
  competitorsSkipped: false,
  compiledNote: "# Business profile\nVerify Brand Co",
  minimumComplete: true,
  sections: {
    skill: [
      {
        id: "pentry_skill",
        category: "skill",
        title: null,
        body: "Content writing",
        status: "active",
        source: "setup",
        sortOrder: 0,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    ],
  },
  updatedAt: "2026-08-11T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(getBusinessProfile).mockReset();
  vi.mocked(patchBusinessProfile).mockReset();
  vi.mocked(getBusinessProfile).mockResolvedValue(profile);
  vi.mocked(patchBusinessProfile).mockResolvedValue({
    ...profile,
    businessName: "Updated Co",
  });
});

describe("PersonalSettings", () => {
  it("loads identity fields and saves personal information", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PersonalSettings />
      </ToastProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Personal information" }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Verify Brand Co")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Verify Brand Co"), {
      target: { value: "Updated Co" },
    });
    await user.click(
      screen.getByRole("button", { name: /Save personal information/i }),
    );

    await waitFor(() => {
      expect(patchBusinessProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: "Updated Co",
          personaRole: "business_owner",
          primaryPlatforms: ["threads"],
        }),
      );
    });
  });

  it("shows the server status after required fields are removed", async () => {
    const user = userEvent.setup();
    vi.mocked(patchBusinessProfile).mockResolvedValue({
      ...profile,
      businessName: null,
      setupStatus: "in_progress",
      setupStep: "business_details",
      minimumComplete: false,
    });

    render(
      <ToastProvider>
        <PersonalSettings />
      </ToastProvider>,
    );

    expect(await screen.findByDisplayValue("Verify Brand Co")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Verify Brand Co"), {
      target: { value: "" },
    });
    await user.click(
      screen.getByRole("button", { name: /Save personal information/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("in_progress · incomplete")).toBeTruthy();
    });
  });
});
