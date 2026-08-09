import { AppShell } from "@/components/app/app-shell";

export default function BrandAssetsPage() {
  return (
    <AppShell
      title="Brand Assets"
      description="Logos, product shots, and reusable creative for publishing."
    >
      <section
        className="settings-content os-settings"
        aria-labelledby="brand-assets-title"
      >
        <h1 id="brand-assets-title" className="sr-only">
          Brand Assets
        </h1>
        <p className="os-context-placeholder">
          Brand asset library is coming soon. Upload and reuse logos and product
          shots from here once this surface ships.
        </p>
        <span className="os-soon-chip">Soon</span>
      </section>
    </AppShell>
  );
}
