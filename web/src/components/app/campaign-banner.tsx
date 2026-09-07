"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getCurrentCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  type CampaignCurrent,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";

const PAUSE_WARN =
  "Pause stops new days. Posts already on your calendar stay. You can resume later.";
const STOP_WARN =
  "Stop ends this campaign. Posts already on your calendar stay. You can cancel those on the list if you want.";

const IN_FLIGHT = new Set(["queued", "running", "paused"]);

export function CampaignBanner() {
  const [campaign, setCampaign] = useState<CampaignCurrent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"pause" | "resume" | "stop" | null>(
    null,
  );
  const [confirm, setConfirm] = useState<"pause" | "stop" | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getCurrentCampaign();
      setCampaign(result.campaign);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setCampaign(null);
        setError(null);
        return;
      }
      setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign || !IN_FLIGHT.has(campaign.status)) return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [campaign, load]);

  async function run(action: "pause" | "resume" | "stop") {
    if (!campaign) return;
    setPending(action);
    try {
      if (action === "pause") await pauseCampaign(campaign.id);
      if (action === "resume") await resumeCampaign(campaign.id);
      if (action === "stop") await stopCampaign(campaign.id);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    } finally {
      setPending(null);
    }
  }

  if (!campaign && !error) return null;

  const inFlight = campaign ? IN_FLIGHT.has(campaign.status) : false;

  return (
    <section className="campaign-banner" aria-live="polite">
      {error ? (
        <p className="campaign-banner-error" role="alert">
          {userFacingError(error)}
        </p>
      ) : null}
      {campaign ? (
        <>
          <div className="campaign-banner-copy">
            <p className="campaign-banner-title">
              {inFlight
                ? `Day ${campaign.dayIndex}. ${campaign.bookedCount} of ${campaign.cap} queued.`
                : campaign.status === "succeeded"
                  ? `Finished. ${campaign.bookedCount} of ${campaign.cap} queued.`
                  : `Campaign ${campaign.status}. ${campaign.bookedCount} of ${campaign.cap} queued.`}
            </p>
            {campaign.notice ? <p>{campaign.notice}</p> : null}
            {campaign.lastError ? <p>{campaign.lastError}</p> : null}
          </div>
          {inFlight ? (
            <div className="campaign-banner-actions">
              {campaign.status === "paused" ? (
                <button
                  type="button"
                  className="cal-link-btn"
                  disabled={pending !== null}
                  onClick={() => void run("resume")}
                >
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  className="cal-link-btn"
                  disabled={pending !== null}
                  onClick={() => setConfirm("pause")}
                >
                  Pause
                </button>
              )}
              <button
                type="button"
                className="cal-link-btn"
                disabled={pending !== null}
                onClick={() => setConfirm("stop")}
              >
                Stop
              </button>
            </div>
          ) : null}
          {confirm ? (
            <div className="campaign-banner-confirm" role="alertdialog" aria-modal="true">
              <p>{confirm === "pause" ? PAUSE_WARN : STOP_WARN}</p>
              <div className="campaign-banner-actions">
                <button
                  type="button"
                  className="cal-link-btn"
                  disabled={pending !== null}
                  onClick={() => void run(confirm)}
                >
                  Confirm {confirm}
                </button>
                <button
                  type="button"
                  className="cal-link-btn"
                  onClick={() => setConfirm(null)}
                >
                  Keep going
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
