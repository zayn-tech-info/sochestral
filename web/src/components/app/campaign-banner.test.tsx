import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentCampaign, pauseCampaign } from "@/lib/product-api";
import { CampaignBanner } from "./campaign-banner";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getCurrentCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    resumeCampaign: vi.fn(),
    stopCampaign: vi.fn(),
  };
});

describe("CampaignBanner", () => {
  beforeEach(() => {
    vi.mocked(getCurrentCampaign).mockReset();
    vi.mocked(pauseCampaign).mockReset();
  });

  it("shows Day N and queued counts with pause (AC-8)", async () => {
    vi.mocked(getCurrentCampaign).mockResolvedValue({
      campaign: {
        id: "camp_1",
        status: "running",
        bookedCount: 6,
        cap: 30,
        nextDate: "2026-08-15",
        dayIndex: 2,
        conversationId: "conv_1",
        startDate: "2026-08-14",
        notice: null,
        lastError: null,
      },
    });
    render(<CampaignBanner />);
    expect(await screen.findByText(/Day 2/)).toBeInTheDocument();
    expect(screen.getByText(/6 of 30 queued/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("warns before pause (AC-7)", async () => {
    vi.mocked(getCurrentCampaign).mockResolvedValue({
      campaign: {
        id: "camp_1",
        status: "queued",
        bookedCount: 0,
        cap: 30,
        nextDate: "2026-08-15",
        dayIndex: 1,
        conversationId: "conv_1",
        startDate: "2026-08-14",
        notice: null,
        lastError: null,
      },
    });
    vi.mocked(pauseCampaign).mockResolvedValue({
      id: "camp_1",
      status: "paused",
    });
    const user = userEvent.setup();
    render(<CampaignBanner />);
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(
      screen.getByText(/Pause stops new days/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm pause" }));
    await waitFor(() => {
      expect(pauseCampaign).toHaveBeenCalledWith("camp_1");
    });
  });
});
