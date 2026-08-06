import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PG,
  type Fixtures,
  expectViolation,
  id,
  insertAppointment,
  insertWorkingHours,
  minutes,
  pool,
  seedFixtures,
  truncateAll,
} from "./helpers";

/**
 * Поведенческие тесты ограничений: выполняют конфликтующие операции против
 * реальной базы и проверяют, что она их отвергает.
 *
 * Зачем они, если есть структурные снимки DDL: снимок ловит изменение
 * определения, но не отвечает на вопрос «а защищает ли это определение то,
 * что мы думаем». Здесь зафиксировано намерение, а не форма реализации —
 * именно это нужно, когда схему правит агент.
 */

const MONDAY_10AM = new Date("2026-09-07T07:00:00.000Z"); // 10:00 Europe/Moscow

let fx: Fixtures;

beforeEach(async () => {
  await truncateAll();
  fx = await seedFixtures();
});

afterAll(async () => {
  await pool.end();
});

describe("appointment_no_overlap", () => {
  it("отвергает две пересекающиеся записи одного мастера", async () => {
    await insertAppointment(fx, { startsAt: MONDAY_10AM });

    await expectViolation(
      insertAppointment(fx, { startsAt: new Date(MONDAY_10AM.getTime() + minutes(30)) }),
      PG.EXCLUSION_VIOLATION,
      "appointment_no_overlap",
    );
  });

  it("отвергает запись, попадающую в технический перерыв предыдущей", async () => {
    // 10:00–11:00 + 15 минут перерыва: мастер занят до 11:15.
    await insertAppointment(fx, { startsAt: MONDAY_10AM, bufferMinutes: 15 });

    await expectViolation(
      insertAppointment(fx, { startsAt: new Date(MONDAY_10AM.getTime() + minutes(60)) }),
      PG.EXCLUSION_VIOLATION,
      "appointment_no_overlap",
    );
  });

  it("разрешает запись ровно в момент окончания перерыва", async () => {
    await insertAppointment(fx, { startsAt: MONDAY_10AM, bufferMinutes: 15 });

    await expect(
      insertAppointment(fx, { startsAt: new Date(MONDAY_10AM.getTime() + minutes(75)) }),
    ).resolves.toBeDefined();
  });

  it("разрешает одинаковое время у разных мастеров", async () => {
    await insertAppointment(fx, { startsAt: MONDAY_10AM });

    await expect(
      insertAppointment(fx, { startsAt: MONDAY_10AM, masterId: fx.otherMasterId }),
    ).resolves.toBeDefined();
  });

  it("не считает занятыми отменённые и несостоявшиеся записи", async () => {
    await insertAppointment(fx, {
      startsAt: MONDAY_10AM,
      status: "CANCELLED",
      cancelledAt: new Date(),
    });
    await insertAppointment(fx, {
      startsAt: new Date(MONDAY_10AM.getTime() + minutes(120)),
      status: "NO_SHOW",
      noShowAt: new Date(),
    });

    await expect(insertAppointment(fx, { startsAt: MONDAY_10AM })).resolves.toBeDefined();
    await expect(
      insertAppointment(fx, { startsAt: new Date(MONDAY_10AM.getTime() + minutes(120)) }),
    ).resolves.toBeDefined();
  });
});

describe("appointment_duration_consistent", () => {
  it("отвергает endsAt, не соответствующий снимку длительности", async () => {
    await expectViolation(
      insertAppointment(fx, {
        startsAt: MONDAY_10AM,
        durationMinutes: 90,
        endsAt: new Date(MONDAY_10AM.getTime() + minutes(15)),
      }),
      PG.CHECK_VIOLATION,
      "appointment_duration_consistent",
    );
  });

  it("отвергает blockedUntil, не соответствующий снимку перерыва", async () => {
    await expectViolation(
      insertAppointment(fx, {
        startsAt: MONDAY_10AM,
        bufferMinutes: 15,
        blockedUntil: new Date(MONDAY_10AM.getTime() + minutes(60)),
      }),
      PG.CHECK_VIOLATION,
      "appointment_duration_consistent",
    );
  });
});

