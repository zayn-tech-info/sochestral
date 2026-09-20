"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ApiError } from "@/lib/product-api";
import { reattachComment, approvePlan, commentOnPlan, createPlanContent, getPlan, listPlans, submitPlanComments, type PlanBlock, type PlanDetail, type PlanSummary } from "@/lib/plans-api";

function message(error: unknown) {
  return error instanceof ApiError && error.code === "STALE_VERSION"
    ? "This plan changed. Refresh to review the latest version before continuing."
    : "Could not save this action. Your text is still here; please try again.";
}

export function PlansList() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void listPlans().then(result => setPlans(result.plans)).catch(() => setError(true)); }, []);
  return <AppShell><div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
    <h1 className="text-3xl font-semibold">Plans</h1>
    <p className="text-muted-foreground">Review your direction, leave comments, and approve the plan before creating content.</p>
    {error ? <p role="alert">Could not load plans. Refresh to try again.</p> : !plans ? <p>Loading plans…</p> : !plans.length ? <p>No plans yet.</p> :
      <ul className="grid gap-4 sm:grid-cols-2">{plans.map(plan => <li key={plan.id}><Link className="block rounded-xl border p-5 focus-visible:ring-2" href={`/app/plans/${plan.id}`}>
        <h2 className="text-lg font-medium">{plan.title}</h2><p className="mt-2 text-sm text-muted-foreground">Version {plan.currentVersion}</p>
      </Link></li>)}</ul>}
  </div></AppShell>;
}

