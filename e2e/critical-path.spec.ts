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

    // Фамилия понадобится, чтобы найти платёж этого клиента в финансах.
    const clientName = (await row.locator("a").first().textContent())!.trim().split(" ")[0]!;

    // Завершаем визит: это должно создать платёж.
    await row.getByRole("button", { name: "Действия над записью" }).click();
    await page.getByRole("menuitem", { name: "Визит состоялся" }).click();

    const completeDialog = page.getByRole("dialog");
    await expect(completeDialog.getByText("Визит состоялся")).toBeVisible();
    await completeDialog.getByRole("button", { name: "Подтвердить" }).click();
    await expect(completeDialog).not.toBeVisible({ timeout: 15_000 });

    await expect(row.getByText("Состоялась")).toBeVisible();

    // Деньги должны появиться в финансах — это и есть смысл завершения визита.
    // Проверяем именно платёж этого клиента, а не то, что страница отрисовалась:
    // иначе тест пройдёт и при полностью сломанном создании платежа.
    await page.goto("/finance");

    const operations = page.locator("li").filter({ hasText: clientName });
    await expect(operations.first()).toBeVisible();
    await expect(operations.first()).toContainText("+");
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

  test("резерв по абонементу уменьшает остаток", async ({ page }) => {
    // Название теста обещает конкретное поведение, поэтому и проверяется оно:
    // остаток до записи, остаток после. Проверка «блок абонементов виден»
    // прошла бы и при полностью сломанном списании.
    const target = new Date();
    target.setDate(target.getDate() + 5);
    if (target.getDay() === 0) target.setDate(target.getDate() + 1);
    const isoDate = target.toISOString().slice(0, 10);

    await page.goto("/clients");
    const clientLink = page.locator("li a").first();
    const clientName = (await clientLink.textContent())!.trim().split(" ")[0]!;
    await clientLink.click();

    // Ждём завершения перехода: page.url() сразу после click ещё вернёт
    // адрес списка, и возврат «на карточку» приведёт обратно в список.
    await page.waitForURL(/\/clients\/.+/);
    const clientUrl = page.url();

    // Продаём пакет: первый в списке — на «Классический массаж, 60 мин».
    await page.getByRole("button", { name: "Продать абонемент" }).click();
    const sellDialog = page.getByRole("dialog");
    await expect(sellDialog.getByText("Продажа абонемента")).toBeVisible();

    // Пакет выбираем явно: тест дальше записывает на классический массаж,
    // и полагаться на то, какой пакет окажется первым, нельзя.
    const planSelect = sellDialog.getByLabel("Абонемент");
    const planValue = await planSelect
      .locator("option", { hasText: "Классический массаж" })
      .first()
      .getAttribute("value");

    await planSelect.selectOption(planValue!);

    await sellDialog.getByRole("button", { name: "Продать" }).click();
    await expect(sellDialog).not.toBeVisible({ timeout: 15_000 });

    // Свежекупленный пакет — полный: сколько сеансов куплено, столько и доступно.
    const badge = page.getByText(/^\d+ из \d+ сеанс/).first();
    await expect(badge).toBeVisible();

    const before = (await badge.textContent())!;
    const total = Number(before.match(/из (\d+)/)![1]);
    expect(Number(before.match(/^(\d+)/)![1])).toBe(total);

    // Записываем на услугу этого абонемента и платим им же.
    await page.goto(`/calendar?date=${isoDate}`);
    await page.getByRole("button", { name: "Записать" }).click();

    const booking = page.getByRole("dialog");
    // selectOption принимает label только строкой, поэтому находим значение
    // нужной опции по фамилии клиента.
    const clientSelect = booking.getByLabel("Клиент");
    const clientValue = await clientSelect
      .locator("option", { hasText: clientName })
      .first()
      .getAttribute("value");

    await clientSelect.selectOption(clientValue!);
    await booking.getByLabel("Услуга").selectOption({ label: "Классический массаж, 60 мин" });
    await booking.getByLabel("Дата").fill(isoDate);

    const slot = booking.locator("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 15_000 });

    // Абонемент подходит услуге, поэтому форма должна сама предложить оплату им.
    await expect(booking.getByRole("radio", { name: /абонемент/i })).toBeChecked();

    await slot.click();
    await booking.getByRole("button", { name: "Записать" }).click();
    await expect(booking).not.toBeVisible({ timeout: 15_000 });

    // Резерв уменьшает доступный остаток сразу: иначе клиент запишется
    // десять раз по абонементу на пять сеансов.
    await page.goto(clientUrl);
    const after = (await page.getByText(/^\d+ из \d+ сеанс/).first().textContent())!;

    expect(Number(after.match(/^(\d+)/)![1])).toBe(total - 1);
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
