"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  nextStep,
  ONBOARDING_STEPS,
  PERSONA_OPTIONS,
  PLATFORM_OPTIONS,
  prevStep,
  SKILL_OPTIONS,
  stepIndex,
  type OnboardingStepId,
} from "@/lib/onboarding";
import { userFacingError } from "@/lib/user-facing-error";
import { useToast } from "./toast-provider";

const STEP_TITLES: Record<OnboardingStepId, string> = {
  business_details: "Your business",
  who_you_are: "Who you are",
  skills: "Your skills",
  platforms: "Primary platforms",
  attribution: "How did you hear about us?",
};

export function OnboardingWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStepId>("business_details");
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [personaRole, setPersonaRole] = useState("");
  const [personaRoleOther, setPersonaRoleOther] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [primaryPlatforms, setPrimaryPlatforms] = useState<string[]>([]);
  const [attributionSource, setAttributionSource] = useState("");
  const [attributionOther, setAttributionOther] = useState("");

  useEffect(() => {
    let active = true;
    void getBusinessProfile()
      .then((profile) => {
        if (!active) return;
        hydrate(profile);
        if (profile.setupStatus === "complete") {
          router.replace("/app/workspace");
          return;
        }
        const idx = stepIndex(profile.setupStep);
        setStep(ONBOARDING_STEPS[idx]!);
      })
      .catch((err) => {
        if (!active) return;
        toast({
          tone: "error",
          title: userFacingError(err),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Mount-once load. Do not depend on router/toast identity — unstable
    // references would re-fetch and wipe in-progress wizard fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once load
  }, []);

  function hydrate(profile: BusinessProfileResponse) {
    setBusinessName(profile.businessName ?? "");
    setBusinessDescription(profile.businessDescription ?? "");
    setWebsiteUrl(profile.websiteUrl ?? "");
    setPersonaRole(profile.personaRole ?? "");
    setPersonaRoleOther(profile.personaRoleOther ?? "");
    setPrimaryPlatforms(profile.primaryPlatforms ?? []);
    setAttributionSource(profile.attributionSource ?? "");
    setAttributionOther(profile.attributionOther ?? "");
    const skillBodies = (profile.sections.skill ?? [])
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.body);
    setSkills(skillBodies);
  }

  const wordCount = countWords(businessDescription);
  const progress = ((stepIndex(step) + 1) / ONBOARDING_STEPS.length) * 100;

  const canContinue = useMemo(() => {
    switch (step) {
      case "business_details":
        return (
          businessName.trim().length > 0 && wordCount >= MIN_DESCRIPTION_WORDS
        );
      case "who_you_are":
        return (
          Boolean(personaRole) &&
          (personaRole !== "other" || personaRoleOther.trim().length > 0)
        );
      case "skills":
        return skills.length > 0;
      case "platforms":
        return primaryPlatforms.length > 0;
      case "attribution":
        return (
          Boolean(attributionSource) &&
          (attributionSource !== "other" || attributionOther.trim().length > 0)
        );
      default:
        return false;
    }
  }, [
    step,
    businessName,
    wordCount,
    personaRole,
    personaRoleOther,
    skills,
    primaryPlatforms,
    attributionSource,
    attributionOther,
  ]);

  async function saveAndAdvance() {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const upcoming = nextStep(step);
      const body: Parameters<typeof patchBusinessProfile>[0] = {
        setupStep: upcoming === "done" ? "done" : upcoming,
      };
      if (step === "business_details") {
        body.businessName = businessName.trim();
        body.businessDescription = businessDescription.trim();
        body.websiteUrl = websiteUrl.trim() || null;
      }
      if (step === "who_you_are") {
        body.personaRole = personaRole;
        body.personaRoleOther =
          personaRole === "other" ? personaRoleOther.trim() : null;
      }
      if (step === "skills") {
        body.skills = skills;
      }
      if (step === "platforms") {
        body.primaryPlatforms = primaryPlatforms;
      }
      if (step === "attribution") {
        body.attributionSource = attributionSource;
        body.attributionOther =
          attributionSource === "other" ? attributionOther.trim() : null;
        body.completeSetup = true;
      }

      const next = await patchBusinessProfile(body);
      hydrate(next);
      if (next.setupStatus === "complete") {
        toast({ tone: "success", title: "Profile ready. Welcome to Sochestral." });
        router.replace("/app/workspace");
        return;
      }
      if (upcoming === "done") {
        toast({
          tone: "error",
          title: "Complete the required fields before finishing setup.",
        });
        const idx = stepIndex(next.setupStep);
        setStep(ONBOARDING_STEPS[idx]!);
        return;
      }
      setStep(upcoming);
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err : "REQUEST_FAILED",
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (saving) return;
    const previous = prevStep(step);
    if (!previous) return;
    setSaving(true);
    try {
      const next = await patchBusinessProfile({ setupStep: previous });
      hydrate(next);
      setStep(previous);
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err : "REQUEST_FAILED",
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleSkill(skill: string) {
    setSkills((current) =>
      current.includes(skill)
        ? current.filter((item) => item !== skill)
        : [...current, skill],
    );
  }

  function togglePlatform(platform: string) {
    setPrimaryPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  if (loading) {
    return (
      <div className="onboarding-shell">
        <p className="text-sm text-muted-foreground">Loading onboarding…</p>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <header className="onboarding-header">
          <p className="onboarding-kicker">
            Step {stepIndex(step) + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h1 className="onboarding-title">{STEP_TITLES[step]}</h1>
          <div className="onboarding-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </header>

        {step === "business_details" ? (
          <div className="onboarding-fields">
            <p className="onboarding-hint">
              Richer details help the agent personalize drafts, schedules, and
              replies for your brand.
            </p>
            <label className="onboarding-label">
              Business name
              <input
                className="onboarding-input"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                autoComplete="organization"
              />
            </label>
            <label className="onboarding-label">
              Business description
              <textarea
                className="onboarding-textarea"
                rows={6}
                value={businessDescription}
                onChange={(event) => setBusinessDescription(event.target.value)}
                placeholder="What you do, who you help, and what makes you different…"
              />
              <span
                className={
                  wordCount >= MIN_DESCRIPTION_WORDS
                    ? "onboarding-meta"
                    : "onboarding-meta onboarding-meta-warn"
                }
              >
                {wordCount} / {MIN_DESCRIPTION_WORDS} words minimum
              </span>
            </label>
            <label className="onboarding-label">
              Website <span className="onboarding-optional">(optional)</span>
              <input
                className="onboarding-input"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://example.com"
                autoComplete="url"
              />
            </label>
          </div>
        ) : null}

        {step === "who_you_are" ? (
          <div className="onboarding-fields">
            <p className="onboarding-hint">
              Pick the option that best matches how you show up on social.
            </p>
            <div className="onboarding-choice-grid" role="radiogroup">
              {PERSONA_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={
                    personaRole === option.id
                      ? "onboarding-choice onboarding-choice-active"
                      : "onboarding-choice"
                  }
                >
                  <input
                    type="radio"
                    name="persona"
                    checked={personaRole === option.id}
                    onChange={() => setPersonaRole(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {personaRole === "other" ? (
              <label className="onboarding-label">
                Tell us who you are
                <input
                  className="onboarding-input"
                  value={personaRoleOther}
                  onChange={(event) => setPersonaRoleOther(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {step === "skills" ? (
          <div className="onboarding-fields">
            <p className="onboarding-hint">
              Select the strengths the agent should lean on when drafting for
              you.
            </p>
            <div className="onboarding-chip-grid">
              {SKILL_OPTIONS.map((skill) => {
                const active = skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    className={
                      active
                        ? "onboarding-chip onboarding-chip-active"
                        : "onboarding-chip"
                    }
                    aria-pressed={active}
                    onClick={() => toggleSkill(skill)}
                  >
                    {skill}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "platforms" ? (
          <div className="onboarding-fields">
            <p className="onboarding-hint">
              Choose where you plan to post most. You can connect accounts later.
            </p>
            <div className="onboarding-chip-grid">
              {PLATFORM_OPTIONS.map((platform) => {
                const active = primaryPlatforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    className={
                      active
                        ? "onboarding-chip onboarding-chip-active"
                        : "onboarding-chip"
                    }
                    aria-pressed={active}
                    onClick={() => togglePlatform(platform.id)}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === "attribution" ? (
          <div className="onboarding-fields">
            <div className="onboarding-choice-grid" role="radiogroup">
              {ATTRIBUTION_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={
                    attributionSource === option.id
                      ? "onboarding-choice onboarding-choice-active"
                      : "onboarding-choice"
                  }
                >
                  <input
                    type="radio"
                    name="attribution"
                    checked={attributionSource === option.id}
                    onChange={() => setAttributionSource(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {attributionSource === "other" ? (
              <label className="onboarding-label">
                Where did you hear about us?
                <input
                  className="onboarding-input"
                  value={attributionOther}
                  onChange={(event) => setAttributionOther(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <footer className="onboarding-footer">
          <button
            type="button"
            className="onboarding-btn-secondary"
            disabled={stepIndex(step) === 0 || saving}
            onClick={() => void goBack()}
          >
            Back
          </button>
          <button
            type="button"
            className="onboarding-btn-primary"
            disabled={!canContinue || saving}
            onClick={() => void saveAndAdvance()}
          >
            {saving
              ? "Saving…"
              : step === "attribution"
                ? "Finish"
                : "Continue"}
          </button>
        </footer>
      </div>
    </div>
  );
}
