import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getMessages, markRead } from "@/lib/services/chat";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { client: { select: { id: true, lastName: true, firstName: true, phone: true } } },
  });

  if (!conversation) notFound();

  const messages = await getMessages(id);
  // Открытие диалога и есть прочтение: отдельная кнопка «прочитано»
  // никому не нужна.
  await markRead(id, "ADMIN");

  return (
    <div className="space-y-4">
      <Link
        href="/chat"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />К списку диалогов
      </Link>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          <Link href={`/clients/${conversation.clientId}`} className="hover:underline">
            {conversation.client.lastName} {conversation.client.firstName}
          </Link>
        </h1>
        <p className="text-muted-foreground text-sm">{conversation.client.phone}</p>
      </header>

      <Card>
        <CardContent>
          <ChatThread
            conversationId={conversation.id}
            viewerRole="ADMIN"
            emptyHint="Напишите первым — клиент увидит сообщение в своём кабинете"
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
