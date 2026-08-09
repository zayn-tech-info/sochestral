import { Suspense } from "react";

import { ChannelsSettings } from "@/components/app/channels-settings";

export default function WhatsAppChannelsPage() {
  return (
    <Suspense fallback={<div className="settings-content">Loading channels…</div>}>
      <ChannelsSettings />
    </Suspense>
  );
}
