import "server-only";
import { prisma } from "@/lib/db";
import { getReminderQueue, reminderJobId } from "@/lib/queue";
import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<PrismaClient, "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends">;

/**
 * Планирование напоминаний.
 *
 * Два хранилища, и роли у них разные: BullMQ держит отложенную задачу,
 * NotificationLog — факт того, что уведомление запланировано и отправлено.
 * Лог нужен именно потому, что очередь ненадёжна как источник правды:
 * потеря Redis не должна приводить к повторной рассылке писем клиентам,
 * а уникальный индекс по паре (запись, тип) это гарантирует.
 */

export async function scheduleReminder(
  tx: Tx,
  appointment: { id: string; startsAt: Date },
  reminderOffsetMinutes: number,
  now: Date = new Date(),
): Promise<void> {
  const scheduledFor = new Date(appointment.startsAt.getTime() - reminderOffsetMinutes * 60_000);

  // Записались за час до сеанса при напоминании за два — напоминать уже поздно
  // и незачем: клиент только что сам выбрал это время.
  if (scheduledFor <= now) return;

  // upsert здесь недоступен: уникальность обеспечивают частичные индексы
  // в SQL (subscriptionId тоже может быть субъектом), а их Prisma не видит
  // и составного where не генерирует. Поэтому поиск и запись раздельно —
  // внутри транзакции этого достаточно, а от гонки защищает сам индекс.
  const existing = await tx.notificationLog.findFirst({
    where: { appointmentId: appointment.id, type: "REMINDER_2H" },
    select: { id: true },
  });

  if (existing) {
    await tx.notificationLog.update({
      where: { id: existing.id },
      data: {
        // Перенос записи: время меняется, а счётчик попыток и ошибка
        // от прошлой отправки больше не актуальны.
        status: "SCHEDULED",
        scheduledFor,
        sentAt: null,
        attempts: 0,
        lastError: null,
        jobId: reminderJobId(appointment.id),
      },
    });

    return;
  }

  await tx.notificationLog.create({
    data: {
      appointmentId: appointment.id,
      type: "REMINDER_2H",
      channel: "EMAIL",
      status: "SCHEDULED",
      scheduledFor,
      jobId: reminderJobId(appointment.id),
    },
  });
}

/**
 * Постановка задачи в очередь — отдельно от записи в лог, потому что делается
 * ПОСЛЕ фиксации транзакции. Иначе воркер может подхватить задачу раньше,
 * чем запись станет видимой другим соединениям, и не найти её.
 */
export async function enqueueReminder(
  appointmentId: string,
  startsAt: Date,
  reminderOffsetMinutes: number,
  now: Date = new Date(),
): Promise<void> {
  const scheduledFor = new Date(startsAt.getTime() - reminderOffsetMinutes * 60_000);
  const delay = scheduledFor.getTime() - now.getTime();

  if (delay <= 0) return;

  await enqueueReminderAt(appointmentId, scheduledFor, now);
}

/** Ставит задачу на сохранённый момент; просроченную — немедленно. */
export async function enqueueReminderAt(
  appointmentId: string,
  scheduledFor: Date,
  now: Date = new Date(),
): Promise<void> {
  const delay = Math.max(0, scheduledFor.getTime() - now.getTime());

  const queue = getReminderQueue();
  const jobId = reminderJobId(appointmentId);

  // Старую задачу снимаем явно: BullMQ игнорирует повторное добавление
  // с тем же jobId, и перенос записи не изменил бы время отправки.
  await queue.remove(jobId).catch(() => undefined);
  await queue.add("reminder", { appointmentId }, { jobId, delay });
}

export async function cancelReminder(appointmentId: string): Promise<void> {
  await getReminderQueue()
    .remove(reminderJobId(appointmentId))
    .catch(() => undefined);

  await prisma.notificationLog.updateMany({
    where: { appointmentId, type: "REMINDER_2H", status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
}

/**
 * Отправка уведомлений отключается целиком — нужно для сида и тестов,
 * где создаются десятки записей и письма не нужны.
 */
export function notificationsDisabled(): boolean {
  return process.env.DISABLE_NOTIFICATIONS === "true";
}
