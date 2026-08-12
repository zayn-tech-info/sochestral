import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Navbar } from "./navbar";

describe("Navbar", () => {
  it("exposes the product sections and real sign-in path", () => {
    render(<Navbar />);

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute(
      "href",
      "#hero",
    );
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#how-it-works-title",
    );
    expect(screen.getByRole("link", { name: "Platforms" })).toHaveAttribute(
      "href",
      "#integrations-title",
    );
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("opens and closes the mobile navigation", async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(
      screen.getByRole("button", { name: "Close navigation menu" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Start free" })).toHaveLength(2);

    await user.click(screen.getAllByRole("link", { name: "Product" })[1]);
    expect(
      screen.getByRole("button", { name: "Open navigation menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
