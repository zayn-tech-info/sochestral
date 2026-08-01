import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageMarkdown } from "./message-markdown";

describe("MessageMarkdown", () => {
  it("renders emphasis, lists, and links as readable content (AC 3)", () => {
    render(
      <MessageMarkdown
        content={"A **safe preview**:\n\n- First item\n- [Details](https://example.com)"}
      />,
    );

    expect(screen.getByText("safe preview").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("presents markdown headings without oversized heading levels", () => {
    render(<MessageMarkdown content="# Preview ready" />);

    expect(screen.getByText("Preview ready").tagName).toBe("STRONG");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("does not render raw HTML or markdown images (AC 3)", () => {
    const { container } = render(
      <MessageMarkdown
        content={'<script>alert("token")</script>\n\n![secret](https://example.com/token.png)'}
      />,
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
