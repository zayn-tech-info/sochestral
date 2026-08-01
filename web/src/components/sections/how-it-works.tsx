import { FileText, Send, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const steps = [
  {
    number: "01",
    title: "Feed it your brand",
    description:
      "Connect your docs, website, past posts, and brand voice so Sochestral learns what makes your business distinct.",
    icon: FileText,
  },
  {
    number: "02",
    title: "AI plans and creates",
    description:
      "A strategic content calendar takes shape while on-brand posts are generated automatically around your goals.",
    icon: Sparkles,
  },
  {
    number: "03",
    title: "Publishes and engages",
    description:
      "Posts, replies, and analytics are handled across platforms, keeping your presence active and responsive.",
    icon: Send,
  },
];

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-title"
      className="section-shell section-divider"
    >
      <div className="content-container">
        <header className="section-centered">
          <p className="eyebrow">How it works</p>
          <h2 id="how-it-works-title" className="section-heading mt-5">
            From business knowledge to daily content, automatically
          </h2>
        </header>

        <ol className="mt-14 grid list-none gap-4 md:mt-20 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <li key={step.number} className="h-full">
                <Card className="h-full gap-0 rounded-2xl py-0">
                  <CardHeader className="gap-0 p-6 pb-0 md:p-8 md:pb-0">
                    <div
                      aria-hidden="true"
                      className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/70"
                    >
                      <Icon className="size-5" strokeWidth={1.5} />
                    </div>
                    <p className="eyebrow mt-10">{step.number}</p>
                    <CardTitle className="mt-4 text-xl leading-tight font-medium tracking-[-0.025em] md:text-2xl">
                      <h3>{step.title}</h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 pt-5 md:p-8 md:pt-5">
                    <CardDescription className="text-base leading-7 text-muted-foreground">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
