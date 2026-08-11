import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { tryDecryptSecret } from "@/lib/crypto";
import { getOrganization } from "@/lib/services/organization";

/**
 * Почтовый транспорт.
 *
 * Источников настроек два, и порядок важен: сначала база (их задал владелец
 * салона в wizard), потом переменные окружения. Env — это режим первого
 * запуска, когда организации ещё нет, и запасной вариант, если настройки
 * почты в wizard пропустили. Обратный порядок означал бы, что заданное
 * в интерфейсе молча игнорируется.
 */

export type MailSettings = {
  host: string;
  port: number;
  user: string | null;
  password: string | null;
  secure: boolean;
  from: string;
  source: "database" | "environment";
};

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

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);

  if (!host || !Number.isInteger(port)) return null;

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
    return { ok: false, error: "Почта не настроена: нет ни настроек в базе, ни SMTP_HOST" };
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
