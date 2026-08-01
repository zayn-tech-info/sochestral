"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef } from "react";

const testimonials = [
  {
    company: "Northstar",
    initials: "AM",
    quote:
      "Sochestral keeps our voice present every day, even when the whole team is focused on building the product.",
    background:
      "linear-gradient(145deg, #d9ff58 0%, #9bea58 52%, #46d8a0 100%)",
    foreground: "text-[#101a13]",
    secondary: "text-black/60",
    control: "border-black/15 bg-black/[0.06] hover:bg-black/10",
  },
  {
    company: "Vault",
    initials: "JR",
    quote:
      "It turned scattered ideas and old notes into a content rhythm that finally feels intentional and unmistakably ours.",
    background:
      "linear-gradient(145deg, #f05ad9 0%, #b938e4 48%, #6d4cff 100%)",
    foreground: "text-white",
    secondary: "text-white/65",
    control: "border-white/20 bg-white/[0.08] hover:bg-white/15",
  },
  {
    company: "Luma",
    initials: "SK",
    quote:
      "We stay responsive across every channel without asking someone on the team to live inside social media all day.",
    background:
      "linear-gradient(145deg, #5ff3e0 0%, #31cce7 50%, #4da1ff 100%)",
    foreground: "text-[#071923]",
    secondary: "text-black/60",
    control: "border-black/15 bg-black/[0.06] hover:bg-black/10",
  },
];

export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollTestimonials(direction: -1 | 1) {
    const track = trackRef.current;

    if (!track) return;

    track.scrollBy({
      left: direction * Math.max(track.clientWidth * 0.82, 280),
      behavior: "smooth",
    });
  }

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-title"
      className="section-shell section-divider"
    >
      <div className="content-container">
        <header className="section-centered">
          <p className="eyebrow">Trusted by founders</p>
          <h2 id="testimonials-title" className="section-heading mt-5">
            Teams we help stay visible
          </h2>
        </header>

        <div className="relative mt-14 md:mt-20">
          <div
            id="testimonial-track"
            ref={trackRef}
            className="testimonial-track grid auto-cols-[86%] grid-flow-col gap-4 overflow-x-auto pb-2 sm:auto-cols-[60%] lg:auto-cols-[calc((100%-2rem)/3)]"
          >
            {testimonials.map((testimonial) => (
              <article
                key={testimonial.company}
                className={`flex min-h-[28rem] snap-start flex-col rounded-2xl p-7 sm:p-8 ${testimonial.foreground}`}
                style={{ background: testimonial.background }}
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`text-sm font-semibold tracking-[-0.025em] uppercase ${testimonial.secondary}`}
                  >
                    {testimonial.company}
                  </span>
                  <div
                    aria-label={`${testimonial.initials} placeholder avatar`}
                    className={`grid size-11 shrink-0 place-items-center rounded-full border text-xs font-semibold ${testimonial.control}`}
                  >
                    {testimonial.initials}
                  </div>
                </div>

                <blockquote className="mt-16 text-2xl leading-[1.22] font-medium tracking-[-0.035em] sm:text-[1.75rem]">
                  “{testimonial.quote}”
                </blockquote>

                <a
                  href="#testimonials"
                  className={`mt-auto inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${testimonial.control}`}
                >
                  Read the full story
                  <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              </article>
            ))}
          </div>

          <button
            type="button"
            aria-label="Previous testimonial"
            aria-controls="testimonial-track"
            onClick={() => scrollTestimonials(-1)}
            className="absolute top-1/2 left-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next testimonial"
            aria-controls="testimonial-track"
            onClick={() => scrollTestimonials(1)}
            className="absolute top-1/2 right-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black focus-visible:ring-3 focus-visible:ring-white/30 focus-visible:outline-none"
          >
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
