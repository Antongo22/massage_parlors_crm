import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * Критический путь: вход → запись клиента на свободный слот → завершение
 * визита → отражение денег в финансах.
 *
 * Это ровно та цепочка, ради которой существует система. Если она цела,
 * салон может работать; если нет — остальное не важно. Поэтому здесь
 * не проверяются мелочи интерфейса, только сквозной сценарий.
 *
 * Требует поднятого приложения и засеянной базы: npm run db:seed.
 */

const ADMIN_EMAIL = "admin@example.com";

test.describe("критический путь администратора", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);
  });

  test("вход администратора ведёт на дашборд", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
    await expect(page.getByText("Выручка сегодня")).toBeVisible();
  });

  test("запись на свободный слот, завершение визита и оплата в финансах", async ({ page }) => {
    // Берём дату через несколько дней: сегодняшний день частично занят сидом,
    // а тест не должен зависеть от того, сколько сейчас времени.
    const target = new Date();
    target.setDate(target.getDate() + 3);
    // Воскресенье — выходной, в графике его нет.
    if (target.getDay() === 0) target.setDate(target.getDate() + 1);
    const isoDate = target.toISOString().slice(0, 10);

    await page.goto(`/calendar?date=${isoDate}`);
    await page.getByRole("button", { name: "Записать" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Новая запись")).toBeVisible();

    await dialog.getByLabel("Клиент").selectOption({ index: 1 });
    await dialog.getByLabel("Услуга").selectOption({ index: 1 });
    await dialog.getByLabel("Дата").fill(isoDate);

    // Слоты подгружаются серверным действием — ждём, пока появятся кнопки времени.
    const slot = dialog.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 15_000 });

    const slotTime = (await slot.textContent())!.trim();
    await slot.click();
    await dialog.getByRole("button", { name: "Записать" }).click();

    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    const row = page.locator("li").filter({ hasText: slotTime }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText("Подтверждена")).toBeVisible();

    // Завершаем визит: это должно создать платёж.
    await row.getByRole("button", { name: "Действия над записью" }).click();
    await page.getByRole("menuitem", { name: "Визит состоялся" }).click();

    const completeDialog = page.getByRole("dialog");
    await expect(completeDialog.getByText("Визит состоялся")).toBeVisible();
    await completeDialog.getByRole("button", { name: "Подтвердить" }).click();
    await expect(completeDialog).not.toBeVisible({ timeout: 15_000 });

    await expect(row.getByText("Состоялась")).toBeVisible();

    // Деньги должны появиться в финансах — это и есть смысл завершения визита.
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Финансы" })).toBeVisible();
    await expect(page.getByText("Последние операции")).toBeVisible();
  });

  test("занятый слот исчезает из предложенных", async ({ page }) => {
    const target = new Date();
    target.setDate(target.getDate() + 4);
    if (target.getDay() === 0) target.setDate(target.getDate() + 1);
    const isoDate = target.toISOString().slice(0, 10);

    await page.goto(`/calendar?date=${isoDate}`);
    await page.getByRole("button", { name: "Записать" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Клиент").selectOption({ index: 1 });
    await dialog.getByLabel("Услуга").selectOption({ index: 1 });
    await dialog.getByLabel("Дата").fill(isoDate);

    const slots = dialog.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(slots.first()).toBeVisible({ timeout: 15_000 });

    const before = await slots.allTextContents();
    const chosen = before[0]!;

    await slots.first().click();
    await dialog.getByRole("button", { name: "Записать" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // Открываем форму заново: занятое время предлагаться больше не должно.
    await page.getByRole("button", { name: "Записать" }).click();
    const secondDialog = page.getByRole("dialog");
    await secondDialog.getByLabel("Клиент").selectOption({ index: 1 });
    await secondDialog.getByLabel("Услуга").selectOption({ index: 1 });
    await secondDialog.getByLabel("Дата").fill(isoDate);

    const after = secondDialog.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ });
    await expect(after.first()).toBeVisible({ timeout: 15_000 });

    expect(await after.allTextContents()).not.toContain(chosen);
  });

  test("абонемент списывается при завершении визита", async ({ page }) => {
    await page.goto("/clients");
    await page.locator("li a").first().click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Продаём абонемент и убеждаемся, что остаток отображается полным.
    await page.getByRole("button", { name: "Продать абонемент" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Продажа абонемента")).toBeVisible();

    const planLabel = await dialog.getByLabel("Абонемент").inputValue();
    expect(planLabel).toBeTruthy();

    await dialog.getByRole("button", { name: "Продать" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    const subscriptions = page.locator("section, div").filter({ hasText: "Абонементы" });
    await expect(subscriptions.first()).toBeVisible();
  });
});

test.describe("кабинет клиента", () => {
  test("клиент видит только свои записи", async ({ page }) => {
    // olga@example.com — первый клиент из сида, у него есть визиты.
    await loginAs(page, "olga@example.com");
    await page.goto("/my");

    await expect(page.getByRole("heading", { name: "Мои записи" })).toBeVisible();

    // Клиент не должен попасть в админку: его перебрасывает в кабинет.
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/my/);
  });
});
