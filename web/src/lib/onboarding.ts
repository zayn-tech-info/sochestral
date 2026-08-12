export const PERSONA_OPTIONS = [
  { id: "student", label: "Student" },
  { id: "content_creator", label: "Content creator" },
  { id: "business_owner", label: "Business owner" },
  { id: "entrepreneur", label: "Entrepreneur" },
  { id: "freelancer", label: "Freelancer / consultant" },
  { id: "other", label: "Other" },
] as const;

export const PLATFORM_OPTIONS = [
  { id: "threads", label: "Threads" },
  { id: "linkedin_personal", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
] as const;

export const ATTRIBUTION_OPTIONS = [
  { id: "twitter", label: "Twitter / X" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "friend", label: "Friend or colleague" },
  { id: "other", label: "Other" },
] as const;

export const SKILL_OPTIONS = [
  "Content writing",
  "Brand design",
  "Product marketing",
  "Community",
  "Ads",
  "Founder storytelling",
  "Short-form video",
  "SEO content",
] as const;

export const ONBOARDING_STEPS = [
  "business_details",
  "who_you_are",
  "skills",
  "platforms",
  "attribution",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export const MIN_DESCRIPTION_WORDS = 30;

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function stepIndex(step: string | null | undefined): number {
  const idx = ONBOARDING_STEPS.indexOf(step as OnboardingStepId);
  return idx >= 0 ? idx : 0;
}

export function nextStep(step: OnboardingStepId): OnboardingStepId | "done" {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx < 0 || idx >= ONBOARDING_STEPS.length - 1) return "done";
  return ONBOARDING_STEPS[idx + 1]!;
}

export function prevStep(step: OnboardingStepId): OnboardingStepId | null {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx <= 0) return null;
  return ONBOARDING_STEPS[idx - 1]!;
}
