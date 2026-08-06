import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect } from "vitest";

/**
 * Тесты ограничений работают с базой напрямую через pg, а не через Prisma.
 *
 * Причина: проверяется поведение PostgreSQL, а не ORM. Prisma приводит ошибки
 * БД к собственным кодам (P2002 и прочие) и для CHECK-нарушений не даёт
 * структурированного кода вообще — утверждение свелось бы к разбору текста
 * сообщения. Голый драйвер отдаёт SQLSTATE и имя ограничения как есть.
 */
export const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

/** SQLSTATE-коды, на которые ссылаются тесты. */
export const PG = {
  EXCLUSION_VIOLATION: "23P01",
  CHECK_VIOLATION: "23514",
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
} as const;

export const id = () => randomUUID();

/** Минута в миллисекундах — расписание везде считается в минутах. */
export const minutes = (n: number) => n * 60_000;

export async function truncateAll() {
  await pool.query(`
    TRUNCATE TABLE
      "AuditLog", "Message", "Conversation", "NotificationLog", "Payment",
      "SubscriptionUsage", "Subscription", "SubscriptionPlan", "Appointment",
      "ClientNote", "Client", "Service", "ServiceCategory", "TimeOff",
      "WorkingHours", "Master", "Session", "Account", "User", "Organization"
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Проверяет, что операция нарушила конкретное ограничение.
 *
 * Сверяется и код, и имя: без имени тест «упало с 23514» прошёл бы при падении
 * на совершенно другом CHECK и создал бы ложную уверенность.
 */
export async function expectViolation(
  operation: Promise<unknown>,
  code: string,
  constraint: string,
) {
  const error = await operation.then(
    () => null,
    (e: unknown) => e as { code?: string; constraint?: string; message?: string },
  );

  expect(error, `ожидалось нарушение ${constraint}, но операция прошла`).not.toBeNull();
  expect({ code: error?.code, constraint: error?.constraint }).toEqual({ code, constraint });
}

export type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

/** Минимальный набор сущностей, без которого нельзя вставить запись на сеанс. */
export async function seedFixtures() {
  const categoryId = id();
  const serviceId = id();
  const masterId = id();
  const otherMasterId = id();
  const clientId = id();

  await pool.query(
    `INSERT INTO "ServiceCategory" (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, 'Классический', 'classic', 0, now(), now())`,
    [categoryId],
  );

  await pool.query(
    `INSERT INTO "Service"
       (id, "categoryId", name, slug, "durationMinutes", "priceMinor", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Классический массаж, 60 мин', 'classic-60', 60, 350000, true, now(), now())`,
    [serviceId, categoryId],
  );

  for (const [mid, name] of [
    [masterId, "Анна"],
    [otherMasterId, "Мария"],
  ] as const) {
    await pool.query(
      `INSERT INTO "Master" (id, "displayName", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, true, now(), now())`,
      [mid, name],
    );
  }

  await pool.query(
    `INSERT INTO "Client"
       (id, "lastName", "firstName", phone, "noShowCount", "createdAt", "updatedAt")
     VALUES ($1, 'Иванова', 'Ольга', '+79990000001', 0, now(), now())`,
    [clientId],
  );

  return { categoryId, serviceId, masterId, otherMasterId, clientId };
}

type AppointmentOverrides = {
  id?: string;
  startsAt: Date;
  durationMinutes?: number;
  bufferMinutes?: number;
  status?: string;
  endsAt?: Date;
  blockedUntil?: Date;
  masterId?: string;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  noShowAt?: Date | null;
  paymentMode?: string;
};

/**
 * Вставка записи с корректно посчитанными endsAt/blockedUntil.
 * Тесты, проверяющие рассогласование, передают их явно.
 */
export function insertAppointment(fx: Fixtures, o: AppointmentOverrides) {
  const duration = o.durationMinutes ?? 60;
  const buffer = o.bufferMinutes ?? 0;
  const endsAt = o.endsAt ?? new Date(o.startsAt.getTime() + minutes(duration));
  const blockedUntil = o.blockedUntil ?? new Date(endsAt.getTime() + minutes(buffer));

  return pool.query(
    `INSERT INTO "Appointment" (
       id, "clientId", "masterId", "serviceId",
       "startsAt", "endsAt", "blockedUntil", status,
       "serviceNameSnapshot", "priceMinorSnapshot",
       "durationMinutesSnapshot", "bufferMinutesSnapshot",
       "paymentMode", "completedAt", "cancelledAt", "noShowAt",
       "createdAt", "updatedAt"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::"AppointmentStatus",$9,$10,$11,$12,$13::"PaymentMode",$14,$15,$16,now(),now())`,
    [
      o.id ?? id(),
      fx.clientId,
      o.masterId ?? fx.masterId,
      fx.serviceId,
      o.startsAt,
      endsAt,
      blockedUntil,
      o.status ?? "CONFIRMED",
      "Классический массаж, 60 мин",
      350000,
      duration,
      buffer,
      o.paymentMode ?? "CASH_OR_CARD",
      o.completedAt ?? null,
      o.cancelledAt ?? null,
      o.noShowAt ?? null,
    ],
  );
}

export function insertWorkingHours(
  masterId: string,
  weekday: number,
  startMinute: number,
  endMinute: number,
) {
  return pool.query(
    `INSERT INTO "WorkingHours" (id, "masterId", weekday, "startMinute", "endMinute", "createdAt")
     VALUES ($1, $2, $3, $4, $5, now())`,
    [id(), masterId, weekday, startMinute, endMinute],
  );
}
