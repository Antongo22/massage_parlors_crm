import { ChatThread } from "@/components/chat/chat-thread";
import { Card, CardContent } from "@/components/ui/card";
import { requireClientProfile } from "@/lib/auth-guards";
import { getMessages, getOrCreateConversation, markRead } from "@/lib/services/chat";

export const dynamic = "force-dynamic";

export default async function MyChatPage() {
  const { client } = await requireClientProfile();

  // Тред создаётся при первом заходе: клиенту не нужно «начинать переписку»,
  // поле ввода должно быть на месте сразу.
  const conversation = await getOrCreateConversation(client.id);
  const messages = await getMessages(conversation.id);

  await markRead(conversation.id, "CLIENT");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Чат с салоном</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Задайте вопрос о записи, услугах или абонементе — администратор ответит здесь.
        </p>
      </header>

      <Card>
        <CardContent>
          <ChatThread
            conversationId={conversation.id}
            viewerRole="CLIENT"
            emptyHint="Напишите первое сообщение"
            initialMessages={messages.map((message) => ({
              id: message.id,
              body: message.body,
              senderRole: message.senderRole,
              createdAt: message.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
