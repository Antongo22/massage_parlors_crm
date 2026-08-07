import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "@/lib/db";
import { formatLocalDateTime } from "@/lib/domain/time";
import { sendMail } from "@/lib/mail";
import {
  getMaintenanceQueue,
  getRedis,
  MAINTENANCE_QUEUE,
  REMINDER_QUEUE,
  type MaintenanceJob,
  type ReminderJob,
} from "@/lib/queue";
import { expireSubscriptions } from "@/lib/services/subscriptions";

/**
 * Фоновый процесс: напоминания и обслуживание.
 *
 * Отдельный контейнер, а не поток внутри веб-сервера. Причина не в масштабе:
 * перезапуск приложения при деплое не должен гасить очередь на лету, а долгая
 * рассылка не должна занимать event loop, обслуживающий запросы.
 */

const connection = getRedis();

const reminderWorker = new Worker<ReminderJob>(
  REMINDER_QUEUE,
  async (job) => {
    const { appointmentId } = job.data;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        client: { select: { firstName: true, email: true } },
        master: { select: { displayName: true } },
      },
    });

    if (!appointment) {
      console.warn(`[reminder] запись ${appointmentId} не найдена, пропускаем`);
      return;
    }

    // Статус мог измениться после постановки задачи: отмену мы задачу снимаем,
    // но между снятием и выполнением есть окно, а ретрай может прийти позже.
    if (appointment.status !== "CONFIRMED" && appointment.status !== "PENDING") {
      console.info(`[reminder] запись ${appointmentId} в статусе ${appointment.status}, не шлём`);
      return;
    }

    const log = await prisma.notificationLog.findFirst({
      where: { appointmentId, type: "REMINDER_2H" },
    });

    // Идемпотентность: перезапуск воркера или дубль задачи не должны
    // приводить ко второму письму клиенту.
    if (log?.status === "SENT") {
      console.info(`[reminder] уже отправлено для ${appointmentId}`);
      return;
    }

    if (!appointment.client.email) {
      await markFailed(log?.id, "У клиента не указан email");
      return;
    }

    const organization = await prisma.organization.findFirst();
    const when = formatLocalDateTime(appointment.startsAt, organization?.timezone ?? "UTC");

    const result = await sendMail({
      to: appointment.client.email,
      subject: `Напоминание: сеанс ${when}`,
      text:
        `${appointment.client.firstName}, здравствуйте!\n\n` +
        `Напоминаем о записи: ${appointment.serviceNameSnapshot}, ${when}.\n` +
        `Мастер: ${appointment.master.displayName}.\n\n` +
        `Если планы изменились, сообщите нам заранее.\n` +
        `${organization?.name ?? ""}`,
      html: reminderHtml({
        clientName: appointment.client.firstName,
        service: appointment.serviceNameSnapshot,
        when,
        master: appointment.master.displayName,
        organization: organization?.name ?? "Массажный салон",
      }),
    });

    if (!result.ok) {
      await markFailed(log?.id, result.error);
      // Бросаем, чтобы BullMQ выполнил ретрай по своей политике.
      throw new Error(`Не удалось отправить напоминание: ${result.error}`);
    }

    if (log) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });
    }

    console.info(`[reminder] отправлено ${appointment.client.email} по записи ${appointmentId}`);
  },
  { connection, concurrency: 5 },
);

const maintenanceWorker = new Worker<MaintenanceJob>(
  MAINTENANCE_QUEUE,
  async (job) => {
    if (job.data.kind === "expire-subscriptions") {
      const count = await expireSubscriptions();
      console.info(`[maintenance] помечено истёкшими абонементов: ${count}`);
      return;
    }

    if (job.data.kind === "notify-expiring-subscriptions") {
      await notifyExpiringSubscriptions();
    }
  },
  { connection, concurrency: 1 },
);

/**
 * Предупреждение о сгорающем абонементе.
 *
 * «У меня сгорело четыре сеанса, меня не предупредили» — типичный конфликт
 * салона с клиентом. Письмо уходит один раз на абонемент: уникальный
 * частичный индекс по паре (абонемент, тип) не даст отправить второй раз.
 */
