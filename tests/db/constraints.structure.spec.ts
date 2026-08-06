import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./helpers";

/**
 * Структурные снимки ограничений.
 *
 * Сравниваются НЕ имена, а нормализованные определения из pg_get_constraintdef
 * и pg_indexes. Проверка «констрейнт appointment_no_overlap существует» прошла бы
 * и после подмены blockedUntil на endsAt внутри него — имя осталось бы прежним,
 * а защита технического перерыва исчезла. Именно такой сценарий (правка схемы
 * агентом или наспех) и был причиной завести эти тесты.
 *
 * PostgreSQL приводит выражение к канонической форме, поэтому снимок реагирует
 * на смысловое изменение и не ломается от переносов строк и лишних скобок.
 *
 * Если тест упал: сначала поймите, почему определение изменилось. Обновлять
 * ожидание можно только вместе с осознанным изменением prisma/sql/*.sql.
 */

const EXPECTED_CONSTRAINTS: Record<string, string> = {
  appointment_no_overlap:
    `EXCLUDE USING gist ("masterId" WITH =, tstzrange("startsAt", "blockedUntil", '[)'::text) WITH &&) ` +
    `WHERE ((status = ANY (ARRAY['PENDING'::"AppointmentStatus", 'CONFIRMED'::"AppointmentStatus"])))`,

  appointment_duration_consistent:
    `CHECK ((("endsAt" = ("startsAt" + make_interval(mins => "durationMinutesSnapshot"))) ` +
    `AND ("blockedUntil" = ("endsAt" + make_interval(mins => "bufferMinutesSnapshot")))))`,

  appointment_status_fields_consistent:
    `CHECK ((((status = 'COMPLETED'::"AppointmentStatus") AND ("completedAt" IS NOT NULL) AND ("cancelledAt" IS NULL) AND ("noShowAt" IS NULL)) ` +
    `OR ((status = 'CANCELLED'::"AppointmentStatus") AND ("cancelledAt" IS NOT NULL) AND ("completedAt" IS NULL) AND ("noShowAt" IS NULL)) ` +
    `OR ((status = 'NO_SHOW'::"AppointmentStatus") AND ("noShowAt" IS NOT NULL) AND ("completedAt" IS NULL) AND ("cancelledAt" IS NULL)) ` +
    `OR ((status = ANY (ARRAY['PENDING'::"AppointmentStatus", 'CONFIRMED'::"AppointmentStatus"])) AND ("completedAt" IS NULL) AND ("cancelledAt" IS NULL) AND ("noShowAt" IS NULL))))`,

  workinghours_no_overlap:
    `EXCLUDE USING gist ("masterId" WITH =, weekday WITH =, ` +
    `int4range(("startMinute")::integer, ("endMinute")::integer, '[)'::text) WITH &&)`,

  payment_has_exactly_one_subject:
    `CHECK ((((("appointmentId" IS NOT NULL))::integer + (("subscriptionId" IS NOT NULL))::integer) = 1))`,

  payment_refund_link:
    `CHECK ((((kind = 'SALE'::"PaymentKind") AND ("refundedPaymentId" IS NULL)) ` +
    `OR ((kind = 'REFUND'::"PaymentKind") AND ("refundedPaymentId" IS NOT NULL))))`,

  payment_cannot_refund_itself: `CHECK ((("refundedPaymentId" IS NULL) OR ("refundedPaymentId" <> id)))`,

  subscription_usage_state_consistent:
    `CHECK ((((state = 'RESERVED'::"UsageState") AND ("consumedAt" IS NULL) AND ("revertedAt" IS NULL)) ` +
    `OR ((state = 'CONSUMED'::"UsageState") AND ("consumedAt" IS NOT NULL) AND ("revertedAt" IS NULL)) ` +
    `OR ((state = 'REVERTED'::"UsageState") AND ("revertedAt" IS NOT NULL))))`,

  subscription_usage_timeline_valid:
    `CHECK (((("consumedAt" IS NULL) OR ("consumedAt" >= "reservedAt")) ` +
    `AND (("revertedAt" IS NULL) OR ("revertedAt" >= "reservedAt"))))`,

  notification_subject_valid:
    `CHECK ((((type = ANY (ARRAY['REMINDER_2H'::"NotificationType", 'BOOKING_CONFIRMED'::"NotificationType", 'CANCELLED'::"NotificationType"])) ` +
    `AND ("appointmentId" IS NOT NULL) AND ("subscriptionId" IS NULL)) ` +
    `OR ((type = 'SUBSCRIPTION_EXPIRING'::"NotificationType") AND ("subscriptionId" IS NOT NULL) AND ("appointmentId" IS NULL))))`,

  client_phone_e164: `CHECK ((phone ~ '^\\+[1-9][0-9]{7,14}$'::text))`,

  message_body_not_empty: `CHECK ((length(btrim(body)) > 0))`,
};

const EXPECTED_INDEXES: Record<string, string> = {
  user_email_normalized_unique:
    `CREATE UNIQUE INDEX user_email_normalized_unique ON public."User" USING btree (lower(btrim(email)))`,

  client_email_normalized_unique:
    `CREATE UNIQUE INDEX client_email_normalized_unique ON public."Client" USING btree (lower(btrim(email))) ` +
    `WHERE ((email IS NOT NULL) AND ("archivedAt" IS NULL))`,

  notification_unique_per_appointment:
    `CREATE UNIQUE INDEX notification_unique_per_appointment ON public."NotificationLog" ` +
    `USING btree ("appointmentId", type) WHERE ("appointmentId" IS NOT NULL)`,

  notification_unique_per_subscription:
    `CREATE UNIQUE INDEX notification_unique_per_subscription ON public."NotificationLog" ` +
    `USING btree ("subscriptionId", type) WHERE ("subscriptionId" IS NOT NULL)`,

  organization_singleton: `CREATE UNIQUE INDEX organization_singleton ON public."Organization" USING btree ((true))`,
};

afterAll(async () => {
  await pool.end();
});

describe("определения ограничений", () => {
  it.for(Object.entries(EXPECTED_CONSTRAINTS))("%s", async ([name, expected]) => {
    const { rows } = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = $1 AND connamespace = 'public'::regnamespace`,
      [name],
    );

    expect(rows[0]?.definition, `ограничение ${name} отсутствует в базе`).toBeDefined();
    expect(rows[0]?.definition).toBe(expected);
  });
});

describe("определения индексов", () => {
  it.for(Object.entries(EXPECTED_INDEXES))("%s", async ([name, expected]) => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [name],
    );

    expect(rows[0]?.indexdef, `индекс ${name} отсутствует в базе`).toBeDefined();
    expect(rows[0]?.indexdef).toBe(expected);
  });
});
