import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ensureClientAccessByEmail,
  saveClientWithAccess,
  type SaveClientInput,
} from "@/lib/services/clients";
import { pool, truncateAll } from "./helpers";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

const clientInput = (overrides: Partial<SaveClientInput> = {}): SaveClientInput => ({
  lastName: "Иванова",
  firstName: "Ольга",
  middleName: null,
  phone: "+79990000001",
  email: "olga@example.com",
  birthDate: null,
  source: null,
  ...overrides,
});

describe("доступ клиента в личный кабинет", () => {
  it("создаёт CLIENT-пользователя и связывает его с новой карточкой", async () => {
    const client = await saveClientWithAccess(clientInput());

    const result = await pool.query<{
      clientId: string;
      userId: string;
      email: string;
      role: string;
      isActive: boolean;
    }>(
      `SELECT c.id AS "clientId", u.id AS "userId", u.email, u.role::text, u."isActive"
       FROM "Client" c JOIN "User" u ON u.id = c."userId"
       WHERE c.id = $1`,
      [client.id],
    );

    expect(result.rows).toEqual([
      {
        clientId: client.id,
        userId: expect.any(String),
        email: "olga@example.com",
        role: "CLIENT",
        isActive: true,
      },
    ]);
  });

  it("переносит доступ на новый email без создания второй учётной записи", async () => {
    const created = await saveClientWithAccess(clientInput());
    const oldUser = await pool.query<{ id: string }>(
      `SELECT id FROM "User" WHERE email = 'olga@example.com'`,
    );

    await saveClientWithAccess(clientInput({ id: created.id, email: "new@example.com" }));

    const users = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM "User" WHERE role = 'CLIENT'`,
    );
    expect(users.rows).toEqual([{ id: oldUser.rows[0]!.id, email: "new@example.com" }]);
  });

  it("отзывает доступ и удаляет сессии при удалении email из карточки", async () => {
    const created = await saveClientWithAccess(clientInput());
    const user = await pool.query<{ id: string }>(`SELECT id FROM "User" WHERE role = 'CLIENT'`);

    await pool.query(
      `INSERT INTO "Session" (id, "sessionToken", "userId", expires)
       VALUES ('session-1', 'token-1', $1, now() + interval '1 day')`,
      [user.rows[0]!.id],
    );

    await saveClientWithAccess(clientInput({ id: created.id, email: null }));

    const result = await pool.query<{
      users: string;
      sessions: string;
      clientEmail: string | null;
      clientUserId: string | null;
    }>(
      `SELECT
         (SELECT count(*) FROM "User")::text AS users,
         (SELECT count(*) FROM "Session")::text AS sessions,
         email AS "clientEmail",
         "userId" AS "clientUserId"
       FROM "Client" WHERE id = $1`,
      [created.id],
    );

    expect(result.rows[0]).toEqual({
      users: "0",
      sessions: "0",
      clientEmail: null,
      clientUserId: null,
    });
  });

  it("не позволяет связать карточку с email администратора", async () => {
    await pool.query(
      `INSERT INTO "User" (id, email, role, "isActive", "createdAt", "updatedAt")
       VALUES ('admin-1', 'admin@example.com', 'ADMIN', true, now(), now())`,
    );

    await expect(
      saveClientWithAccess(clientInput({ email: "admin@example.com" })),
    ).rejects.toThrow("Этот email уже используется другой учётной записью");

    const clients = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Client"`,
    );
    expect(clients.rows[0]?.count).toBe("0");
  });

  it("при первом запросе ссылки выдаёт доступ ранее созданной карточке", async () => {
    await pool.query(
      `INSERT INTO "Client"
         (id, "lastName", "firstName", phone, email, "noShowCount", "createdAt", "updatedAt")
       VALUES ('legacy-client', 'Старова', 'Мария', '+79990000002',
               'legacy@example.com', 0, now(), now())`,
    );

    const user = await ensureClientAccessByEmail("legacy@example.com");
    const linked = await pool.query<{ email: string; role: string; userId: string }>(
      `SELECT u.email, u.role::text, c."userId"
       FROM "Client" c JOIN "User" u ON u.id = c."userId"
       WHERE c.id = 'legacy-client'`,
    );

    expect(user).toEqual({ id: expect.any(String), isActive: true });
    expect(linked.rows).toEqual([
      { email: "legacy@example.com", role: "CLIENT", userId: user!.id },
    ]);
  });
});
