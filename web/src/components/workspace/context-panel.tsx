"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CircleAlert,
  Link2,
  TrendingUp,
} from "lucide-react";

import {
  apiRequest,
  type ConnectorSummary,
} from "@/lib/product-api";

function statusLabel(state: ConnectorSummary["state"]) {
  if (state === "connected") return "Live";
  if (state === "reconnect_required") return "Reconnect";
  return "Not connected";
}

export function ContextPanel() {
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ connectors: ConnectorSummary[] }>("/connectors")
      .then((result) => {
        if (!active) return;
        setConnectors(result.connectors);
        setUnavailable(false);
      })
      .catch(() => {
        if (!active) return;
        setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const connectedCount =
    connectors?.filter((item) => item.state === "connected").length ?? 0;

  return (
    <aside className="os-context" aria-label="Workspace context">
      <section className="os-context-card">
        <div className="os-context-header">
          <p className="os-context-label">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Today&apos;s schedule
          </p>
          <span className="os-soon-chip">Soon</span>
        </div>
        <p className="os-context-placeholder">
          Scheduled posts will appear here when calendar lands.
        </p>
      </section>

      <section className="os-context-card">
        <div className="os-context-header">
          <p className="os-context-label">
            <Link2 className="size-3.5" aria-hidden="true" />
            Connected accounts
          </p>
          <Link href="/app/settings/connectors" className="os-text-link">
            Manage
          </Link>
        </div>
        {unavailable ? (
          <p className="os-context-placeholder" role="status">
            <CircleAlert className="size-3.5 inline" aria-hidden="true" />{" "}
            Connector status unavailable
          </p>
        ) : connectors === null ? (
          <p className="os-context-placeholder" role="status">
            Loading channels…
          </p>
        ) : (
          <>
            <p className="os-context-metric">
              {connectedCount}{" "}
              <span>live channel{connectedCount === 1 ? "" : "s"}</span>
            </p>
            <ul className="os-connector-mini">
              {connectors.map((connector) => (
                <li key={connector.platform}>
                  <span className="os-connector-name">
                    {connector.platform.replaceAll("_", " ")}
                  </span>
                  <span
                    className={`os-status-pill os-status-${connector.state}`}
                  >
                    {statusLabel(connector.state)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="os-context-card">
        <div className="os-context-header">
          <p className="os-context-label">
            <TrendingUp className="size-3.5" aria-hidden="true" />
            Analytics snapshot
          </p>
          <span className="os-soon-chip">Soon</span>
        </div>
        <p className="os-context-placeholder">
          Engagement trends arrive after publishing volume grows.
        </p>
      </section>

      <section className="os-context-card">
        <div className="os-context-header">
          <p className="os-context-label">
            <Bell className="size-3.5" aria-hidden="true" />
            Notifications
          </p>
          <span className="os-soon-chip">Soon</span>
        </div>
        <p className="os-context-placeholder">
          Approvals and sync events will show here.
        </p>
      </section>
    </aside>
  );
}
