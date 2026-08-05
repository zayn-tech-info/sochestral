"use client";

import type { ReactNode } from "react";

import { DashboardPreview } from "@/components/auth/dashboard-preview";
import { cn } from "@/lib/utils";

type AuthLayoutProps = {
  children: ReactNode;
  className?: string;
};

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <main id="main-content" className={cn("login-page auth-page", className)}>
      <a href="#login-form" className="skip-link">
        Skip to sign in
      </a>

      <section
        className="auth-preview-pane"
        aria-label="Product workspace preview"
      >
        <div className="auth-preview-copy">
          <p className="auth-eyebrow">Intelligent social workspace</p>
          <h2 className="auth-preview-heading">
            Plan, draft, and publish with AI that stays out of the way.
          </h2>
          <p className="auth-preview-subcopy">
            One calm surface for calendars, connectors, and approvals.
          </p>
        </div>
        <DashboardPreview />
      </section>

      <section className="auth-form-pane" aria-labelledby="sign-in-title">
        {children}
      </section>
    </main>
  );
}
