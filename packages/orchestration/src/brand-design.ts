const JOB_PROMPT_MAX = 8000;

export function prependBrandBrief(
  prompt: string | null | undefined,
  briefText: string | null | undefined,
): string {
  const user = (prompt ?? "").trim();
  const brief = (briefText ?? "").trim();
  if (!brief) return user.slice(0, JOB_PROMPT_MAX);
  const combined = user
    ? `Brand design system (must follow):\n${brief}\n\nUser request:\n${user}`
    : `Brand design system (must follow):\n${brief}`;
  return combined.slice(0, JOB_PROMPT_MAX);
}

export function brandDesignSystemSuffix(briefText: string): string {
  return `\n\n---\nBrand design system (authoritative when the user opts in for branded creatives; never apply unless brandIntent is use):\n${briefText.trim()}`;
}
