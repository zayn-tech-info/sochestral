import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBusinessProfile,
  patchBusinessProfile,
  type BusinessProfileResponse,
} from "@/lib/product-api";
import { ProfileSettings } from "./profile-settings";
import { ToastProvider } from "./toast-provider";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getBusinessProfile: vi.fn(),
    patchBusinessProfile: vi.fn(),
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
  },
}));

const profile: BusinessProfileResponse = {
  id: "bprof_test",
  businessName: "Verify Brand Co",
  businessDescription: "Handcrafted tools",
  websiteUrl: null,
  targetAudience: null,
  industry: null,
  setupStatus: "in_progress",
  setupStep: "tone",
  competitorsSkipped: false,
  compiledNote: "# Business profile\nVerify Brand Co",
  minimumComplete: false,
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
  vi.mocked(patchBusinessProfile).mockReset();
  vi.mocked(getBusinessProfile).mockResolvedValue(profile);
  vi.mocked(patchBusinessProfile).mockResolvedValue({
    ...profile,
    businessName: "Updated Co",
  });
});

describe("ProfileSettings", () => {
  it("loads identity, compiled note, and category sections (AC-5)", async () => {
    render(
      <ToastProvider>
        <ProfileSettings />
      </ToastProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Business profile" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Verify Brand Co")).toBeInTheDocument();
    expect(screen.getByText(/Use warm short sentences/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compiled note" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tone" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brand facts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo setup (keep entries)" })).toBeInTheDocument();
  });

  it("saves identity through the profile API (AC-5)", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProfileSettings />
      </ToastProvider>,
    );

    await screen.findByDisplayValue("Verify Brand Co");
    const name = screen.getByLabelText(/Business name/i);
    await user.clear(name);
    await user.type(name, "Updated Co");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    await waitFor(() => {
      expect(patchBusinessProfile).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: "Updated Co" }),
      );
    });
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
  });
});
