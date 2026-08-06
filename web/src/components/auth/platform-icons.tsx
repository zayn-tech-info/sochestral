import type { ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function IconShell({
  className,
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <span
      className={cn("auth-platform-icon", className)}
      title={label}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.94 8.5H3.75V20h3.19V8.5ZM5.34 3.5A1.85 1.85 0 1 0 5.35 7.2a1.85 1.85 0 0 0-.01-3.7ZM20.25 20h-3.18v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.15 1.45-2.15 2.96V20H9.88V8.5h3.05v1.57h.04c.42-.8 1.46-1.65 3.01-1.65 3.22 0 3.82 2.12 3.82 4.87V20Z" />
    </svg>
  );
}

function ThreadsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.3 11.1c-.1-.05-.2-.1-.3-.13a5.3 5.3 0 0 0-.7-3.2c-.7-1.2-1.9-1.8-3.6-1.8-2.7 0-4.4 1.7-4.5 4.5h2.1c.05-1.4.7-2.3 2.4-2.3 1.4 0 2.2.8 2.4 2.2-1.3-.08-2.6.05-3.8.4-1.9.55-3.1 1.7-3.1 3.5 0 2.1 1.7 3.5 4 3.5 1.5 0 2.7-.55 3.5-1.65.4.9 1 1.4 2.1 1.55v-2c-.5-.1-.8-.4-1-.9a5.6 5.6 0 0 0 .8-3.02Zm-4.1 4.1c-1.1 0-1.8-.55-1.8-1.4 0-.9.7-1.5 2.1-1.85.7-.18 1.5-.27 2.2-.28-.2 2.05-1.1 3.53-2.5 3.53Z" />
    </svg>
  );
}

function TikTokIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M19.5 8.2a6.4 6.4 0 0 1-3.8-1.2v7.1a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.08v2.75a2.95 2.95 0 1 0 2.05 2.82V2.5h2.75a3.7 3.7 0 0 0 3.8 3.7v2Z" />
    </svg>
  );
}

function FacebookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14.5 9.5V7.8c0-.5.1-.8.8-.8h1.5V4.5h-2.1c-2.4 0-3.9 1.5-3.9 4v1H9v2.7h1.8V20h3.2v-7.8h2.1l.4-2.7h-2.5Z" />
    </svg>
  );
}

function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.6 4.5h2.1l-4.6 5.3 5.4 7.2h-4.2l-3.3-4.3-3.8 4.3H7.1l4.9-5.6-5.2-6.9h4.3l3 3.9 3.5-3.9Zm-.7 11.4h1.2L7.2 5.7H6L16.9 15.9Z" />
    </svg>
  );
}

function YouTubeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.6 8.2a2.6 2.6 0 0 0-1.8-1.9C18.2 6 12 6 12 6s-6.2 0-7.8.3A2.6 2.6 0 0 0 2.4 8.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 3.8 2.6 2.6 0 0 0 1.8 1.9C5.8 18 12 18 12 18s6.2 0 7.8-.3a2.6 2.6 0 0 0 1.8-1.9A27 27 0 0 0 22 12a27 27 0 0 0-.4-3.8ZM10.2 14.7V9.3L14.8 12l-4.6 2.7Z" />
    </svg>
  );
}

function PinterestIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 3.5A8.5 8.5 0 0 0 7.7 19.4c0-.7.1-1.7.4-2.5.3-.9 1.9-7.8 1.9-7.8s-.5-1-.5-2.4c0-2.3 1.3-4 3-4 1.4 0 2.1 1.1 2.1 2.3 0 1.4-.9 3.5-1.4 5.4-.4 1.6.8 2.9 2.4 2.9 2.9 0 4.8-3.7 4.8-8.1 0-3.3-2.2-5.8-6.2-5.8-4.5 0-7.3 3.3-7.3 7.1 0 1.3.4 2.2.9 2.9.2.3.3.4.2.7l-.3 1.3c-.1.3-.3.4-.6.3-1.7-.7-2.5-2.6-2.5-4.7 0-3.5 3-7.7 8.9-7.7 4.8 0 7.9 3.4 7.9 7.2 0 4.9-2.7 8.6-7.1 8.6-1.4 0-2.8-.8-3.2-1.6l-.9 3.3c-.3 1.1-1 2.3-1.6 3.2A8.5 8.5 0 1 0 12 3.5Z" />
    </svg>
  );
}

const platforms = [
  { id: "instagram", label: "Instagram", Icon: InstagramIcon },
  { id: "linkedin", label: "LinkedIn", Icon: LinkedInIcon },
  { id: "threads", label: "Threads", Icon: ThreadsIcon },
  { id: "tiktok", label: "TikTok", Icon: TikTokIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "x", label: "X", Icon: XIcon },
  { id: "youtube", label: "YouTube", Icon: YouTubeIcon },
  { id: "pinterest", label: "Pinterest", Icon: PinterestIcon },
] as const;

type PlatformIconsProps = {
  className?: string;
};

export function PlatformIcons({ className }: PlatformIconsProps) {
  return (
    <ul
      className={cn("auth-platform-row", className)}
      aria-label="Connected social platforms"
    >
      {platforms.map(({ id, label, Icon }) => (
        <li key={id}>
          <IconShell label={label}>
            <Icon className="size-3.5" />
          </IconShell>
          <span className="sr-only">{label}</span>
        </li>
      ))}
    </ul>
  );
}

export { InstagramIcon, LinkedInIcon, ThreadsIcon };
