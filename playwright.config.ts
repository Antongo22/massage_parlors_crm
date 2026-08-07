import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-тесты критического пути.
 *
 * Приложение поднимается извне (docker compose или npm run dev) — Playwright
 * его не стартует. Причина: тестам нужны Postgres, Redis и Mailpit, и поднимать
 * их из конфига теста означало бы дублировать docker-compose.yml.
 *
 * Вход в систему идёт по magic link, поэтому тесты читают письмо из Mailpit
 * через его HTTP API. Это заодно проверяет, что почта настроена и работает —
 * ровно тот путь, которым пользуется живой человек.
 */
export default defineConfig({
  testDir: "./e2e",
  // Сид перед прогоном: см. комментарий в самом файле.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // Тесты меняют общие данные (записи, абонементы), поэтому один воркер:
  // параллельные прогоны отбирали бы друг у друга слоты в календаре.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
