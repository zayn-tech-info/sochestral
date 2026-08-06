"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, Link2 } from "lucide-react";

import {
  apiRequest,
  type ConnectorSummary,
} from "@/lib/product-api";
import {
  SlideOverPanel,
  useWorkspacePanels,
} from "@/components/workspace/slide-over-panel";

function statusLabel(state: ConnectorSummary["state"]) {
  if (state === "connected") return "Live";
  if (state === "reconnect_required") return "Reconnect";
  return "Not connected";
}

function ConnectorsDrawerBody() {
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const { setOpenPanel } = useWorkspacePanels();

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

  if (unavailable) {
    return (
      <p className="os-context-placeholder" role="status">
        <CircleAlert className="size-3.5 inline" aria-hidden="true" /> Connector
        status unavailable
      </p>
    );
  }

  if (!connectors) {
    return (
      <p className="os-context-placeholder" role="status">
        Loading channels…
      </p>
    );
  }

  return (
    <div className="os-drawer-stack">
      <ul className="os-connector-mini">
        {connectors.map((connector) => (
          <li key={connector.platform}>
            <span className="os-connector-name">
              {connector.platform.replaceAll("_", " ")}
            </span>
            <span className={`os-status-pill os-status-${connector.state}`}>
              {statusLabel(connector.state)}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/app/settings/connectors"
        className="os-text-link"
        onClick={() => setOpenPanel(null)}
      >
        <Link2 className="size-3.5 inline" aria-hidden="true" /> Manage in
        Settings
      </Link>
    </div>
  );
}

export function WorkspaceDrawers() {
  return (
    <>
      <SlideOverPanel id="notifications">
        <p className="os-context-placeholder">
          Approvals and sync events will show here when notifications land.
        </p>
        <span className="os-soon-chip">Soon</span>
      </SlideOverPanel>
      <SlideOverPanel id="connectors">
        <ConnectorsDrawerBody />
      </SlideOverPanel>
      <SlideOverPanel id="schedule">
        <p className="os-context-placeholder">
          Scheduled posts will appear here when calendar lands.
        </p>
        <span className="os-soon-chip">Soon</span>
      </SlideOverPanel>
      <SlideOverPanel id="analytics">
        <p className="os-context-placeholder">
          Engagement trends arrive after publishing volume grows.
        </p>
        <span className="os-soon-chip">Soon</span>
      </SlideOverPanel>
      <SlideOverPanel id="activity">
        <p className="os-context-placeholder">
          Recent AI runs and tool activity will appear here.
        </p>
        <span className="os-soon-chip">Soon</span>
      </SlideOverPanel>
    </>
  );
}
