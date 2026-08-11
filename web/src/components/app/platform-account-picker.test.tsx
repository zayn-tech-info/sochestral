import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PlatformAccountPicker } from "./platform-account-picker";
import type { CalendarAccount } from "@/lib/product-api";

const accounts: CalendarAccount[] = [
  {
    id: "acct_t1",
    platform: "threads",
    label: "Brand One",
    username: "brand1",
    avatarHint: null,
  },
  {
    id: "acct_t2",
    platform: "threads",
    label: "Brand Two",
    username: "brand2",
    avatarHint: null,
  },
  {
    id: "acct_li",
    platform: "linkedin_personal",
    label: "Person",
    username: "person@example.com",
    avatarHint: null,
  },
];

describe("PlatformAccountPicker", () => {
  it("opens a popover and toggles multi-select for a platform", () => {
    const onChange = vi.fn();
    render(
      <PlatformAccountPicker
        accounts={accounts}
        selectedAccountIds={[]}
        onChange={onChange}
        mode="target"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Threads/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /Threads accounts/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Brand One/i));
    expect(onChange).toHaveBeenCalledWith(["acct_t1"]);
  });

  it("toggles a single-account platform immediately in filter mode", () => {
    const onChange = vi.fn();
    render(
      <PlatformAccountPicker
        accounts={accounts}
        selectedAccountIds={[]}
        onChange={onChange}
        mode="filter"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /LinkedIn/i }),
    );
    expect(onChange).toHaveBeenCalledWith(["acct_li"]);
    expect(
      screen.queryByRole("dialog", { name: /LinkedIn accounts/i }),
    ).not.toBeInTheDocument();
  });
});
