"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { ApiError, apiRequest, type ConnectorSummary } from "@/lib/product-api";
import {
  excludePlanItem, commentOnPlan, createPlanContent, getPlan, listPlans, schedulePlanPosts, submitPlanComments,
  type ContentItem, type PlanComment, type PlanDetail, type PlanItem, type PlanSummary,
} from "@/lib/plans-api";

function message(error: unknown) {
  if (!(error instanceof ApiError)) return "Could not finish this action. Please try again.";
  if (error.code === "STALE_VERSION") return "This board changed. Refresh before continuing.";
  if (error.code === "TIMEZONE_NOT_CONFIRMED") return "Confirm your timezone in settings before scheduling.";
  if (error.code === "ACCOUNT_REQUIRED") return "Connect the account for each destination before scheduling.";
  if (error.code === "SCHEDULE_NOT_READY") return "A post is still blocked. Exclude it or fix it before scheduling.";
  if (error.code === "INVALID_SCHEDULE") return "Each included post needs a future local time and a connected account.";
  return "Could not finish this action. Please try again.";
}

function calendarItems(detail: PlanDetail): PlanItem[] {
  const items: PlanItem[] = [];
  for (const section of detail.version.document.sections) {
    for (const block of section.blocks) if (block.kind === "calendar") items.push(...block.items);
  }
  return items;
}

function proposedLocalTime(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : "";
}

function blockLabel(item: ContentItem, calendar: PlanItem | undefined, timezoneConfirmed: boolean, accounts: ConnectorSummary[] | null) {
  if (item.status === "blocked") {
    return item.revision.blockReason === "unverified_placeholder" ? "Blocked: unverified claim" : "Blocked: missing image";
  }
  if (!timezoneConfirmed) return "Blocked: missing timezone";
  if (accounts) {
    const missing = item.revision.destinations.some(platform => !accounts.some(connector => connector.platform === platform && connector.accounts.some(account => account.state === "connected")));
    if (missing) return "Blocked: disconnected account";
  }
  if (calendar && !proposedLocalTime(calendar.proposedTime)) return "Ready · set a local time";
  return "Ready";
}

export function PlansList() {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void listPlans().then(result => setPlans(result.plans)).catch(() => setError(true)); }, []);
  return <AppShell><div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
    <h1 className="text-3xl font-semibold">Posts</h1>
    <p className="text-muted-foreground">Review captions on the board, then schedule the posts that are ready.</p>
    {error ? <p role="alert">Could not load plans. Refresh to try again.</p> : !plans ? <p>Loading plans…</p> : !plans.length ? <p>No posts yet.</p> :
      <ul className="grid gap-4 sm:grid-cols-2">{plans.map(plan => <li key={plan.id}><Link className="block rounded-xl border p-5 focus-visible:ring-2" href={`/app/plans/${plan.id}`}>
        <h2 className="text-lg font-medium">{plan.title}</h2><p className="mt-2 text-sm text-muted-foreground">Board · version {plan.currentVersion}</p>
      </Link></li>)}</ul>}
  </div></AppShell>;
}

