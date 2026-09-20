import { PlanViewer } from "@/components/app/plan-viewer";
export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return <PlanViewer planId={planId} />;
}
