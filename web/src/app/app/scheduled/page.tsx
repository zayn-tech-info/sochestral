import { Suspense } from "react";

import { ScheduledPostsList } from "@/components/app/scheduled-posts-list";

export default function ScheduledPostsPage() {
  return (
    <Suspense fallback={<main className="cal-page-fallback">Loading schedules…</main>}>
      <ScheduledPostsList />
    </Suspense>
  );
}
