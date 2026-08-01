import { Play } from "lucide-react";

export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-[#0a0a0a] pt-28 md:pt-36"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.065),transparent_52%)]"
      />

      <div className="content-container relative z-10">
        <header className="mx-auto max-w-4xl text-center">
          <p className="eyebrow">AI social media department</p>
          <h1
            id="hero-title"
            className="display-heading mx-auto mt-6 max-w-4xl text-[2.25rem] sm:text-5xl lg:text-[4rem]"
          >
            The always-on AI social media department for your brand
          </h1>
          <p className="body-copy mx-auto mt-7 max-w-2xl">
            Turns your business knowledge into a consistent, strategic,
            authentic online presence. Stay relevant and active without
            running social media yourself.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#cta"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-base font-medium text-black transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
            >
              Start for Free
            </a>
            <a
              href="#how-it-works-title"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-transparent px-7 text-base font-medium text-white transition-colors hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-white/20 focus-visible:outline-none"
            >
              See how it works
            </a>
          </div>
        </header>

        <div className="relative mx-auto mt-20 max-w-5xl md:mt-24">
          <div className="relative min-h-[19rem] overflow-hidden rounded-2xl border border-white/10 bg-[#161616] shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:min-h-[27rem] lg:min-h-[32rem]">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(20,184,166,0.16),transparent_33%),radial-gradient(circle_at_78%_24%,rgba(217,70,239,0.14),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.12),transparent_38%)]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 flex h-12 items-center gap-2 border-b border-white/[0.08] px-5"
            >
              <span className="size-2 rounded-full bg-white/20" />
              <span className="size-2 rounded-full bg-white/15" />
              <span className="size-2 rounded-full bg-white/10" />
            </div>

            <div className="absolute inset-0 grid place-items-center px-6 pt-12 text-center">
              <div>
                <button
                  type="button"
                  aria-label="Play Sochestral product demo"
                  className="mx-auto grid size-16 place-items-center rounded-full border border-white/15 bg-white text-black shadow-2xl transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-white/25 focus-visible:outline-none sm:size-20"
                >
                  <Play
                    aria-hidden="true"
                    className="ml-1 size-5 fill-current sm:size-6"
                  />
                </button>
                <p className="mt-5 text-sm font-medium text-white/75">
                  Product demo preview
                </p>
                <p className="mt-1 text-xs text-white/35">
                  See Sochestral turn brand knowledge into daily content
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-16 h-3 w-full bg-[linear-gradient(90deg,#14b8a6_0%,#3b82f6_30%,#d946ef_66%,#f97316_100%)] sm:h-4"
      />
    </section>
  );
}
