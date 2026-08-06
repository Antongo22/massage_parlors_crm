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
    // Тесты БД делят одну базу и чистят таблицы между кейсами.
    // Параллельные файлы вычищали бы данные друг у друга.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
