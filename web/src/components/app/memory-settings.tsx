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
  patchProfileEntry,
  type BusinessProfileResponse,
  type ProfileEntry,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import { AppShell } from "./app-shell";
import { productMotion } from "./product-motion-provider";
import { useToast } from "./toast-provider";

const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  tone: "Tone",
  do_not: "Do not",
  cadence: "Cadence",
  competitor: "Competitors",
  audience: "Audience",
  brand_fact: "Brand facts",
};

export function MemorySettings() {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<BusinessProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState({ category: "brand_fact", body: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getBusinessProfile();
      setProfile(next);
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
      toast({ tone: "success", title: "Memory entry added." });
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
    <AppShell title="Memory">
      <motion.div
        className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={productMotion.enter}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tone, competitors, and other facts the agent learned. Edit identity
              fields in{" "}
              <Link className="underline" href="/app/settings/personal">
                Personal information
              </Link>
              .
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
            <p className="text-sm text-muted-foreground">Loading memory…</p>
          )
        ) : (
          <>
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
              {Object.entries(MEMORY_CATEGORY_LABELS).map(([category, label]) => {
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
                {Object.entries(MEMORY_CATEGORY_LABELS).map(([value, label]) => (
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
