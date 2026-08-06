"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getOrCreateConversation, markRead, sendMessage } from "@/lib/services/chat";

export type ChatState = { error?: string; ok?: boolean };

/**
 * Отправка сообщения. Одно действие на обе роли: различие только в том, чей
 * тред разрешено трогать, и это решается здесь, а не в двух копиях кода.
 */
export async function postMessage(_prev: ChatState, formData: FormData): Promise<ChatState> {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "");

  if (!body) return { error: "Сообщение пустое" };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, clientId: true },
  });

  if (!conversation) return { error: "Диалог не найден" };

  if (user.role === "CLIENT") {
    const client = await prisma.client.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    // Клиент пишет только в свой тред. Проверка по сессии, а не по тому,
    // какой conversationId пришёл в форме.
    if (!client || client.id !== conversation.clientId) {
      return { error: "Нет доступа к этому диалогу" };
    }
  }

  await sendMessage({
    conversationId,
    senderUserId: user.id,
    senderRole: user.role,
    body,
  });

  revalidatePath(user.role === "ADMIN" ? `/chat/${conversationId}` : "/my/chat");
  return { ok: true };
}

export async function openConversation(clientId: string): Promise<string> {
  await requireAdmin();

  const conversation = await getOrCreateConversation(clientId);
  return conversation.id;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  await markRead(conversationId, user.role);
  revalidatePath("/chat");
}
