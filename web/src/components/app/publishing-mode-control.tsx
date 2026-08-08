"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import {
  ApiError,
  apiRequest,
  type PublishingMode,
  type PublishingPreference,
} from "@/lib/product-api";
import { SelectChip } from "@/components/workspace/select-chip";

const modeOptions = [
  { value: "always_draft", label: "Always draft" },
  { value: "approve_for_me", label: "Approve for me" },
  { value: "full_access", label: "Full access" },
] as const;

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
      <div className="publishing-mode-field">
        <span className={compact ? "sr-only" : "publishing-mode-label"}>
          Publishing mode
        </span>
        <SelectChip
          label="Publishing mode"
          className={compact ? "os-select-chip-compact" : undefined}
          value={preference?.currentMode ?? "always_draft"}
          onChange={(value) => select(value as PublishingMode)}
          disabled={!preference || busy || !preference.enabled}
          options={modeOptions}
          placement={compact ? "top" : "bottom"}
        />
      </div>
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
      {error ? (
        <p id={descriptionId} className="publishing-mode-error" role="alert">
          {error}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="authority-dialog"
        aria-labelledby="full-access-title"
        aria-describedby="full-access-description"
        onClose={() => setAcknowledged(false)}
      >
        <header>
          <span>
            <ShieldAlert aria-hidden="true" />
          </span>
          <div>
            <h2 id="full-access-title">Turn on Full access?</h2>
            <p id="full-access-description">
              Sochestral may publish an explicit live request to your connected
              social accounts without opening review first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close Full access warning"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <ul>
          <li>
            <Check aria-hidden="true" /> Ownership and connected account checks
            still apply.
          </li>
          <li>
            <Check aria-hidden="true" /> Blocking validation errors still open
            review.
          </li>
          <li>
            <Check aria-hidden="true" /> Rate limits and duplicate protection
            remain active.
          </li>
        </ul>
        <label className="authority-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I understand Sochestral may publish immediately without reviewing
            each post.
          </span>
        </label>
        <footer>
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!acknowledged || busy}
            onClick={() => void change("full_access", true)}
          >
            Confirm Full access
          </button>
        </footer>
      </dialog>
    </div>
  );
}
