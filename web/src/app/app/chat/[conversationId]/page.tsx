import { ChatWorkspace } from "@/components/app/chat-workspace";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ChatWorkspace conversationId={conversationId} />;
}
