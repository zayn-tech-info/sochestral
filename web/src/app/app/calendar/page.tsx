import { Suspense } from "react";

import { ScheduleCalendar } from "@/components/app/schedule-calendar";

export default function CalendarPage() {
  return (
    <Suspense fallback={<main className="cal-page-fallback">Loading calendar…</main>}>
      <ScheduleCalendar />
    </Suspense>
  );
}