export function PlanViewer({ planId }: { planId: string }) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ version: number; blockId: string; quote?: string } | null>(null);
  const [reattaching, setReattaching] = useState<{ id: string; body: string } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(async () => { setDetail(await getPlan(planId)); }, [planId]);
  useEffect(() => { void load().catch(() => setError("Could not load this plan.")); }, [load]);
  const historical = Boolean(detail && detail.version.version !== detail.plan.currentVersion);
  const revisionActive = Boolean(detail?.batches?.some(batch => batch.status === "submitted" || batch.status === "running"));
  useEffect(() => {
    if (!revisionActive || historical || busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await getPlan(planId); if (active) setDetail(next); }
      catch { /* Keep the saved document visible; Refresh remains available. */ }
      if (active) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [revisionActive, historical, busy, planId]);
  const chooseAnchor = (blockId: string, text: string) => {
    if (!detail || historical || busy) return;
    const selected = window.getSelection()?.toString().trim();
    setAnchor({ version: detail.plan.currentVersion, blockId, ...(selected && text.includes(selected) ? { quote: selected } : {}) });
    setTimeout(() => { input.current?.focus(); input.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 0);
  };
  const commentButton = (id: string, text: string) => historical ? null : <button disabled={busy} type="button" className="mt-3 min-h-11 rounded-md border px-3 text-sm" aria-label={`Comment on ${text.slice(0, 80)}`}
    onMouseDown={event => event.preventDefault()} onClick={() => chooseAnchor(id, text)}>{reattaching ? "Select this location" : "Comment"}</button>;
  const renderBlock = (block: PlanBlock) => {
    if (block.kind === "paragraph" || block.kind === "callout") return <div className={block.kind === "callout" ? "rounded-lg border bg-muted/30 p-4" : ""} key={block.id}>
      <p className="whitespace-pre-wrap break-words text-base leading-7">{block.text}</p>{commentButton(block.id, block.text)}
    </div>;
    if (block.kind === "calendar") return <div key={block.id}>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm">
        <caption className="sr-only">Proposed content calendar</caption>
        <thead><tr>{["Angle and audience", "Destination and format", "Proposed time", "Assets"].map(label => <th key={label} className="border-b p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{block.items.map(item => <tr key={item.id}>
          <td className="border-b p-3 align-top"><p className="font-medium">{item.angle}</p><p className="mt-1 text-muted-foreground">{item.audience}</p>{commentButton(item.id, [item.angle, item.audience, item.format, ...item.destinations, item.proposedTime, ...item.assetNeeds].filter(Boolean).join("\n"))}</td>
          <td className="border-b p-3 align-top">{item.destinations.join(", ")}<br />{item.format}</td>
          <td className="border-b p-3 align-top">{item.proposedTime ?? "To be confirmed"}</td>
          <td className="border-b p-3 align-top">{item.assetNeeds.join(", ") || "None specified"}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="space-y-4 md:hidden">{block.items.map(item => <article key={item.id} className="rounded-xl border p-4">
      <h3 className="text-lg font-medium">{item.angle}</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Audience</dt><dd>{item.audience}</dd></div>
        <div><dt className="text-muted-foreground">Format and destinations</dt><dd>{item.format} · {item.destinations.join(", ")}</dd></div>
        <div><dt className="text-muted-foreground">Proposed time</dt><dd>{item.proposedTime ?? "To be confirmed"}</dd></div>
        <div><dt className="text-muted-foreground">Assets needed</dt><dd>{item.assetNeeds.join(", ") || "None specified"}</dd></div>
      </dl>{commentButton(item.id, [item.angle, item.audience, item.format, ...item.destinations, item.proposedTime, ...item.assetNeeds].filter(Boolean).join("\n"))}
    </article>)}</div></div>;
    if (block.kind === "sources") return <ul className="space-y-4" key={block.id}>{block.sources.map(source => <li key={source.id} className="rounded-lg border p-4">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">{source.title}</a>
      <p className="mt-2 leading-7">{source.summary}</p><p className="mt-2 text-sm">Supports: {source.claim}</p>
      {commentButton(source.id, [source.title, source.summary, source.claim].join("\n"))}
    </li>)}</ul>;
  };
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null);
    try { await work(); await load(); setNotice(success); }
    catch (err) {
      if (err instanceof ApiError && err.code === "CONTENT_NOT_READY") {
        setNotice("Direction approval does not create posts. Finished captions come later.");
      } else {
        setError(message(err));
      }
    }
    finally { setBusy(false); }
  }
  async function viewVersion(version?: number) {
    setBusy(true); setError(null); setNotice(null);
    try { setDetail(await getPlan(planId, version)); }
    catch { setError("Could not load this version. Please try again."); }
    finally { setBusy(false); }
  }
  const approved = detail?.approvals.some(approval => approval.scope === "plan_direction" && approval.revision === detail.plan.currentVersion);
  const pending = detail?.comments.filter(item => item.status === "pending") ?? [];
  return <AppShell><div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <Link href="/app/plans" className="text-sm underline">All plans</Link>
    {error && <p role="alert" className="my-4 rounded-lg border border-destructive p-3">{error}</p>}
    {notice && <p role="status" className="my-4 rounded-lg border p-3">{notice}</p>}
    {!detail ? <p className="py-8">{error ? "Plan unavailable." : "Loading plan…"}</p> : <>
      <header className="my-6 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight">{detail.plan.title}</h1><p className="mt-2 text-sm text-muted-foreground">Version {detail.version.version} · {historical ? "Earlier version · Read only" : approved ? "Direction approved" : "Needs review"}</p></div>
        <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg border px-4" onClick={() => void viewVersion()} disabled={busy}>Refresh</button>
          <button className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy || approved || historical} onClick={() => void action(() => approvePlan(planId, detail.plan.currentVersion), "Plan direction approved. Content still needs review before scheduling.")}>Approve plan direction</button>
          {approved && !historical && <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy} onClick={() => void action(() => createPlanContent(planId, detail.plan.currentVersion), "Direction approval does not create posts. Finished captions come later.")}>Create content</button>}</div>
      </header>
      <nav aria-label="Plan version history" className="mb-6 flex flex-wrap items-center gap-3">
        <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy || detail.version.version <= 1} onClick={() => void viewVersion(detail.version.version - 1)}>Previous version</button>
        <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy || !historical} onClick={() => void viewVersion(detail.version.version + 1)}>Next version</button>
        {historical && <button className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => void viewVersion()}>Back to latest</button>}
      </nav>
      {detail.version.parentVersion != null && <p className="mb-5 text-sm text-muted-foreground">Revised from version {detail.version.parentVersion}. {detail.version.changedBlockIds?.length ?? 0} changed sections or items. {detail.version.handledCommentIds?.length ?? 0} comments handled.</p>}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 space-y-8 rounded-2xl border bg-background p-5 sm:p-8" aria-label="Plan document">{detail.version.document.sections.map(section => <section key={section.id} className="space-y-4" aria-labelledby={section.id}>
          <h2 id={section.id} className="text-2xl font-semibold">{section.title}</h2>{section.blocks.map(renderBlock)}
        </section>)}</article>
        <aside className="min-w-0 space-y-5" aria-label="Plan comments">
          {historical ? <>
            <h2 className="text-xl font-semibold">Revision feedback</h2>
            <p className="text-sm text-muted-foreground">This is an immutable earlier document. Return to the latest version to comment or approve.</p>
            <ul className="space-y-3">{detail.comments.filter(item => detail.version.handledCommentIds?.includes(item.id)).map(item => <li key={item.id} className="rounded-lg border p-4"><p className="whitespace-pre-wrap break-words">{item.body}</p><p className="mt-2 text-sm text-muted-foreground">Handled in this revision</p></li>)}</ul>
          </> : <>
          {detail.batches?.filter(batch => batch.version === detail.plan.currentVersion && ["submitted", "running", "needs_attention"].includes(batch.status)).map(batch => <p key={batch.id} className="rounded-lg border p-3 text-sm" role="status">
            {batch.status === "running" ? "Applying submitted comments…" : batch.status === "submitted" ? "Revision queued." : "Revision needs attention. Your feedback is saved. Review it before submitting again."}
          </p>)}
          <h2 className="text-xl font-semibold">Comments</h2><p className="text-sm text-muted-foreground">Select text and choose Comment, or comment on a whole block.</p>
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!anchor || (!reattaching && !comment.trim())) return;
            void action(async () => {
              if (reattaching) { await reattachComment(planId, reattaching.id, anchor); setReattaching(null); }
              else { await commentOnPlan(planId, { ...anchor, body: comment }); setComment(""); }
              setAnchor(null);
            }, reattaching ? "Comment reattached. Original feedback remains in history." : "Comment saved."); }}>
            {reattaching && <div className="rounded-lg border p-3 text-sm"><p>Select text or a block in the latest plan, then save the new location.</p><button type="button" className="mt-2 min-h-11 underline" onClick={() => { setReattaching(null); setAnchor(null); }}>Cancel reattachment</button></div>}
            {anchor && <p className="break-words rounded-lg border p-3 text-sm">{anchor.quote ? `“${anchor.quote}”` : "Commenting on the selected block"}</p>}
            <label className="block text-sm font-medium" htmlFor="plan-comment">Your comment</label>
            <textarea ref={input} id="plan-comment" className="min-h-28 w-full rounded-lg border bg-background p-3" readOnly={Boolean(reattaching)} value={reattaching?.body ?? comment} onChange={event => setComment(event.target.value)} maxLength={4000} />
            <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy || !anchor || (!reattaching && !comment.trim())}>{reattaching ? "Save new location" : "Save comment"}</button>
          </form>
          <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy || !pending.length} onClick={() => void action(() => submitPlanComments(planId, detail.plan.currentVersion, pending.map(item => item.id)), "Comments submitted for revision.")}>Review comments ({pending.length})</button>
          <ul className="space-y-3">{detail.comments.map(item => <li key={item.id} className="rounded-lg border p-4">
            {item.quote && <blockquote className="mb-2 break-words border-l-2 pl-3 text-sm text-muted-foreground">{item.quote}</blockquote>}
            <p className="whitespace-pre-wrap break-words">{item.body}</p><p className="mt-3 text-sm text-muted-foreground">{item.status === "needs_reattachment" ? "Needs reattachment" : item.status} · Version {item.version}</p>
            {item.status === "needs_reattachment" && <button type="button" disabled={busy} className="mt-3 min-h-11 rounded-lg border px-3" aria-label={`Reattach comment: ${item.body}`} onClick={() => { setReattaching({ id: item.id, body: item.body }); setAnchor(null); input.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>Reattach comment</button>}
            {item.reattachedFromId && <p className="mt-2 text-sm text-muted-foreground">Reattached from an earlier comment</p>}
          </li>)}</ul>
          </>}
        </aside>
      </div>
    </>}
  </div></AppShell>;
}
