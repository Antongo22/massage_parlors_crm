"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { clientSchema, normalizePhone } from "@/lib/domain/client";

export type ClientActionState = { error?: string; ok?: boolean; clientId?: string };

export async function saveClient(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  await requireAdmin();

  const parsed = clientSchema.safeParse({
    id: formData.get("id") || undefined,
    lastName: formData.get("lastName"),
    firstName: formData.get("firstName"),
    middleName: formData.get("middleName") || undefined,
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    birthDate: formData.get("birthDate") || undefined,
    source: (formData.get("source") as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте заполнение формы" };
  }

  const input = parsed.data;
  const phone = normalizePhone(input.phone);

  if (!phone) {
    return { error: "Телефон не распознан. Формат: +7 999 123-45-67 или 89991234567" };
  }

  const data = {
    lastName: input.lastName,
    firstName: input.firstName,
    middleName: input.middleName || null,
    phone,
    email: input.email ? input.email.toLowerCase() : null,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
    source: input.source ?? null,
  };

  try {
    const client = input.id
      ? await prisma.client.update({ where: { id: input.id }, data })
      : await prisma.client.create({ data });

    revalidatePath("/clients");
    revalidatePath(`/clients/${client.id}`);

    return { ok: true, clientId: client.id };
  } catch (error) {
    // Уникальность телефона и email — на уровне базы. Сообщение переводим
    // на человеческий: «Unique constraint failed» ничего не объясняет.
    const message = error instanceof Error ? error.message : "";

    if (message.includes("phone")) {
      return { error: "Клиент с таким телефоном уже есть" };
    }

    if (message.includes("email")) {
      return { error: "Клиент с таким email уже есть" };
    }

    return { error: "Не удалось сохранить клиента" };
  }
}

const noteSchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["CONTRAINDICATION", "PREFERENCE", "GENERAL"]),
  body: z.string().trim().min(1, "Заметка пустая").max(2000),
  isPinned: z.boolean(),
});

export async function addClientNote(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const admin = await requireAdmin();

  const parsed = noteSchema.safeParse({
    clientId: formData.get("clientId"),
    type: formData.get("type"),
    body: formData.get("body"),
    // Противопоказание закрепляется само: его должно быть видно в шапке
    // карточки, а не среди двадцати обычных заметок.
    isPinned: formData.get("isPinned") === "on" || formData.get("type") === "CONTRAINDICATION",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте заметку" };
  }

  await prisma.clientNote.create({
    data: { ...parsed.data, authorUserId: admin.id },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true };
}

export async function deleteClientNote(noteId: string, clientId: string): Promise<void> {
  await requireAdmin();

  await prisma.clientNote.delete({ where: { id: noteId } });
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Архивирование вместо удаления: на клиента ссылаются визиты, платежи
 * и абонементы. Физическое удаление сломало бы финансовую историю.
 */
export async function archiveClient(clientId: string): Promise<void> {
  await requireAdmin();

  await prisma.client.update({
    where: { id: clientId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/clients");
}
