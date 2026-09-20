import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(10_000);
export const planCalendarItemSchema = z.object({
  id,
  angle: text,
  audience: text,
  format: z.enum(["text", "image", "carousel", "video_script"]),
  destinations: z.array(z.enum(["threads", "instagram", "linkedin_personal"])).min(1).max(3),
  proposedTime: z.string().max(100).nullable(),
  assetNeeds: z.array(text).max(20),
}).strict();

const block = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("paragraph"), text }).strict(),
  z.object({ id, kind: z.literal("callout"), text, tone: z.enum(["info", "attention"]) }).strict(),
  z.object({ id, kind: z.literal("calendar"), items: z.array(planCalendarItemSchema).max(1000) }).strict(),
  z.object({ id, kind: z.literal("sources"), sources: z.array(z.object({
    id, url: z.url().refine(value => /^https?:\/\//.test(value)), title: text,
    retrievedAt: z.iso.datetime(), summary: text, claim: text,
  }).strict()).max(100) }).strict(),
]);

export const planDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  sections: z.array(z.object({
    id,
    type: z.enum(["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"]),
    title: z.string().trim().min(1).max(200),
    blocks: z.array(block).min(1).max(100),
  }).strict()).length(6),
}).strict().superRefine((document, ctx) => {
  if (new Set(document.sections.map(section => section.type)).size !== 6) {
    ctx.addIssue({ code: "custom", message: "Each required section must appear once" });
  }
  const ids = new Set<string>();
  const accept = (value: string) => {
    if (ids.has(value)) ctx.addIssue({ code: "custom", message: `Duplicate document identity: ${value}` });
    ids.add(value);
  };
  for (const section of document.sections) {
    accept(section.id);
    for (const item of section.blocks) {
      accept(item.id);
      if (item.kind === "calendar") for (const row of item.items) accept(row.id);
      if (item.kind === "sources") for (const source of item.sources) accept(source.id);
    }
  }
  if (JSON.stringify(document).length > 1_000_000) ctx.addIssue({ code: "custom", message: "Plan exceeds document size limit; split the plan before generating" });
});

export type PlanDocument = z.infer<typeof planDocumentSchema>;

/** Exact rendered text used to validate selection anchors. */
export function planAnchorText(document: PlanDocument): Map<string, string> {
  const result = new Map<string, string>();
  for (const section of document.sections) {
    result.set(section.id, section.title);
    for (const block of section.blocks) {
      if (block.kind === "paragraph" || block.kind === "callout") result.set(block.id, block.text);
      if (block.kind === "calendar") {
        result.set(block.id, block.items.map(item => item.angle).join("\n"));
        for (const row of block.items) result.set(row.id, [row.angle, row.audience, row.format, ...row.destinations, row.proposedTime, ...row.assetNeeds].filter(Boolean).join("\n"));
      }
      if (block.kind === "sources") {
        result.set(block.id, block.sources.map(source => source.title).join("\n"));
        for (const source of block.sources) result.set(source.id, [source.title, source.summary, source.claim].join("\n"));
      }
    }
  }
  return result;
}
