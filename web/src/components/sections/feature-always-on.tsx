const stats = [
  { value: "24/7", label: "Active" },
  { value: "4", label: "Platforms" },
  { value: "0", label: "Manual posting" },
];

export function FeatureAlwaysOn() {
  return (
    <section
      id="always-on-feature"
      aria-labelledby="always-on-feature-title"
      className="section-shell section-divider"
    >
      <div className="content-container split-layout">
        <div className="max-w-xl md:pr-4">
          <p className="eyebrow">Always on</p>
          <h2 id="always-on-feature-title" className="section-heading mt-5">
            Your social media department that never sleeps
          </h2>
          <p className="body-copy mt-6">
            Sochestral keeps content scheduled, replies to comments, and keeps
            your brand active every day—without the manual work of checking in
            and posting yourself.
          </p>

          <dl className="mt-10 grid grid-cols-3 border-y border-white/10 py-5">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={
                  index === 0
                    ? "grid min-w-0 place-items-center px-2 text-center"
                    : "grid min-w-0 place-items-center border-l border-white/10 px-2 text-center"
                }
              >
                <dt className="order-2 mt-2 text-[0.65rem] leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase sm:text-xs">
                  {stat.label}
                </dt>
                <dd className="order-1 text-2xl leading-none font-medium tracking-[-0.035em] text-white sm:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          aria-hidden="true"
          className="visual-panel visual-panel--always-on min-h-[26rem] md:min-h-[34rem]"
        >
          <div className="absolute top-1/2 left-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
          <div className="absolute top-1/2 left-1/2 size-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-white/[0.06] backdrop-blur-sm" />
          <div className="absolute top-1/2 left-1/2 size-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75 shadow-[0_0_80px_rgba(255,255,255,0.5)]" />
          <div className="absolute top-[15%] left-1/2 h-[70%] w-px -translate-x-1/2 rotate-45 bg-white/25" />
          <div className="absolute top-[15%] left-1/2 h-[70%] w-px -translate-x-1/2 -rotate-45 bg-white/25" />
        </div>
      </div>
    </section>
  );
}
