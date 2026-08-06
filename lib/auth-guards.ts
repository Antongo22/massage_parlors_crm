import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { isSetupCompleted } from "@/lib/services/organization";

/**
 * Доступ проверяется здесь, а не в разметке.
 *
 * Скрытая кнопка — не защита: клиент может открыть чужой URL или вызвать
 * серверное действие напрямую. Поэтому каждая страница и каждое действие
 * начинается с одной из этих функций, а данные клиента запрашиваются
 * только через getCurrentClient — с clientId из сессии, а не из параметров.
 */

export type SessionUser = { id: string; role: "ADMIN" | "CLIENT"; email: string; name: string | null };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();

  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
  };
});

export async function requireSetup(): Promise<void> {
  if (!(await isSetupCompleted())) {
    redirect("/setup");
  }
}

export async function requireUser(): Promise<SessionUser> {
  await requireSetup();

  const user = await getSessionUser();

  if (!user) redirect("/login");

  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  // Клиента отправляем в его кабинет, а не на страницу ошибки: он попал сюда
  // по ссылке или из закладки, и «доступ запрещён» ему ничего не даёт.
  if (user.role !== "ADMIN") redirect("/my");

  return user;
}

/**
 * Карточка клиента текущего пользователя.
 *
 * Связывание происходит по email при первом входе: администратор заводит
 * карточку по телефону задолго до того, как человек зарегистрируется.
 */
export const getCurrentClient = cache(async () => {
  const user = await getSessionUser();

  if (!user) return null;

  const linked = await prisma.client.findFirst({
    where: { userId: user.id, archivedAt: null },
  });

  if (linked) return linked;

  if (!user.email) return null;

  // Одноразовая привязка. Уникальный индекс по нормализованному email среди
  // неархивированных карточек гарантирует, что кандидат ровно один —
  // иначе привязка выдала бы человеку чужую историю посещений.
  const byEmail = await prisma.client.findFirst({
    where: { email: user.email, userId: null, archivedAt: null },
  });

  if (!byEmail) return null;

  return prisma.client.update({
    where: { id: byEmail.id },
    data: { userId: user.id },
  });
});

export async function requireClientProfile() {
  const user = await requireUser();
  const client = await getCurrentClient();

  if (!client) {
    // Учётка есть, карточки нет: администратор ещё не завёл клиента
    // или завёл с другим адресом.
    redirect("/my/no-profile");
  }

  return { user, client };
}

/** Проверка владения ресурсом для серверных действий клиента. */
export async function assertOwnsAppointment(appointmentId: string): Promise<void> {
  const user = await requireUser();

  if (user.role === "ADMIN") return;

  const client = await getCurrentClient();
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { clientId: true },
  });

  if (!appointment || !client || appointment.clientId !== client.id) {
    throw new DomainError("FORBIDDEN", "Запись принадлежит другому клиенту");
  }
}
