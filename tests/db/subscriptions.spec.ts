import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "@/lib/domain/errors";
import {
  consumeSubscriptionSession,
  countActiveUsages,
  releaseSubscriptionSession,
  reserveSubscriptionSession,
} from "@/lib/services/subscriptions";
import { id, pool, seedFixtures, truncateAll, type Fixtures } from "./helpers";

/**
 * Абонементы против реальной базы.
 *
 * Ключевой тест — конкурентный: инвариант «активных списаний не больше, чем
 * сеансов» не выражается констрейнтом, потому что требует агрегата по журналу.
 * Его держит блокировка строки абонемента, и проверить это можно только
 * двумя настоящими параллельными транзакциями.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});

let fx: Fixtures;

beforeEach(async () => {
  await truncateAll();
  fx = await seedFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

async function createSubscription(sessions = 5, overrides: { expiresAt?: Date } = {}) {
  const plan = await prisma.subscriptionPlan.create({
    data: {
      serviceId: fx.serviceId,
      name: `Абонемент на ${sessions}`,
      sessionsCount: sessions,
      priceMinor: 1_500_000,
      validityDays: 180,
    },
  });

  return prisma.subscription.create({
    data: {
      clientId: fx.clientId,
      planId: plan.id,
      serviceId: fx.serviceId,
      serviceNameSnapshot: "Классический массаж, 60 мин",
      sessionsTotal: sessions,
      pricePaidMinor: 1_500_000,
      purchasedAt: new Date(),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 180 * 864e5),
    },
  });
}

async function createAppointment(startsAt: Date) {
  return prisma.appointment.create({
    data: {
      clientId: fx.clientId,
      masterId: fx.masterId,
      serviceId: fx.serviceId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      blockedUntil: new Date(startsAt.getTime() + 3_600_000),
      status: "CONFIRMED",
      serviceNameSnapshot: "Классический массаж, 60 мин",
      priceMinorSnapshot: 350_000,
      durationMinutesSnapshot: 60,
      bufferMinutesSnapshot: 0,
      paymentMode: "SUBSCRIPTION",
    },
  });
}

describe("резервирование сеанса", () => {
  it("уменьшает доступный остаток", async () => {
    const subscription = await createSubscription(5);
    const appointment = await createAppointment(new Date("2026-10-01T09:00:00Z"));

    await prisma.$transaction((tx) =>
      reserveSubscriptionSession(tx, {
        subscriptionId: subscription.id,
        appointmentId: appointment.id,
        clientId: fx.clientId,
        serviceId: fx.serviceId,
        now: new Date(),
      }),
    );

    const usages = await prisma.subscriptionUsage.findMany({
      where: { subscriptionId: subscription.id },
    });

    expect(countActiveUsages(usages)).toBe(1);
    expect(usages[0]?.state).toBe("RESERVED");
  });

  it("отвергает списание с исчерпанного абонемента", async () => {
    const subscription = await createSubscription(1);

    const first = await createAppointment(new Date("2026-10-01T09:00:00Z"));
    await prisma.$transaction((tx) =>
      reserveSubscriptionSession(tx, {
        subscriptionId: subscription.id,
        appointmentId: first.id,
        clientId: fx.clientId,
        serviceId: fx.serviceId,
        now: new Date(),
      }),
    );

    const second = await createAppointment(new Date("2026-10-02T09:00:00Z"));

    await expect(
      prisma.$transaction((tx) =>
        reserveSubscriptionSession(tx, {
          subscriptionId: subscription.id,
          appointmentId: second.id,
          clientId: fx.clientId,
          serviceId: fx.serviceId,
          now: new Date(),
        }),
      ),
    ).rejects.toThrow(DomainError);
  });

  it("отвергает списание с истёкшего абонемента", async () => {
    const subscription = await createSubscription(5, {
      expiresAt: new Date(Date.now() + 60_000),
    });
    const appointment = await createAppointment(new Date("2026-10-01T09:00:00Z"));

    await expect(
      prisma.$transaction((tx) =>
        reserveSubscriptionSession(tx, {
          subscriptionId: subscription.id,
          appointmentId: appointment.id,
          clientId: fx.clientId,
          serviceId: fx.serviceId,
          // Момент «сейчас» позже срока действия
          now: new Date(Date.now() + 120_000),
        }),
      ),
    ).rejects.toThrow(/истёк/);
  });

  it("отвергает абонемент на другую услугу", async () => {
    const subscription = await createSubscription(5);
    const otherService = await prisma.service.create({
      data: {
        categoryId: fx.categoryId,
        name: "Спортивный массаж",
        slug: `sport-${id()}`,
        durationMinutes: 90,
        priceMinor: 520_000,
      },
    });

    const appointment = await prisma.appointment.create({
      data: {
        clientId: fx.clientId,
        masterId: fx.masterId,
        serviceId: otherService.id,
        startsAt: new Date("2026-10-05T09:00:00Z"),
        endsAt: new Date("2026-10-05T10:30:00Z"),
        blockedUntil: new Date("2026-10-05T10:30:00Z"),
        status: "CONFIRMED",
        serviceNameSnapshot: "Спортивный массаж",
        priceMinorSnapshot: 520_000,
        durationMinutesSnapshot: 90,
        bufferMinutesSnapshot: 0,
        paymentMode: "SUBSCRIPTION",
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        reserveSubscriptionSession(tx, {
          subscriptionId: subscription.id,
          appointmentId: appointment.id,
          clientId: fx.clientId,
          serviceId: otherService.id,
          now: new Date(),
        }),
      ),
    ).rejects.toThrow(/действует только на услугу/);
  });
});

describe("конкурентный резерв последнего сеанса", () => {
  it("пропускает ровно одну из двух параллельных транзакций", async () => {
    const subscription = await createSubscription(1);
    const first = await createAppointment(new Date("2026-10-01T09:00:00Z"));
    const second = await createAppointment(new Date("2026-10-02T09:00:00Z"));

    const attempt = (appointmentId: string) =>
      prisma.$transaction((tx) =>
        reserveSubscriptionSession(tx, {
          subscriptionId: subscription.id,
          appointmentId,
          clientId: fx.clientId,
          serviceId: fx.serviceId,
          now: new Date(),
        }),
      );

    // Обе транзакции стартуют одновременно и читают остаток. Без FOR UPDATE
    // обе увидели бы «остался один сеанс» и создали бы по списанию.
    const results = await Promise.allSettled([attempt(first.id), attempt(second.id)]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const usages = await prisma.subscriptionUsage.findMany({
      where: { subscriptionId: subscription.id },
    });

    expect(countActiveUsages(usages)).toBe(1);
  });
});

describe("жизненный цикл", () => {
  it("ставит EXHAUSTED после последнего потреблённого сеанса, но не после резерва", async () => {
    const subscription = await createSubscription(1);
    const appointment = await createAppointment(new Date("2026-10-01T09:00:00Z"));

    await prisma.$transaction((tx) =>
      reserveSubscriptionSession(tx, {
        subscriptionId: subscription.id,
        appointmentId: appointment.id,
        clientId: fx.clientId,
        serviceId: fx.serviceId,
        now: new Date(),
      }),
    );

    // Резерв не делает абонемент использованным: визит ещё не состоялся,
    // и отмена вернула бы сеанс.
    let current = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(current.status).toBe("ACTIVE");

    const usage = await prisma.subscriptionUsage.findFirstOrThrow({
      where: { subscriptionId: subscription.id },
    });

    await prisma.$transaction((tx) => consumeSubscriptionSession(tx, usage.id, new Date()));

    current = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(current.status).toBe("EXHAUSTED");
  });

  it("возвращает сеанс и статус ACTIVE при откате списания", async () => {
    const subscription = await createSubscription(1);
    const appointment = await createAppointment(new Date("2026-10-01T09:00:00Z"));

    await prisma.$transaction((tx) =>
      reserveSubscriptionSession(tx, {
        subscriptionId: subscription.id,
        appointmentId: appointment.id,
        clientId: fx.clientId,
        serviceId: fx.serviceId,
        now: new Date(),
      }),
    );

    const usage = await prisma.subscriptionUsage.findFirstOrThrow({
      where: { subscriptionId: subscription.id },
    });

    await prisma.$transaction((tx) => consumeSubscriptionSession(tx, usage.id, new Date()));
    await prisma.$transaction((tx) => releaseSubscriptionSession(tx, usage.id, new Date()));

    const current = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: { usages: true },
    });

    expect(current.status).toBe("ACTIVE");
    expect(countActiveUsages(current.usages)).toBe(0);
  });

  it("не списывает сеанс повторно при двойном вызове", async () => {
    const subscription = await createSubscription(3);
    const appointment = await createAppointment(new Date("2026-10-01T09:00:00Z"));

    await prisma.$transaction((tx) =>
      reserveSubscriptionSession(tx, {
        subscriptionId: subscription.id,
        appointmentId: appointment.id,
        clientId: fx.clientId,
        serviceId: fx.serviceId,
        now: new Date(),
      }),
    );

    const usage = await prisma.subscriptionUsage.findFirstOrThrow({
      where: { subscriptionId: subscription.id },
    });

    // Ретрай задачи или повторная отправка формы: второй вызов должен
    // оказаться пустой операцией, а не съесть ещё один сеанс.
    await prisma.$transaction((tx) => consumeSubscriptionSession(tx, usage.id, new Date()));
    await prisma.$transaction((tx) => consumeSubscriptionSession(tx, usage.id, new Date()));

    const usages = await prisma.subscriptionUsage.findMany({
      where: { subscriptionId: subscription.id },
    });

    expect(usages).toHaveLength(1);
    expect(countActiveUsages(usages)).toBe(1);
  });
});
