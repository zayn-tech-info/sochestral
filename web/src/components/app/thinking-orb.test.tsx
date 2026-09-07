import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingOrb } from "./thinking-orb";

const motionMocks = vi.hoisted(() => ({ reduce: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionMocks.reduce,
  };
});

describe("ThinkingOrb", () => {
  beforeEach(() => {
    motionMocks.reduce = false;
  });

  it("renders a decorative ribbon orb", () => {
    const { getByTestId } = render(<ThinkingOrb />);
    const orb = getByTestId("thinking-orb");
    expect(orb).toHaveAttribute("aria-hidden", "true");
    expect(orb.querySelector("svg")).not.toBeNull();
    expect(orb).not.toHaveClass("thinking-orb-static");
  });

  it("freezes spin when motion is reduced", () => {
    motionMocks.reduce = true;
    const { getByTestId } = render(<ThinkingOrb />);
    expect(getByTestId("thinking-orb")).toHaveClass("thinking-orb-static");
  });
});