export function PlanViewer({ planId }: { planId: string }) {
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [postComment, setPostComment] = useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [accounts, setAccounts] = useState<ConnectorSummary[] | null>(null);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, Record<string, string>>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(async () => { setDetail(await getPlan(planId)); }, [planId]);
  useEffect(() => { void load().catch(() => setError("Could not load this board.")); }, [load]);
  useEffect(() => {
    void apiRequest<{ connectors: ConnectorSummary[] }>("/connectors").then(result => setAccounts(result.connectors)).catch(() => setAccounts([]));
  }, []);
  const historical = Boolean(detail && detail.version.version !== detail.plan.currentVersion);
  const revisionActive = Boolean(detail?.batches?.some(batch => batch.status === "submitted" || batch.status === "running"));
  const contentActive = Boolean(detail?.contentJob && (detail.contentJob.status === "submitted" || detail.contentJob.status === "running"));
  useEffect(() => {
    if ((!revisionActive && !contentActive) || historical || busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await getPlan(planId); if (active) setDetail(next); }
      catch { /* Keep the saved board visible; Refresh remains available. */ }
      if (active) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [revisionActive, contentActive, historical, busy, planId]);
  useEffect(() => {
    if (!detail) return;
    setTimes(current => {
      const next = { ...current };
      const calendar = new Map(calendarItems(detail).map(item => [item.id, item]));
      for (const item of detail.contentItems ?? []) {
        if (!next[item.id]) next[item.id] = proposedLocalTime(calendar.get(item.calendarItemId)?.proposedTime ?? null);
      }
      return next;
    });
  }, [detail]);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null);
    try { await work(); await load(); setNotice(success); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  const calendar = useMemo(() => detail ? new Map(calendarItems(detail).map(item => [item.id, item])) : new Map<string, PlanItem>(), [detail]);
  const pending = detail?.comments.filter(item => item.status === "pending" && (item.scope === "board" || item.scope === "post")) ?? [];
  const boardComments = detail?.comments.filter(item => item.scope === "board" || item.scope === "post") ?? [];
  const timezoneConfirmed = Boolean(detail?.board?.timezoneConfirmed);
  function accountOptions(platform: string) {
    return accounts?.find(connector => connector.platform === platform)?.accounts.filter(account => account.state === "connected") ?? [];
  }
  function pickAccount(itemId: string, platform: string, accountId: string) {
    setChosen(current => ({ ...current, [itemId]: { ...current[itemId], [platform]: accountId } }));
  }
  function selectedAccount(item: ContentItem, platform: string) {
    const picked = chosen[item.id]?.[platform];
    if (picked) return picked;
    const options = accountOptions(platform);
    return options.length === 1 ? options[0]!.id : "";
  }
  function scheduleRows() {
    return (detail?.contentItems ?? []).map(item => ({
      itemId: item.id,
      excluded: Boolean(item.excludedAt),
      localTime: times[item.id] || undefined,
      accounts: Object.fromEntries(item.revision.destinations.map(platform => [platform, selectedAccount(item, platform)]).filter(([, id]) => id)),
    }));
  }
  return <AppShell><div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <Link href="/app/plans" className="text-sm underline">All posts</Link>
    {error && <p role="alert" className="my-4 rounded-lg border border-destructive p-3">{error}</p>}
    {notice && <p role="status" className="my-4 rounded-lg border p-3">{notice}</p>}
    {!detail ? <p className="py-8">{error ? "Board unavailable." : "Loading board…"}</p> : <>
      <header className="my-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{detail.plan.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Post board · Version {detail.version.version}{historical ? " · Earlier version · Read only" : detail.board?.timezone ? ` · ${detail.board.timezone}` : " · Confirm timezone before scheduling"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 rounded-lg border px-4" onClick={() => void action(() => load(), "Board refreshed.")} disabled={busy}>Refresh</button>
          {pending.length ? <button className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy || historical} onClick={() => void action(() => submitPlanComments(planId, detail.plan.currentVersion, pending.map(item => item.id)), "Comments sent for review.")}>Review</button>
            : <button className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy || historical || !(detail.contentItems?.some(item => !item.excludedAt))} onClick={() => void action(() => schedulePlanPosts(planId, detail.plan.currentVersion, scheduleRows()), "Posts queued for the scheduled times.")}>Schedule posts</button>}
        </div>
      </header>
      {detail.contentJob && (detail.contentJob.status === "submitted" || detail.contentJob.status === "running") && <p className="mb-5 rounded-lg border p-3 text-sm" role="status">{detail.contentJob.status === "running" ? "Writing these posts…" : "Writing these posts…"}</p>}
      {detail.contentJob?.status === "needs_attention" && !detail.contentItems?.length && <div className="mb-5 rounded-lg border p-3 text-sm" role="status">
        <p>Could not write these posts. Try again.</p>
        {!historical && <button className="mt-3 min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => void action(() => createPlanContent(planId, detail.plan.currentVersion), "Trying to write these posts again.")}>Try again</button>}
      </div>}
      {detail.batches?.filter(batch => batch.kind === "content" && ["submitted", "running", "needs_attention"].includes(batch.status)).map(batch => <p key={batch.id} className="mb-5 rounded-lg border p-3 text-sm" role="status">
        {batch.status === "running" ? "Applying review comments…" : batch.status === "submitted" ? "Review queued." : "Could not apply those comments. Your notes are saved. Review them and try again."}
      </p>)}
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {!detail.contentItems?.length && !contentActive && detail.contentJob?.status !== "needs_attention" && <p className="rounded-xl border p-5 text-muted-foreground">Posts will show here as soon as captions are written.</p>}
          {(detail.contentItems ?? []).map(item => {
            const meta = calendar.get(item.calendarItemId);
            const excluded = Boolean(item.excludedAt);
            return <article key={item.id} className={`rounded-2xl border p-5 ${excluded ? "opacity-60" : ""}`} aria-label={meta?.angle ?? item.calendarItemId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{meta?.angle ?? item.calendarItemId}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{item.revision.destinations.join(", ")} · {item.revision.format} · {excluded ? "Excluded" : blockLabel(item, meta, timezoneConfirmed, accounts)}</p>
                </div>
                {!historical && <button type="button" className="min-h-11 rounded-md border px-3 text-sm" disabled={busy} onClick={() => void action(() => excludePlanItem(planId, item.id, detail.plan.currentVersion, !excluded), excluded ? "Post included again." : "Post excluded from Schedule posts.")}>{excluded ? "Include" : "Exclude"}</button>}
              </div>
              <p className="mt-4 whitespace-pre-wrap break-words leading-7">{item.revision.caption}</p>
              {!!item.revision.assetNeeds.length && <p className="mt-3 text-sm text-muted-foreground">Media needed: {item.revision.assetNeeds.join(", ")}</p>}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {item.revision.destinations.map(platform => {
                  const options = accountOptions(platform);
                  return <div key={platform}>
                    <dt className="text-muted-foreground">{platform}</dt>
                    <dd>{historical ? selectedAccount(item, platform) || "Account" : options.length ? <select className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" aria-label={`Account for ${platform}`} value={selectedAccount(item, platform)} onChange={event => pickAccount(item.id, platform, event.target.value)} disabled={busy || excluded}>
                      <option value="">Choose account</option>
                      {options.map(account => <option key={account.id} value={account.id}>{account.displayName || account.username || account.id}</option>)}
                    </select> : <Link className="underline" href="/app/settings/connectors">Connect {platform}</Link>}</dd>
                  </div>;
                })}
                <div>
                  <dt className="text-muted-foreground">Local time</dt>
                  <dd>{historical ? times[item.id] || meta?.proposedTime || "To be confirmed" : <input className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" aria-label={`Local time for ${meta?.angle ?? "post"}`} type="datetime-local" value={times[item.id] ?? ""} onChange={event => setTimes(current => ({ ...current, [item.id]: event.target.value }))} disabled={busy || excluded} />}</dd>
                </div>
              </dl>
              {!historical && <div className="mt-4 space-y-2">
                {postComment?.id === item.id ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!postComment.body.trim()) return;
                  void action(async () => { await commentOnPlan(planId, { version: detail.plan.currentVersion, blockId: item.id, body: postComment.body, scope: "post" }); setPostComment(null); }, "Comment saved."); }}>
                  <label className="block text-sm font-medium" htmlFor={`post-comment-${item.id}`}>Comment on this post</label>
                  <textarea id={`post-comment-${item.id}`} className="min-h-24 w-full rounded-lg border bg-background p-3" value={postComment.body} onChange={event => setPostComment({ id: item.id, body: event.target.value })} maxLength={4000} />
                  <div className="flex gap-2">
                    <button className="min-h-11 rounded-lg border px-4" disabled={busy || !postComment.body.trim()}>Save post comment</button>
                    <button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => setPostComment(null)}>Cancel</button>
                  </div>
                </form> : <button type="button" className="min-h-11 rounded-md border px-3 text-sm" disabled={busy} onClick={() => setPostComment({ id: item.id, body: "" })}>Comment on this post</button>}
              </div>}
            </article>;
          })}
          {!historical && <button type="button" className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => { setComment(value => value || "Add a post: "); input.current?.focus(); }}>Add post</button>}
          <button type="button" className="block text-sm underline" onClick={() => setShowPlan(open => !open)}>{showPlan ? "Hide how this was planned" : "View how this was planned"}</button>
          {showPlan && <article className="space-y-6 rounded-2xl border p-5" aria-label="Internal plan">
            {detail.version.document.sections.map(section => <section key={section.id} className="space-y-3">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              {section.blocks.map(block => {
                if (block.kind === "paragraph" || block.kind === "callout") return <p key={block.id} className="whitespace-pre-wrap leading-7">{block.text}</p>;
                if (block.kind === "calendar") return <ul key={block.id} className="space-y-2">{block.items.map(item => <li key={item.id}>{item.angle} · {item.destinations.join(", ")} · {item.proposedTime ?? "Time to confirm"}</li>)}</ul>;
                if (block.kind === "sources") return <ul key={block.id} className="space-y-2">{block.sources.map(source => <li key={source.id}><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>;
                return null;
              })}
            </section>)}
          </article>}
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Board comments">
          {historical ? <p className="text-sm text-muted-foreground">This is an earlier version. Return to the latest board to comment or schedule.</p> : <>
            <h2 className="text-xl font-semibold">Comments</h2>
            <p className="text-sm text-muted-foreground">Notes for the whole set. Per-post comments live on each card. Unsent notes turn the button into Review.</p>
            <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!comment.trim()) return;
              void action(async () => { await commentOnPlan(planId, { version: detail.plan.currentVersion, blockId: "board", body: comment, scope: "board" }); setComment(""); }, "Comment saved."); }}>
              <label className="block text-sm font-medium" htmlFor="board-comment">General comment</label>
              <textarea ref={input} id="board-comment" className="min-h-28 w-full rounded-lg border bg-background p-3" value={comment} onChange={event => setComment(event.target.value)} maxLength={4000} />
              <button className="min-h-11 rounded-lg border px-4 disabled:opacity-50" disabled={busy || !comment.trim()}>Save comment</button>
            </form>
            <ul className="space-y-3">{boardComments.map((item: PlanComment) => <li key={item.id} className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.scope === "post" ? "Post" : "Board"} · {item.status}</p>
              <p className="mt-2 whitespace-pre-wrap break-words">{item.body}</p>
            </li>)}</ul>
          </>}
        </aside>
      </div>
    </>}
  </div></AppShell>;
}
