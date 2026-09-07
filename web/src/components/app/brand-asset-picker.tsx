"use client";

import { useEffect, useMemo, useState } from "react";
import { Palette } from "lucide-react";

import {
  ApiError,
  listBrandAssets,
  type BrandAssetItem,
} from "@/lib/product-api";

export const SLASH_COMMANDS = [
  {
    id: "brand-asset",
    token: "/brand-asset",
    label: "Brand assets",
    hint: "Use your logo, colors, and style references",
  },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];

export function detectSlashQuery(
  value: string,
): { query: string; from: number } | null {
  const match = value.match(/(^|\s)\/([a-z0-9-]*)$/i);
  if (!match) return null;
  return {
    query: match[2] ?? "",
    from: value.length - (match[2]?.length ?? 0) - 1,
  };
}

export function matchingSlashCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  return SLASH_COMMANDS.filter((command) => {
    const token = command.token.slice(1);
    return (
      token.startsWith(needle) ||
      command.label.toLowerCase().includes(needle) ||
      command.id.replaceAll("-", "").startsWith(needle.replaceAll("-", ""))
    );
  });
}

export function applySlashCommand(value: string, token: string): string {
  const detected = detectSlashQuery(value);
  if (!detected) {
    const prefix = value.trim().length ? `${value.trimEnd()} ` : "";
    return `${prefix}${token} `;
  }
  return `${value.slice(0, detected.from)}${token} `;
}

export function BrandAssetPicker({
  open,
  selectedIds,
  onToggle,
  onClose,
}: {
  open: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BrandAssetItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void listBrandAssets()
      .then((result) => setItems(result.items ?? []))
      .catch((err) => {
        setError(err instanceof ApiError ? err.code : "LOAD_FAILED");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (!open) return null;

  return (
    <div className="brand-asset-picker" role="dialog" aria-label="Brand assets">
      <div className="brand-asset-picker-head">
        <p>Pick brand assets</p>
        <button type="button" onClick={onClose} aria-label="Close brand picker">
          Close
        </button>
      </div>
      {loading ? <p className="os-context-placeholder">Loading…</p> : null}
      {error ? (
        <p className="image-proposal-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && items.length === 0 ? (
        <p className="os-context-placeholder">
          No brand assets yet. Add some in Settings → Brand Assets.
        </p>
      ) : null}
      <ul className="brand-asset-picker-list">
        {items.map((item) => {
          const checked = selected.has(item.id);
          return (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                />
                <span>
                  <strong>{item.name}</strong>
                  <em>{item.kind}</em>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {selectedIds.length ? (
        <p className="brand-asset-picker-foot">
          {selectedIds.length} selected for the next image proposal
        </p>
      ) : null}
    </div>
  );
}

export function SlashCommandMenu({
  open,
  commands,
  onSelect,
}: {
  open: boolean;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
}) {
  if (!open || commands.length === 0) return null;

  return (
    <div className="slash-command-menu" role="listbox" aria-label="Chat commands">
      <p className="slash-command-menu-kicker">Commands</p>
      <ul>
        {commands.map((command) => (
          <li key={command.id}>
            <button
              type="button"
              role="option"
              aria-selected="true"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(command);
              }}
            >
              <Palette className="size-4" aria-hidden="true" />
              <span>
                <strong>{command.label}</strong>
                <em>{command.hint}</em>
              </span>
              <code>{command.token}</code>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Detect trailing `/brand-asset` token to open the picker (UI only; not authority). */
export function detectBrandAssetSlash(value: string): boolean {
  return /(?:^|\s)\/brand-asset(?:\s|$)/i.test(value);
}

export function stripBrandAssetSlash(value: string): string {
  return value
    .replace(/(^|\s)\/brand-asset(?=\s|$)/gi, "$1")
    .replace(/\s+/g, " ")
    .trimStart();
}
