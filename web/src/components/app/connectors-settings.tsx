"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  apiRequest,
  type ConnectorPlatform,
  type ConnectorSummary,
} from "@/lib/product-api";
import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import { AppShell } from "./app-shell";
import { productMotion } from "./product-motion-provider";
import { useToast } from "./toast-provider";

const labels: Record<ConnectorPlatform, string> = {
  threads: "Threads",
  linkedin_personal: "LinkedIn",
  instagram: "Instagram",
};

const EMPTY_CONNECTORS: ConnectorSummary[] = [
  { platform: "threads", state: "not_connected", accounts: [] },
  { platform: "linkedin_personal", state: "not_connected", accounts: [] },
  { platform: "instagram", state: "not_connected", accounts: [] },
];

const CONNECTOR_TYPE = "Content";

type ConnectorTab = "all" | "connected" | "not_connected";

function PlatformGlyph({
  platform,
  size = "md",
}: {
  platform: ConnectorPlatform;
  size?: "sm" | "md";
}) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;

  return (
    <span
      className={`connector-brand connector-brand-${platform} connector-brand-${size}`}
      aria-hidden="true"
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}

function isConnected(connector: ConnectorSummary) {
  return connector.accounts.length > 0 || connector.state === "connected";
}

function connectLabel(connector: ConnectorSummary) {
  if (connector.state === "not_connected") return "Connect";
  if (connector.state === "reconnect_required") return "Reconnect";
  return "Connect another";
}

function formatAccountLabel(account: ConnectorSummary["accounts"][number]) {
  const name =
    account.displayName ?? account.username ?? "Connected account";
  const handle = account.username ? `@${account.username}` : null;
  return handle ? `${name} · ${handle}` : name;
}

