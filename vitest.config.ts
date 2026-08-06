import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    globalSetup: ["tests/db/global-setup.ts"],
    // Тесты БД делят одну базу и чистят таблицы между кейсами.
    // Параллельные файлы вычищали бы данные друг у друга.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
