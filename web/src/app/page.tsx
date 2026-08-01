import { CTA } from "@/components/sections/cta";
import { FeatureAlwaysOn } from "@/components/sections/feature-always-on";
import { FeatureStrategic } from "@/components/sections/feature-strategic";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Integrations } from "@/components/sections/integrations";
import { LogoStrip } from "@/components/sections/logo-strip";
import { Testimonials } from "@/components/sections/testimonials";
import { Trust } from "@/components/sections/trust";

export default function Home() {
  return (
    <main>
      <Hero />
      <LogoStrip />
      <HowItWorks />
      <Integrations />
      <FeatureStrategic />
      <FeatureAlwaysOn />
      <Testimonials />
      <Trust />
      <CTA />
      <Footer />
    </main>
  );
}
