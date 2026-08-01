import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, forwardRef, type ElementType, type ReactNode } from "react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

vi.mock("motion/react", () => {
  const componentCache = new Map<PropertyKey, ElementType>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: PropertyKey) => {
        const cached = componentCache.get(tag);
        if (cached) return cached;
        const component = forwardRef<HTMLElement, Record<string, unknown>>(function MotionElement(
          props,
          ref,
        ) {
          const domProps = { ...props };
          for (const key of [
            "animate",
            "exit",
            "initial",
            "layoutId",
            "onAnimationComplete",
            "transition",
          ]) {
            delete domProps[key];
          }
          return createElement(String(tag), { ...domProps, ref });
        });
        componentCache.set(tag, component);
        return component;
      },
    },
  );

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    MotionConfig: ({ children }: { children: ReactNode }) => children,
    motion,
    useReducedMotion: () => true,
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
});

Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  },
});
