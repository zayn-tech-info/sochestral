import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiRequest,
  type ConnectorSummary,
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

beforeEach(() => {
  window.history.replaceState({}, "", "/app/settings/connectors");
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ connectors });
});

describe("ConnectorsSettings", () => {
  it("shows every platform on All with a Content type column (AC 4)", async () => {
    const user = userEvent.setup();
    render(<ConnectorsSettings />);

    expect(await screen.findByRole("tab", { name: /^All/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("heading", { name: "Threads" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "LinkedIn" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Instagram" }).length).toBeGreaterThan(0);

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Connector" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(within(table).getAllByText("Content")).toHaveLength(3);
    expect(within(table).getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Connect another" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Connected/ }));
    const connectedPanel = screen.getByRole("tabpanel");
    expect(within(connectedPanel).getByText("LinkedIn")).toBeInTheDocument();
    expect(within(connectedPanel).getByText(/@zayn/)).toBeInTheDocument();
    expect(within(connectedPanel).queryByText("Threads")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Not connected/ }));
    const openPanel = screen.getByRole("tabpanel");
    expect(within(openPanel).getByText("Threads")).toBeInTheDocument();
    expect(within(openPanel).getByText("Instagram")).toBeInTheDocument();
    expect(within(openPanel).queryByText("LinkedIn")).not.toBeInTheDocument();
  });

  it("reports an unavailable service but still lists every platform (AC 4, AC 6)", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    render(<ConnectorsSettings />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Connector status is unavailable");
    expect(alert).toHaveTextContent("have not been marked as disconnected");
    expect(screen.getAllByRole("heading", { name: "Threads" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "LinkedIn" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "Instagram" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("disconnected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Connected/ }));
    expect(
      within(screen.getByRole("tabpanel")).getByText(/No accounts connected yet/i),
    ).toBeInTheDocument();
  });

  it("keeps last known connected accounts when a refresh fails (AC 6)", async () => {
    const user = userEvent.setup();
    render(<ConnectorsSettings />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("tab", { name: /^Connected/ }));
    expect(
      within(screen.getByRole("tabpanel")).getByText(/@zayn/),
    ).toBeInTheDocument();

    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    window.dispatchEvent(new Event("focus"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Connector status is unavailable");
    expect(
      within(screen.getByRole("tabpanel")).getByText(/@zayn/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Connect another" }).length).toBeGreaterThan(0);
  });

  it("refreshes connector status when the window regains focus (AC 6)", async () => {
    render(<ConnectorsSettings />);
    await screen.findByRole("table");

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
    expect(screen.getByRole("tab", { name: /^Connected/ })).toHaveAttribute(
      "aria-selected",
      "true",
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
      if (path === "/connectors") return Promise.resolve({ connectors });
      return Promise.reject(new ApiError(502, "SOCIALMCP_UNAVAILABLE", {}));
    });
    render(<ConnectorsSettings />);
    await screen.findByRole("table");

    await user.click(screen.getAllByRole("button", { name: "Connect" })[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The connector service is unavailable. Nothing changed.",
    );
    expect(apiRequest).toHaveBeenLastCalledWith("/connectors/threads/connect", {
      method: "POST",
    });
  });
});
