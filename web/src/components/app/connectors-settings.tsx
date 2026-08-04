"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  BriefcaseBusiness,
  Camera,
  Check,
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
import { AppShell } from "./app-shell";
import { productMotion } from "./product-motion-provider";
import { PublishingModeControl } from "./publishing-mode-control";

const labels: Record<ConnectorPlatform, string> = {
  threads: "Threads",
  linkedin_personal: "LinkedIn Personal",
  instagram: "Instagram",
};

const descriptions: Record<ConnectorPlatform, string> = {
  threads: "Create and validate conversation led posts.",
  linkedin_personal: "Shape professional posts for your personal profile.",
  instagram: "Prepare captions and image post previews.",
};

function PlatformIcon({ platform }: { platform: ConnectorPlatform }) {
  if (platform === "linkedin_personal") {
    return <BriefcaseBusiness className="size-5" aria-hidden="true" />;
  }
  if (platform === "instagram") {
    return <Camera className="size-5" aria-hidden="true" />;
  }
  return <AtSign className="size-5" aria-hidden="true" />;
}

export function ConnectorsSettings() {
  const reduceMotion = useReducedMotion();
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [connecting, setConnecting] = useState<ConnectorPlatform | null>(null);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

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
      setBanner({
        tone: "success",
        text: `${labels[knownPlatform]} is connected.`,
      });
    } else if (result === "error") {
      setBanner({
        tone: "error",
        text: code
          ? `Connection was not completed (${code}). Try again when ready.`
          : "Connection was not completed. Try again when ready.",
      });
    }
    void refresh();

    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  async function connect(platform: ConnectorPlatform) {
    setConnecting(platform);
    setBanner(null);
    try {
      const result = await apiRequest<{
        authorizeUrl: string;
      }>(`/connectors/${platform}/connect`, { method: "POST" });
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setBanner({
        tone: "error",
        text:
          error instanceof ApiError &&
          error.code === "SOCIALMCP_UNAVAILABLE"
            ? "The connector service is unavailable. Nothing changed."
            : "Connection could not start safely. Please try again.",
      });
      setConnecting(null);
    }
  }

  return (
    <AppShell
      title="Connectors"
      description="Choose the social accounts Sochestral can safely work with."
    >
      <section
        className="settings-content"
        aria-labelledby="available-socials-title"
      >
        <section className="publishing-settings" aria-labelledby="publishing-mode-title">
          <div>
            <p className="settings-kicker">Publishing</p>
            <h2 id="publishing-mode-title">Choose how review works</h2>
            <p>The setting applies to every conversation. Live wording is still required in every mode.</p>
          </div>
          <PublishingModeControl source="settings" />
        </section>
        <AnimatePresence initial={false}>
          {banner ? (
            <motion.div
              key={`oauth-${banner.tone}-${banner.text}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={productMotion.enter}
              className={`oauth-banner oauth-banner-${banner.tone}`}
              role={banner.tone === "error" ? "alert" : "status"}
            >
              {banner.tone === "success" ? (
                <Check className="size-5" aria-hidden="true" />
              ) : (
                <CircleAlert className="size-5" aria-hidden="true" />
              )}
              <span>{banner.text}</span>
              {banner.tone === "error" ? (
                <button type="button" onClick={() => setBanner(null)}>
                  Dismiss
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

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
            <h2 id="available-socials-title">Available socials</h2>
            <p>Connect more than one account when your brand needs it.</p>
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
          <div className="connector-skeletons" role="status">
            <span className="sr-only">Loading connectors</span>
            {[0, 1, 2].map((item) => (
              <div key={item} />
            ))}
          </div>
        ) : (
          <ul className="connector-list">
              {(connectors ?? []).map((connector, index) => (
                <motion.li
                  key={connector.platform}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    ...productMotion.enter,
                    delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.12),
                  }}
                  className="connector-card"
                >
                  <header>
                    <span className="connector-icon">
                      <PlatformIcon platform={connector.platform} />
                    </span>
                    <div>
                      <h3>{labels[connector.platform]}</h3>
                      <p>{descriptions[connector.platform]}</p>
                    </div>
                    <span
                      className={`connector-state connector-state-${connector.state}`}
                    >
                      {connector.state.replaceAll("_", " ")}
                    </span>
                  </header>

                  {connector.accounts.length ? (
                    <ul className="account-list">
                      {connector.accounts.map((account) => (
                        <li key={account.id}>
                          <span className="account-avatar">
                            {(account.displayName ?? account.username ?? "?")
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>
                          <span>
                            <strong>
                              {account.displayName ??
                                account.username ??
                                "Connected account"}
                            </strong>
                            {account.username ? (
                              <small>@{account.username}</small>
                            ) : null}
                          </span>
                          <small>{account.state.replaceAll("_", " ")}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-accounts">
                      No account connected yet. Provider consent takes about a
                      minute.
                    </p>
                  )}

                  <button
                    type="button"
                    className="connect-button"
                    onClick={() => void connect(connector.platform)}
                    disabled={connecting !== null}
                  >
                    {connecting === connector.platform ? (
                      <RefreshCw
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ExternalLink className="size-4" aria-hidden="true" />
                    )}
                    {connector.state === "not_connected"
                      ? "Connect"
                      : connector.state === "reconnect_required"
                        ? "Reconnect"
                        : "Connect another"}
                  </button>
                </motion.li>
              ))}
          </ul>
        )}
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
