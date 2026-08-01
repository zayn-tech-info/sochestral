import { ArrowRight } from "lucide-react";

export function FeatureStrategic() {
  return (
    <section
      id="strategic-feature"
      aria-labelledby="strategic-feature-title"
      className="section-shell section-divider"
    >
      <div className="content-container split-layout">
        <div
          aria-hidden="true"
          className="visual-panel visual-panel--strategic min-h-[26rem] md:min-h-[34rem]"
        >
          <div className="absolute top-[14%] left-[10%] size-52 rounded-full border border-white/20 bg-white/[0.06] blur-[1px]" />
          <div className="absolute right-[8%] bottom-[8%] size-64 rounded-full border border-black/20 bg-black/10" />
          <div className="absolute inset-[22%] rotate-12 rounded-[2rem] border border-white/25 bg-white/[0.08] shadow-2xl backdrop-blur-md" />
          <div className="absolute top-1/2 left-1/2 h-px w-2/3 -translate-x-1/2 -rotate-12 bg-white/35" />
        </div>

        <div className="max-w-xl md:pl-4">
          <p className="eyebrow">Strategic by design</p>
          <h2 id="strategic-feature-title" className="section-heading mt-5">
            Not just auto-posting. Actual strategy.
          </h2>
          <p className="body-copy mt-6">
            Sochestral understands your brand voice, business goals, and
            audience, then uses that context to plan content strategically—not
            churn out generic filler posts.
          </p>
          <a
            href="#strategic-feature"
            className="mt-8 -ml-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Learn more
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
