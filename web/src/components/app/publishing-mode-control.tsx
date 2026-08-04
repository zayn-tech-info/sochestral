"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ShieldAlert, X } from "lucide-react";
import {
  ApiError,
  apiRequest,
  type PublishingMode,
  type PublishingPreference,
} from "@/lib/product-api";

export function PublishingModeControl({
  source,
  compact = false,
}: {
  source: "composer" | "settings";
  compact?: boolean;
}) {
  const [preference, setPreference] = useState<PublishingPreference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    let active = true;
    apiRequest<PublishingPreference>("/publishing/preferences")
      .then((result) => active && setPreference(result))
      .catch(() => active && setError("Publishing mode is unavailable."));
    return () => {
      active = false;
    };
  }, []);

  async function change(mode: PublishingMode, consent = false) {
    if (!preference || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<PublishingPreference>("/publishing/preferences", {
        method: "PATCH",
        headers: { "X-Sochestral-Request": "publishing-action" },
        body: JSON.stringify({
          expectedRevision: preference.revision,
          mode,
          source,
          acknowledged: consent,
          consentVersion: consent ? preference.policyVersion : null,
        }),
      });
      setPreference(result);
      setAcknowledged(false);
      dialogRef.current?.close();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError && requestError.code === "STALE_REVISION"
          ? "The mode changed elsewhere. Refresh and try again."
          : "Publishing mode could not be changed safely.",
      );
    } finally {
      setBusy(false);
    }
  }

  function select(mode: PublishingMode) {
    if (mode === preference?.currentMode) return;
    if (mode === "full_access") {
      setAcknowledged(false);
      dialogRef.current?.showModal();
      return;
    }
    void change(mode);
  }

  return (
    <div className={`publishing-mode-control${compact ? " publishing-mode-compact" : ""}`}>
      <label>
        <span className={compact ? "sr-only" : "publishing-mode-label"}>Publishing mode</span>
        <span className="publishing-mode-select-wrap">
          <select
            value={preference?.currentMode ?? "always_draft"}
            onChange={(event) => select(event.target.value as PublishingMode)}
            disabled={!preference || busy || !preference.enabled}
            aria-describedby={error ? descriptionId : undefined}
          >
            <option value="always_draft">Always draft</option>
            <option value="approve_for_me">Approve for me</option>
            <option value="full_access">Full access</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </span>
      </label>
      {!compact && preference ? (
        <p>
          {preference.enabled
            ? preference.currentMode === "always_draft"
              ? "Every social set opens for review before publishing."
              : preference.currentMode === "approve_for_me"
                ? "Explicit publish requests run automatically only with no warnings."
                : "Explicit publish requests run after blocking checks pass."
            : "Always draft is enforced while publishing authority rollout checks finish."}
        </p>
      ) : null}
      {error ? <p id={descriptionId} className="publishing-mode-error" role="alert">{error}</p> : null}

      <dialog
        ref={dialogRef}
        className="authority-dialog"
        aria-labelledby="full-access-title"
        aria-describedby="full-access-description"
        onClose={() => setAcknowledged(false)}
      >
        <header>
          <span><ShieldAlert aria-hidden="true" /></span>
          <div>
            <h2 id="full-access-title">Turn on Full access?</h2>
            <p id="full-access-description">
              Sochestral may publish an explicit live request to your connected social accounts without opening review first.
            </p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close Full access warning">
            <X aria-hidden="true" />
          </button>
        </header>
        <ul>
          <li><Check aria-hidden="true" /> Ownership and connected account checks still apply.</li>
          <li><Check aria-hidden="true" /> Blocking validation errors still open review.</li>
          <li><Check aria-hidden="true" /> Rate limits and duplicate protection remain active.</li>
        </ul>
        <label className="authority-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>I understand Sochestral may publish immediately without reviewing each post.</span>
        </label>
        <footer>
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button type="button" disabled={!acknowledged || busy} onClick={() => void change("full_access", true)}>
            Confirm Full access
          </button>
        </footer>
      </dialog>
    </div>
  );
}
