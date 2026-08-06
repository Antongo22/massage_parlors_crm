import { execSync } from "node:child_process";
import { Client } from "pg";

/**
 * Готовит тестовую базу: создаёт её, если нет, и накатывает миграции.
 *
 * Отдельная база, а не та же, что у разработчика: тесты чистят таблицы между
 * кейсами, и делать это на базе с сидом — гарантированная потеря данных
 * ровно в тот момент, когда кто-то запустит тесты, не заметив переменной.
 */
export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;

  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL не задан — см. .env.example");
  }

  const parsed = new URL(testUrl);
  const dbName = parsed.pathname.slice(1);

  // Подключаемся к служебной postgres: создать базу, находясь в ней самой, нельзя.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();

  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);

  if (exists.rowCount === 0) {
    // Имя базы нельзя передать параметром — оно идентификатор, а не значение.
    // Кавычим вручную, источник имени — собственный .env, не пользовательский ввод.
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  }

  await admin.end();

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
