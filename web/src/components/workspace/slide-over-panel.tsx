"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { productMotion } from "@/components/app/product-motion-provider";
import { cn } from "@/lib/utils";

export type PanelId =
  | "notifications"
  | "connectors"
  | "schedule"
  | "analytics"
  | "activity"
  | null;

type PanelContextValue = {
  openPanel: PanelId;
  setOpenPanel: (id: PanelId) => void;
};

const PanelContext = createContext<PanelContextValue | null>(null);

export function useWorkspacePanels() {
  const value = useContext(PanelContext);
  if (!value) {
    throw new Error("useWorkspacePanels must be used within PanelProvider");
  }
  return value;
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const value = useMemo(
    () => ({ openPanel, setOpenPanel }),
    [openPanel],
  );
  return (
    <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
  );
}

const titles: Record<Exclude<PanelId, null>, string> = {
  notifications: "Notifications",
  connectors: "Connected accounts",
  schedule: "Schedule",
  analytics: "Analytics",
  activity: "AI activity",
};

export function SlideOverPanel({
  id,
  children,
  className,
}: {
  id: Exclude<PanelId, null>;
  children: ReactNode;
  className?: string;
}) {
  const { openPanel, setOpenPanel } = useWorkspacePanels();
  const reduceMotion = useReducedMotion();
  const open = openPanel === id;

  const onClose = useCallback(() => setOpenPanel(null), [setOpenPanel]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="os-drawer-root" role="presentation">
          <motion.button
            type="button"
            className="os-drawer-backdrop"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : productMotion.quick}
            onClick={onClose}
          />
          <motion.aside
            className={cn("os-drawer", className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`drawer-title-${id}`}
            initial={reduceMotion ? false : { x: 28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { x: 28, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : productMotion.enter}
          >
            <header className="os-drawer-header">
              <h2 id={`drawer-title-${id}`}>{titles[id]}</h2>
              <button
                type="button"
                className="os-icon-btn"
                onClick={onClose}
                aria-label={`Close ${titles[id]}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="os-drawer-body">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
