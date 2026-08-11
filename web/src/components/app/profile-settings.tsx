"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  createProfileEntry,
  deleteProfileEntry,
  getBusinessProfile,
  patchBusinessProfile,
  patchProfileEntry,
  type BusinessProfileResponse,
  type ProfileEntry,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import { AppShell } from "./app-shell";
import { productMotion } from "./product-motion-provider";
import { useToast } from "./toast-provider";

const CATEGORY_LABELS: Record<string, string> = {
  tone: "Tone",
  do_not: "Do not",
  cadence: "Cadence",
  competitor: "Competitors",
  audience: "Audience",
  skill: "Skills",
  brand_fact: "Brand facts",
};

export function ProfileSettings() {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<BusinessProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    businessName: "",
    businessDescription: "",
    websiteUrl: "",
    targetAudience: "",
    industry: "",
  });
  const [newEntry, setNewEntry] = useState({ category: "brand_fact", body: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getBusinessProfile();
      setProfile(next);
      setDraft({
        businessName: next.businessName ?? "",
        businessDescription: next.businessDescription ?? "",
        websiteUrl: next.websiteUrl ?? "",
        targetAudience: next.targetAudience ?? "",
        industry: next.industry ?? "",
      });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function actionError(err: unknown) {
    toast({
      tone: "error",
      title: userFacingError(err, {
        fallback: "Something went wrong. Please try again.",
      }),
    });
  }

  async function saveIdentity() {
    setSaving(true);
    try {
      const next = await patchBusinessProfile({
        businessName: draft.businessName || null,
        businessDescription: draft.businessDescription || null,
        websiteUrl: draft.websiteUrl || null,
        targetAudience: draft.targetAudience || null,
        industry: draft.industry || null,
      });
      setProfile(next);
      toast({ tone: "success", title: "Profile saved." });
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  async function redoSetup(reset: boolean) {
    setSaving(true);
    try {
      const next = await patchBusinessProfile({
        redoSetup: true,
        confirmReset: reset,
      });
      setProfile(next);
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  async function addEntry() {
    if (!newEntry.body.trim()) return;
    setSaving(true);
    try {
      await createProfileEntry({
        category: newEntry.category,
        body: newEntry.body.trim(),
      });
      setNewEntry({ category: "brand_fact", body: "" });
      await load();
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(entry: ProfileEntry, body: string) {
    setSaving(true);
    try {
      await patchProfileEntry(entry.id, { body });
      await load();
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    setSaving(true);
    try {
      await deleteProfileEntry(id);
      await load();
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Business profile">
      <motion.div
        className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={productMotion.enter}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Business profile
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What Sochestral knows about your business. Edit anything that looks
              wrong. The same note is injected into operator chat after setup.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </header>

        {loadError && !profile ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {userFacingError(loadError)}
          </p>
        ) : null}

        {loading || !profile ? (
          loadError ? null : (
            <p className="text-sm text-muted-foreground">Loading profile…</p>
          )
        ) : (
          <>
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Setup status
                </h2>
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  {profile.setupStatus}
                  {profile.minimumComplete ? " · ready" : " · incomplete"}
                </span>
              </div>
              {profile.setupStatus !== "complete" ? (
                <p className="text-sm text-muted-foreground">
                  Finish onboarding in{" "}
                  <Link className="underline" href="/app/workspace">
                    chat
                  </Link>{" "}
                  or fill the fields below. Connect platforms anytime in{" "}
                  <Link className="underline" href="/app/settings/connectors">
                    Connected Accounts
                  </Link>
                  .
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm"
                  disabled={saving}
                  onClick={() => void redoSetup(false)}
                >
                  Redo setup (keep entries)
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm text-destructive"
                  disabled={saving}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset profile identity and delete all entries?",
                      )
                    ) {
                      void redoSetup(true);
                    }
                  }}
                >
                  Reset profile
                </button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Identity
              </h2>
              {(
                [
                  ["businessName", "Business name"],
                  ["businessDescription", "Description"],
                  ["websiteUrl", "Website"],
                  ["targetAudience", "Target audience"],
                  ["industry", "Industry"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span>{label}</span>
                  {key === "businessDescription" ? (
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <input
                      className="w-full rounded-md border bg-background px-3 py-2"
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
              <button
                type="button"
                className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
                disabled={saving}
                onClick={() => void saveIdentity()}
              >
                Save identity
              </button>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Compiled note
              </h2>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                {profile.compiledNote}
              </pre>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Categories
              </h2>
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                const entries = profile.sections[category] ?? [];
                return (
                  <div key={category} className="space-y-2 rounded-xl border p-4">
                    <h3 className="font-medium">{label}</h3>
                    {entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No entries yet.</p>
                    ) : (
                      entries.map((entry) => (
                        <EntryEditor
                          key={entry.id}
                          entry={entry}
                          disabled={saving}
                          onSave={(body) => void saveEntry(entry, body)}
                          onDelete={() => void removeEntry(entry.id)}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Add entry
              </h2>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newEntry.category}
                onChange={(event) =>
                  setNewEntry((prev) => ({
                    ...prev,
                    category: event.target.value,
                  }))
                }
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Write a rule or fact"
                value={newEntry.body}
                onChange={(event) =>
                  setNewEntry((prev) => ({ ...prev, body: event.target.value }))
                }
              />
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                disabled={saving}
                onClick={() => void addEntry()}
              >
                Add entry
              </button>
            </section>
          </>
        )}
      </motion.div>
    </AppShell>
  );
}

function EntryEditor({
  entry,
  disabled,
  onSave,
  onDelete,
}: {
  entry: ProfileEntry;
  disabled: boolean;
  onSave: (body: string) => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(entry.body);
  useEffect(() => {
    setBody(entry.body);
  }, [entry.body]);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {entry.title ?? entry.category} · {entry.status} · {entry.source}
        </span>
        <button
          type="button"
          className="underline"
          disabled={disabled}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      <textarea
        className="min-h-16 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={body}
        disabled={disabled}
        onChange={(event) => setBody(event.target.value)}
      />
      <button
        type="button"
        className="rounded-md border px-2 py-1 text-xs"
        disabled={disabled || body === entry.body}
        onClick={() => onSave(body)}
      >
        Save
      </button>
    </div>
  );
}
