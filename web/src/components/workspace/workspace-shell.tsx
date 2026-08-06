"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { motion } from "motion/react";

import { Brand } from "@/components/app/brand";
import { MobileSheet } from "@/components/app/mobile-sheet";
import { productMotion } from "@/components/app/product-motion-provider";
import { useWorkspace } from "@/components/app/workspace-provider";
import { SideNav } from "@/components/workspace/side-nav";
import {
  PanelProvider,
} from "@/components/workspace/slide-over-panel";
import { WorkspaceDrawers } from "@/components/workspace/workspace-drawers";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import { cn } from "@/lib/utils";

export function WorkspaceShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** @deprecated Right rail removed; kept for call-site compatibility. */
  showContext?: boolean;
}) {
  const pathname = usePathname();
  const { authLoading } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);
  const isStudio =
    pathname === "/app" ||
    pathname === "/app/workspace" ||
    pathname.startsWith("/app/chat/");

  if (authLoading) {
    return (
      <main id="main-content" className="app-loading" role="status">
        <Brand />
        <span>Opening your workspace</span>
      </main>
    );
  }

  return (
    <PanelProvider>
      <div className="app-frame os-frame os-frame-v2">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <SideNav />

        <div className="os-center">
          <header className="os-mobile-header">
            <button
              type="button"
              className="os-icon-btn"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <Brand compact />
            <span className="size-11" aria-hidden="true" />
          </header>

          <div className="os-topbar-wrap">
            <WorkspaceTopBar />
          </div>

          <motion.main
            key={pathname}
            id="main-content"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={productMotion.enter}
            className={cn(
              "os-main",
              isStudio && "os-main-studio",
              pathname.startsWith("/app/chat/") && "os-main-chat",
            )}
          >
            {title ? (
              <header className="os-page-heading">
                <div>
                  <h1>{title}</h1>
                  {description ? <p>{description}</p> : null}
                </div>
                {actions ? (
                  <div className="os-page-actions">{actions}</div>
                ) : null}
              </header>
            ) : null}
            {children}
          </motion.main>
        </div>

        <WorkspaceDrawers />

        <MobileSheet
          open={navOpen}
          title="Navigation"
          onClose={() => setNavOpen(false)}
        >
          <SideNav expanded onNavigate={() => setNavOpen(false)} />
        </MobileSheet>
      </div>
    </PanelProvider>
  );
}
