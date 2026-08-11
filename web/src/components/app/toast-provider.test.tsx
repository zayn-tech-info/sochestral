import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./toast-provider";

function Probe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useToast>) => void;
}) {
  const api = useToast();
  onReady(api);
  return null;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a success toast and auto-dismisses", async () => {
    let api: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Probe onReady={(value) => {
          api = value;
        }}
        />
      </ToastProvider>,
    );

    act(() => {
      api!.toast({ tone: "success", title: "Saved cleanly." });
    });

    expect(screen.getByRole("status")).toHaveTextContent("Saved cleanly.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an error toast with assertive alert role", () => {
    let api: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Probe onReady={(value) => {
          api = value;
        }}
        />
      </ToastProvider>,
    );

    act(() => {
      api!.toast({ tone: "error", title: "Could not save." });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save.");
  });

  it("keeps only the latest three toasts", () => {
    let api: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Probe onReady={(value) => {
          api = value;
        }}
        />
      </ToastProvider>,
    );

    act(() => {
      api!.toast({ tone: "success", title: "One", durationMs: 60_000 });
      api!.toast({ tone: "success", title: "Two", durationMs: 60_000 });
      api!.toast({ tone: "success", title: "Three", durationMs: 60_000 });
      api!.toast({ tone: "success", title: "Four", durationMs: 60_000 });
    });

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(3);
    expect(statuses.map((node) => node.textContent).join(" ")).toContain("Two");
    expect(statuses.map((node) => node.textContent).join(" ")).toContain("Four");
    expect(statuses.map((node) => node.textContent).join(" ")).not.toContain("One");
  });

  it("dismisses when the close button is pressed", async () => {
    vi.useRealTimers();
    let api: ReturnType<typeof useToast> | null = null;
    render(
      <ToastProvider>
        <Probe onReady={(value) => {
          api = value;
        }}
        />
      </ToastProvider>,
    );

    act(() => {
      api!.toast({ tone: "error", title: "Dismiss me", durationMs: 60_000 });
    });

    await userEvent.click(screen.getByLabelText("Dismiss notification"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