describe("appointment_status_fields_consistent", () => {
  it("отвергает COMPLETED без completedAt", async () => {
    await expectViolation(
      insertAppointment(fx, { startsAt: MONDAY_10AM, status: "COMPLETED" }),
      PG.CHECK_VIOLATION,
      "appointment_status_fields_consistent",
    );
  });

  it("отвергает активную запись с проставленной отменой", async () => {
    await expectViolation(
      insertAppointment(fx, {
        startsAt: MONDAY_10AM,
        status: "CONFIRMED",
        cancelledAt: new Date(),
      }),
      PG.CHECK_VIOLATION,
      "appointment_status_fields_consistent",
    );
  });

  it("отвергает NO_SHOW без noShowAt", async () => {
    await expectViolation(
      insertAppointment(fx, { startsAt: MONDAY_10AM, status: "NO_SHOW" }),
      PG.CHECK_VIOLATION,
      "appointment_status_fields_consistent",
    );
  });
});

describe("workinghours_no_overlap", () => {
  it("отвергает пересекающиеся смены одного дня", async () => {
    await insertWorkingHours(fx.masterId, 1, 9 * 60, 13 * 60);

    await expectViolation(
      insertWorkingHours(fx.masterId, 1, 10 * 60, 18 * 60),
      PG.EXCLUSION_VIOLATION,
      "workinghours_no_overlap",
    );
  });

  it("разрешает смежные смены", async () => {
    await insertWorkingHours(fx.masterId, 1, 9 * 60, 13 * 60);

    await expect(insertWorkingHours(fx.masterId, 1, 13 * 60, 18 * 60)).resolves.toBeDefined();
  });

  it("разрешает две смены с перерывом посреди дня", async () => {
    await insertWorkingHours(fx.masterId, 1, 9 * 60, 13 * 60);

    await expect(insertWorkingHours(fx.masterId, 1, 15 * 60, 19 * 60)).resolves.toBeDefined();
  });

  it("не мешает другому мастеру работать в те же часы", async () => {
    await insertWorkingHours(fx.masterId, 1, 9 * 60, 13 * 60);

    await expect(insertWorkingHours(fx.otherMasterId, 1, 9 * 60, 13 * 60)).resolves.toBeDefined();
  });
});

describe("Payment", () => {
  const insertPayment = (o: {
    kind: string;
    appointmentId?: string | null;
    subscriptionId?: string | null;
    refundedPaymentId?: string | null;
    id?: string;
  }) =>
    pool.query(
      `INSERT INTO "Payment"
         (id, "clientId", "appointmentId", "subscriptionId", "refundedPaymentId",
          kind, "amountMinor", method, "paidAt", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6::"PaymentKind",350000,'CARD'::"PaymentMethod",now(),now())`,
      [
        o.id ?? id(),
        fx.clientId,
        o.appointmentId ?? null,
        o.subscriptionId ?? null,
        o.refundedPaymentId ?? null,
        o.kind,
      ],
    );

  it("отвергает платёж без субъекта", async () => {
    await expectViolation(
      insertPayment({ kind: "SALE" }),
      PG.CHECK_VIOLATION,
      "payment_has_exactly_one_subject",
    );
  });

  it("отвергает платёж, привязанный и к визиту, и к абонементу", async () => {
    const appointmentId = id();
    const subscriptionId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });
    await seedSubscription(fx, subscriptionId);

    await expectViolation(
      insertPayment({ kind: "SALE", appointmentId, subscriptionId }),
      PG.CHECK_VIOLATION,
      "payment_has_exactly_one_subject",
    );
  });

  it("отвергает возврат без ссылки на продажу", async () => {
    const appointmentId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });

    await expectViolation(
      insertPayment({ kind: "REFUND", appointmentId }),
      PG.CHECK_VIOLATION,
      "payment_refund_link",
    );
  });

  it("отвергает возврат, ссылающийся сам на себя", async () => {
    const appointmentId = id();
    const paymentId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });

    await expectViolation(
      insertPayment({
        id: paymentId,
        kind: "REFUND",
        appointmentId,
        refundedPaymentId: paymentId,
      }),
      PG.CHECK_VIOLATION,
      "payment_cannot_refund_itself",
    );
  });

  it("разрешает возврат со ссылкой на продажу", async () => {
    const appointmentId = id();
    const saleId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });
    await insertPayment({ id: saleId, kind: "SALE", appointmentId });

    await expect(
      insertPayment({ kind: "REFUND", appointmentId, refundedPaymentId: saleId }),
    ).resolves.toBeDefined();
  });
});

