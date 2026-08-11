"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

import { productMotion } from "@/components/app/product-motion-provider";

export type ToastTone = "success" | "error";

export type ToastInput = {
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  durationMs: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  error: 6000,
};

let toastId = 0;
function nextId() {
  toastId += 1;
  return `toast_${toastId}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId();
      const durationMs =
        input.durationMs ?? DEFAULT_DURATION[input.tone] ?? DEFAULT_DURATION.success;
      const item: ToastItem = {
        id,
        tone: input.tone,
        title: input.title,
        description: input.description,
        durationMs,
      };
      setItems((current) => {
        const next = [...current, item];
        if (next.length <= MAX_TOASTS) return next;
        const dropped = next.slice(0, next.length - MAX_TOASTS);
        for (const old of dropped) {
          const timer = timers.current.get(old.id);
          if (timer) {
            clearTimeout(timer);
            timers.current.delete(old.id);
          }
        }
        return next.slice(-MAX_TOASTS);
      });
      if (durationMs > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), durationMs),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="app-toast-viewport" aria-live="polite" aria-relevant="additions text">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              className={`app-toast app-toast-${item.tone}`}
              role={item.tone === "error" ? "alert" : "status"}
              aria-live={item.tone === "error" ? "assertive" : "polite"}
              layout={reduceMotion ? undefined : true}
              initial={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
              }
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }
              }
              transition={reduceMotion ? { duration: 0 } : productMotion.enter}
              onClick={() => dismiss(item.id)}
            >
              <div className="app-toast-body">
                <p className="app-toast-title">{item.title}</p>
                {item.description ? (
                  <p className="app-toast-description">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="app-toast-dismiss"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation();
                  dismiss(item.id);
                }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
