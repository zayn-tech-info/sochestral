import Link from "next/link";
import { FileText, ImageIcon, Link2 } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";

const SETTINGS_LINKS = [
  {
    href: "/app/settings/profile",
    label: "Business profile",
    description: "Brand facts, tone, audience, and operator notes.",
    icon: FileText,
  },
  {
    href: "/app/settings/connectors",
    label: "Connected Accounts",
    description: "Social accounts Sochestral can safely work with.",
    icon: Link2,
  },
  {
    href: "/app/settings/brand-assets",
    label: "Brand Assets",
    description: "Logos, product shots, and reusable creative.",
    icon: ImageIcon,
  },
] as const;

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Manage your business profile and connected accounts."
    >
      <section className="settings-hub" aria-labelledby="settings-hub-title">
        <h1 id="settings-hub-title" className="sr-only">
          Settings
        </h1>
        <ul className="settings-hub-list">
          {SETTINGS_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className="settings-hub-card">
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="settings-hub-copy">
                    <span className="settings-hub-label">{item.label}</span>
                    <span className="settings-hub-desc">{item.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
