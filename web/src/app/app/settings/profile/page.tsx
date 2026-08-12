import { redirect } from "next/navigation";

export default function LegacyProfileSettingsPage() {
  redirect("/app/settings/personal");
}
