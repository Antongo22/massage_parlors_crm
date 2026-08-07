import { expect, type Page } from "@playwright/test";

/**
 * Вспомогательное для E2E.
 *
 * Логин идёт через настоящее письмо: тест запрашивает ссылку, читает её
 * из Mailpit и переходит по ней. Обходить это, подкладывая cookie сессии,
 * было бы быстрее — но тогда из-под теста выпадает вся цепочка «форма →
 * письмо → токен → сессия», в которой и ломается вход на практике.
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MailpitMessage = { ID: string; Subject: string; To: Array<{ Address: string }> };

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

async function findMessage(to: string, subject: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
    const data = (await response.json()) as { messages: MailpitMessage[] };

    const message = data.messages.find(
      (item) =>
        item.To.some((recipient) => recipient.Address.toLowerCase() === to.toLowerCase()) &&
        item.Subject.includes(subject),
    );

    if (message) return message.ID;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Письмо «${subject}» для ${to} не пришло за ${timeoutMs} мс`);
}

export async function extractLoginLink(email: string): Promise<string> {
  const id = await findMessage(email, "Вход в CRM");
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const message = (await response.json()) as { Text?: string; HTML?: string };

  const match = `${message.Text ?? ""}${message.HTML ?? ""}`.match(
    /https?:\/\/[^\s"'<]*\/api\/auth\/callback\/nodemailer\?[^\s"'<]+/,
  );

  if (!match) throw new Error("В письме нет ссылки для входа");

  return match[0].replace(/&amp;/g, "&");
}

export async function loginAs(page: Page, email: string): Promise<void> {
  await clearMailbox();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Получить ссылку для входа" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();

  await page.goto(await extractLoginLink(email));
}

/** Ждёт письмо-напоминание конкретному клиенту. */
export async function waitForMail(to: string, subject: string): Promise<void> {
  await findMessage(to, subject);
}
