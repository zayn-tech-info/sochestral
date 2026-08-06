import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/app/workspace"
      className={cn(
        "inline-flex min-h-11 items-center gap-3 rounded-xl px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact && "gap-2",
      )}
      aria-label="Sochestral home"
    >
      <span className="brand-mark" aria-hidden="true">
        S
      </span>
      {!compact ? (
        <span className="text-base font-semibold tracking-[-0.025em]">
          Sochestral
        </span>
      ) : null}
    </Link>
  );
}
