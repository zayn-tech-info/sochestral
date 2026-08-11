import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  InstagramMediaCarousel,
  LinkedInMediaCollage,
  ThreadsMediaStrip,
} from "./preview-media";

const images = [
  "https://cdn.example/a.jpg",
  "https://cdn.example/b.jpg",
  "https://cdn.example/c.jpg",
  "https://cdn.example/d.jpg",
];

function imgSrcs(container: HTMLElement) {
  return Array.from(container.querySelectorAll("img")).map((img) =>
    img.getAttribute("src"),
  );
}

describe("preview media layouts", () => {
  it("shows two Threads images and pages when there are more", () => {
    const { container } = render(<ThreadsMediaStrip images={images} />);
    expect(imgSrcs(container)).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(imgSrcs(container)).toEqual([
      "https://cdn.example/b.jpg",
      "https://cdn.example/c.jpg",
    ]);
  });

  it("carousels Instagram one frame at a time", () => {
    const { container } = render(
      <div className="pp-instagram-stage">
        <InstagramMediaCarousel images={images.slice(0, 3)} />
      </div>,
    );
    expect(imgSrcs(container)).toEqual(["https://cdn.example/a.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(imgSrcs(container)).toEqual(["https://cdn.example/b.jpg"]);
  });

  it("collates LinkedIn up to four and focuses on click", () => {
    const { container } = render(<LinkedInMediaCollage images={images} />);
    expect(screen.getAllByRole("button", { name: /View image/i })).toHaveLength(
      4,
    );
    fireEvent.click(screen.getByRole("button", { name: "View image 2 of 4" }));
    expect(imgSrcs(container)).toEqual(["https://cdn.example/b.jpg"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByRole("button", { name: /View image/i })).toHaveLength(
      4,
    );
  });
});
