import "server-only";
import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * Очередь отложенных задач.
 *
 * Единственный обязательный сценарий — напоминание за два часа до сеанса.
 * Cron-опрос «кому пора слать» здесь хуже: он либо частый и бесполезно грузит
 * базу, либо редкий и промахивается мимо точного времени. Отложенная задача
 * ставится один раз при создании записи и снимается при отмене.
 */

export const REMINDER_QUEUE = "reminders";
export const MAINTENANCE_QUEUE = "maintenance";

export type ReminderJob = {
  appointmentId: string;
};

export type MaintenanceJob = {
  kind: "expire-subscriptions" | "notify-expiring-subscriptions";
};

let connection: IORedis | null = null;

export function getRedis(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // Требование BullMQ: воркер блокируется на чтении, и ограничение
      // на повторы превратило бы обрыв связи в остановку очереди.
      maxRetriesPerRequest: null,
    });
  }

  return connection;
}

const globalForQueues = globalThis as unknown as {
  reminderQueue?: Queue<ReminderJob>;
  maintenanceQueue?: Queue<MaintenanceJob>;
};

export function getReminderQueue(): Queue<ReminderJob> {
  globalForQueues.reminderQueue ??= new Queue<ReminderJob>(REMINDER_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: false,
    },
  });

  return globalForQueues.reminderQueue;
}

export function getMaintenanceQueue(): Queue<MaintenanceJob> {
  globalForQueues.maintenanceQueue ??= new Queue<MaintenanceJob>(MAINTENANCE_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 24 * 3600, count: 100 },
    },
  });

  return globalForQueues.maintenanceQueue;
}

/**
 * Идентификатор задачи выводится из записи, а не генерируется случайно.
 * Благодаря этому повторная постановка не создаёт второе напоминание,
 * а отмена находит задачу, не храня её id где-то ещё.
 *
 * Разделитель — дефис, а не двоеточие: BullMQ отвергает двоеточие
 * в пользовательских id, потому что сам строит им ключи Redis.
 */
export function reminderJobId(appointmentId: string): string {
  return `reminder-${appointmentId}`;
}
