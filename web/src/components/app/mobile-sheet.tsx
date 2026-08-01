"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";

import { productMotion } from "./product-motion-provider";

export function MobileSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="app-sheet-dialog m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-foreground lg:hidden"
      aria-labelledby="navigation-sheet-title"
      data-open={open}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        initial={{ x: "-100%" }}
        animate={{ x: open ? 0 : "-100%" }}
        transition={productMotion.sheet}
        onAnimationComplete={() => {
          const dialog = dialogRef.current;
          if (!open && dialog?.open) dialog.close();
        }}
        className="app-sheet start-0"
      >
        <header className="flex min-h-16 items-center justify-between border-b border-border px-4">
          <h2 id="navigation-sheet-title" className="font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            aria-label={`Close ${title}`}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </motion.section>
    </dialog>
  );
}
