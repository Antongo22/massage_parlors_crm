import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { tryDecryptSecret } from "@/lib/crypto";
import { getOrganization } from "@/lib/services/organization";

/**
 * Почтовый транспорт.
 *
 * Порядок источников важен: сначала база (реальный SMTP, заданный владельцем),
 * затем закрытый Mailpit и только потом legacy SMTP из окружения. Обратный
 * порядок означал бы, что выбранное в интерфейсе молча игнорируется.
 */

export type MailSettings = {
  host: string;
  port: number;
  user: string | null;
  password: string | null;
  secure: boolean;
  from: string;
  source: "database" | "environment" | "mailpit";
};

/**
 * Резервный транспорт для первичной настройки и тестового режима.
 *
 * В compose Mailpit задаётся отдельными переменными, поэтому старый
 * SMTP_PORT=587 в production env не может случайно превратить адрес
 * mailpit:1025 в mailpit:587. Если Mailpit в окружении отсутствует, сохраняем
 * обратную совместимость с обычными SMTP_* переменными.
 */
export function resolveFallbackMailSettings(): MailSettings | null {
  const mailpitHost = process.env.MAILPIT_SMTP_HOST?.trim();
  const mailpitPort = Number(process.env.MAILPIT_SMTP_PORT ?? 1025);

  if (mailpitHost && Number.isInteger(mailpitPort) && mailpitPort > 0) {
    return {
      host: mailpitHost,
      port: mailpitPort,
      user: null,
      password: null,
      secure: false,
      from: process.env.MAILPIT_MAIL_FROM || "CRM (Mailpit) <noreply@mailpit.local>",
      source: "mailpit",
    };
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);

  if (!host || !Number.isInteger(port) || port <= 0) return null;

  return {
    host,
    port,
    user: process.env.SMTP_USER || null,
    password: process.env.SMTP_PASSWORD || null,
    secure: process.env.SMTP_SECURE === "true",
    from: process.env.MAIL_FROM || "CRM <noreply@localhost>",
    source: "environment",
  };
}

export async function resolveMailSettings(): Promise<MailSettings | null> {
  const organization = await getOrganization();

  if (organization?.smtpHost && organization.smtpPort && organization.mailFrom) {
    return {
      host: organization.smtpHost,
      port: organization.smtpPort,
      user: organization.smtpUser,
      password: tryDecryptSecret(organization.smtpPassword),
      secure: organization.smtpSecure,
      from: organization.mailFrom,
      source: "database",
    };
  }

  return resolveFallbackMailSettings();
}

export function createTransport(settings: MailSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // Облачные VPS нередко блокируют исходящие SMTP-порты. Без явных
    // таймаутов Server Action ждёт дольше nginx и пользователь видит 504
    // вместо понятной ошибки в форме.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // Пустой auth для локального Mailpit: он не требует аутентификации,
    // а переданный пустой логин заставил бы nodemailer её пытаться.
    auth: settings.user ? { user: settings.user, pass: settings.password ?? "" } : undefined,
  });
}

export type SendResult = { ok: true } | { ok: false; error: string };

function mailErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const code = (error as Error & { code?: string }).code;

  if (code === "ETIMEDOUT") {
    return "SMTP-сервер не ответил за 20 секунд. Проверьте, разрешён ли исходящий SMTP-порт у хостинг-провайдера";
  }

  if (code === "EAUTH") {
    return "SMTP отклонил логин или пароль. Используйте полный адрес ящика и пароль приложения";
  }

  if (code === "ECONNECTION" || code === "ESOCKET" || code === "ECONNREFUSED") {
    return `Не удалось подключиться к SMTP-серверу: ${error.message}`;
  }

  return error.message;
}

/**
 * Отправка письма. Ошибки возвращаются значением, а не исключением: почти все
 * вызовы — это фон (воркер напоминаний) или форма wizard, где нужно показать
 * причину пользователю, а не уронить запрос.
 */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const settings = await resolveMailSettings();

  if (!settings) {
    return { ok: false, error: "Почта не настроена: выберите Mailpit или укажите SMTP" };
  }

  try {
    await createTransport(settings).sendMail({ from: settings.from, ...message });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mailErrorMessage(error) };
  }
}

/** Проверка соединения для кнопки «отправить тестовое письмо» в wizard. */
export async function sendTestMail(settings: MailSettings, to: string): Promise<SendResult> {
  try {
    const transport = createTransport(settings);
    // sendMail сам устанавливает соединение и проверяет авторизацию. Отдельный
    // verify создавал второе SMTP-соединение и вдвое увеличивал время ожидания.
    await transport.sendMail({
      from: settings.from,
      to,
      subject: "Проверка почты — CRM массажного салона",
      text:
        "Если вы читаете это письмо, почта настроена верно.\n\n" +
        "Напоминания клиентам о сеансе будут уходить с этих настроек.",
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: mailErrorMessage(error) };
  }
}