describe("SubscriptionUsage", () => {
  it("отвергает второе списание по тому же визиту", async () => {
    const appointmentId = id();
    const subscriptionId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: MONDAY_10AM,
      paymentMode: "SUBSCRIPTION",
    });
    await seedSubscription(fx, subscriptionId);
    await insertUsage(subscriptionId, appointmentId, "RESERVED");

    await expectViolation(
      insertUsage(subscriptionId, appointmentId, "RESERVED"),
      PG.UNIQUE_VIOLATION,
      "SubscriptionUsage_appointmentId_key",
    );
  });

  it("отвергает CONSUMED без consumedAt", async () => {
    const appointmentId = id();
    const subscriptionId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: MONDAY_10AM,
      paymentMode: "SUBSCRIPTION",
    });
    await seedSubscription(fx, subscriptionId);

    await expectViolation(
      insertUsage(subscriptionId, appointmentId, "CONSUMED"),
      PG.CHECK_VIOLATION,
      "subscription_usage_state_consistent",
    );
  });

  it("отвергает списание, потреблённое раньше резерва", async () => {
    const appointmentId = id();
    const subscriptionId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: MONDAY_10AM,
      paymentMode: "SUBSCRIPTION",
    });
    await seedSubscription(fx, subscriptionId);

    await expectViolation(
      insertUsage(subscriptionId, appointmentId, "CONSUMED", {
        reservedAt: new Date("2026-09-07T10:00:00Z"),
        consumedAt: new Date("2026-09-06T10:00:00Z"),
      }),
      PG.CHECK_VIOLATION,
      "subscription_usage_timeline_valid",
    );
  });

  it("разрешает откат уже потреблённого списания", async () => {
    const appointmentId = id();
    const subscriptionId = id();
    await insertAppointment(fx, {
      id: appointmentId,
      startsAt: MONDAY_10AM,
      paymentMode: "SUBSCRIPTION",
    });
    await seedSubscription(fx, subscriptionId);

    await expect(
      insertUsage(subscriptionId, appointmentId, "REVERTED", {
        reservedAt: new Date("2026-09-01T10:00:00Z"),
        consumedAt: new Date("2026-09-07T10:00:00Z"),
        revertedAt: new Date("2026-09-08T10:00:00Z"),
      }),
    ).resolves.toBeDefined();
  });
});

describe("NotificationLog", () => {
  it("отвергает повторное уведомление того же типа по тому же визиту", async () => {
    const appointmentId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });
    await insertNotification({ appointmentId, type: "REMINDER_2H" });

    await expectViolation(
      insertNotification({ appointmentId, type: "REMINDER_2H" }),
      PG.UNIQUE_VIOLATION,
      "notification_unique_per_appointment",
    );
  });

  it("отвергает напоминание о визите, привязанное к абонементу", async () => {
    const subscriptionId = id();
    await seedSubscription(fx, subscriptionId);

    await expectViolation(
      insertNotification({ subscriptionId, type: "REMINDER_2H" }),
      PG.CHECK_VIOLATION,
      "notification_subject_valid",
    );
  });

  it("отвергает предупреждение об абонементе, привязанное к визиту", async () => {
    const appointmentId = id();
    await insertAppointment(fx, { id: appointmentId, startsAt: MONDAY_10AM });

    await expectViolation(
      insertNotification({ appointmentId, type: "SUBSCRIPTION_EXPIRING" }),
      PG.CHECK_VIOLATION,
      "notification_subject_valid",
    );
  });

  it("отвергает повторное предупреждение по тому же абонементу", async () => {
    // Ключевой кейс: составной UNIQUE по обнуляемой колонке здесь не сработал бы,
    // потому что в PostgreSQL NULL <> NULL. Защиту даёт частичный индекс.
    const subscriptionId = id();
    await seedSubscription(fx, subscriptionId);
    await insertNotification({ subscriptionId, type: "SUBSCRIPTION_EXPIRING" });

    await expectViolation(
      insertNotification({ subscriptionId, type: "SUBSCRIPTION_EXPIRING" }),
      PG.UNIQUE_VIOLATION,
      "notification_unique_per_subscription",
    );
  });
});

