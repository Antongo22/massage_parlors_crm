"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveFallbackMailSettings, sendTestMail } from "@/lib/mail";
import { seedDemoCatalog } from "@/lib/services/demo-catalog";
import {
  getSetupState,
  saveStep1,
  saveStep2,
  saveStep3,
  step1Schema,
  step2Schema,
  step3Schema,
} from "@/lib/services/setup";

/**
 * Серверные действия wizard.
 *
 * Каждое проверяет, что вызвано в свой момент: настройка — единственная часть
 * приложения, открытая без аутентификации, поэтому её нельзя защищать только
 * тем, что нужная форма не отрисована. POST на завершённую настройку должен
 * отвергаться, иначе кто угодно перезапишет параметры работающего салона.
 */

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
};

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
  );
}

async function assertSetupOpen(expectedStep: 1 | 2 | 3): Promise<ActionState | null> {
  const state = await getSetupState();

  if (state.completed) {
    return { error: "Настройка уже завершена" };
  }

  if (state.step < expectedStep) {
    return { error: `Сначала завершите шаг ${state.step}` };
  }

  return null;
}

export async function submitStep1(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSetupOpen(1);
  if (guard) return guard;

  const parsed = step1Schema.safeParse({
    organizationName: formData.get("organizationName"),
    timezone: formData.get("timezone"),
    adminName: formData.get("adminName"),
    adminEmail: formData.get("adminEmail"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  await saveStep1(parsed.data);
  revalidatePath("/setup");
  redirect("/setup?step=2");
}

export async function submitStep2(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSetupOpen(2);
  if (guard) return guard;

  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: formData.get(`day-${weekday}-enabled`) === "on",
    startMinute: parseTime(formData.get(`day-${weekday}-start`)),
    endMinute: parseTime(formData.get(`day-${weekday}-end`)),
  }));

  const parsed = step2Schema.safeParse({
    masterName: formData.get("masterName"),
    specialization: formData.get("specialization") || undefined,
    days,
    slotStepMinutes: Number(formData.get("slotStepMinutes")),
    bufferMinutes: Number(formData.get("bufferMinutes")),
    minLeadTimeMinutes: Number(formData.get("minLeadTimeMinutes")),
    cancellationWindowHours: Number(formData.get("cancellationWindowHours")),
    reminderOffsetMinutes: Number(formData.get("reminderOffsetMinutes")),
    chargeSubscriptionOnNoShow: formData.get("chargeSubscriptionOnNoShow") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  await saveStep2(parsed.data);
  revalidatePath("/setup");
  redirect("/setup?step=3");
}

export async function submitStep3(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSetupOpen(3);
  if (guard) return guard;

  const parsed = parseMailForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  await saveStep3(parsed.data);

  if (parsed.data.seedDemoData) {
    await seedDemoCatalog();
  }

  redirect("/login?setup=done");
}

/**
 * Тестовое письмо отправляется теми настройками, что сейчас в форме, а не теми,
 * что сохранены: смысл кнопки — проверить их ДО сохранения. Иначе wizard
 * завершится с нерабочей почтой, и выяснится это на первом напоминании клиенту.
 */
export async function sendTestEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSetupOpen(3);
  if (guard) return guard;

  const recipient = z.email().safeParse(String(formData.get("testEmail") ?? "").trim());

  if (!recipient.success) {
    return { fieldErrors: { testEmail: "Укажите адрес, на который отправить письмо" } };
  }

  const parsed = parseMailForm(formData);

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure, mailFrom } = parsed.data;

  const settings = smtpHost
    ? {
        host: smtpHost,
        port: smtpPort!,
        user: smtpUser || null,
        password: smtpPassword || null,
        secure: smtpSecure,
        from: mailFrom!,
        source: "database" as const,
      }
    : resolveFallbackMailSettings();

  if (!settings) {
    return { error: "Почта не настроена: выберите Mailpit или заполните SMTP" };
  }

  const result = await sendTestMail(settings, recipient.data);

  return result.ok
    ? {
        notice:
          settings.source === "mailpit"
            ? `Письмо для ${recipient.data} перехвачено Mailpit`
            : `Письмо отправлено на ${recipient.data}`,
      }
    : { error: `Не удалось отправить: ${result.error}` };
}

function parseMailForm(formData: FormData) {
  const mailMode = formData.get("mailMode");
  const submittedHost = formData.get("smtpHost");
  // Формы старой версии не присылали mailMode. Для них наличие хоста по-прежнему
  // означает собственный SMTP, чтобы обновление не ломало незавершённый wizard.
  const useCustomSmtp = mailMode === "smtp" || (mailMode == null && Boolean(submittedHost));
  const port = formData.get("smtpPort");

  return step3Schema.safeParse({
    smtpHost: useCustomSmtp ? submittedHost || undefined : undefined,
    smtpPort: useCustomSmtp && port ? Number(port) : undefined,
    smtpUser: useCustomSmtp ? formData.get("smtpUser") || undefined : undefined,
    smtpPassword: useCustomSmtp ? formData.get("smtpPassword") || undefined : undefined,
    smtpSecure: useCustomSmtp && formData.get("smtpSecure") === "on",
    mailFrom: useCustomSmtp ? formData.get("mailFrom") || undefined : undefined,
    seedDemoData: formData.get("seedDemoData") === "on",
  });
}

/** "10:00" → 600. Пустое значение считаем нулём: день всё равно выключен. */
function parseTime(value: FormDataEntryValue | null): number {
  const [hours, minutes] = String(value ?? "").split(":");
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}
