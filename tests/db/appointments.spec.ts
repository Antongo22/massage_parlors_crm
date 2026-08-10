import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { transitionAppointment } from "@/lib/services/appointments";
import { id, insertAppointment, pool, seedFixtures, truncateAll, type Fixtures } from "./helpers";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
});

let fx: Fixtures;

beforeEach(async () => {
  process.env.DISABLE_NOTIFICATIONS = "true";
  await truncateAll();
  fx = await seedFixtures();
  await prisma.organization.create({
    data: { name: "Тестовый салон", setupCompletedAt: new Date() },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe("конкурентный переход записи", () => {
  it("создаёт только одну оплату при двойном завершении", async () => {
    const appointmentId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: new Date("2026-09-07T07:00:00.000Z"),
    });

    const complete = () =>
      transitionAppointment({
        appointmentId,
        to: "COMPLETED",
        actorUserId: null,
        payment: { amountMinor: 350_000, method: "CARD" },
      });
    const results = await Promise.allSettled([complete(), complete()]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.payment.count({ where: { appointmentId, kind: "SALE" } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entity: "Appointment", entityId: appointmentId, action: "status_change" },
      }),
    ).toBe(1);
  });

  it("увеличивает счётчик неявок только один раз", async () => {
    const appointmentId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: new Date("2026-09-07T07:00:00.000Z"),
    });

    const noShow = () =>
      transitionAppointment({ appointmentId, to: "NO_SHOW", actorUserId: null });
    const results = await Promise.allSettled([noShow(), noShow()]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const client = await prisma.client.findUniqueOrThrow({ where: { id: fx.clientId } });
    expect(client.noShowCount).toBe(1);
  });
});
