import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Тот же алиас, что в tsconfig: vitest не читает paths оттуда сам.
    alias: {
      "@": path.resolve(import.meta.dirname),
      // См. комментарий в самой заглушке.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    // Сервисы приложения используют DATABASE_URL, а низкоуровневые тесты —
    // TEST_DATABASE_URL. В тестовом процессе обе должны указывать на отдельную
    // тестовую БД, иначе service-level тест случайно тронет базу разработчика.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    },
    // Тесты БД делят одну базу и чистят таблицы между кейсами.
    // Параллельные файлы вычищали бы данные друг у друга.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
