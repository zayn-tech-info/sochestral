import type { SVGProps } from "react";

const footerGroups = [
  {
    title: "Product",
    links: ["Features", "Integrations", "Pricing"],
  },
  {
    title: "Resources",
    links: ["Docs", "Blog", "Support"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Contact"],
  },
];

const socialLinks = [
  { label: "X", icon: XLogo },
  { label: "LinkedIn", icon: LinkedInLogo },
  { label: "GitHub", icon: GitHubLogo },
];

function XLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M5 4.5 18.75 19.5M19 4.5 5.25 19.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkedInLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M6.55 8.2H3.2V19h3.35V8.2ZM6.77 4.86c0-1.07-.86-1.86-1.89-1.86S3 3.79 3 4.86c0 1.04.83 1.86 1.84 1.86h.02c1.05 0 1.91-.82 1.91-1.86ZM19 12.81c0-3.31-1.76-4.85-4.12-4.85-1.9 0-2.75 1.04-3.22 1.78V8.2H8.31c.04 1.02 0 10.8 0 10.8h3.35v-6.03c0-.32.02-.64.12-.87.24-.64.78-1.31 1.69-1.31 1.19 0 1.67.91 1.67 2.25V19H19v-6.19Z" />
    </svg>
  );
}

function GitHubLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2.75a9.5 9.5 0 0 0-3 18.51c.48.09.65-.2.65-.46v-1.67c-2.66.58-3.22-1.13-3.22-1.13-.43-1.11-1.06-1.4-1.06-1.4-.87-.6.07-.59.07-.59.96.07 1.47.99 1.47.99.86 1.47 2.25 1.05 2.8.8.09-.62.33-1.05.61-1.29-2.12-.24-4.35-1.06-4.35-4.7 0-1.04.37-1.89.99-2.56-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.61.98a9.06 9.06 0 0 1 4.76 0c1.81-1.24 2.61-.98 2.61-.98.52 1.31.19 2.28.09 2.52.62.67.99 1.52.99 2.56 0 3.65-2.24 4.46-4.37 4.7.34.3.65.88.65 1.77v2.48c0 .26.17.56.66.46A9.5 9.5 0 0 0 12 2.75Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#0a0a0a]">
      <div className="content-container pt-20 pb-8 md:pt-24">
        <div className="grid gap-16 pb-16 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-12 md:pb-20 lg:grid-cols-2">
          <div className="max-w-sm">
            <a
              href="#"
              aria-label="Sochestral home"
              className="inline-flex items-center gap-3 text-lg font-semibold tracking-[-0.03em] text-white"
            >
              <span className="grid size-8 place-items-center rounded-full bg-white text-xs font-bold text-black">
                S
              </span>
              Sochestral
            </a>
            <p className="mt-6 text-base leading-7 text-white/45">
              Always-on AI social media, powered by your brand knowledge.
            </p>
          </div>

          <nav
            aria-label="Footer navigation"
            className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3"
          >
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-xs font-medium tracking-[0.1em] text-white/40 uppercase">
                  {group.title}
                </h2>
                <ul className="mt-5 space-y-3.5">
                  {group.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-white/65 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-6 border-t border-white/[0.09] pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {socialLinks.map(({ label, icon: Icon }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="grid size-9 place-items-center rounded-full border border-white/10 text-white/45 transition-colors hover:border-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:outline-none"
              >
                <Icon aria-hidden="true" className="size-4" />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-6 text-xs text-white/40">
            <a href="#" className="transition-colors hover:text-white/80">
              Terms
            </a>
            <a href="#" className="transition-colors hover:text-white/80">
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
