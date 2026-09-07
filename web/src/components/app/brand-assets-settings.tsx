"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Save,
} from "lucide-react";

import { ApiError, apiRequest } from "@/lib/product-api";
import {
  isUploadableImageFile,
  uploadImagesForSchedule,
} from "@/lib/media-upload";
import { userFacingError } from "@/lib/user-facing-error";
import { AppShell } from "./app-shell";
import { useToast } from "./toast-provider";

type BrandKind = "logo" | "reference_image" | "color" | "design_note";

type BrandAssetItem = {
  id: string;
  kind: BrandKind;
  name: string;
  mediaAssetId: string | null;
  colorValue: string | null;
  noteText: string | null;
  sortOrder: number;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RecentJob = {
  id: string;
  status: string;
  kind: string;
  resultMediaAssetId: string | null;
  resultPreviewUrl?: string | null;
  completedAt: string | null;
};

const COLOR_SLOTS = [
  { key: "primary", name: "Primary", fallback: "#111111" },
  { key: "secondary", name: "Secondary", fallback: "#f211b6" },
  { key: "accent", name: "Accent", fallback: "#5b5b5b" },
] as const;

type ColorSlotKey = (typeof COLOR_SLOTS)[number]["key"];

/** Beta cap until plan based limits ship with Feature 6. */
const BRAND_IMAGE_CAP = 12;

function imageActionHeaders(): HeadersInit {
  return { "X-Sochestral-Request": "image-action" };
}

function normalizeHex(value: string): string | null {
  const raw = value.trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) return withHash.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const a = withHash[1]!;
    const b = withHash[2]!;
    const c = withHash[3]!;
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return null;
}

