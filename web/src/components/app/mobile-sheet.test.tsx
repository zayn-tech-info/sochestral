import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileSheet } from "./mobile-sheet";

describe("MobileSheet", () => {
  it("opens an accessible dialog with a named close control (AC 9)", () => {
    render(
      <MobileSheet open title="Navigation" onClose={vi.fn()}>
        Workspace links
      </MobileSheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Navigation" })).toBeInTheDocument();
  });

  it("requests close from the named close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MobileSheet open title="Navigation" onClose={onClose}>
        Workspace links
      </MobileSheet>,
    );

    await user.click(screen.getByRole("button", { name: "Close Navigation" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
