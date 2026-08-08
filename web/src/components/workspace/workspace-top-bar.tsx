"use client";

import Link from "next/link";
import { Bell, Plus } from "lucide-react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { HoverDetails } from "@/components/workspace/hover-details";
import { useWorkspacePanels } from "@/components/workspace/slide-over-panel";

export function WorkspaceTopBar() {
  const { user } = useWorkspace();
  const { setOpenPanel } = useWorkspacePanels();

  return (
    <header className="os-topbar os-topbar-slim">
      <div className="os-topbar-actions">
        <Link href="/app/workspace" className="os-quick-create">
          <Plus className="size-4" aria-hidden="true" />
          Quick create
        </Link>
        <HoverDetails label="Notifications" side="bottom">
          <button
            type="button"
            className="os-icon-btn"
            onClick={() => setOpenPanel("notifications")}
            aria-label="Open notifications"
          >
            <Bell className="size-4" aria-hidden="true" />
          </button>
        </HoverDetails>
        <HoverDetails label={user?.email ?? "Profile"} side="bottom">
          <button
            type="button"
            className="os-profile-chip"
            onClick={() => setOpenPanel("connectors")}
            aria-label="Open workspace profile panel"
          >
            {(user?.email?.[0] ?? "S").toUpperCase()}
          </button>
        </HoverDetails>
      </div>
    </header>
  );
}
