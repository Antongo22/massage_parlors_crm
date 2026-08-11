"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { encryptSecret, tryDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { RESET_CONFIRMATION } from "@/lib/domain/data-management";
import { resolveFallbackMailSettings, sendTestMail } from "@/lib/mail";
import { grantSetupAccess } from "@/lib/setup-access";
import { resetApplicationData } from "@/lib/services/data-management";
import { fillDemoData } from "@/prisma/demo-fill";

export type SettingsState = { error?: string; notice?: string };
export type DataManagementState = { error?: string; notice?: string };

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slotStepMinutes: z.number().int().min(5).max(120),
  bufferMinutes: z.number().int().min(0).max(120),
  minLeadTimeMinutes: z.number().int().min(0).max(10080),
  cancellationWindowHours: z.number().int().min(0).max(168),
  reminderOffsetMinutes: z.number().int().min(5).max(10080),
  chargeSubscriptionOnNoShow: z.boolean(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().trim().max(255).optional(),
  smtpPassword: z.string().max(255).optional(),
  smtpSecure: z.boolean(),
  mailFrom: z.string().trim().max(255).optional(),
});

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте заполнение формы" };
  }

  const input = parsed.data;
  const organization = await prisma.organization.findFirstOrThrow({ select: { id: true } });

  if (input.smtpHost && (!input.smtpPort || !input.mailFrom)) {
    return { error: "Для своего SMTP нужны порт и адрес отправителя" };
  }

  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      name: input.name,
      slotStepMinutes: input.slotStepMinutes,
      bufferMinutes: input.bufferMinutes,
      minLeadTimeMinutes: input.minLeadTimeMinutes,
      cancellationWindowHours: input.cancellationWindowHours,
      reminderOffsetMinutes: input.reminderOffsetMinutes,
      chargeSubscriptionOnNoShow: input.chargeSubscriptionOnNoShow,
      smtpHost: input.smtpHost || null,
      smtpPort: input.smtpHost ? (input.smtpPort ?? null) : null,
      smtpUser: input.smtpHost ? input.smtpUser || null : null,
      // Пустое поле = «не менять»: сохранённый пароль в форме не показывается,
      // и правка соседнего поля не должна его стирать.
      smtpPassword: input.smtpHost
        ? input.smtpPassword
          ? encryptSecret(input.smtpPassword)
          : undefined
        : null,
      smtpSecure: input.smtpSecure,
      mailFrom: input.smtpHost ? input.mailFrom || null : null,
    },
  });

  revalidatePath("/settings");
  return { notice: "Настройки сохранены" };
}

export async function sendSettingsTestMail(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const to = String(formData.get("testEmail") ?? "").trim() || admin.email;
  const parsed = settingsSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return { error: "Сначала исправьте ошибки в форме" };
  }

  const input = parsed.data;
  const organization = await prisma.organization.findFirst({
    select: { smtpPassword: true },
  });

  const settings = input.smtpHost
    ? {
        host: input.smtpHost,
        port: input.smtpPort!,
        user: input.smtpUser || null,
        password: input.smtpPassword || tryDecryptSecret(organization?.smtpPassword ?? null),
        secure: input.smtpSecure,
        from: input.mailFrom!,
        source: "database" as const,
      }
    : resolveFallbackMailSettings();

  if (!settings) {
    return { error: "Почта не настроена" };
  }

  const result = await sendTestMail(settings, to);

  return result.ok
    ? {
        notice:
          settings.source === "mailpit"
            ? `Письмо для ${to} перехвачено Mailpit`
            : `Письмо отправлено на ${to}`,
      }
    : { error: `Не удалось отправить: ${result.error}` };
}

export async function applyDemoData(
  _prev: DataManagementState,
): Promise<DataManagementState> {
  await requireAdmin();

  try {
    const result = await fillDemoData();

    for (const path of [
      "/dashboard",
      "/calendar",
      "/clients",
      "/services",
      "/subscriptions",
      "/finance",
      "/chat",
    ]) {
      revalidatePath(path);
    }

    return {
      notice:
        `Готово: ${result.clientCount} клиентов, ${result.serviceCount} услуг, ` +
        `${result.appointmentCount} записей, ${result.subscriptionCount} абонементов`,
    };
  } catch (error) {
    console.error("Не удалось применить демонстрационные данные", error);
    return { error: error instanceof Error ? error.message : "Не удалось добавить данные" };
  }
}

export async function resetCrm(
  _prev: DataManagementState,
  formData: FormData,
): Promise<DataManagementState> {
  await requireAdmin();

  if (String(formData.get("confirmation") ?? "").trim() !== RESET_CONFIRMATION) {
    return { error: `Введите «${RESET_CONFIRMATION}» без изменений` };
  }

  await resetApplicationData();
  // Сброс инициировал уже аутентифицированный администратор, поэтому после
  // удаления данных можно сразу открыть ему wizard, не спрашивая второй пароль.
  await grantSetupAccess();
  redirect("/setup");
}

function readForm(formData: FormData) {
  const mailMode = formData.get("mailMode");
  const submittedHost = formData.get("smtpHost");
  const useCustomSmtp = mailMode === "smtp" || (mailMode == null && Boolean(submittedHost));
  const port = formData.get("smtpPort");

  return {
    name: formData.get("name"),
    slotStepMinutes: Number(formData.get("slotStepMinutes")),
    bufferMinutes: Number(formData.get("bufferMinutes")),
    minLeadTimeMinutes: Number(formData.get("minLeadTimeMinutes")),
    cancellationWindowHours: Number(formData.get("cancellationWindowHours")),
    reminderOffsetMinutes: Number(formData.get("reminderOffsetMinutes")),
    chargeSubscriptionOnNoShow: formData.get("chargeSubscriptionOnNoShow") === "on",
    smtpHost: useCustomSmtp ? submittedHost || undefined : undefined,
    smtpPort: useCustomSmtp && port ? Number(port) : undefined,
    smtpUser: useCustomSmtp ? formData.get("smtpUser") || undefined : undefined,
    smtpPassword: useCustomSmtp ? formData.get("smtpPassword") || undefined : undefined,
    smtpSecure: useCustomSmtp && formData.get("smtpSecure") === "on",
    mailFrom: useCustomSmtp ? formData.get("mailFrom") || undefined : undefined,
  };
}
