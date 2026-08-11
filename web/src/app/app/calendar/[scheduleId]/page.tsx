import { redirect } from "next/navigation";

export default async function CalendarDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  redirect(`/app/calendar?schedule=${encodeURIComponent(scheduleId)}`);
}
