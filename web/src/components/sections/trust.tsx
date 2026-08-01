import {
  DatabaseZap,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

const complianceBadges = [
  {
    label: "SOC 2",
    detail: "Controls ready",
    icon: ShieldCheck,
  },
  {
    label: "GDPR",
    detail: "Privacy aligned",
    icon: FileCheck2,
  },
  {
    label: "Encrypted",
    detail: "Storage at rest",
    icon: LockKeyhole,
  },
  {
    label: "Protected",
    detail: "Secure handling",
    icon: DatabaseZap,
  },
];

export function Trust() {
  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      className="section-shell section-divider"
    >
      <div className="content-container">
        <header className="section-centered">
          <p className="eyebrow">Security &amp; compliance</p>
          <h2 id="trust-title" className="section-heading mt-5">
            Enterprise-grade security for your brand&apos;s voice
          </h2>
          <p className="body-copy mx-auto mt-6 max-w-2xl">
            Your brand knowledge and customer data are protected with
            privacy-first infrastructure, encrypted storage, and compliance
            practices built for growing teams.
          </p>
        </header>

        <ul
          aria-label="Security and compliance standards"
          className="mt-14 grid overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.015] sm:grid-cols-2 lg:mt-20 lg:grid-cols-4"
        >
          {complianceBadges.map(({ label, detail, icon: Icon }) => (
            <li
              key={label}
              className="flex min-h-36 items-center justify-center gap-4 border-b border-white/[0.09] px-5 py-7 last:border-b-0 sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-r lg:border-b-0 lg:last:border-r-0"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-white/65">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </span>
              <span>
                <span className="block text-sm font-medium tracking-[0.04em] text-white/80 uppercase">
                  {label}
                </span>
                <span className="mt-1 block text-xs text-white/40">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
