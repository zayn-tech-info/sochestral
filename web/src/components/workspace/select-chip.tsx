"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";

import { productMotion } from "@/components/app/product-motion-provider";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectChipProps = {
  label: string;
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
  title?: string;
  className?: string;
  align?: "start" | "end";
  /** Prefer "top" when the control sits at the bottom of the viewport (composer). */
  placement?: "bottom" | "top";
};

export function SelectChip({
  label,
  icon,
  value,
  onChange,
  options,
  disabled = false,
  title,
  className,
  align = "start",
  placement = "bottom",
}: SelectChipProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const selected =
    options.find((option) => option.value === value) ?? options[0];
  const opensUp = placement === "top";

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn("os-select-chip", open && "os-select-chip-open", className)}
      title={title}
    >
      <motion.button
        type="button"
        className="os-select-chip-trigger"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
        whileHover={
          reduceMotion || disabled ? undefined : { y: -1, scale: 1.015 }
        }
        whileTap={reduceMotion || disabled ? undefined : { scale: 0.96 }}
        transition={productMotion.press}
      >
        {icon ? (
          <span className="os-select-chip-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="os-select-chip-value">{selected?.label}</span>
        <motion.span
          className="os-select-chip-caret-wrap"
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 28 }
          }
        >
          <ChevronDown className="os-select-chip-caret size-3.5" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              "os-select-menu",
              align === "end" && "os-select-menu-end",
              opensUp && "os-select-menu-up",
            )}
            style={{
              transformOrigin: opensUp ? "50% 100%" : "50% 0%",
            }}
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: opensUp ? 12 : -12,
                    scale: 0.94,
                    filter: "blur(4px)",
                  }
            }
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              filter: "blur(0px)",
            }}
            exit={
              reduceMotion
                ? undefined
                : {
                    opacity: 0,
                    y: opensUp ? 8 : -8,
                    scale: 0.96,
                    filter: "blur(2px)",
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    ...productMotion.menu,
                    opacity: productMotion.menuExit,
                    filter: productMotion.menuExit,
                  }
            }
          >
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <motion.li
                  key={option.value}
                  role="presentation"
                  initial={
                    reduceMotion
                      ? false
                      : { opacity: 0, y: opensUp ? 6 : -6 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          ...productMotion.quick,
                          delay: 0.03 + index * 0.035,
                        }
                  }
                >
                  <motion.button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "os-select-option",
                      active && "os-select-option-active",
                    )}
                    onClick={() => choose(option.value)}
                    whileHover={reduceMotion ? undefined : { x: 2 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                    transition={productMotion.press}
                  >
                    <span className="os-select-option-copy">
                      <strong>{option.label}</strong>
                      {option.description ? (
                        <small>{option.description}</small>
                      ) : null}
                    </span>
                    {active ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : null}
                  </motion.button>
                </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
