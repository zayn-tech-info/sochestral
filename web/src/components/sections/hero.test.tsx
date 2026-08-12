import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Hero } from "./hero";

describe("Hero", () => {
  it("states the shipped product promise and routes to the beta", () => {
    render(<Hero />);

    expect(
      screen.getByRole("heading", {
        name: /your business moves fast/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drafts, schedules, and approved posts/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start free beta/i }),
    ).toHaveAttribute("href", "/login");
    expect(screen.getAllByText("Review before publish")).not.toHaveLength(0);
  });

  it("moves a scheduled post with the keyboard and announces its new day", () => {
    render(<Hero />);

    const launchPost = screen.getByRole("button", {
      name: /launch progress, linkedin, tuesday/i,
    });

    fireEvent.keyDown(launchPost, { key: "ArrowRight" });

    expect(
      screen.getByRole("button", {
        name: /launch progress, linkedin, wednesday/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Launch progress moved to Wednesday.")).toBeInTheDocument();
  });

  it("resets the interactive schedule", async () => {
    const user = userEvent.setup();
    render(<Hero />);

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: /launch progress, linkedin, tuesday/i,
      }),
      { key: "ArrowRight" },
    );
    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(
      screen.getByRole("button", {
        name: /launch progress, linkedin, tuesday/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule preview reset.")).toBeInTheDocument();
  });
});
