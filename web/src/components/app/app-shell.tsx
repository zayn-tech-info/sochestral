"use client";

import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";

/** @deprecated Prefer WorkspaceShell; kept as a thin adapter for existing call sites. */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <WorkspaceShell title={title} description={description} actions={actions}>
      {children}
    </WorkspaceShell>
  );
}