describe("Client", () => {
  it("отвергает телефон не в формате E.164", async () => {
    await expectViolation(
      pool.query(
        `INSERT INTO "Client" (id, "lastName", "firstName", phone, "noShowCount", "createdAt", "updatedAt")
         VALUES ($1, 'Петров', 'Пётр', '+7 999 123-45-67', 0, now(), now())`,
        [id()],
      ),
      PG.CHECK_VIOLATION,
      "client_phone_e164",
    );
  });

  it("считает email одним и тем же независимо от регистра", async () => {
    await pool.query(
      `INSERT INTO "Client" (id, "lastName", "firstName", phone, email, "noShowCount", "createdAt", "updatedAt")
       VALUES ($1, 'Петров', 'Пётр', '+79990000002', 'Petrov@Example.com', 0, now(), now())`,
      [id()],
    );

    await expectViolation(
      pool.query(
        `INSERT INTO "Client" (id, "lastName", "firstName", phone, email, "noShowCount", "createdAt", "updatedAt")
         VALUES ($1, 'Петрова', 'Анна', '+79990000003', 'petrov@example.com', 0, now(), now())`,
        [id()],
      ),
      PG.UNIQUE_VIOLATION,
      "client_email_normalized_unique",
    );
  });
});

describe("Organization", () => {
  it("не допускает вторую строку конфигурации", async () => {
    const insert = () =>
      pool.query(
        `INSERT INTO "Organization" (id, name, timezone, currency, "createdAt", "updatedAt")
         VALUES ($1, 'Салон', 'Europe/Moscow', 'RUB', now(), now())`,
        [id()],
      );

    await insert();
    await expectViolation(insert(), PG.UNIQUE_VIOLATION, "organization_singleton");
  });
});

// --- вспомогательное ---

async function seedSubscription(fixtures: Fixtures, subscriptionId: string) {
  const planId = id();

  await pool.query(
    `INSERT INTO "SubscriptionPlan"
       (id, "serviceId", name, "sessionsCount", "priceMinor", "validityDays", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Классический, 5 сеансов', 5, 1500000, 180, true, now(), now())`,
    [planId, fixtures.serviceId],
  );

  await pool.query(
    `INSERT INTO "Subscription"
       (id, "clientId", "planId", "serviceId", "serviceNameSnapshot", "sessionsTotal",
        "pricePaidMinor", "purchasedAt", "expiresAt", status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Классический массаж, 60 мин', 5, 1500000,
             now(), now() + interval '180 days', 'ACTIVE'::"SubscriptionStatus", now(), now())`,
    [subscriptionId, fixtures.clientId, planId, fixtures.serviceId],
  );

  return { planId, subscriptionId };
}

function insertUsage(
  subscriptionId: string,
  appointmentId: string,
  state: string,
  times: { reservedAt?: Date; consumedAt?: Date; revertedAt?: Date } = {},
) {
  return pool.query(
    `INSERT INTO "SubscriptionUsage"
       (id, "subscriptionId", "appointmentId", state, "reservedAt", "consumedAt", "revertedAt", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4::"UsageState",$5,$6,$7,now(),now())`,
    [
      id(),
      subscriptionId,
      appointmentId,
      state,
      times.reservedAt ?? new Date(),
      times.consumedAt ?? null,
      times.revertedAt ?? null,
    ],
  );
}

function insertNotification(o: {
  appointmentId?: string;
  subscriptionId?: string;
  type: string;
}) {
  return pool.query(
    `INSERT INTO "NotificationLog"
       (id, "appointmentId", "subscriptionId", type, channel, status, "scheduledFor", attempts, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4::"NotificationType",'EMAIL'::"NotificationChannel",
             'SCHEDULED'::"NotificationStatus", now(), 0, now(), now())`,
    [id(), o.appointmentId ?? null, o.subscriptionId ?? null, o.type],
  );
}
