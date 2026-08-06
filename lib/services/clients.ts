import "server-only";
import { prisma } from "@/lib/db";
import { countActiveUsages } from "@/lib/services/subscriptions";

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
