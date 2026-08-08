import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "./workspace-shell";

const mocks = vi.hoisted(() => ({
  authLoading: true,
  pathname: "/app/workspace",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/components/app/workspace-provider", () => ({
  useWorkspace: () => ({
    authLoading: mocks.authLoading,
    user: mocks.authLoading
      ? null
      : { id: "user_1", email: "dev@example.com" },
    conversations: [],
    conversationsLoading: false,
  }),
}));

vi.mock("@/components/workspace/side-nav", () => ({
  SideNav: () => <nav aria-label="Workspace navigation">Nav</nav>,
}));

vi.mock("@/components/workspace/workspace-top-bar", () => ({
  WorkspaceTopBar: () => <div>Top bar</div>,
}));

vi.mock("@/components/workspace/workspace-drawers", () => ({
  WorkspaceDrawers: () => null,
}));

vi.mock("@/components/workspace/slide-over-panel", () => ({
  PanelProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspacePanels: () => ({ setOpenPanel: vi.fn() }),
}));

vi.mock("@/components/app/mobile-sheet", () => ({
  MobileSheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@/components/app/brand", () => ({
  Brand: () => <span>Brand</span>,
}));

vi.mock("motion/react", () => ({
  motion: {
    main: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => (
      <main {...props}>{children}</main>
    ),
    aside: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => (
      <aside {...props}>{children}</aside>
    ),
  },
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

describe("WorkspaceShell", () => {
  beforeEach(() => {
    mocks.authLoading = true;
    mocks.pathname = "/app/workspace";
  });

  it("does not render the branded opening splash while auth loads", () => {
    render(
      <WorkspaceShell>
        <p>Workspace body</p>
      </WorkspaceShell>,
    );

    expect(screen.queryByText("Opening your workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace body")).not.toBeInTheDocument();
    expect(document.querySelector(".app-loading")).toBeNull();

    const frame = document.querySelector(".os-frame");
    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Open navigation")).toBeDisabled();
  });

  it("mounts page children after auth resolves", () => {
    mocks.authLoading = false;
    render(
      <WorkspaceShell>
        <p>Workspace body</p>
      </WorkspaceShell>,
    );

    expect(screen.getByText("Workspace body")).toBeInTheDocument();
    expect(document.querySelector(".os-frame")).not.toHaveAttribute(
      "aria-busy",
    );
  });
});
