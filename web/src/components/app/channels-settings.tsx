"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Unlink } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { ApiError, apiRequest } from "@/lib/product-api";
import { AppShell } from "./app-shell";

type WhatsAppStatus = {
  status: "unlinked" | "active";
  displayKey: string | null;
  linkedAt: string | null;
};

type LinkStart = {
  deepLink: string;
  waMeUrl: string;
  expiresAt: string;
  instructions: string;
  token: string;
};

export function ChannelsSettings() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [link, setLink] = useState<LinkStart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenFromUrl = searchParams.get("token");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<WhatsAppStatus>("/channels/whatsapp");
      setStatus(result);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load channel status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startLink() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<LinkStart>("/channels/whatsapp/link", {
        method: "POST",
      });
      setLink(result);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "ALREADY_LINKED"
            ? "WhatsApp is already linked on this account."
            : err.message
          : "Could not start WhatsApp link.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest<{ ok: true }>("/channels/whatsapp", { method: "DELETE" });
      setLink(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not unlink WhatsApp.",
      );
    } finally {
      setBusy(false);
    }
  }

  const activeToken = link?.token ?? tokenFromUrl;

  return (
    <AppShell>
      <section
        className="settings-content os-settings"
        aria-labelledby="channels-title"
      >
        <header className="os-settings-header">
          <h2 id="channels-title">Channels</h2>
          <p>
            Link WhatsApp so you can draft, approve, and check publish status
            from your phone. Platform OAuth still opens in the browser.
          </p>
        </header>

        {error ? (
          <p className="os-banner os-banner-error" role="alert">
            {error}
          </p>
        ) : null}

        <article className="os-settings-block">
          <div className="os-settings-block-head">
            <MessageCircle aria-hidden="true" className="size-5" />
            <div>
              <h3>WhatsApp</h3>
              <p>
                {loading
                  ? "Loading…"
                  : status?.status === "active"
                    ? `Linked${status.displayKey ? ` · ${status.displayKey}` : ""}`
                    : "Not linked"}
              </p>
            </div>
          </div>

          {status?.status === "active" ? (
            <button
              type="button"
              className="os-button os-button-secondary"
              onClick={() => void unlink()}
              disabled={busy}
            >
              <Unlink className="size-4" aria-hidden="true" />
              Unlink WhatsApp
            </button>
          ) : (
            <button
              type="button"
              className="os-button"
              onClick={() => void startLink()}
              disabled={busy || loading}
            >
              Start WhatsApp link
            </button>
          )}

          {activeToken ? (
            <div className="os-settings-help">
              <p>
                Send this exact message to the Sochestral WhatsApp business
                number:
              </p>
              <p>
                <code>LINK {activeToken}</code>
              </p>
              {link?.waMeUrl ? (
                <p>
                  <a href={link.waMeUrl} target="_blank" rel="noreferrer">
                    Open WhatsApp with prefilled LINK
                  </a>
                </p>
              ) : null}
              {link?.expiresAt ? (
                <p>Code expires at {new Date(link.expiresAt).toLocaleString()}.</p>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>
    </AppShell>
  );
}
