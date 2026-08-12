import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBusinessProfile,
  patchBusinessProfile,
  type BusinessProfileResponse,
} from "@/lib/product-api";
import { OnboardingWizard } from "./onboarding-wizard";
import { ToastProvider } from "./toast-provider";

const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  return { replace, push, router: { replace, push } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
}));

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getBusinessProfile: vi.fn(),
    patchBusinessProfile: vi.fn(),
  };
});

const incompleteProfile: BusinessProfileResponse = {
  id: "bprof_test",
  businessName: null,
  businessDescription: null,
  websiteUrl: null,
  targetAudience: null,
  industry: null,
  personaRole: null,
  personaRoleOther: null,
  primaryPlatforms: [],
  attributionSource: null,
  attributionOther: null,
  setupStatus: "not_started",
  setupStep: null,
  competitorsSkipped: false,
  compiledNote: "# Business profile",
  minimumComplete: false,
  sections: {},
  updatedAt: "2026-08-11T00:00:00.000Z",
};

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.push.mockReset();
  vi.mocked(getBusinessProfile).mockReset();
  vi.mocked(patchBusinessProfile).mockReset();
  vi.mocked(getBusinessProfile).mockResolvedValue(incompleteProfile);
  vi.mocked(patchBusinessProfile).mockImplementation(async (body) => ({
    ...incompleteProfile,
    businessName:
      body.businessName === undefined
        ? incompleteProfile.businessName
        : body.businessName,
    businessDescription:
      body.businessDescription === undefined
        ? incompleteProfile.businessDescription
        : body.businessDescription,
    websiteUrl:
      body.websiteUrl === undefined
        ? incompleteProfile.websiteUrl
        : body.websiteUrl,
    personaRole:
      body.personaRole === undefined
        ? incompleteProfile.personaRole
        : body.personaRole,
    personaRoleOther:
      body.personaRoleOther === undefined
        ? incompleteProfile.personaRoleOther
        : body.personaRoleOther,
    attributionSource:
      body.attributionSource === undefined
        ? incompleteProfile.attributionSource
        : body.attributionSource,
    attributionOther:
      body.attributionOther === undefined
        ? incompleteProfile.attributionOther
        : body.attributionOther,
    setupStatus: body.completeSetup ? "complete" : "in_progress",
    setupStep: (body.setupStep as string | null | undefined) ?? "business_details",
    primaryPlatforms: body.primaryPlatforms ?? [],
    sections: {
      skill: (body.skills ?? []).map((skill, index) => ({
        id: `pentry_${index}`,
        category: "skill",
        title: null,
        body: skill,
        status: "active",
        source: "setup",
        sortOrder: index,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      })),
    },
  }));
});

describe("OnboardingWizard", () => {
  it("saves business details and advances to who you are", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <OnboardingWizard />
      </ToastProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Your business" })).toBeTruthy();

    const description = Array.from({ length: 32 }, (_, i) => `word${i}`).join(" ");
    const nameInput = screen.getByRole("textbox", { name: /^Business name$/i });
    const descriptionInput = screen.getByRole("textbox", {
      name: /Business description/i,
    });

    await user.clear(nameInput);
    await user.type(nameInput, "Acme");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, description);

    expect(nameInput).toHaveValue("Acme");
    expect(descriptionInput).toHaveValue(description);

    const continueButton = screen.getByRole("button", { name: /Continue/i });
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    await waitFor(() => {
      expect(patchBusinessProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: "Acme",
          setupStep: "who_you_are",
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Who you are" })).toBeTruthy();
  });

  it("redirects completed profiles to workspace", async () => {
    vi.mocked(getBusinessProfile).mockResolvedValue({
      ...incompleteProfile,
      setupStatus: "complete",
      minimumComplete: true,
    });

    render(
      <ToastProvider>
        <OnboardingWizard />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/app/workspace");
    });
  });

  it("persists Back navigation to the server", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(getBusinessProfile).mockResolvedValue({
      ...incompleteProfile,
      businessName: "Acme",
      businessDescription: Array.from({ length: 32 }, (_, i) => `word${i}`).join(
        " ",
      ),
      personaRole: "business_owner",
      setupStatus: "in_progress",
      setupStep: "skills",
    });
    vi.mocked(patchBusinessProfile).mockResolvedValue({
      ...incompleteProfile,
      setupStatus: "in_progress",
      setupStep: "who_you_are",
    });

    render(
      <ToastProvider>
        <OnboardingWizard />
      </ToastProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Your skills" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Back/i }));

    await waitFor(() => {
      expect(patchBusinessProfile).toHaveBeenCalledWith({
        setupStep: "who_you_are",
      });
    });
    expect(await screen.findByRole("heading", { name: "Who you are" })).toBeTruthy();
  });

  it("does not navigate away when final setup did not complete", async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(getBusinessProfile).mockResolvedValue({
      ...incompleteProfile,
      businessName: "Acme",
      businessDescription: Array.from({ length: 32 }, (_, i) => `word${i}`).join(
        " ",
      ),
      personaRole: "business_owner",
      primaryPlatforms: ["threads"],
      attributionSource: "friend",
      setupStatus: "in_progress",
      setupStep: "attribution",
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
    });
    vi.mocked(patchBusinessProfile).mockResolvedValue({
      ...incompleteProfile,
      setupStatus: "in_progress",
      setupStep: "done",
      minimumComplete: false,
    });

    render(
      <ToastProvider>
        <OnboardingWizard />
      </ToastProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "How did you hear about us?",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Finish/i }));

    await waitFor(() => {
      expect(patchBusinessProfile).toHaveBeenCalledWith(
        expect.objectContaining({ completeSetup: true }),
      );
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