export function BrandAssetsSettings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BrandAssetItem[]>([]);
  const [recent, setRecent] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingPalette, setSavingPalette] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [palette, setPalette] = useState<Record<ColorSlotKey, string>>({
    primary: "#111111",
    secondary: "#f211b6",
    accent: "#5b5b5b",
  });
  const [hexDraft, setHexDraft] = useState<Record<ColorSlotKey, string>>({
    primary: "#111111",
    secondary: "#f211b6",
    accent: "#5b5b5b",
  });
  const [noteText, setNoteText] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [briefUpdating, setBriefUpdating] = useState(false);

  const imageItems = useMemo(
    () =>
      items.filter(
        (item) => item.kind === "logo" || item.kind === "reference_image",
      ),
    [items],
  );
  const colorItems = useMemo(
    () => items.filter((item) => item.kind === "color"),
    [items],
  );
  const atImageCap = imageItems.length >= BRAND_IMAGE_CAP;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [library, generations, brief] = await Promise.all([
        apiRequest<{ items: BrandAssetItem[] }>("/brand-assets"),
        apiRequest<{ items: RecentJob[] }>("/brand-assets/recent-generations"),
        apiRequest<{
          status: string;
          updating: boolean;
          compiledAt: string | null;
          errorCode: string | null;
        }>("/brand-assets/design-brief"),
      ]);
      setItems(library.items);
      setRecent(generations.items);
      setBriefUpdating(brief.updating);

      const nextPalette = { ...palette };
      const nextHex = { ...hexDraft };
      for (const slot of COLOR_SLOTS) {
        const match = library.items.find(
          (item) =>
            item.kind === "color" &&
            item.name.toLowerCase() === slot.name.toLowerCase() &&
            item.colorValue,
        );
        const value = normalizeHex(match?.colorValue ?? slot.fallback) ?? slot.fallback;
        nextPalette[slot.key] = value;
        nextHex[slot.key] = value;
      }
      setPalette(nextPalette);
      setHexDraft(nextHex);

      const note = library.items.find((item) => item.kind === "design_note");
      setNoteId(note?.id ?? null);
      setNoteText(note?.noteText ?? "");
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not load brand assets",
        description: userFacingError(error),
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from server
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!briefUpdating) return;
    const timer = window.setInterval(() => {
      void apiRequest<{ updating: boolean }>("/brand-assets/design-brief")
        .then((brief) => {
          setBriefUpdating(brief.updating);
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [briefUpdating]);

  async function uploadImages(files: File[]) {
    const accepted = files.filter(isUploadableImageFile);
    if (accepted.length === 0) {
      toast({
        tone: "error",
        title: "Unsupported file",
        description: "Use JPEG, PNG, or WebP.",
      });
      return;
    }
    const room = Math.max(0, BRAND_IMAGE_CAP - imageItems.length);
    if (room === 0) {
      toast({
        tone: "info",
        title: `Library full (${BRAND_IMAGE_CAP} images)`,
        description: "Archive one before adding more.",
      });
      return;
    }
    const batch = accepted.slice(0, room);
    setUploading(true);
    try {
      const uploaded = await uploadImagesForSchedule(batch);
      for (const [index, entry] of uploaded.entries()) {
        const file = batch[index];
        await apiRequest("/brand-assets", {
          method: "POST",
          headers: imageActionHeaders(),
          body: JSON.stringify({
            kind: index === 0 && imageItems.length === 0 ? "logo" : "reference_image",
            name: file?.name?.replace(/\.[^.]+$/, "") || `Brand image ${imageItems.length + index + 1}`,
            mediaAssetId: entry.assetId,
          }),
        });
      }
      toast({
        tone: "success",
        title:
          batch.length === 1
            ? "Image added to brand library"
            : `${batch.length} images added to brand library`,
      });
      await load();
    } catch (error) {
      toast({
        tone: "error",
        title: "Upload failed",
        description: userFacingError(error),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function archive(id: string) {
    setBusy(true);
    try {
      await apiRequest(`/brand-assets/${id}`, {
        method: "DELETE",
        headers: imageActionHeaders(),
      });
      toast({ tone: "success", title: "Removed from library" });
      await load();
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not remove",
        description: userFacingError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePalette() {
    setSavingPalette(true);
    try {
      for (const slot of COLOR_SLOTS) {
        const hex = normalizeHex(hexDraft[slot.key]);
        if (!hex) {
          toast({
            tone: "error",
            title: `Invalid ${slot.name} color`,
            description: "Use a hex like #f211b6.",
          });
          return;
        }
        const existing = colorItems.find(
          (item) => item.name.toLowerCase() === slot.name.toLowerCase(),
        );
        if (existing) {
          await apiRequest(`/brand-assets/${existing.id}`, {
            method: "PATCH",
            headers: imageActionHeaders(),
            body: JSON.stringify({ colorValue: hex, name: slot.name }),
          });
        } else {
          await apiRequest("/brand-assets", {
            method: "POST",
            headers: imageActionHeaders(),
            body: JSON.stringify({
              kind: "color",
              name: slot.name,
              colorValue: hex,
            }),
          });
        }
        setPalette((current) => ({ ...current, [slot.key]: hex }));
        setHexDraft((current) => ({ ...current, [slot.key]: hex }));
      }
      toast({ tone: "success", title: "Brand colors saved" });
      await load();
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not save colors",
        description: userFacingError(error),
      });
    } finally {
      setSavingPalette(false);
    }
  }

  async function saveNote() {
    const body = noteText.trim();
    if (!body) {
      toast({
        tone: "error",
        title: "Add a design note first",
      });
      return;
    }
    setSavingNote(true);
    try {
      if (noteId) {
        await apiRequest(`/brand-assets/${noteId}`, {
          method: "PATCH",
          headers: imageActionHeaders(),
          body: JSON.stringify({ noteText: body, name: "Design notes" }),
        });
      } else {
        await apiRequest("/brand-assets", {
          method: "POST",
          headers: imageActionHeaders(),
          body: JSON.stringify({
            kind: "design_note",
            name: "Design notes",
            noteText: body,
          }),
        });
      }
      toast({ tone: "success", title: "Design notes saved" });
      await load();
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not save notes",
        description: userFacingError(error),
      });
    } finally {
      setSavingNote(false);
    }
  }

  async function addRecentToLibrary(job: RecentJob) {
    if (!job.resultMediaAssetId) return;
    if (atImageCap) {
      toast({
        tone: "info",
        title: `Library full (${BRAND_IMAGE_CAP} images)`,
        description: "Archive one before adding more.",
      });
      return;
    }
    if (imageItems.some((item) => item.mediaAssetId === job.resultMediaAssetId)) {
      toast({ tone: "info", title: "Already in your brand library" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/brand-assets", {
        method: "POST",
        headers: imageActionHeaders(),
        body: JSON.stringify({
          kind: "reference_image",
          name: `Generation ${job.kind}`,
          mediaAssetId: job.resultMediaAssetId,
        }),
      });
      toast({ tone: "success", title: "Added to brand library" });
      await load();
    } catch (error) {
      toast({
        tone: "error",
        title: "Could not add to library",
        description: userFacingError(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function onHexChange(key: ColorSlotKey, value: string) {
    setHexDraft((current) => ({ ...current, [key]: value }));
    const normalized = normalizeHex(value);
    if (normalized) {
      setPalette((current) => ({ ...current, [key]: normalized }));
    }
  }

  return (
    <AppShell
      title="Brand Assets"
      description="Logos, style references, and colors the agent uses when you opt in for branded creatives."
    >
      <section
        className="settings-content os-settings brand-assets-page"
        aria-labelledby="brand-assets-title"
      >
        <header className="brand-assets-hero">
          <div>
            <h1 id="brand-assets-title" className="sr-only">
              Brand Assets
            </h1>
            <p className="brand-assets-lead">
              Upload sample visuals and lock your palette so flyers and posters
              follow your look, not a random style.
            </p>
            {briefUpdating ? (
              <p className="brand-assets-brief-status" role="status">
                Style brief updating
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="os-ghost-btn"
            onClick={() => void load()}
            disabled={loading || busy || uploading}
            aria-label="Refresh brand assets"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </button>
        </header>

        <section className="brand-panel" aria-labelledby="brand-visuals-title">
          <div className="brand-panel-head">
            <div>
              <h2 id="brand-visuals-title">Visual references</h2>
              <p>
                Logos and style samples the agent can read when you ask for
                branded creatives. {imageItems.length}/{BRAND_IMAGE_CAP} used.
              </p>
            </div>
            <button
              type="button"
              className="os-primary-btn"
              disabled={uploading || atImageCap || busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
              {uploading ? "Uploading…" : "Add images"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple
              className="sr-only"
              disabled={uploading || atImageCap}
              onChange={(event) => {
                void uploadImages(Array.from(event.target.files ?? []));
              }}
            />
          </div>

          <div
            className={`brand-dropzone${dragOver ? " brand-dropzone-active" : ""}${atImageCap ? " brand-dropzone-full" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!atImageCap) setDragOver(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (atImageCap) return;
              void uploadImages(Array.from(event.dataTransfer.files));
            }}
          >
            {loading ? (
              <p className="brand-empty">Loading library…</p>
            ) : imageItems.length === 0 ? (
              <button
                type="button"
                className="brand-empty-cta"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-6" aria-hidden="true" />
                <span>Drop images here or browse</span>
                <em>JPEG, PNG, or WebP · up to {BRAND_IMAGE_CAP}</em>
              </button>
            ) : (
              <ul className="brand-image-grid">
                {imageItems.map((item) => (
                  <li key={item.id} className="brand-image-tile">
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.previewUrl} alt={item.name} />
                    ) : (
                      <div className="brand-image-fallback" aria-hidden="true">
                        {item.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="brand-image-meta">
                      <strong>{item.name}</strong>
                      <span>
                        {item.kind === "logo" ? "Logo" : "Reference"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="brand-image-remove"
                      disabled={busy || uploading}
                      onClick={() => void archive(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Archive className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="brand-panel" aria-labelledby="brand-colors-title">
          <div className="brand-panel-head">
            <div>
              <h2 id="brand-colors-title">Color palette</h2>
              <p>
                Primary, secondary, and accent. Pick with the swatch or paste an
                exact hex code.
              </p>
            </div>
            <button
              type="button"
              className="os-primary-btn"
              disabled={savingPalette || loading}
              onClick={() => void savePalette()}
            >
              {savingPalette ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Save colors
            </button>
          </div>

          <ul className="brand-palette">
            {COLOR_SLOTS.map((slot) => (
              <li key={slot.key} className="brand-swatch">
                <label className="brand-swatch-preview">
                  <span className="sr-only">{slot.name} color picker</span>
                  <input
                    type="color"
                    value={palette[slot.key]}
                    disabled={savingPalette}
                    onChange={(event) => {
                      const value = event.target.value.toLowerCase();
                      setPalette((current) => ({
                        ...current,
                        [slot.key]: value,
                      }));
                      setHexDraft((current) => ({
                        ...current,
                        [slot.key]: value,
                      }));
                    }}
                  />
                  <span
                    className="brand-swatch-chip"
                    style={{ background: palette[slot.key] }}
                    aria-hidden="true"
                  />
                </label>
                <div className="brand-swatch-fields">
                  <p className="brand-swatch-label">{slot.name}</p>
                  <p className="brand-swatch-hint">Click swatch to pick</p>
                  <label className="brand-hex-field">
                    <span>Hex</span>
                    <input
                      value={hexDraft[slot.key]}
                      onChange={(event) =>
                        onHexChange(slot.key, event.target.value)
                      }
                      spellCheck={false}
                      maxLength={7}
                      disabled={savingPalette}
                      placeholder="#000000"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="brand-panel" aria-labelledby="brand-notes-title">
          <div className="brand-panel-head">
            <div>
              <h2 id="brand-notes-title">Design notes</h2>
              <p>
                Optional voice or layout rules, for example “no stock people” or
                “keep type bold and short.”
              </p>
            </div>
            <button
              type="button"
              className="os-primary-btn"
              disabled={savingNote || loading}
              onClick={() => void saveNote()}
            >
              {savingNote ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Save notes
            </button>
          </div>
          <label className="brand-note-field">
            <span className="sr-only">Design notes</span>
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="How should branded creatives feel?"
              disabled={savingNote}
            />
          </label>
        </section>

        <section className="brand-panel" aria-labelledby="brand-recent-title">
          <div className="brand-panel-head">
            <div>
              <h2 id="brand-recent-title">Recent generations</h2>
              <p>
                Keep a finished image as a brand reference so later flyers can
                match it.
              </p>
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="brand-empty">
              Generated images show here after you confirm a job in chat.
            </p>
          ) : (
            <ul className="brand-recent-grid">
              {recent.map((job) => (
                <li key={job.id} className="brand-recent-tile">
                  {job.resultPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.resultPreviewUrl}
                      alt={`${job.kind} generation`}
                    />
                  ) : (
                    <div className="brand-image-fallback" aria-hidden="true">
                      Gen
                    </div>
                  )}
                  <div className="brand-recent-meta">
                    <strong>{job.kind.replaceAll("_", " ")}</strong>
                    <button
                      type="button"
                      className="os-ghost-btn"
                      disabled={busy || atImageCap || !job.resultMediaAssetId}
                      onClick={() => void addRecentToLibrary(job)}
                    >
                      Add to library
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </AppShell>
  );
}
