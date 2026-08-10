"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { encryptSecret, tryDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { sendTestMail } from "@/lib/mail";

export type SettingsState = { error?: string; notice?: string };

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
      smtpPassword: input.smtpPassword ? encryptSecret(input.smtpPassword) : undefined,
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
    : {
        host: process.env.SMTP_HOST ?? "",
        port: Number(process.env.SMTP_PORT ?? 0),
        user: process.env.SMTP_USER || null,
        password: process.env.SMTP_PASSWORD || null,
        secure: process.env.SMTP_SECURE === "true",
        from: process.env.MAIL_FROM || "CRM <noreply@localhost>",
        source: "environment" as const,
      };

  if (!settings.host || !settings.port) {
    return { error: "Почта не настроена" };
  }

  const result = await sendTestMail(settings, to);

  return result.ok
    ? { notice: `Письмо отправлено на ${to}` }
    : { error: `Не удалось отправить: ${result.error}` };
}

function readForm(formData: FormData) {
  const port = formData.get("smtpPort");

  return {
    name: formData.get("name"),
    slotStepMinutes: Number(formData.get("slotStepMinutes")),
    bufferMinutes: Number(formData.get("bufferMinutes")),
    minLeadTimeMinutes: Number(formData.get("minLeadTimeMinutes")),
    cancellationWindowHours: Number(formData.get("cancellationWindowHours")),
    reminderOffsetMinutes: Number(formData.get("reminderOffsetMinutes")),
    chargeSubscriptionOnNoShow: formData.get("chargeSubscriptionOnNoShow") === "on",
    smtpHost: formData.get("smtpHost") || undefined,
    smtpPort: port ? Number(port) : undefined,
    smtpUser: formData.get("smtpUser") || undefined,
    smtpPassword: formData.get("smtpPassword") || undefined,
    smtpSecure: formData.get("smtpSecure") === "on",
    mailFrom: formData.get("mailFrom") || undefined,
  };
}
