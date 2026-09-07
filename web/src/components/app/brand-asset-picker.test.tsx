import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SlashCommandMenu,
  applySlashCommand,
  detectBrandAssetSlash,
  detectSlashQuery,
  matchingSlashCommands,
  stripBrandAssetSlash,
} from "./brand-asset-picker";

describe("slash command helpers", () => {
  it("detects a trailing slash query including a lone /", () => {
    expect(detectSlashQuery("/")).toEqual({ query: "", from: 0 });
    expect(detectSlashQuery("Make a flyer /br")).toEqual({
      query: "br",
      from: "Make a flyer ".length,
    });
    expect(detectSlashQuery("cost is 5/hour")).toBeNull();
    expect(detectSlashQuery("https://example.com")).toBeNull();
  });

  it("matches Brand assets as the user types / or /brand", () => {
    expect(matchingSlashCommands("").map((item) => item.id)).toEqual([
      "brand-asset",
    ]);
    expect(matchingSlashCommands("br").map((item) => item.id)).toEqual([
      "brand-asset",
    ]);
    expect(matchingSlashCommands("brand").map((item) => item.id)).toEqual([
      "brand-asset",
    ]);
    expect(matchingSlashCommands("zzz")).toEqual([]);
  });

  it("completes the /brand-asset token from a partial slash", () => {
    expect(applySlashCommand("/", "/brand-asset")).toBe("/brand-asset ");
    expect(applySlashCommand("Flyer /br", "/brand-asset")).toBe(
      "Flyer /brand-asset ",
    );
    expect(detectBrandAssetSlash("/brand-asset ")).toBe(true);
    expect(stripBrandAssetSlash("Flyer /brand-asset now")).toBe("Flyer now");
  });
});

describe("SlashCommandMenu", () => {
  it("lets the user click Brand assets", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SlashCommandMenu
        open
        commands={matchingSlashCommands("")}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole("option", { name: /brand assets/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "brand-asset" }),
    );
  });
});
