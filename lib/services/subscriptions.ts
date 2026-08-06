import "server-only";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<PrismaClient, "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends">;

/**
 * Абонементы.
 *
 * Остаток нигде не хранится — он считается по журналу списаний. Поле-счётчик
 * пришлось бы увеличивать при отмене, не увеличивать дважды при повторе задачи
 * и как-то объяснять клиенту, куда делся сеанс. Журнал отвечает на всё это сам.
 *
 * Списание двухфазное: RESERVED в момент записи, CONSUMED при завершении
 * визита. Без резерва клиент записался бы десять раз по абонементу на пять
 * сеансов — все визиты в будущем, ни один ещё не «потреблён».
 */

export type SubscriptionBalance = {
  id: string;
  sessionsTotal: number;
  used: number;
  available: number;
  expiresAt: Date;
  status: string;
};

export async function reserveSubscriptionSession(
  tx: Tx,
  params: {
    subscriptionId: string;
    appointmentId: string;
    clientId: string;
    serviceId: string;
    now: Date;
  },
): Promise<void> {
  // Блокировка строки абонемента: без неё два одновременных бронирования
  // прочитают «остался один сеанс» и спишут его дважды. Констрейнтом это
  // не выражается — нужен агрегат по журналу.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Subscription" WHERE id = ${params.subscriptionId} FOR UPDATE
  `;

  if (locked.length === 0) {
    throw new DomainError("NOT_FOUND", "Абонемент не найден");
  }

  const subscription = await tx.subscription.findUniqueOrThrow({
    where: { id: params.subscriptionId },
    include: { usages: { select: { state: true } } },
  });

  if (subscription.clientId !== params.clientId) {
    throw new DomainError("FORBIDDEN", "Абонемент принадлежит другому клиенту");
  }

  if (subscription.status !== "ACTIVE") {
    throw new DomainError("SUBSCRIPTION_NOT_ACTIVE", "Абонемент неактивен");
  }

  if (subscription.expiresAt <= params.now) {
    throw new DomainError("SUBSCRIPTION_EXPIRED", "Срок действия абонемента истёк");
  }

  if (subscription.serviceId !== params.serviceId) {
    throw new DomainError(
      "SUBSCRIPTION_WRONG_SERVICE",
      `Абонемент действует только на услугу «${subscription.serviceNameSnapshot}»`,
    );
  }

  const used = countActiveUsages(subscription.usages);

  if (used >= subscription.sessionsTotal) {
    throw new DomainError("SUBSCRIPTION_EXHAUSTED", "В абонементе не осталось сеансов");
  }

  await tx.subscriptionUsage.create({
    data: {
      subscriptionId: subscription.id,
      appointmentId: params.appointmentId,
      state: "RESERVED",
      reservedAt: params.now,
    },
  });
}

export async function consumeSubscriptionSession(
  tx: Tx,
  usageId: string,
  now: Date,
): Promise<void> {
  const usage = await tx.subscriptionUsage.findUniqueOrThrow({ where: { id: usageId } });

  if (usage.state !== "RESERVED") return;

  await tx.subscriptionUsage.update({
    where: { id: usageId },
    data: { state: "CONSUMED", consumedAt: now },
  });

  await refreshSubscriptionStatus(tx, usage.subscriptionId, now);
}

export async function releaseSubscriptionSession(
  tx: Tx,
  usageId: string,
  now: Date,
): Promise<void> {
  const usage = await tx.subscriptionUsage.findUniqueOrThrow({ where: { id: usageId } });

  if (usage.state === "REVERTED") return;

  await tx.subscriptionUsage.update({
    where: { id: usageId },
    data: { state: "REVERTED", revertedAt: now },
  });

  await refreshSubscriptionStatus(tx, usage.subscriptionId, now);
}

/**
 * Пересчёт lifecycle-статуса.
 *
 * EXHAUSTED ставится по фактически потреблённым сеансам, а не по резервам:
 * иначе абонемент с одним забронированным, но ещё не состоявшимся визитом
 * показывался бы клиенту использованным, а отмена «воскрешала» бы его.
 * Нулевой доступный остаток запрещает новый резерв, но статуса не меняет.
 */
export async function refreshSubscriptionStatus(
  tx: Tx,
  subscriptionId: string,
  now: Date,
): Promise<void> {
  const subscription = await tx.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { usages: { select: { state: true } } },
  });

  if (subscription.status === "REFUNDED") return;

  const consumed = subscription.usages.filter((usage) => usage.state === "CONSUMED").length;

  const next =
    consumed >= subscription.sessionsTotal
      ? "EXHAUSTED"
      : subscription.expiresAt <= now
        ? "EXPIRED"
        : "ACTIVE";

  if (next !== subscription.status) {
    await tx.subscription.update({ where: { id: subscriptionId }, data: { status: next } });
  }
}

export function countActiveUsages(usages: Array<{ state: string }>): number {
  return usages.filter((usage) => usage.state === "RESERVED" || usage.state === "CONSUMED").length;
}

/** Абонементы клиента с посчитанным остатком. */
export async function getClientSubscriptions(clientId: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: { clientId },
    orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
    include: {
      service: { select: { id: true, name: true } },
      usages: {
        select: {
          id: true,
          state: true,
          consumedAt: true,
          reservedAt: true,
          appointment: { select: { id: true, startsAt: true, status: true } },
        },
        orderBy: { reservedAt: "desc" },
      },
    },
  });

  return subscriptions.map((subscription) => ({
    ...subscription,
    used: countActiveUsages(subscription.usages),
    available: subscription.sessionsTotal - countActiveUsages(subscription.usages),
  }));
}

/**
 * Абонементы, пригодные для оплаты конкретной услуги. Используется формой
 * записи: показывать абонемент, которым нельзя заплатить, — приглашение
 * к ошибке.
 */
export async function getUsableSubscriptions(clientId: string, serviceId: string, now = new Date()) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      clientId,
      serviceId,
      status: "ACTIVE",
      expiresAt: { gt: now },
    },
    include: { usages: { select: { state: true } } },
    orderBy: { expiresAt: "asc" },
  });

  return subscriptions
    .map((subscription) => ({
      id: subscription.id,
      serviceNameSnapshot: subscription.serviceNameSnapshot,
      sessionsTotal: subscription.sessionsTotal,
      expiresAt: subscription.expiresAt,
      available: subscription.sessionsTotal - countActiveUsages(subscription.usages),
    }))
    .filter((subscription) => subscription.available > 0);
}

export async function sellSubscription(params: {
  clientId: string;
  planId: string;
  method: "CASH" | "CARD" | "TRANSFER";
  actorUserId: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({
      where: { id: params.planId },
      include: { service: { select: { id: true, name: true } } },
    });

    if (!plan.isActive) {
      throw new DomainError("NOT_FOUND", "Абонемент снят с продажи");
    }

    const expiresAt = new Date(now.getTime() + plan.validityDays * 24 * 3600 * 1000);

    const subscription = await tx.subscription.create({
      data: {
        clientId: params.clientId,
        planId: plan.id,
        serviceId: plan.service.id,
        // Снимок названия: услугу могут переименовать, а в истории покупки
        // должно остаться то, что клиент покупал.
        serviceNameSnapshot: plan.service.name,
        sessionsTotal: plan.sessionsCount,
        pricePaidMinor: plan.priceMinor,
        purchasedAt: now,
        expiresAt,
        status: "ACTIVE",
      },
    });

    await tx.payment.create({
      data: {
        clientId: params.clientId,
        subscriptionId: subscription.id,
        kind: "SALE",
        amountMinor: plan.priceMinor,
        method: params.method,
        paidAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        entity: "Subscription",
        entityId: subscription.id,
        action: "create",
        diff: { planId: plan.id, priceMinor: plan.priceMinor },
      },
    });

    return subscription;
  });
}

/** Помечает сгоревшие абонементы. Вызывается воркером по расписанию. */
export async function expireSubscriptions(now = new Date()): Promise<number> {
  const result = await prisma.subscription.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return result.count;
}
