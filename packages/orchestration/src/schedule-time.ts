/** Convert a local scheduling minute without silently shifting gaps or overlaps. */
export function resolveScheduleTime(
  local: string,
  timezone: string,
  occurrence?: "earlier" | "later",
): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error("INVALID_LOCAL_TIME");
  }
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local) {
    throw new Error("INVALID_LOCAL_TIME");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    throw new Error("INVALID_TIMEZONE");
  }
  const wallTime = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  // Sample offsets on both sides of transitions, including half-hour DST and date-line shifts.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3_600_000;
    offsets.add(Date.parse(`${wallTime(sample)}:00Z`) - sample);
  }
  const candidates = [...offsets].map(offset => nominal - offset)
    .filter(instant => wallTime(instant) === local).sort((a, b) => a - b);
  if (!candidates.length) throw new Error("NONEXISTENT_LOCAL_TIME");
  if (candidates.length > 1 && !occurrence) throw new Error("AMBIGUOUS_LOCAL_TIME");
  return new Date(occurrence === "later" ? candidates[candidates.length - 1]! : candidates[0]!).toISOString();
}
