"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  getBusinessProfile,
  patchBusinessProfile,
  type BusinessProfileResponse,
} from "@/lib/product-api";
import {
  ATTRIBUTION_OPTIONS,
  countWords,
  MIN_DESCRIPTION_WORDS,
  PERSONA_OPTIONS,
  PLATFORM_OPTIONS,
  SKILL_OPTIONS,
} from "@/lib/onboarding";
import { userFacingError } from "@/lib/user-facing-error";
import { AppShell } from "./app-shell";
import { productMotion } from "./product-motion-provider";
import { useToast } from "./toast-provider";

export function PersonalSettings() {
  const { toast } = useToast();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [profile, setProfile] = useState<BusinessProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    businessName: "",
    businessDescription: "",
    websiteUrl: "",
    personaRole: "",
    personaRoleOther: "",
    skills: [] as string[],
    primaryPlatforms: [] as string[],
    attributionSource: "",
    attributionOther: "",
  });

  const wordCount = useMemo(
    () => countWords(draft.businessDescription),
    [draft.businessDescription],
  );

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
        personaRole: next.personaRole ?? "",
        personaRoleOther: next.personaRoleOther ?? "",
        skills: (next.sections.skill ?? []).map((entry) => entry.body),
        primaryPlatforms: next.primaryPlatforms ?? [],
        attributionSource: next.attributionSource ?? "",
        attributionOther: next.attributionOther ?? "",
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

  function toggleSkill(skill: string) {
    setDraft((current) => ({
      ...current,
      skills: current.skills.includes(skill)
        ? current.skills.filter((item) => item !== skill)
        : [...current.skills, skill],
    }));
  }

  function togglePlatform(platform: string) {
    setDraft((current) => ({
      ...current,
      primaryPlatforms: current.primaryPlatforms.includes(platform)
        ? current.primaryPlatforms.filter((item) => item !== platform)
        : [...current.primaryPlatforms, platform],
    }));
  }

  async function saveIdentity() {
    setSaving(true);
    try {
      const next = await patchBusinessProfile({
        businessName: draft.businessName || null,
        businessDescription: draft.businessDescription || null,
        websiteUrl: draft.websiteUrl || null,
        personaRole: draft.personaRole || null,
        personaRoleOther:
          draft.personaRole === "other" ? draft.personaRoleOther || null : null,
        skills: draft.skills,
        primaryPlatforms: draft.primaryPlatforms,
        attributionSource: draft.attributionSource || null,
        attributionOther:
          draft.attributionSource === "other"
            ? draft.attributionOther || null
            : null,
      });
      setProfile(next);
      toast({ tone: "success", title: "Personal information saved." });
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
      toast({
        tone: "success",
        title: reset
          ? "Profile reset. Complete the wizard again."
          : "Wizard reopened. Memory entries were kept.",
      });
      router.push("/app/onboarding");
    } catch (err) {
      actionError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Personal information">
      <motion.div
        className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={productMotion.enter}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Personal information
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Identity fields from onboarding. Agent-learned rules live in{" "}
              <Link className="underline" href="/app/settings/memory">
                Memory
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
            <p className="text-sm text-muted-foreground">Loading…</p>
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm"
                  disabled={saving}
                  onClick={() => void redoSetup(false)}
                >
                  Redo wizard (keep Memory)
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm text-destructive"
                  disabled={saving}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reset identity fields and delete all Memory entries?",
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
                Business details
              </h2>
              <label className="block space-y-1 text-sm">
                <span>Business name</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.businessName}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      businessName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2"
                  value={draft.businessDescription}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      businessDescription: event.target.value,
                    }))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {wordCount} / {MIN_DESCRIPTION_WORDS} words minimum
                </span>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Website</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.websiteUrl}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      websiteUrl: event.target.value,
                    }))
                  }
                />
              </label>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Who you are
              </h2>
              <div className="flex flex-wrap gap-2">
                {PERSONA_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      draft.personaRole === option.id
                        ? "border-foreground bg-foreground/10"
                        : ""
                    }`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        personaRole: option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {draft.personaRole === "other" ? (
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Describe your role"
                  value={draft.personaRoleOther}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      personaRoleOther: event.target.value,
                    }))
                  }
                />
              ) : null}
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      draft.skills.includes(skill)
                        ? "border-foreground bg-foreground/10"
                        : ""
                    }`}
                    onClick={() => toggleSkill(skill)}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Primary platforms
              </h2>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      draft.primaryPlatforms.includes(platform.id)
                        ? "border-foreground bg-foreground/10"
                        : ""
                    }`}
                    onClick={() => togglePlatform(platform.id)}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                How you heard about us
              </h2>
              <div className="flex flex-wrap gap-2">
                {ATTRIBUTION_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      draft.attributionSource === option.id
                        ? "border-foreground bg-foreground/10"
                        : ""
                    }`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        attributionSource: option.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {draft.attributionSource === "other" ? (
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Tell us where"
                  value={draft.attributionOther}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      attributionOther: event.target.value,
                    }))
                  }
                />
              ) : null}
            </section>

            <button
              type="button"
              className="rounded-md bg-foreground px-3 py-2 text-sm text-background"
              disabled={saving}
              onClick={() => void saveIdentity()}
            >
              Save personal information
            </button>
          </>
        )}
      </motion.div>
    </AppShell>
  );
}
