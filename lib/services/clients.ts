import "server-only";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import { countActiveUsages } from "@/lib/services/subscriptions";
import type { ClientSource } from "@/generated/prisma/enums";

/**
 * Клиенты.
 *
 * Телефон — основной идентификатор: в салоне человека находят по нему,
 * а не по email. Нормализация к E.164 обязательна, иначе «+7 999 123-45-67»
 * и «89991234567» станут двумя карточками с разной историей посещений.
 */

export async function listClients(search?: string) {
  const clients = await prisma.client.findMany({
    where: {
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { lastName: { contains: search, mode: "insensitive" as const } },
              { firstName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search.replace(/[^\d+]/g, "") } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      _count: { select: { appointments: true } },
      appointments: {
        where: { status: "COMPLETED" },
        orderBy: { startsAt: "desc" },
        take: 1,
        select: { startsAt: true },
      },
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      notes: {
        where: { type: "CONTRAINDICATION" },
        select: { id: true },
      },
    },
  });

  return clients.map((client) => ({
    ...client,
    lastVisitAt: client.appointments[0]?.startsAt ?? null,
    activeSubscriptions: client.subscriptions.length,
    hasContraindications: client.notes.length > 0,
  }));
}

export type SaveClientInput = {
  id?: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  phone: string;
  email: string | null;
  birthDate: Date | null;
  source: ClientSource | null;
};

/**
 * Сохраняет карточку и синхронизирует доступ в личный кабинет.
 *
 * Карточка Client и учётная запись User — разные сущности: первая нужна салону
 * даже для человека без email, вторая — Auth.js для сессии и роли. Если просто
 * записать email в Client, форма входа не отправит письмо, потому что Auth.js
 * ещё не знает такого пользователя. Поэтому обе записи создаются и меняются
 * атомарно в одной транзакции.
 */
export async function saveClientWithAccess(input: SaveClientInput) {
  return prisma.$transaction(async (tx) => {
    const current = input.id
      ? await tx.client.findUnique({
          where: { id: input.id },
          include: { user: { select: { id: true, role: true } } },
        })
      : null;

    if (input.id && !current) {
      throw new DomainError("NOT_FOUND", "Клиент не найден");
    }

    const clientData = {
      lastName: input.lastName,
      firstName: input.firstName,
      middleName: input.middleName,
      phone: input.phone,
      email: input.email,
      birthDate: input.birthDate,
      source: input.source,
    };

    if (!input.email) {
      const client = current
        ? await tx.client.update({
            where: { id: current.id },
            data: { ...clientData, userId: null },
          })
        : await tx.client.create({ data: clientData });

      // Удаление email означает отзыв доступа. Удаляем CLIENT-пользователя,
      // а не только связь: каскад удалит его активные сессии и старый адрес
      // больше не сможет открыть карточку клиента.
      if (current?.user?.role === "CLIENT") {
        await tx.user.delete({ where: { id: current.user.id } });
      }

      return client;
    }

    const displayName = `${input.firstName} ${input.lastName}`;
    const userWithEmail = await tx.user.findUnique({
      where: { email: input.email },
      include: { client: { select: { id: true } } },
    });

    let userId: string;

    if (current?.user) {
      if (current.user.role !== "CLIENT") {
        throw new DomainError("FORBIDDEN", "Карточка связана не с клиентской учётной записью");
      }

      if (userWithEmail && userWithEmail.id !== current.user.id) {
        throw new DomainError("FORBIDDEN", "Этот email уже используется другой учётной записью");
      }

      const user = await tx.user.update({
        where: { id: current.user.id },
        data: { email: input.email, name: displayName, isActive: true },
      });
      userId = user.id;
    } else if (userWithEmail) {
      if (userWithEmail.role !== "CLIENT" || (userWithEmail.client && userWithEmail.client.id !== input.id)) {
        throw new DomainError("FORBIDDEN", "Этот email уже используется другой учётной записью");
      }

      const user = await tx.user.update({
        where: { id: userWithEmail.id },
        data: { name: displayName, isActive: true },
      });
      userId = user.id;
    } else {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: displayName,
          role: "CLIENT",
        },
      });
      userId = user.id;
    }

    return current
      ? tx.client.update({ where: { id: current.id }, data: { ...clientData, userId } })
      : tx.client.create({ data: { ...clientData, userId } });
  });
}

export async function getClientCard(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      notes: { orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }] },
      appointments: {
        orderBy: { startsAt: "desc" },
        include: {
          service: { select: { name: true } },
          usage: { select: { state: true } },
          payments: { select: { amountMinor: true, kind: true } },
        },
      },
      subscriptions: {
        orderBy: { purchasedAt: "desc" },
        include: { usages: { select: { state: true } } },
      },
      user: { select: { id: true, email: true, isActive: true } },
    },
  });

  if (!client) return null;

  const completed = client.appointments.filter((a) => a.status === "COMPLETED");

  // Потрачено считается по платежам, а не по ценам визитов: часть визитов
  // оплачена абонементом, и их стоимость уже учтена в покупке пакета.
  const spentMinor = client.appointments
    .flatMap((appointment) => appointment.payments)
    .reduce((sum, payment) => sum + (payment.kind === "SALE" ? payment.amountMinor : -payment.amountMinor), 0);

  return {
    ...client,
    stats: {
      totalVisits: completed.length,
      spentMinor,
      firstVisitAt: completed.at(-1)?.startsAt ?? null,
      lastVisitAt: completed[0]?.startsAt ?? null,
    },
    subscriptions: client.subscriptions.map((subscription) => ({
      ...subscription,
      available: subscription.sessionsTotal - countActiveUsages(subscription.usages),
    })),
  };
}
