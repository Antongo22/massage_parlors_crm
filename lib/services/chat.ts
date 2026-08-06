import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

/**
 * Чат с клиентами.
 *
 * Один тред на клиента: у салона нет тем и групп, есть переписка с человеком.
 * Транспорт — SSE поверх этих таблиц, а не WebSocket: двусторонний текстовый
 * чат не требует полнодуплексного канала, а SSE переживает reconnect
 * и работает через обратный прокси без отдельной настройки.
 */

export async function getOrCreateConversation(clientId: string) {
  const existing = await prisma.conversation.findUnique({ where: { clientId } });

  if (existing) return existing;

  return prisma.conversation.create({ data: { clientId } });
}

export async function listConversations() {
  const conversations = await prisma.conversation.findMany({
    orderBy: [{ lastMessageAt: "desc" }],
    include: {
      client: { select: { id: true, lastName: true, firstName: true, phone: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, senderRole: true, createdAt: true },
      },
      _count: {
        select: { messages: { where: { senderRole: "CLIENT", readAt: null } } },
      },
    },
  });

  return conversations.map((conversation) => ({
    ...conversation,
    lastMessage: conversation.messages[0] ?? null,
    unread: conversation._count.messages,
  }));
}

export async function getMessages(conversationId: string, afterId?: string) {
  return prisma.message.findMany({
    where: {
      conversationId,
      ...(afterId ? { createdAt: { gt: (await messageCreatedAt(afterId)) ?? new Date(0) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

async function messageCreatedAt(messageId: string): Promise<Date | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { createdAt: true },
  });

  return message?.createdAt ?? null;
}

export async function sendMessage(params: {
  conversationId: string;
  senderUserId: string;
  senderRole: Role;
  body: string;
}) {
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: params.conversationId,
        senderUserId: params.senderUserId,
        // Снимок роли: сообщение остаётся «от салона», даже если учётка удалена.
        senderRole: params.senderRole,
        body: params.body.trim(),
      },
    });

    // Денормализация ради сортировки списка диалогов: иначе для каждого треда
    // пришлось бы доставать последнее сообщение только чтобы упорядочить список.
    await tx.conversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: created.createdAt },
    });

    return created;
  });

  return message;
}

/** Помечает прочитанными сообщения ОТ другой стороны, а не свои. */
export async function markRead(conversationId: string, readerRole: Role) {
  const counterpart: Role = readerRole === "ADMIN" ? "CLIENT" : "ADMIN";

  await prisma.message.updateMany({
    where: { conversationId, senderRole: counterpart, readAt: null },
    data: { readAt: new Date() },
  });
}
