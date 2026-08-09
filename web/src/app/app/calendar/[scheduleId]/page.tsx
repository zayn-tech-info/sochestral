import { ScheduleDetailView } from "@/components/app/schedule-detail";

export default async function CalendarDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  return <ScheduleDetailView scheduleId={scheduleId} />;
}