function ConnectorAccountList({
  accounts,
}: {
  accounts: ConnectorSummary["accounts"];
}) {
  if (accounts.length === 0) return null;
  return (
    <ul className="connector-account-list">
      {accounts.map((account) => (
        <li key={account.id} className="connector-account-item">
          <span className="connector-account-name">
            {formatAccountLabel(account)}
          </span>
          {account.state === "reconnect_required" ? (
            <span className="connector-account-state">Reconnect required</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ConnectorsSettings() {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(
    null,
  );
  const [tab, setTab] = useState<ConnectorTab>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [connecting, setConnecting] = useState<ConnectorPlatform | null>(
    null,
  );

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await apiRequest<{ connectors: ConnectorSummary[] }>(
        "/connectors",
      );
      setConnectors(result.connectors);
      setUnavailable(false);
    } catch {
      setConnectors((prev) => prev ?? EMPTY_CONNECTORS);
      setUnavailable(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result = query.get("result");
    const platform = query.get("platform");
    const rawCode = query.get("code");
    const code =
      rawCode && /^[A-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : null;
    const knownPlatform =
      platform === "threads" ||
      platform === "linkedin_personal" ||
      platform === "instagram"
        ? platform
        : null;
    if (result === "connected" && knownPlatform) {
      toast({
        tone: "success",
        title: `${labels[knownPlatform]} is connected.`,
      });
      setTab("connected");
    } else if (result === "error") {
      toast({
        tone: "error",
        title: code
          ? `Connection was not completed (${code}). Try again when ready.`
          : "Connection was not completed. Try again when ready.",
      });
    }
    void refresh();

    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, toast]);

  const allConnectors = connectors ?? [];
  const connected = useMemo(
    () => allConnectors.filter((item) => isConnected(item)),
    [allConnectors],
  );
  const notConnected = useMemo(
    () => allConnectors.filter((item) => !isConnected(item)),
    [allConnectors],
  );
  const visible = useMemo(() => {
    if (tab === "connected") return connected;
    if (tab === "not_connected") return notConnected;
    return allConnectors;
  }, [tab, connected, notConnected, allConnectors]);

  async function connect(platform: ConnectorPlatform) {
    setConnecting(platform);
    try {
      const result = await apiRequest<{
        authorizeUrl: string;
      }>(`/connectors/${platform}/connect`, { method: "POST" });
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      toast({
        tone: "error",
        title:
          error instanceof ApiError && error.code === "SOCIALMCP_UNAVAILABLE"
            ? "The connector service is unavailable. Nothing changed."
            : "Connection could not start safely. Please try again.",
      });
      setConnecting(null);
    }
  }

  return (
    <AppShell
      title="Connected accounts"
      description="Choose the social accounts Sochestral can safely work with."
    >
      <section
        className="settings-content os-settings connectors-page"
        aria-labelledby="connectors-title"
      >
        <AnimatePresence initial={false}>
          {unavailable ? (
            <motion.div
              key="connectors-unavailable"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={productMotion.enter}
              className="service-unavailable"
              role="alert"
            >
              <CircleAlert className="size-5" aria-hidden="true" />
              <div>
                <strong>Connector status is unavailable</strong>
                <p>
                  We could not reach SocialMCP. Existing accounts have not been
                  marked as disconnected.
                </p>
              </div>
              <button type="button" onClick={() => void refresh(true)}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Retry
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="connector-heading">
          <div>
            <h2 id="connectors-title">Connectors</h2>
            <p>
              Link platforms with their real accounts, then keep publishing in
              review.
            </p>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={() => void refresh(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        {loading && !connectors ? (
          <div className="connector-featured connector-skeletons" role="status">
            <span className="sr-only">Loading connectors</span>
            {[0, 1, 2].map((item) => (
              <div key={item} />
            ))}
          </div>
        ) : (
          <ul className="connector-featured" aria-label="Supported platforms">
            {allConnectors.map((connector, index) => (
              <motion.li
                key={`featured-${connector.platform}`}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...productMotion.enter,
                  delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.12),
                }}
                className="connector-featured-card"
              >
                <PlatformGlyph platform={connector.platform} />
                <div className="connector-featured-copy">
                  <h3>{labels[connector.platform]}</h3>
                  {isConnected(connector) ? (
                    connector.accounts.length > 0 ? (
                      <ConnectorAccountList accounts={connector.accounts} />
                    ) : (
                      <p>Connected</p>
                    )
                  ) : (
                    <p>Type · {CONNECTOR_TYPE}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="connect-button connect-button-compact"
                  onClick={() => void connect(connector.platform)}
                  disabled={connecting !== null}
                >
                  {connecting === connector.platform ? (
                    <RefreshCw
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {connectLabel(connector)}
                </button>
              </motion.li>
            ))}
          </ul>
        )}

        <div
          className="connector-tabs"
          role="tablist"
          aria-label="Connector views"
        >
          {(
            [
              ["all", "All", allConnectors.length],
              ["connected", "Connected", connected.length],
              ["not_connected", "Not connected", notConnected.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`connectors-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="connectors-panel"
              className={`connector-tab${tab === id ? " connector-tab-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="connector-tab-count">{count}</span>
            </button>
          ))}
        </div>

        <div
          id="connectors-panel"
          role="tabpanel"
          aria-labelledby={`connectors-tab-${tab}`}
        >
          {loading && !connectors ? (
            <div className="connector-table-skeleton" role="status">
              <span className="sr-only">Loading connector list</span>
            </div>
          ) : visible.length === 0 ? (
            <div className="connector-empty" role="status">
              {tab === "connected" ? (
                <p>No accounts connected yet. Open All to link one.</p>
              ) : (
                <p>Every supported platform is already connected.</p>
              )}
            </div>
          ) : (
            <div className="connector-table-wrap">
              <table className="connector-table">
                <thead>
                  <tr>
                    <th scope="col">Connector</th>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((connector) => {
                    const linked = isConnected(connector);
                    return (
                      <tr key={connector.platform}>
                        <td>
                          <div className="connector-table-name">
                            <PlatformGlyph
                              platform={connector.platform}
                              size="sm"
                            />
                            <div>
                              <span className="connector-table-title">
                                {labels[connector.platform]}
                              </span>
                              {linked && connector.accounts.length > 0 ? (
                                <ConnectorAccountList
                                  accounts={connector.accounts}
                                />
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="connector-type">
                            {CONNECTOR_TYPE}
                          </span>
                        </td>
                        <td>
                          <div className="connector-table-status">
                            {linked ? (
                              <span className="connector-state connector-state-connected">
                                Connected
                              </span>
                            ) : connector.state === "reconnect_required" ? (
                              <span className="connector-state connector-state-reconnect_required">
                                Reconnect required
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="connect-button connect-button-compact"
                              onClick={() => void connect(connector.platform)}
                              disabled={connecting !== null}
                            >
                              {connecting === connector.platform ? (
                                <RefreshCw
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ExternalLink
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {connectLabel(connector)}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="connector-security" aria-label="Connection security">
          <ShieldCheck className="size-4" aria-hidden="true" />
          <p>
            SocialMCP stores encrypted platform tokens. Sochestral receives
            only public account identity and connection state.
          </p>
        </aside>
      </section>
    </AppShell>
  );
}