async function notifyExpiringSubscriptions() {
  const inSevenDays = new Date(Date.now() + 7 * 864e5);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: new Date(), lte: inSevenDays },
      notifications: { none: { type: "SUBSCRIPTION_EXPIRING" } },
    },
    include: {
      client: { select: { firstName: true, email: true } },
      usages: { select: { state: true } },
    },
  });

  for (const subscription of subscriptions) {
    const available =
      subscription.sessionsTotal -
      subscription.usages.filter((usage) => usage.state !== "REVERTED").length;

    if (available <= 0 || !subscription.client.email) continue;

    const created = await prisma.notificationLog.create({
      data: {
        subscriptionId: subscription.id,
        type: "SUBSCRIPTION_EXPIRING",
        channel: "EMAIL",
        status: "SCHEDULED",
        scheduledFor: new Date(),
      },
    });

    const result = await sendMail({
      to: subscription.client.email,
      subject: "Абонемент скоро сгорает",
      text:
        `${subscription.client.firstName}, здравствуйте!\n\n` +
        `В вашем абонементе на «${subscription.serviceNameSnapshot}» осталось ${available} сеансов, ` +
        `а срок действия истекает ${subscription.expiresAt.toLocaleDateString("ru-RU")}.\n\n` +
        `Успейте записаться.`,
    });

    await prisma.notificationLog.update({
      where: { id: created.id },
      data: result.ok
        ? { status: "SENT", sentAt: new Date(), attempts: 1 }
        : { status: "FAILED", lastError: result.error, attempts: 1 },
    });
  }

  console.info(`[maintenance] предупреждений о сгорании: ${subscriptions.length}`);
}

async function markFailed(logId: string | undefined, error: string) {
  if (!logId) return;

  await prisma.notificationLog.update({
    where: { id: logId },
    data: { status: "FAILED", lastError: error, attempts: { increment: 1 } },
  });
}

function reminderHtml(data: {
  clientName: string;
  service: string;
  when: string;
  master: string;
  organization: string;
}): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <p style="color:#444;line-height:1.5">${data.clientName}, здравствуйте!</p>
      <div style="background:#f6f6f5;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px;font-size:18px;font-weight:600">${data.service}</p>
        <p style="margin:0;color:#555">${data.when}</p>
        <p style="margin:8px 0 0;color:#777;font-size:14px">Мастер: ${data.master}</p>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.5">
        Если планы изменились, сообщите нам заранее — мы предложим время другому клиенту.
      </p>
      <p style="color:#999;font-size:13px;margin-top:24px">${data.organization}</p>
    </div>
  `;
}

/**
 * Повторяющиеся задачи. Ставятся при старте: BullMQ хранит расписание
 * в Redis и не создаёт дублей при перезапуске воркера.
 */
async function scheduleRepeatableJobs() {
  const queue = getMaintenanceQueue();

  await queue.upsertJobScheduler(
    "expire-subscriptions",
    { pattern: "0 3 * * *" },
    { name: "maintenance", data: { kind: "expire-subscriptions" } },
  );

  await queue.upsertJobScheduler(
    "notify-expiring",
    { pattern: "0 10 * * *" },
    { name: "maintenance", data: { kind: "notify-expiring-subscriptions" } },
  );
}

reminderWorker.on("failed", (job, error) => {
  console.error(`[reminder] задача ${job?.id} провалилась:`, error.message);
});

maintenanceWorker.on("failed", (job, error) => {
  console.error(`[maintenance] задача ${job?.id} провалилась:`, error.message);
});

async function shutdown(signal: string) {
  console.info(`[worker] получен ${signal}, завершаем текущие задачи`);

  // Закрываем аккуратно: незавершённое письмо не должно потеряться,
  // иначе клиент не получит напоминание из-за обычного деплоя.
  await Promise.all([reminderWorker.close(), maintenanceWorker.close()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await scheduleRepeatableJobs();

console.info("[worker] запущен: напоминания и обслуживание абонементов");
