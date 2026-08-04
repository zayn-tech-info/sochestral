import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiRequest,
  type ConnectorSummary,
  type PublishingPreference,
} from "@/lib/product-api";
import { ConnectorsSettings } from "./connectors-settings";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

vi.mock("./app-shell", () => ({
  AppShell: ({
    title,
    description,
    children,
  }: {
    title?: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

const connectors: ConnectorSummary[] = [
  { platform: "threads", state: "not_connected", accounts: [] },
  {
    platform: "linkedin_personal",
    state: "connected",
    accounts: [
      {
        id: "acct_1",
        username: "zayn",
        displayName: "Zayn",
        state: "connected",
      },
    ],
  },
  {
    platform: "instagram",
    state: "reconnect_required",
    accounts: [],
  },
];

const preference: PublishingPreference = {
  currentMode: "always_draft",
  effectiveMode: "always_draft",
  revision: 0,
  consentVersion: null,
  consentedAt: null,
  consentCurrent: false,
  policyVersion: "2026-08-01",
  enabled: false,
  authorityEventId: null,
};

function routeResponse(path: string) {
  if (path === "/publishing/preferences") return Promise.resolve(preference);
  return Promise.resolve({ connectors });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app/settings/connectors");
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation((path) => routeResponse(path));
});

describe("ConnectorsSettings", () => {
  it("shows every supported social and its public account state (AC 4)", async () => {
    render(<ConnectorsSettings />);

    expect(await screen.findByRole("heading", { name: "Threads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "LinkedIn Personal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByText("@zayn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect another" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
  });

  it("reports an unavailable service without calling accounts disconnected (AC 6)", async () => {
    vi.mocked(apiRequest).mockImplementation((path) =>
      path === "/publishing/preferences"
        ? Promise.resolve(preference)
        : Promise.reject(new Error("offline")),
    );
    render(<ConnectorsSettings />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Connector status is unavailable");
    expect(alert).toHaveTextContent("have not been marked as disconnected");
    expect(screen.queryByText("No account connected yet")).not.toBeInTheDocument();
  });

  it("refreshes connector status when the window regains focus (AC 6)", async () => {
    render(<ConnectorsSettings />);
    await screen.findByRole("heading", { name: "Threads" });

    window.dispatchEvent(new Event("focus"));

    await waitFor(() =>
      expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === "/connectors")).toHaveLength(2),
    );
  });

  it("shows a safe OAuth success result from known query values (AC 7)", async () => {
    window.history.replaceState(
      {},
      "",
      "/app/settings/connectors?result=connected&platform=threads",
    );
    render(<ConnectorsSettings />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Threads is connected.",
    );
  });

  it("does not echo an unsafe OAuth error code (AC 7)", async () => {
    window.history.replaceState(
      {},
      "",
      "/app/settings/connectors?result=error&code=%3Cscript%3E",
    );
    render(<ConnectorsSettings />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Connection was not completed. Try again when ready.");
    expect(alert).not.toHaveTextContent("script");
  });

  it("shows a stable safe error when SocialMCP cannot start OAuth (AC 5, AC 6)", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation((path) => {
      if (path === "/publishing/preferences") return Promise.resolve(preference);
      if (path === "/connectors") return Promise.resolve({ connectors });
      return Promise.reject(new ApiError(502, "SOCIALMCP_UNAVAILABLE", {}));
    });
    render(<ConnectorsSettings />);
    await screen.findByRole("heading", { name: "Threads" });

    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connector service is unavailable. Nothing changed.",
    );
    expect(apiRequest).toHaveBeenLastCalledWith("/connectors/threads/connect", {
      method: "POST",
    });
  });
});
