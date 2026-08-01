import { AtSign } from "lucide-react";

import { cn } from "@/lib/utils";

const platforms = ["Threads", "LinkedIn", "Instagram", "Facebook"] as const;

type Platform = (typeof platforms)[number];

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === "Threads") {
    return <AtSign className="size-6" strokeWidth={1.6} />;
  }

  if (platform === "LinkedIn") {
    return (
      <span className="text-lg leading-none font-semibold tracking-[-0.08em]">
        in
      </span>
    );
  }

  if (platform === "Instagram") {
    return (
      <span className="relative grid size-6 place-items-center rounded-[7px] border-[1.5px] border-current">
        <span className="size-2 rounded-full border-[1.5px] border-current" />
        <span className="absolute top-1 right-1 size-1 rounded-full bg-current" />
      </span>
    );
  }

  return <span className="text-2xl leading-none font-semibold">f</span>;
}

export function Integrations() {
  return (
    <section
      aria-labelledby="integrations-title"
      className="section-shell section-divider"
    >
      <div className="content-container split-layout">
        <div className="max-w-xl">
          <p className="eyebrow">Integrations</p>
          <h2 id="integrations-title" className="section-heading mt-5">
            Works where your audience already is
          </h2>
          <p className="body-copy mt-6 max-w-lg">
            Connect Threads, LinkedIn, Instagram, and Facebook to plan,
            publish, and engage from one coordinated workflow.
          </p>
        </div>

        <ul
          aria-label="Supported social platforms"
          className="grid list-none grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-card"
          role="list"
        >
          {platforms.map((platform, index) => (
            <li
              key={platform}
              className={cn(
                "flex min-h-40 flex-col justify-between gap-8 p-5 sm:min-h-48 sm:p-7",
                index % 2 === 1 && "border-l border-white/10",
                index < 2 && "border-b border-white/10",
              )}
            >
              <div
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/75"
              >
                <PlatformIcon platform={platform} />
              </div>
              <span className="text-base font-medium tracking-[-0.02em] text-white sm:text-lg">
                {platform}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
