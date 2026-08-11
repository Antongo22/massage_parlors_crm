import "server-only";
import { prisma } from "@/lib/db";
import { getReminderQueue } from "@/lib/queue";

/**
 * Полный возврат к wizard.
 *
 * `_prisma_migrations` и Docker volumes не затрагиваются: после сброса схема
 * остаётся актуальной, а /setup может сразу создать новую организацию.
 */
export async function resetApplicationData(): Promise<void> {
  await truncateApplicationData();

  // Старые delayed jobs больше не имеют субъекта в БД. Удаляем waiting и
  // delayed, но не трогаем maintenance scheduler воркера.
  try {
    await getReminderQueue().drain(true);
  } catch (error) {
    // База уже сброшена; недоступный Redis не должен оставить приложение без
    // возможности пройти wizard. Старый job при восстановлении сам увидит,
    // что запись удалена, и завершится без письма.
    console.error("Не удалось очистить очередь напоминаний после сброса", error);
  }
}

/** Экспортирована отдельно, чтобы проверять destructive SQL на тестовой БД. */
export async function truncateApplicationData(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        TRUNCATE TABLE
          "AuditLog", "Message", "Conversation", "NotificationLog", "Payment",
          "SubscriptionUsage", "Subscription", "SubscriptionPlan", "Appointment",
          "ClientNote", "Client", "Service", "ServiceCategory", "TimeOff",
          "WorkingHours", "Master", "Session", "Account", "VerificationToken",
          "User", "Organization"
        RESTART IDENTITY CASCADE
      `;
    },
    { timeout: 30_000 },
  );
}
