import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { truncateApplicationData } from "@/lib/services/data-management";
import { pool, seedFixtures, truncateAll } from "./helpers";

beforeEach(async () => {
  await truncateAll();
  await seedFixtures();
  await pool.query(
    `INSERT INTO "Organization" (id, name, timezone, currency, "createdAt", "updatedAt")
     VALUES ('reset-test', 'Тестовый салон', 'Europe/Moscow', 'RUB', now(), now())`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("полный сброс CRM", () => {
  it("удаляет прикладные данные, но сохраняет историю миграций", async () => {
    const migrationsBefore = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );

    await truncateApplicationData();

    const dataCounts = await pool.query<{ clients: string; services: string; organizations: string }>(
      `SELECT
         (SELECT count(*) FROM "Client")::text AS clients,
         (SELECT count(*) FROM "Service")::text AS services,
         (SELECT count(*) FROM "Organization")::text AS organizations`,
    );
    const migrationsAfter = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );

    expect(dataCounts.rows[0]).toEqual({ clients: "0", services: "0", organizations: "0" });
    expect(migrationsAfter.rows[0]?.count).toBe(migrationsBefore.rows[0]?.count);
    expect(Number(migrationsAfter.rows[0]?.count)).toBeGreaterThan(0);
  });
});
