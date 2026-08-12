"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import {
  PLATFORM_LABELS,
} from "@/lib/calendar-week";
import type { CalendarAccount, ConnectorPlatform } from "@/lib/product-api";
import { cn } from "@/lib/utils";

const PLATFORM_ORDER: ConnectorPlatform[] = [
  "threads",
  "linkedin_personal",
  "instagram",
];

function PlatformGlyph({ platform }: { platform: ConnectorPlatform }) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;
  return (
    <span
      className={cn(
        "pap-platform-glyph",
        `pap-platform-glyph-${platform}`,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}

function AccountRowAvatar({ account }: { account: CalendarAccount }) {
  const initial = (account.label || "?").slice(0, 1).toUpperCase();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(account.avatarHint) && !failed;
  const referrerPolicy =
    account.platform === "linkedin_personal" ? undefined : "no-referrer";
  return (
    <span className="pap-account-avatar" aria-hidden="true">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={account.avatarHint!}
          alt=""
          className="pap-account-avatar-img"
          {...(referrerPolicy ? { referrerPolicy } : {})}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pap-account-avatar-fallback">{initial}</span>
      )}
    </span>
  );
}

export type PlatformAccountPickerProps = {
  accounts: CalendarAccount[];
  selectedAccountIds: string[];
  onChange: (nextIds: string[]) => void;
  /** filter = calendar/list; target = schedule modal */
  mode?: "filter" | "target";
  /** Account ids that cannot be unchecked (e.g. source schedule). */
  lockedAccountIds?: string[];
  className?: string;
  "aria-label"?: string;
};

export function PlatformAccountPicker({
  accounts,
  selectedAccountIds,
  onChange,
  mode = "filter",
  lockedAccountIds = [],
  className,
  "aria-label": ariaLabel = "Platform accounts",
}: PlatformAccountPickerProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openPlatform, setOpenPlatform] = useState<ConnectorPlatform | null>(
    null,
  );
  const selected = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds],
  );
  const locked = useMemo(
    () => new Set(lockedAccountIds),
    [lockedAccountIds],
  );

  const byPlatform = useMemo(() => {
    const map = new Map<ConnectorPlatform, CalendarAccount[]>();
    for (const platform of PLATFORM_ORDER) map.set(platform, []);
    for (const account of accounts) {
      map.get(account.platform)?.push(account);
    }
    return map;
  }, [accounts]);

  const platformsWithAccounts = PLATFORM_ORDER.filter(
    (platform) => (byPlatform.get(platform)?.length ?? 0) > 0,
  );

  useEffect(() => {
    if (!openPlatform) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPlatform(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPlatform(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openPlatform]);

  function toggleAccount(accountId: string) {
    if (locked.has(accountId) && selected.has(accountId)) return;
    const next = new Set(selected);
    if (next.has(accountId)) {
      // Target mode must keep at least one account for preview/save.
      if (mode === "target" && next.size <= 1) return;
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    onChange(Array.from(next));
  }

  function onPlatformClick(platform: ConnectorPlatform) {
    const rows = byPlatform.get(platform) ?? [];
    if (rows.length === 0) return;
    if (rows.length === 1 && mode === "filter") {
      const only = rows[0]!;
      if (locked.has(only.id) && selected.has(only.id)) return;
      toggleAccount(only.id);
      setOpenPlatform(null);
      return;
    }
    setOpenPlatform((current) => (current === platform ? null : platform));
  }

  function onPlatformKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    platform: ConnectorPlatform,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPlatformClick(platform);
    }
  }

  if (platformsWithAccounts.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={cn("pap-root", `pap-mode-${mode}`, className)}
      role="group"
      aria-label={ariaLabel}
    >
      {platformsWithAccounts.map((platform) => {
        const rows = byPlatform.get(platform) ?? [];
        const selectedCount = rows.filter((row) => selected.has(row.id)).length;
        const isOpen = openPlatform === platform;
        const panelId = `${baseId}-${platform}-panel`;
        return (
          <div key={platform} className="pap-platform">
            <button
              type="button"
              className={cn(
                "pap-platform-btn",
                selectedCount > 0 && "pap-platform-btn-active",
                isOpen && "pap-platform-btn-open",
              )}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              title={PLATFORM_LABELS[platform] ?? platform}
              aria-label={`${PLATFORM_LABELS[platform] ?? platform}${
                selectedCount > 0
                  ? `, ${selectedCount} account${selectedCount === 1 ? "" : "s"} selected`
                  : ""
              }`}
              onClick={() => onPlatformClick(platform)}
              onKeyDown={(event) => onPlatformKeyDown(event, platform)}
            >
              <PlatformGlyph platform={platform} />
              {selectedCount > 0 ? (
                <span className="pap-count" aria-hidden="true">
                  {selectedCount}
                </span>
              ) : null}
            </button>
            {isOpen ? (
              <div
                id={panelId}
                className="pap-popover"
                role="dialog"
                aria-label={`${PLATFORM_LABELS[platform]} accounts`}
              >
                <ul className="pap-account-list">
                  {rows.map((account) => {
                    const checked = selected.has(account.id);
                    const isLocked = locked.has(account.id);
                    const isLastSelected =
                      mode === "target" && checked && selected.size <= 1;
                    const cannotUncheck =
                      (isLocked && checked) || isLastSelected;
                    const handle = account.username
                      ? `@${account.username.replace(/^@/, "")}`
                      : null;
                    return (
                      <li key={account.id}>
                        <label
                          className={cn(
                            "pap-account-row",
                            checked && "pap-account-row-checked",
                            cannotUncheck && "pap-account-row-locked",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="pap-checkbox"
                            checked={checked}
                            disabled={cannotUncheck}
                            onChange={() => toggleAccount(account.id)}
                          />
                          <AccountRowAvatar account={account} />
                          <span className="pap-account-copy">
                            <span className="pap-account-label">
                              {account.label}
                              {isLocked ? " · this schedule" : ""}
                              {isLastSelected && !isLocked
                                ? " · keep one selected"
                                : ""}
                            </span>
                            {handle ? (
                              <span className="pap-account-meta">{handle}</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
