import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/product-api";
import { ChannelsSettings } from "./channels-settings";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({
    status: "unlinked",
    displayKey: null,
    linkedAt: null,
  });
});

describe("ChannelsSettings", () => {
  it("shows WhatsApp unlinked state and starts a link (AC-2)", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path === "/channels/whatsapp" && !init?.method) {
        return {
          status: "unlinked",
          displayKey: null,
          linkedAt: null,
        };
      }
      if (path === "/channels/whatsapp/link" && init?.method === "POST") {
        return {
          deepLink: "http://localhost:3000/app/settings/channels/whatsapp?token=abc",
          waMeUrl: "https://wa.me/?text=LINK%20abc",
          expiresAt: "2026-08-09T16:00:00.000Z",
          instructions: "Send LINK",
          token: "abc",
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<ChannelsSettings />);
    expect(await screen.findByRole("heading", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByText("Not linked")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start WhatsApp link" }));
    await waitFor(() => {
      expect(screen.getByText(/LINK abc/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: /Open WhatsApp with prefilled LINK/i }),
    ).toHaveAttribute("href", "https://wa.me/?text=LINK%20abc");
  });

  it("offers unlink when WhatsApp is active", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      status: "active",
      displayKey: "••••4567",
      linkedAt: "2026-08-09T12:00:00.000Z",
    });
    render(<ChannelsSettings />);
    expect(await screen.findByText(/Linked · ••••4567/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unlink WhatsApp" }),
    ).toBeInTheDocument();
  });
});
