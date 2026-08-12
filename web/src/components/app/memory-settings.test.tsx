import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProfileEntry,
  getBusinessProfile,
  type BusinessProfileResponse,
} from "@/lib/product-api";
import { MemorySettings } from "./memory-settings";
import { ToastProvider } from "./toast-provider";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getBusinessProfile: vi.fn(),
    createProfileEntry: vi.fn(),
    patchProfileEntry: vi.fn(),
    deleteProfileEntry: vi.fn(),
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
  businessDescription: "Handcrafted tools",
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
    brand_fact: [
      {
        id: "pentry_1",
        category: "brand_fact",
        title: null,
        body: "Use warm short sentences",
        status: "active",
        source: "settings",
        sortOrder: 0,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
    ],
  },
  updatedAt: "2026-08-08T00:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(getBusinessProfile).mockReset();
  vi.mocked(createProfileEntry).mockReset();
  vi.mocked(getBusinessProfile).mockResolvedValue(profile);
  vi.mocked(createProfileEntry).mockResolvedValue({
    id: "pentry_2",
    category: "tone",
    title: null,
    body: "Direct",
    status: "active",
    source: "settings",
    sortOrder: 0,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  });
});

describe("MemorySettings", () => {
  it("shows compiled note and memory categories", async () => {
    render(
      <ToastProvider>
        <MemorySettings />
      </ToastProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Memory" })).toBeTruthy();
    expect(screen.getByText(/Verify Brand Co/)).toBeTruthy();
    expect(screen.getByText("Use warm short sentences")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tone" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Skills" })).toBeNull();
  });

  it("adds a memory entry", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemorySettings />
      </ToastProvider>,
    );

    await screen.findByRole("heading", { name: "Memory" });
    await user.selectOptions(screen.getByRole("combobox"), "tone");
    await user.type(screen.getByPlaceholderText(/Write a rule/i), "Direct");
    await user.click(screen.getByRole("button", { name: /Add entry/i }));

    await waitFor(() => {
      expect(createProfileEntry).toHaveBeenCalledWith({
        category: "tone",
        body: "Direct",
      });
    });
  });
});
