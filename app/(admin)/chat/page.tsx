import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { listConversations } from "@/lib/services/chat";

export const dynamic = "force-dynamic";

export default async function ChatListPage() {
  await requireAdmin();
  const conversations = await listConversations();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Чат с клиентами</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          По одному диалогу на клиента. Новые сообщения приходят без перезагрузки страницы.
        </p>
      </header>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            Диалогов пока нет. Он появится, когда клиент напишет из кабинета —
            или когда вы напишете первым из карточки клиента.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/chat/${conversation.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {conversation.client.lastName} {conversation.client.firstName}
                      </p>
                      <p className="text-muted-foreground truncate text-sm">
                        {conversation.lastMessage
                          ? `${conversation.lastMessage.senderRole === "ADMIN" ? "Вы: " : ""}${conversation.lastMessage.body}`
                          : "Нет сообщений"}
                      </p>
                    </div>

                    {conversation.unread > 0 && (
                      <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
                        {conversation.unread}
                      </span>
                    )}

                    {conversation.lastMessageAt && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {conversation.lastMessageAt.toLocaleDateString("ru-RU")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
